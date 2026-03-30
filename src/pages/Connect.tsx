import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { BLEService, DiscoveredChar } from '../services/bleService'
import {
  buildUserDataCommand, identifyPacket,
  decodeWeightPacket, decodeBodyPacket,
  simulateMeasurement, tryExtractWeightFromAnyPacket,
  isFFB0Service, detectFFB0Complete
} from '../services/decoder'
import { Measurement } from '../types'
import BLEStatusComponent from '../components/BLEStatus'
import {
  Bluetooth, Square, AlertCircle, FlaskConical,
  Search, Terminal, ChevronDown, ChevronUp, Copy, Check, Activity,
  RefreshCw
} from 'lucide-react'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function dataViewToBytes(dv: DataView): number[] {
  const b: number[] = []
  for (let i = 0; i < dv.byteLength; i++) b.push(dv.getUint8(i))
  return b
}

export default function Connect() {
  const { activeProfileId, profiles, bleStatus, setBLEStatus, saveMeasurement } = useStore()
  const navigate = useNavigate()
  const bleRef = useRef<BLEService | null>(null)

  const [error, setError]                   = useState('')
  const [deviceName, setDeviceName]         = useState('')
  const [discoveredChars, setDiscoveredChars] = useState<DiscoveredChar[]>([])
  const [packets, setPackets]               = useState<{ hex: string; bytes: number[]; ts: string; char: string }[]>([])
  const [liveWeight, setLiveWeight]         = useState<number | null>(null)
  const [showDiag, setShowDiag]             = useState(false)
  const [copied, setCopied]                 = useState(false)
  const [scanMode, setScanMode]             = useState<'filtered' | 'all'>('all')
  const [userDataSent, setUserDataSent]     = useState(false)
  const [sendingData, setSendingData]       = useState(false)

  // Refs for timing-safe access (avoids React state batching issues)
  const discoveredCharsRef    = useRef<DiscoveredChar[]>([])
  const userDataSentRef       = useRef(false)
  const measurementSavedRef   = useRef(false)  // prevents duplicate saves
  const liveWeightRef         = useRef<number | null>(null)  // last known valid weight
  const ffbWeightHistoryRef   = useRef<number[]>([])  // recent FFB0 weights for stability check
  const ffbPendingWeightRef   = useRef<number | null>(null)
  const ffbFallbackTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connectedAtRef        = useRef<number>(0)  // timestamp when BLE connected (ms)
  const profileRef            = useRef(profiles.find(p => p.id === activeProfileId))

  const profile = profiles.find(p => p.id === activeProfileId)
  profileRef.current = profile

  // ── Standard GATT service UUIDs — never write to their characteristics ────────
  // These are Generic Access (0x1800) and Generic Attribute (0x1801) services.
  // Writing to Device Name (0x2A00) or Appearance (0x2A01) causes GATT errors.
  const isStandardGATTService = (serviceUUID: string) =>
    serviceUUID.startsWith('00001800-') || serviceUUID.startsWith('00001801-')

  // ── Send user profile data to scale (Yolanda 8-point BIA protocol) ──────────
  const attemptSendUserData = useCallback(async (chars: DiscoveredChar[]) => {
    if (!profileRef.current || !bleRef.current || userDataSentRef.current) return
    if (measurementSavedRef.current) return  // already saved — app is navigating, don't write
    if (chars.length === 0) return

    // Only target chars from PROPRIETARY services (not standard GATT 0x1800/0x1801)
    const proprietaryChars = chars.filter(c => !isStandardGATTService(c.serviceUUID))

    if (proprietaryChars.length === 0) {
      // No proprietary service found yet — wait for reprobe to find it
      console.log('[Yolanda] No proprietary service found yet — waiting for reprobe...')
      setSendingData(false)
      return
    }

    setSendingData(true)

    // Priority: known Yolanda write UUIDs first, then any writable proprietary char
    const priorityUUIDs = [
      '0000ffe3-0000-1000-8000-00805f9b34fb',
      '0000ffe2-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb',
      '0000fff1-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '0000fff4-0000-1000-8000-00805f9b34fb',
    ]

    const writeCandidates = [
      ...proprietaryChars.filter(c => priorityUUIDs.includes(c.charUUID)),
      ...proprietaryChars.filter(c =>
        !priorityUUIDs.includes(c.charUUID) &&
        (c.properties.includes('write') || c.properties.includes('writeNoResp'))
      ),
    ]

    if (writeCandidates.length === 0) {
      console.warn('[Yolanda] Proprietary service found but no writable char')
      setSendingData(false)
      return
    }

    const p = profileRef.current
    const cmd = buildUserDataCommand(p.sex, p.age, p.height)
    console.log('[Yolanda] sending user data cmd:', Array.from(cmd).map(b => b.toString(16).padStart(2, '0')).join(' '))
    console.log('[Yolanda] trying', writeCandidates.length, 'proprietary writable char(s)')

    for (const wc of writeCandidates) {
      try {
        await bleRef.current.sendCommand(wc.serviceUUID, wc.charUUID, Array.from(cmd))
        userDataSentRef.current = true
        setUserDataSent(true)
        console.log('[Yolanda] ✓ user data sent via', wc.charUUID)
        break
      } catch (e) {
        console.warn('[Yolanda] write failed on', wc.charUUID, '—', e)
      }
    }

    setSendingData(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Save measurement and navigate ───────────────────────────────────────────
  const saveMeasurementAndNavigate = useCallback(async (decoded: Partial<Measurement>) => {
    if (!profileRef.current || !decoded.weight) {
      console.warn('[saveMeasurementAndNavigate] Validação falhou:', { profile: profileRef.current, weight: decoded.weight })
      return
    }
    const p = profileRef.current
    const measurement: Measurement = {
      id:              generateId(),
      profileId:       p.id,
      timestamp:       new Date().toISOString(),
      weight:          decoded.weight   ?? 0,
      bmi:             decoded.bmi      ?? 0,
      fatMass:         decoded.fatMass  ?? 0,
      fatPercent:      decoded.fatPercent ?? 0,
      waterMass:       decoded.waterMass  ?? 0,
      waterPercent:    decoded.waterPercent ?? 0,
      muscleMass:      decoded.muscleMass  ?? 0,
      musclePercent:   decoded.musclePercent ?? 0,
      boneMass:        decoded.boneMass    ?? 0,
      proteinMass:     decoded.proteinMass ?? 0,
      proteinPercent:  decoded.proteinPercent ?? 0,
      visceralFat:     decoded.visceralFat  ?? 0,
      metabolicAge:    decoded.metabolicAge ?? 0,
      bmr:             decoded.bmr          ?? 0,
      impedances:      decoded.impedances ?? {
        rightArm20: 0, rightArm100: 0, leftArm20: 0, leftArm100: 0,
        trunk20: 0, trunk100: 0, rightLeg20: 0, rightLeg100: 0,
        leftLeg20: 0, leftLeg100: 0,
      },
      rawBytes: decoded.rawBytes,
    }
    try {
      console.log('[saveMeasurementAndNavigate] Salvando medição:', measurement)
      await saveMeasurement(measurement)
      console.log('[saveMeasurementAndNavigate] ✓ Medição salva OK em Zustand')
      
      // Aguarda um microtick para garantir que o state foi atualizado
      // antes de navegar. Isso evita race conditions onde /result
      // renderiza antes de lastMeasurement estar no store.
      await new Promise(resolve => setTimeout(resolve, 50))
      
      console.log('[saveMeasurementAndNavigate] ✓ Navegando para /result...')
      navigate('/result')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[saveMeasurementAndNavigate] ✗ ERRO ao salvar:', msg, err)
      setError('Erro ao salvar medição: ' + msg)
    }
  }, [saveMeasurement, navigate])

  // ── Service Changed UUID (0x2A05) — indicates GATT database was updated ──────
  const SERVICE_CHANGED_UUID = '00002a05-0000-1000-8000-00805f9b34fb'

  // ── Data received from scale ─────────────────────────────────────────────────
  const handleDataReceived = useCallback(async (data: DataView, serviceUUID: string, charUUID: string) => {
    const bytes = dataViewToBytes(data)
    if (bytes.length === 0) return

    // ── Service Changed (0x2A05) — we no longer subscribe to it in bleService,
    // so this block will not fire. Kept as a safety net only.
    if (charUUID === SERVICE_CHANGED_UUID) return

    // Filter generic GATT read values (Device Name, Appearance, etc.)
    const GENERIC_GATT_CHARS = new Set([
      '00002a00-0000-1000-8000-00805f9b34fb',
      '00002a01-0000-1000-8000-00805f9b34fb',
      '00002a04-0000-1000-8000-00805f9b34fb',
      '00002aa6-0000-1000-8000-00805f9b34fb',
    ])
    if (GENERIC_GATT_CHARS.has(charUUID)) return

    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
    setPackets(prev => [{ hex, bytes, ts: new Date().toLocaleTimeString('pt-BR'), char: charUUID }, ...prev].slice(0, 50))
    setBLEStatus('measuring')

    const kind = identifyPacket(bytes)
    const p = profileRef.current

    // ══════════════════════════════════════════════════════════════════════════
    // ── FFB0 Protocol (Relaxmedic-2305 — service 0xFFB0) ─────────────────────
    // Weight is at bytes[2-3] big-endian /100.
    if (isFFB0Service(serviceUUID)) {
      const cacheWindowMs = 5000
      const msSinceConnect = connectedAtRef.current === 0
        ? 0
        : Date.now() - connectedAtRef.current

      const ffbW = tryExtractWeightFromAnyPacket(bytes)
      if (ffbW !== null) {
        setLiveWeight(ffbW)
        liveWeightRef.current = ffbW

        if (msSinceConnect >= cacheWindowMs && !measurementSavedRef.current && p) {
          const hist = ffbWeightHistoryRef.current
          hist.push(ffbW)
          if (hist.length > 5) hist.shift()

          if (hist.length >= 3) {
            const recent = hist.slice(-3)
            const spread = Math.max(...recent) - Math.min(...recent)
            if (spread <= 0.2) {
              const stableW = recent[recent.length - 1]
              ffbPendingWeightRef.current = stableW
              setBLEStatus('measuring')
              console.log('[FFB0] peso estável identificado:', stableW, 'kg; aguardando composição')

              if (p) {
                const decodedBody = decodeBodyPacket(bytes, { height: p.height, sex: p.sex, age: p.age })
                if (decodedBody?.weight && decodedBody?.fatPercent && !measurementSavedRef.current) {
                  if (ffbFallbackTimerRef.current) {
                    clearTimeout(ffbFallbackTimerRef.current)
                    ffbFallbackTimerRef.current = null
                  }
                  measurementSavedRef.current = true
                  console.log('[FFB0] composição recebida diretamente:', decodedBody)
                  await saveMeasurementAndNavigate(decodedBody)
                  return
                }
              }
              if (ffbFallbackTimerRef.current) clearTimeout(ffbFallbackTimerRef.current)
              ffbFallbackTimerRef.current = setTimeout(async () => {
                if (measurementSavedRef.current) return
                if (!p || !ffbPendingWeightRef.current) return
                measurementSavedRef.current = true
                const h = p.height / 100
                const bmi = Math.round((ffbPendingWeightRef.current / (h * h)) * 10) / 10
                console.log('[FFB0] fallback salvando apenas peso após timeout:', ffbPendingWeightRef.current, 'kg')
                await saveMeasurementAndNavigate({ weight: ffbPendingWeightRef.current, bmi })
              }, 8000)
            }
          }
        }
      }

      const stableW = detectFFB0Complete(bytes)
      if (stableW !== null && !measurementSavedRef.current && p && msSinceConnect >= cacheWindowMs) {
        ffbPendingWeightRef.current = stableW
        setBLEStatus('measuring')

        if (p) {
          const decodedBody = decodeBodyPacket(bytes, { height: p.height, sex: p.sex, age: p.age })
          if (decodedBody?.weight && decodedBody?.fatPercent && !measurementSavedRef.current) {
            if (ffbFallbackTimerRef.current) {
              clearTimeout(ffbFallbackTimerRef.current)
              ffbFallbackTimerRef.current = null
            }
            measurementSavedRef.current = true
            console.log('[FFB0] composição direta após byte0>=4 obtida:', decodedBody)
            await saveMeasurementAndNavigate(decodedBody)
            return
          }
        }

        if (ffbFallbackTimerRef.current) clearTimeout(ffbFallbackTimerRef.current)
        ffbFallbackTimerRef.current = setTimeout(async () => {
          console.log('[FFB0 Timeout] iniciando fallback — measurementSaved?', measurementSavedRef.current, 'profile?', !!p, 'weight?', ffbPendingWeightRef.current)
          if (measurementSavedRef.current) {
            console.log('[FFB0 Timeout] medição já foi salva, ignorando fallback')
            return
          }
          if (!p || !ffbPendingWeightRef.current) {
            console.log('[FFB0 Timeout] perfil ou peso vazio — não salvando')
            return
          }
          measurementSavedRef.current = true
          const h = p.height / 100
          const bmi = Math.round((ffbPendingWeightRef.current / (h * h)) * 10) / 10
          console.log('[FFB0] fallback (byte0>=4) iniciando save com peso:', ffbPendingWeightRef.current, 'kg; bmi:', bmi)
          await saveMeasurementAndNavigate({ weight: ffbPendingWeightRef.current, bmi })
        }, 8000)
      }

      return
    }

    // ── Yolanda/QN protocol: real-time weight ──
    if (kind === 'weight_realtime') {
      const w = decodeWeightPacket(bytes)
      if (w) { setLiveWeight(w); liveWeightRef.current = w }
      return
    }

    // ── Yolanda/QN protocol: body composition ──
    if (kind === 'body_composition' && p) {
      const decoded = decodeBodyPacket(bytes, { height: p.height, sex: p.sex, age: p.age })
      if (decoded?.weight && !measurementSavedRef.current) {
        if (ffbFallbackTimerRef.current) {
          clearTimeout(ffbFallbackTimerRef.current)
          ffbFallbackTimerRef.current = null
        }
        measurementSavedRef.current = true
        ffbPendingWeightRef.current = null
        await saveMeasurementAndNavigate(decoded)
        return
      }
    }

    // ── Generic fallback: show live weight from any packet ──
    const fallbackW = tryExtractWeightFromAnyPacket(bytes)
    if (fallbackW !== null) {
      setLiveWeight(fallbackW)
      liveWeightRef.current = fallbackW
    }

    // ── Generic fallback: try body composition decode on long unknown packets ──
    if (bytes.length >= 20 && p && !measurementSavedRef.current) {
      const decoded = decodeBodyPacket(bytes, { height: p.height, sex: p.sex, age: p.age })
      if (decoded?.weight) {
        measurementSavedRef.current = true
        console.log('[Decoder] fallback decode OK — byte[0]=0x' + bytes[0].toString(16))
        await saveMeasurementAndNavigate(decoded)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBLEStatus, saveMeasurementAndNavigate])

  // ── Discovery: ACCUMULATE chars (initial + reprobe results merged) ───────────
  const handleDiscovery = useCallback((chars: DiscoveredChar[]) => {
    // Merge new chars into existing list (deduplicate by charUUID)
    const existingUUIDs = new Set(discoveredCharsRef.current.map(c => c.charUUID))
    const newChars = chars.filter(c => !existingUUIDs.has(c.charUUID))
    const merged = [...discoveredCharsRef.current, ...newChars]

    discoveredCharsRef.current = merged
    setDiscoveredChars(merged)

    // If new writable characteristics were found, attempt to send user data
    const hasNewWritable = newChars.some(c =>
      c.properties.includes('write') || c.properties.includes('writeNoResp')
    )
    if (newChars.length > 0 || hasNewWritable) {
      console.log('[BLE] handleDiscovery merged', newChars.length, 'new chars — retrying user data')
      setTimeout(() => attemptSendUserData(merged), 400)
    }
  }, [attemptSendUserData])

  useEffect(() => {
    const bleService = new BLEService(
      (status) => {
        // Set connectedAtRef SYNCHRONOUSLY here — before React processes state.
        // 'connecting' fires before subscribeServices/readValue, so the 5-second
        // cache guard is already in place when the first cached packet arrives.
        if (status === 'connecting') {
          connectedAtRef.current = Date.now()
          console.log('[BLE] Iniciando conexão — cache ignorado por 5 s')
        }
        setBLEStatus(status)
      },
      handleDataReceived,
      handleDiscovery
    )
    bleRef.current = bleService

    return () => {
      // Ensure proper cleanup
      if (bleRef.current) {
        bleRef.current.disconnect()
        bleRef.current = null
      }
    }
  }, [handleDataReceived, handleDiscovery, setBLEStatus])

  async function handleScan() {
    setError('')
    setPackets([])
    setDiscoveredChars([])
    setLiveWeight(null)
    setUserDataSent(false)
    userDataSentRef.current = false
    measurementSavedRef.current = false
    liveWeightRef.current = null
    ffbWeightHistoryRef.current = []
    connectedAtRef.current = 0
    discoveredCharsRef.current = []

    const abortController = new AbortController()

    try {
      if (scanMode === 'all') await bleRef.current?.scanAll(abortController.signal)
      else await bleRef.current?.scanFiltered(abortController.signal)
      setDeviceName(bleRef.current?.getDeviceName() ?? '')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('chosen')) setError(msg)
      setBLEStatus('idle')
    }
  }

  async function handleDisconnect() {
    await bleRef.current?.disconnect()
    setDiscoveredChars([])
    setLiveWeight(null)
    setUserDataSent(false)
    userDataSentRef.current = false
    measurementSavedRef.current = false
    liveWeightRef.current = null
    ffbWeightHistoryRef.current = []
  }

  function handleResendData() {
    userDataSentRef.current = false
    setUserDataSent(false)
    attemptSendUserData(discoveredCharsRef.current)
  }

  async function handleSimulate() {
    if (!profile) return
    const decoded = simulateMeasurement(profile.height)
    await saveMeasurementAndNavigate(decoded)
  }

  function copyLog() {
    const text = packets.map(p =>
      `[${p.ts}] char: ${p.char}\n  HEX: ${p.hex}\n  byte[0]: 0x${p.bytes[0]?.toString(16) ?? '??'}\n  len: ${p.bytes.length}`
    ).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Selecione um perfil primeiro</p>
        <button onClick={() => navigate('/')} className="bg-primary-600 text-white px-6 py-2 rounded-xl">Ir para Perfis</button>
      </div>
    )
  }

  const isConnected = bleStatus === 'connected' || bleStatus === 'measuring'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Conectar à Balança</h2>
        <p className="text-sm text-gray-500">Perfil: <span className="font-medium text-gray-700">{profile.name}</span></p>
      </div>

      {/* Connection panel */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-600">Status Bluetooth</span>
          <BLEStatusComponent status={bleStatus} />
        </div>

        {deviceName && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
            <Bluetooth className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800 font-medium">{deviceName}</span>
            {sendingData
              ? <span className="ml-auto text-xs text-blue-600 animate-pulse">Enviando dados...</span>
              : userDataSent
              ? <span className="ml-auto text-xs text-green-600">✓ Dados enviados</span>
              : isConnected
              ? <span className="ml-auto text-xs text-yellow-600">⚠ Dados não enviados</span>
              : null
            }
          </div>
        )}

        {'bluetooth' in navigator === false && (
          <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700">Use o <strong>Google Chrome</strong> para Bluetooth.</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {!isConnected ? (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs" role="radiogroup" aria-label="Modo de busca de dispositivos">
              <button
                onClick={() => setScanMode('all')}
                className={`flex-1 py-2 rounded-lg border font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${scanMode === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-600'}`}
                aria-checked={scanMode === 'all'}
                role="radio"
                aria-label="Buscar todos os dispositivos Bluetooth"
              >
                Todos os dispositivos
              </button>
              <button
                onClick={() => setScanMode('filtered')}
                className={`flex-1 py-2 rounded-lg border font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${scanMode === 'filtered' ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-600'}`}
                aria-checked={scanMode === 'filtered'}
                role="radio"
                aria-label="Buscar apenas balanças Relax/Scale"
              >
                Só Relax/Scale
              </button>
            </div>
            <button
              onClick={handleScan}
              disabled={bleStatus === 'scanning' || bleStatus === 'connecting'}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-3 font-semibold hover:bg-primary-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              aria-label={bleStatus === 'scanning' ? 'Procurando dispositivos...' : bleStatus === 'connecting' ? 'Conectando à balança...' : 'Procurar e conectar à balança'}
            >
              <Search className="w-5 h-5" aria-hidden="true" />
              {bleStatus === 'scanning' ? 'Procurando...' : bleStatus === 'connecting' ? 'Conectando...' : 'Procurar Balança'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Live weight display */}
            {liveWeight !== null ? (
              <div className="bg-primary-50 rounded-xl p-4 text-center border border-primary-100">
                <p className="text-xs text-primary-500 mb-1 font-medium">PESO EM TEMPO REAL</p>
                <p className="text-4xl font-black text-primary-700">{liveWeight} <span className="text-lg font-normal">kg</span></p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <Activity className="w-3 h-3 text-primary-400 animate-pulse" />
                  <p className="text-xs text-primary-400">Aguardando medição completa de 8 pontos...</p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-blue-700 font-semibold text-sm">Suba na balança e segure as alças</p>
                <p className="text-blue-500 text-xs mt-1">Mantenha contato nos 8 eletrodos (mãos + pés)</p>
              </div>
            )}

            {/* Resend user data button (shown when data wasn't sent or scale didn't respond) */}
            {!userDataSent && !sendingData && (
              <button
                onClick={handleResendData}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                aria-label="Reenviar dados do perfil do usuário para a balança"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Reenviar Dados do Perfil à Balança
              </button>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              aria-label="Desconectar da balança Bluetooth"
            >
              <Square className="w-4 h-4" aria-hidden="true" /> Desconectar
            </button>
          </div>
        )}
      </div>

      {/* Discovered services */}
      {discoveredChars.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setShowDiag(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
            aria-expanded={showDiag}
            aria-controls="diagnostics-panel"
            aria-label={`${showDiag ? 'Ocultar' : 'Mostrar'} informações de diagnóstico BLE`}
          >
            <span className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary-500" aria-hidden="true" />
              Serviços BLE ({discoveredChars.length} características)
            </span>
            {showDiag ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          </button>
          {showDiag && (
            <div id="diagnostics-panel" className="px-4 pb-4 space-y-2 max-h-48 overflow-y-auto" role="region" aria-label="Painel de diagnóstico BLE">
              {discoveredChars.map((c, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-700 truncate">{c.charUUID}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {c.properties.map(p => (
                        <span key={p} className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          p === 'notify' || p === 'indicate' ? 'bg-green-100 text-green-700' :
                          p === 'write' || p === 'writeNoResp' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{p}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packet log */}
      {packets.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
            <span className="text-xs text-gray-300 font-medium flex items-center gap-2">
              <Terminal className="w-3 h-3" /> Pacotes recebidos ({packets.length})
            </span>
            <button onClick={copyLog} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copiado!' : 'Copiar log'}
            </button>
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto font-mono text-xs">
            {packets.map((p, i) => {
              const kind = identifyPacket(p.bytes)
              const byte0 = p.bytes[0] !== undefined ? '0x' + p.bytes[0].toString(16).padStart(2, '0').toUpperCase() : '??'
              return (
                <div key={i} className="border-b border-gray-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">[{p.ts}]</span>
                    <span className={
                      kind === 'body_composition' ? 'text-green-400 font-bold' :
                      kind === 'weight_realtime'  ? 'text-yellow-400' : 'text-gray-400'
                    }>
                      {kind === 'body_composition' ? '✓ COMPOSIÇÃO CORPORAL' :
                       kind === 'weight_realtime'  ? '⚖ PESO' : '? desconhecido'}
                    </span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded text-xs font-bold ${
                      kind === 'unknown' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'
                    }`}>byte[0]={byte0}</span>
                  </div>
                  <p className="text-green-400 mt-0.5">HEX: {p.hex}</p>
                  <p className="text-blue-300">len: {p.bytes.length} bytes</p>
                </div>
              )
            })}
          </div>
          {packets.some(p => identifyPacket(p.bytes) === 'unknown') && (
            <div className="px-4 py-2 bg-red-950 border-t border-red-900">
              <p className="text-xs text-red-300">
                ⚠ Pacotes desconhecidos detectados — copie o log e informe os valores de <strong>byte[0]</strong> para calibrar o decoder.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Simulation mode */}
      <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
        <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Modo de Teste (sem balança)</p>
        <button onClick={handleSimulate}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 font-semibold hover:bg-purple-700">
          <FlaskConical className="w-5 h-5" /> Simular Medição (8 pontos)
        </button>
      </div>
    </div>
  )
}

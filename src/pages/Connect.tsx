import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { BLEService, DiscoveredChar } from '../services/bleService'
import {
  buildUserDataCommand, identifyPacket,
  decodeWeightPacket, decodeBodyPacket,
  simulateMeasurement, tryExtractWeightFromAnyPacket
} from '../services/decoder'
import { Measurement } from '../types'
import BLEStatusComponent from '../components/BLEStatus'
import {
  Bluetooth, Square, AlertCircle, FlaskConical,
  Terminal, Activity
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
  const { activeProfileId, profiles, bleStatus, setBLEStatus, saveMeasurement, setLastMeasurement } = useStore()
  const navigate = useNavigate()
  const bleRef = useRef<BLEService | null>(null)

  const [error, setError]                   = useState('')
  const [deviceName, setDeviceName]         = useState('')
  const [packets, setPackets]               = useState<{ hex: string; bytes: number[]; ts: string; char: string }[]>([])
  const [liveWeight, setLiveWeight]         = useState<number | null>(null)
  
  const measurementSavedRef   = useRef(false)
  const profileRef            = useRef(profiles.find(p => p.id === activeProfileId))
  
  // Refs para controle de estado e estabilidade
  const lastWeightRef         = useRef<number | null>(null)
  const stabilityTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bestMeasurementRef    = useRef<Partial<Measurement> | null>(null)
  const mountedRef            = useRef(false)
  const savingRef             = useRef(false)
  const weightOnlyCountRef    = useRef(0)
  const connectedAtRef        = useRef<number | null>(null)
  const seenLowWeightRef      = useRef(false)

  const profile = profiles.find(p => p.id === activeProfileId)
  profileRef.current = profile

  const saveMeasurementAndNavigate = useCallback(async (decoded: Partial<Measurement>) => {
    if (!profileRef.current || !decoded.weight || measurementSavedRef.current || savingRef.current) return
    savingRef.current = true
    measurementSavedRef.current = true
    
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current)
      stabilityTimerRef.current = null
    }

    const p = profileRef.current
    const measurement: Measurement = {
      id:              generateId(),
      profileId:       p.id,
      timestamp:       new Date().toISOString(),
      weight:          decoded.weight,
      bmi:             decoded.bmi ?? 0,
      fatMass:         decoded.fatMass ?? 0,
      fatPercent:      decoded.fatPercent ?? 0,
      waterMass:       decoded.waterMass ?? 0,
      waterPercent:    decoded.waterPercent ?? 0,
      muscleMass:      decoded.muscleMass ?? 0,
      musclePercent:   decoded.musclePercent ?? 0,
      boneMass:        decoded.boneMass ?? 0,
      proteinMass:     decoded.proteinMass ?? 0,
      proteinPercent:  decoded.proteinPercent ?? 0,
      visceralFat:     decoded.visceralFat ?? 0,
      metabolicAge:    decoded.metabolicAge ?? 0,
      bmr:             decoded.bmr ?? 0,
      impedances:      decoded.impedances ?? {
        rightArm20: 0, rightArm100: 0, leftArm20: 0, leftArm100: 0,
        trunk20: 0, trunk100: 0, rightLeg20: 0, rightLeg100: 0,
        leftLeg20: 0, leftLeg100: 0,
      },
      rawBytes: decoded.rawBytes,
    }
    try {
      await saveMeasurement(measurement)
      if (mountedRef.current) navigate('/result')
    } catch (err: unknown) {
      setError('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)))
      measurementSavedRef.current = false
      savingRef.current = false
    }
  }, [saveMeasurement, navigate])

  const handleDataReceived = useCallback(async (data: DataView, _serviceUUID: string, charUUID: string) => {
    const bytes = dataViewToBytes(data)
    if (bytes.length === 0) return

    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
    setPackets(prev => [{ hex, bytes, ts: new Date().toLocaleTimeString('pt-BR'), char: charUUID }, ...prev].slice(0, 30))
    setBLEStatus('measuring')

    const p = profileRef.current
    if (!p) return

    const decoded = decodeBodyPacket(bytes, { height: p.height, sex: p.sex, age: p.age })
    
    if (decoded?.weight) {
      setLiveWeight(decoded.weight)
      
      if (decoded.fatPercent && decoded.fatPercent > 0) {
        console.log('[CONNECT] Bioimpedância Real Detectada! Finalizando agora...')
        await saveMeasurementAndNavigate(decoded)
        return
      }

      bestMeasurementRef.current = decoded

      if (decoded.weight === lastWeightRef.current) {
        if (!stabilityTimerRef.current && !measurementSavedRef.current) {
          stabilityTimerRef.current = setTimeout(async () => {
            if (measurementSavedRef.current) return
            console.log('[CONNECT] Tempo de estabilidade esgotado. Finalizando com os melhores dados disponíveis...')
            await saveMeasurementAndNavigate(bestMeasurementRef.current || decoded)
          }, 20000)
        }
      } else {
        if (stabilityTimerRef.current) {
          clearTimeout(stabilityTimerRef.current)
          stabilityTimerRef.current = null
        }
        lastWeightRef.current = decoded.weight
      }
    }
  }, [saveMeasurementAndNavigate, setBLEStatus])

  const handleDiscovery = useCallback((chars: DiscoveredChar[]) => {
    const p = profileRef.current
    if (!p || !bleRef.current) return
    const writeChar = chars.find(c => c.properties.includes('write') || c.properties.includes('writeNoResp'))
    if (writeChar) {
      const cmd = buildUserDataCommand(p.sex, p.age, p.height)
      bleRef.current.sendCommand(writeChar.serviceUUID, writeChar.charUUID, Array.from(cmd)).catch(console.error)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    setLastMeasurement(null)
    const bleService = new BLEService(
      (status) => {
        if (status === 'connected') connectedAtRef.current = Date.now()
        setBLEStatus(status)
      },
      handleDataReceived,
      handleDiscovery
    )
    bleRef.current = bleService
    return () => { 
      mountedRef.current = false
      if (bleRef.current) bleRef.current.disconnect()
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current)
    }
  }, [handleDataReceived, handleDiscovery, setBLEStatus, setLastMeasurement])

  async function handleScan() {
    setError(''); setPackets([]); setLiveWeight(null)
    measurementSavedRef.current = false; savingRef.current = false
    lastWeightRef.current = null; bestMeasurementRef.current = null
    weightOnlyCountRef.current = 0; connectedAtRef.current = null; seenLowWeightRef.current = false
    setLastMeasurement(null)
    
    const abortController = new AbortController()
    try {
      await bleRef.current?.scanAll(abortController.signal)
      setDeviceName(bleRef.current?.getDeviceName() ?? '')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('cancel')) setError(msg)
      setBLEStatus('idle')
    }
  }

  async function handleSimulate() {
    if (!profile) return
    const decoded = simulateMeasurement(profile.height)
    await saveMeasurementAndNavigate(decoded)
  }

  if (!profile) return null

  const isConnected = bleStatus === 'connected' || bleStatus === 'measuring'

  return (
    <div className="space-y-4 max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Conectar à Balança</h2>
          <p className="text-sm text-gray-500">Perfil: <span className="font-medium text-gray-700">{profile.name}</span></p>
        </div>
        <BLEStatusComponent status={bleStatus} />
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        {deviceName && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
            <Bluetooth className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-800 font-medium">{deviceName}</span>
          </div>
        )}

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs mb-3">{error}</div>}

        {!isConnected ? (
          <button onClick={handleScan} className="w-full bg-primary-600 text-white rounded-xl py-3 font-semibold">
            Procurar Balança
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-primary-50 rounded-xl p-6 text-center border border-primary-100">
              <p className="text-xs text-primary-500 mb-1 font-medium">PESO EM TEMPO REAL</p>
              <p className="text-5xl font-black text-primary-700">{liveWeight ?? '0.0'} <span className="text-xl font-normal">kg</span></p>
              <div className="flex items-center justify-center gap-2 mt-4 text-primary-400">
                <Activity className="w-4 h-4 animate-pulse" />
                <span className="text-xs">Aguardando análise de bioimpedância...</span>
              </div>
            </div>
            <button onClick={() => bleRef.current?.disconnect()} className="w-full border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm">
              Desconectar
            </button>
          </div>
        )}
      </div>

      {packets.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex justify-between mb-2 border-b border-gray-800 pb-2">
            <span className="text-xs text-gray-400 font-mono flex items-center gap-2">
              <Terminal className="w-3 h-3" /> LOG DE PACOTES
            </span>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto font-mono text-[10px]">
            {packets.map((p, i) => {
              const kind = identifyPacket(p.bytes)
              return (
                <div key={i} className={`pb-1 border-b border-gray-800 ${kind !== 'unknown' ? 'text-green-400' : 'text-gray-500'}`}>
                  <span className="opacity-50">[{p.ts}]</span> {kind !== 'unknown' ? `[${kind.toUpperCase()}] ` : ''}{p.hex}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button onClick={handleSimulate} className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 font-semibold">
        <FlaskConical className="w-5 h-5" /> Simular Medição
      </button>
    </div>
  )
}

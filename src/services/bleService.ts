import { BLEStatus } from '../types'

export interface DiscoveredChar {
  serviceUUID: string
  charUUID: string
  properties: string[]
}

// Service Changed characteristic UUID — we discover it but DON'T subscribe.
// Subscribing causes a storm of indications that loop reprobeAndExtend infinitely.
// Scheduled reprobes (1.2 s / 3.5 s / 8 s) are sufficient for late-appearing services.
const SERVICE_CHANGED_UUID = '00002a05-0000-1000-8000-00805f9b34fb'

export class BLEService {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private activeNotifyChars: BluetoothRemoteGATTCharacteristic[] = []
  private allDiscoveredChars: DiscoveredChar[] = []
  private reprobeTimers: ReturnType<typeof setTimeout>[] = []
  private reprobing = false   // mutex — prevents concurrent reprobeAndExtend calls

  // Store listener references for cleanup
  private disconnectListener: (() => void) | null = null
  private charValueHandlers: Map<BluetoothRemoteGATTCharacteristic, (e: Event) => void> = new Map()
  private abortController: AbortController | null = null

  private onStatusChange: (status: BLEStatus) => void
  private onDataReceived: (data: DataView, serviceUUID: string, charUUID: string) => void
  private onDiscovery: (chars: DiscoveredChar[]) => void

  constructor(
    onStatusChange: (status: BLEStatus) => void,
    onDataReceived: (data: DataView, serviceUUID: string, charUUID: string) => void,
    onDiscovery: (chars: DiscoveredChar[]) => void = () => {}
  ) {
    this.onStatusChange = onStatusChange
    this.onDataReceived = onDataReceived
    this.onDiscovery = onDiscovery
  }

  isSupported(): boolean {
    return 'bluetooth' in navigator
  }

  // ─── Comprehensive optionalServices list ──────────────────────────────────────
  // Web Bluetooth only allows access to services declared here AT REQUEST TIME.
  // We include the entire 0xFF00–0xFFFF proprietary range (256 entries) plus common
  // known UUIDs so that getPrimaryServices() returns whatever the device uses.
  private buildOptionalServices(): BluetoothServiceUUID[] {
    return [
      // Entire 0xFF00–0xFFFF proprietary range (Yolanda, QN, icomon, and all Chinese OEM variants)
      ...Array.from({ length: 256 }, (_, i) => 0xff00 + i),
      // 0xFE00–0xFEFF range (some BLE chips, FEE7 etc.)
      ...Array.from({ length: 256 }, (_, i) => 0xfe00 + i),
      // Additional known proprietary ranges
      0x6e40, 0x6e41, 0x6e42,   // Nordic UART
      0x1000, 0x1001, 0x1002,   // iComon
      // Standard GATT (body composition, weight, battery, heart rate, generic)
      0x181b, 0x181d, 0x180d, 0x180f, 0x1800, 0x1801,
      // Full 128-bit forms of top priority services
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000fff5-0000-1000-8000-00805f9b34fb',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    ]
  }

  // ─── Scan — show all devices ───────────────────────────────────────────────────
  async scanAll(signal?: AbortSignal): Promise<void> {
    if (!this.isSupported()) throw new Error('Web Bluetooth não suportado. Use Chrome ou Edge.')
    this.onStatusChange('scanning')
    try {
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.buildOptionalServices(),
      })
      this.setupDisconnectListener()
      await this.connectAndDiscover(signal)
    } catch (err) {
      this.onStatusChange('error')
      throw err
    }
  }

  // ─── Scan — filtered by name prefix ───────────────────────────────────────────
  async scanFiltered(signal?: AbortSignal): Promise<void> {
    if (!this.isSupported()) throw new Error('Web Bluetooth não suportado. Use Chrome ou Edge.')
    this.onStatusChange('scanning')
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Relax' }, { namePrefix: 'relax' },
          { namePrefix: 'BM' }, { namePrefix: 'RM' },
          { namePrefix: 'Scale' }, { namePrefix: 'Health' },
          { namePrefix: 'Body' }, { namePrefix: 'icomon' }, { namePrefix: 'QN' },
        ],
        optionalServices: this.buildOptionalServices(),
      })
      this.setupDisconnectListener()
      await this.connectAndDiscover(signal)
    } catch (err) {
      this.onStatusChange('error')
      throw err
    }
  }

  private setupDisconnectListener(): void {
    if (this.device && !this.disconnectListener) {
      this.disconnectListener = () => this.onStatusChange('disconnected')
      this.device.addEventListener('gattserverdisconnected', this.disconnectListener)
    }
  }

  // ─── Connect and discover ──────────────────────────────────────────────────────
  private async connectAndDiscover(signal?: AbortSignal): Promise<void> {
    if (!this.device) throw new Error('Sem dispositivo')
    this.onStatusChange('connecting')
    this.allDiscoveredChars = []
    this.abortController = new AbortController()

    // Check if already aborted
    if (signal?.aborted || this.abortController.signal.aborted) {
      throw new Error('Operação cancelada')
    }

    try {
      this.server = await this.device.gatt!.connect()

      // Check abort after connect
      if (signal?.aborted || this.abortController.signal.aborted) {
        this.server.disconnect()
        throw new Error('Operação cancelada')
      }

      // getPrimaryServices() returns ALL services present on the device that are
      // listed in optionalServices — with our comprehensive list this covers all protocols.
      let services: BluetoothRemoteGATTService[] = []
      try {
        services = await this.server.getPrimaryServices()
        console.log('[BLE] getPrimaryServices returned', services.length, 'services:',
          services.map(s => s.uuid))
      } catch {
        console.log('[BLE] getPrimaryServices failed, using brute-force fallback')
      }

      // Brute-force fallback: probe top priority UUIDs individually if getPrimaryServices failed
      if (services.length === 0) {
        const priority: BluetoothServiceUUID[] = [
          0xffe0, 0xfff0, 0xff01, 0xff12, 0xffe5, 0xfff5,
          0xfee0, 0xfee7, 0xfd00, 0x1000, 0x181b, 0x181d, 0x1800, 0x1801,
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000fff0-0000-1000-8000-00805f9b34fb',
        ]
        for (const uuid of priority) {
          if (signal?.aborted || this.abortController.signal.aborted) break
          try { services.push(await this.server.getPrimaryService(uuid)) } catch {}
        }
      }

      const discovered = await this.subscribeServices(services, signal)
      this.allDiscoveredChars = [...discovered]
      this.onDiscovery(discovered)
      this.onStatusChange('connected')

      // Schedule re-probes to catch services added dynamically via Service Changed.
      // We use getPrimaryServices() in each reprobe — fast single call covers everything.
      this.scheduleReprobes()

    } catch (err) {
      this.onStatusChange('error')
      throw err
    }
  }

  // ─── Subscribe to characteristics in a list of services ───────────────────────
  private async subscribeServices(services: BluetoothRemoteGATTService[], signal?: AbortSignal): Promise<DiscoveredChar[]> {
    const discovered: DiscoveredChar[] = []
    const subscribedUUIDs = new Set(this.activeNotifyChars.map(c => c.uuid))

    for (const service of services) {
      if (signal?.aborted || this.abortController?.signal.aborted) break

      let chars: BluetoothRemoteGATTCharacteristic[] = []
      try { chars = await service.getCharacteristics() } catch { continue }

      for (const char of chars) {
        if (signal?.aborted || this.abortController?.signal.aborted) break

        const props: string[] = []
        if (char.properties.read)               props.push('read')
        if (char.properties.write)              props.push('write')
        if (char.properties.notify)             props.push('notify')
        if (char.properties.indicate)           props.push('indicate')
        if (char.properties.writeWithoutResponse) props.push('writeNoResp')

        discovered.push({ serviceUUID: service.uuid, charUUID: char.uuid, properties: props })

        // Never subscribe to Service Changed (0x2A05) — it causes an indication storm
        // that loops reprobeAndExtend. Scheduled reprobes handle late-appearing services.
        if (char.uuid === SERVICE_CHANGED_UUID) continue

        if ((char.properties.notify || char.properties.indicate) && !subscribedUUIDs.has(char.uuid)) {
          try {
            await char.startNotifications()
            const sUUID = service.uuid
            const cUUID = char.uuid
            const handler = (e: Event) => {
              const c = e.target as BluetoothRemoteGATTCharacteristic
              if (c.value) this.onDataReceived(c.value, sUUID, cUUID)
            }
            char.addEventListener('characteristicvaluechanged', handler)
            this.charValueHandlers.set(char, handler)
            this.activeNotifyChars.push(char)
            subscribedUUIDs.add(char.uuid)
          } catch {}
        }

        if (char.properties.read) {
          try {
            const val = await char.readValue()
            this.onDataReceived(val, service.uuid, char.uuid)
          } catch {}
        }
      }
    }
    return discovered
  }

  // ─── Scheduled re-probes ──────────────────────────────────────────────────────
  private scheduleReprobes(): void {
    for (const t of this.reprobeTimers) clearTimeout(t)
    this.reprobeTimers = []
    for (const delay of [1200, 3500, 8000]) {
      const t = setTimeout(() => {
        if (this.server && !this.abortController?.signal.aborted) this.reprobeAndExtend().catch(() => {})
      }, delay)
      this.reprobeTimers.push(t)
    }
  }

  // ─── Re-probe using getPrimaryServices() ──────────────────────────────────────
  // Called by timer. Mutex prevents concurrent runs (race condition guard).
  async reprobeAndExtend(): Promise<void> {
    if (!this.server || this.reprobing || this.abortController?.signal.aborted) return
    this.reprobing = true
    try {
      let allCurrent: BluetoothRemoteGATTService[] = []
      try {
        allCurrent = await this.server.getPrimaryServices()
      } catch { return }

      const existingServiceUUIDs = new Set(this.allDiscoveredChars.map(c => c.serviceUUID))
      const newServices = allCurrent.filter(s => !existingServiceUUIDs.has(s.uuid))

      if (newServices.length === 0) return

      console.log('[BLE] reprobeAndExtend: found', newServices.length, 'new service(s):',
        newServices.map(s => s.uuid))

      const newChars = await this.subscribeServices(newServices)
      const existingCharUUIDs = new Set(this.allDiscoveredChars.map(c => c.charUUID))
      const reallyNew = newChars.filter(c => !existingCharUUIDs.has(c.charUUID))

      if (reallyNew.length > 0) {
        this.allDiscoveredChars = [...this.allDiscoveredChars, ...reallyNew]
        this.onDiscovery(reallyNew) // Connect.tsx merges these into discoveredChars state
      }
    } finally {
      this.reprobing = false
    }
  }

  // ─── Send command ──────────────────────────────────────────────────────────────
  async sendCommand(serviceUUID: string, charUUID: string, bytes: number[]): Promise<void> {
    if (!this.server) throw new Error('Não conectado')
    if (this.abortController?.signal.aborted) throw new Error('Operação cancelada')

    const service = await this.server.getPrimaryService(serviceUUID)
    const char = await service.getCharacteristic(charUUID)
    const data = new Uint8Array(bytes)
    if (char.properties.writeWithoutResponse && 'writeValueWithoutResponse' in char) {
      await (char as unknown as { writeValueWithoutResponse(v: BufferSource): Promise<void> }).writeValueWithoutResponse(data)
    } else {
      try {
        await char.writeValue(data)
      } catch {
        if ('writeValueWithoutResponse' in char) {
          await (char as unknown as { writeValueWithoutResponse(v: BufferSource): Promise<void> }).writeValueWithoutResponse(data)
        } else throw new Error('Característica não aceita escrita')
      }
    }
  }

  // ─── Disconnect ────────────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    // Abort any ongoing operations
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    // Clear reprobe timers
    for (const t of this.reprobeTimers) clearTimeout(t)
    this.reprobeTimers = []

    // Stop notifications and remove event listeners
    for (const char of this.activeNotifyChars) {
      try {
        await char.stopNotifications()
      } catch {}
      // Remove the event listener
      const handler = this.charValueHandlers.get(char)
      if (handler) {
        char.removeEventListener('characteristicvaluechanged', handler)
        this.charValueHandlers.delete(char)
      }
    }
    this.activeNotifyChars = []
    this.charValueHandlers.clear()

    // Remove device disconnect listener
    if (this.device && this.disconnectListener) {
      this.device.removeEventListener('gattserverdisconnected', this.disconnectListener)
      this.disconnectListener = null
    }

    this.allDiscoveredChars = []
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.server = null
    this.onStatusChange('disconnected')
  }

  getDeviceName(): string {
    return this.device?.name ?? 'Desconhecido'
  }
}

import { Measurement, Impedances } from '../types'
import { safeValidateMeasurement } from '../utils/validation'

// Yolanda/QN BLE Protocol - Relaxmedic RM-BD2305A-B
// Service: 0xFFE0 | Notify: 0xFFE1 | Write: 0xFFE3
// Packet types (byte[0]): 0x24=realtime weight, 0x1F/0xA4=body composition, 0x03=4-electrode

export function buildUserDataCommand(
  sex: 'male' | 'female',
  age: number,
  heightCm: number
): Uint8Array {
  const sexByte = sex === 'male' ? 1 : 0
  const hH = (heightCm >> 8) & 0xff
  const hL = heightCm & 0xff
  const payload = [0x13, 0x09, 0x00, 0x09, sexByte, age & 0xff, hH, hL, 0x00]
  let crc = 0
  for (let i = 1; i < payload.length; i++) crc ^= payload[i]
  return new Uint8Array([...payload, crc])
}

function u16be(b: number[], i: number) { return (b[i] << 8) | b[i + 1] }
function r1(v: number) { return Math.round(v * 10) / 10 }
function calcBMI(w: number, hCm: number) { const h = hCm / 100; return r1(w / (h * h)) }

export type PacketKind = 'weight_realtime' | 'body_composition' | 'unknown'

export function identifyPacket(bytes: number[]): PacketKind {
  if (bytes.length < 4) return 'unknown'
  const t = bytes[0]
  // Yolanda/QN real-time weight packets (various firmware versions)
  if (t === 0x24 || t === 0x22 || t === 0x20) return 'weight_realtime'
  // Yolanda/QN body composition packets (various firmware versions)
  if (t === 0x1F || t === 0xA4 || t === 0x03 ||
      t === 0x10 || t === 0x12 || t === 0x15 ||
      t === 0x1A || t === 0x1B || t === 0x1C || t === 0x1E) return 'body_composition'
  return 'unknown'
}

/**
 * Fallback: tenta extrair peso de qualquer pacote testando múltiplas posições de bytes.
 * Usado quando o byte[0] não é reconhecido mas a balança está claramente enviando dados.
 * Minimum 30 kg to avoid false positives from length/header fields.
 */
export function tryExtractWeightFromAnyPacket(bytes: number[]): number | null {
  if (bytes.length < 3) return null
  const tryBE = (hi: number, lo: number): number | null => {
    if (lo >= bytes.length || hi >= bytes.length) return null
    const raw = (bytes[hi] << 8) | bytes[lo]
    const w100 = raw / 100
    if (w100 >= 30 && w100 <= 250) return Math.round(w100 * 10) / 10
    const w10 = raw / 10
    if (w10 >= 30 && w10 <= 250) return Math.round(w10 * 10) / 10
    return null
  }
  // Try most common byte positions: Yolanda [4,5], FFB0 [2,3], generic [1,2], [3,4], [5,6]
  for (const [hi, lo] of [[4, 5], [2, 3], [1, 2], [3, 4], [5, 6]] as [number, number][]) {
    const w = tryBE(hi, lo)
    if (w !== null) return w
  }
  return null
}

// ─── FFB0 Protocol (Relaxmedic-2305 / 0xFFB0 service) ────────────────────────
// This is a different protocol from Yolanda/QN (FFE0).
// Service: 0xFFB0 | Write: 0xFFB1 | Notify: 0xFFB2 (or similar)
//
// Large measurement packet (≥30 bytes):
//   byte[0]: sequence counter (0x02–0x09)
//   bytes[1]: 0x00
//   bytes[2-3]: WEIGHT big-endian /100  (e.g., 0x2600 = 97.28 kg)
//   bytes[4+]:  device data / zeros (BIA data format TBD)
//   last byte:  CRC
//
// Short sub-measurement packets (12 bytes):
//   byte[0]: 0x1b, 0x1c, 0x1e, 0x1f, 0xa4 (segment/completion markers)
//   bytes[8-9]: raw impedance data (format under analysis)

export function isFFB0Service(serviceUUID: string): boolean {
  return serviceUUID.toLowerCase().includes('ffb0')
}

/**
 * Detect a complete/stable FFB0 measurement packet.
 * Types 0x04–0x09 represent stable weight readings (past the initial settling).
 */
export function detectFFB0Complete(bytes: number[]): number | null {
  if (bytes.length < 30) return null
  if (bytes[0] < 0x04 || bytes[0] > 0x09) return null
  // Weight at bytes[2-3] big-endian / 100
  const raw = (bytes[2] << 8) | bytes[3]
  const w = raw / 100
  if (w >= 30 && w <= 250) return Math.round(w * 10) / 10
  return null
}

export function decodeWeightPacket(bytes: number[]): number | null {
  if (bytes.length < 6) return null
  const raw = u16be(bytes, 4)
  const k100 = raw / 100
  if (k100 >= 10 && k100 <= 300) return r1(k100)
  const k10 = raw / 10
  if (k10 >= 10 && k10 <= 300) return r1(k10)
  return null
}

export function decodeBodyPacket(
  bytes: number[],
  profile: { height: number; sex: 'male' | 'female'; age: number }
): Partial<Measurement> | null {
  if (bytes.length < 8) return null
  console.log('[Yolanda] raw:', bytes.map(b => b.toString(16).padStart(2, '0')).join(' '))

  const rawW = u16be(bytes, 4)
  let weight = rawW / 100
  if (weight < 10 || weight > 300) weight = rawW / 10
  if (weight < 10 || weight > 300) return null
  weight = r1(weight)
  const bmi = calcBMI(weight, profile.height)

  let impedances: Impedances
  if (bytes.length >= 26) {
    impedances = {
      rightArm20:  r1(u16be(bytes,  6) / 10),
      leftArm20:   r1(u16be(bytes,  8) / 10),
      trunk20:     r1(u16be(bytes, 10) / 10),
      rightLeg20:  r1(u16be(bytes, 12) / 10),
      leftLeg20:   r1(u16be(bytes, 14) / 10),
      rightArm100: r1(u16be(bytes, 16) / 10),
      leftArm100:  r1(u16be(bytes, 18) / 10),
      trunk100:    r1(u16be(bytes, 20) / 10),
      rightLeg100: r1(u16be(bytes, 22) / 10),
      leftLeg100:  r1(u16be(bytes, 24) / 10),
    }
  } else {
    const imp = bytes.length >= 10 ? r1(u16be(bytes, 6) / 10) : 400
    impedances = {
      rightArm20: 0, leftArm20: 0, trunk20: 0,
      rightLeg20: imp, leftLeg20: imp,
      rightArm100: 0, leftArm100: 0, trunk100: 0, rightLeg100: 0, leftLeg100: 0,
    }
  }

  const Z   = impedances.rightLeg20 > 0 ? impedances.rightLeg20 : 400
  const h   = profile.height / 100
  const H2  = h * h * 10000
  const { sex, age } = profile
  const sexC = sex === 'male' ? 2.94 : -9.37
  const ffm  = Math.max(0, 0.734 * (H2 / Z) + 0.116 * weight + sexC)

  const fatMass     = r1(Math.max(0, weight - ffm))
  const fatPercent  = r1(Math.max(0, (fatMass / weight) * 100))
  const waterMass   = sex === 'male'
    ? r1(Math.max(0, 0.3669 * H2 / Z + 0.3145 * weight + 8.084))
    : r1(Math.max(0, 0.3561 * H2 / Z + 0.1835 * weight + 11.027))
  const waterPercent   = r1((waterMass / weight) * 100)
  const proteinMass    = r1(ffm * 0.19)
  const proteinPercent = r1((proteinMass / weight) * 100)
  const boneMass       = r1(ffm * 0.055)
  const muscleMass     = r1(Math.max(0, ffm - boneMass))
  const musclePercent  = r1((muscleMass / weight) * 100)
  const visceralFat = Math.min(20, Math.max(1, Math.round(
    sex === 'male'
      ? -503.8 + 5.455 * fatPercent + 0.065 * age * fatPercent + 6.565 * bmi
      : -302.2 + 3.455 * fatPercent + 0.035 * age * fatPercent + 4.565 * bmi
  )))
  const bmr = Math.round(sex === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * profile.height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * profile.height - 4.330 * age)
  const metabolicAge = Math.max(10, Math.round(
    age - (fatPercent - (sex === 'male' ? 15 : 24)) * 0.5
  ))

  const result = {
    weight, bmi, fatMass, fatPercent, waterMass, waterPercent,
    muscleMass, musclePercent, boneMass, proteinMass, proteinPercent,
    visceralFat, metabolicAge, bmr, impedances, rawBytes: bytes,
  }

  // Validate the result
  const validated = safeValidateMeasurement({
    id: 'temp', // temporary ID for validation
    profileId: 'temp', // temporary profile ID for validation
    timestamp: new Date().toISOString(),
    ...result
  })

  return validated ? result : null
}

export function decodePacket(data: DataView, profileHeight: number): Partial<Measurement> | null {
  const bytes: number[] = []
  for (let i = 0; i < data.byteLength; i++) bytes.push(data.getUint8(i))
  if (bytes.length < 6) return null
  console.log('[BLE fallback]', bytes.map(b => b.toString(16).padStart(2, '0')).join(' '))
  if (identifyPacket(bytes) !== 'unknown') return null

  const weight = (bytes[1] | (bytes[2] << 8)) / 10
  if (weight < 5 || weight > 300) return null
  return {
    weight, bmi: calcBMI(weight, profileHeight),
    fatMass: 0, fatPercent: 0, waterMass: 0, waterPercent: 0,
    muscleMass: 0, musclePercent: 0, boneMass: 0,
    proteinMass: 0, proteinPercent: 0, visceralFat: 0, metabolicAge: 0, bmr: 0,
    impedances: {
      rightArm20:0, rightArm100:0, leftArm20:0, leftArm100:0,
      trunk20:0, trunk100:0, rightLeg20:0, rightLeg100:0, leftLeg20:0, leftLeg100:0,
    },
    rawBytes: bytes,
  }
}

export function simulateMeasurement(height: number): Partial<Measurement> {
  const h = height / 100
  const bmiT = 20 + Math.random() * 8
  const weight = r1(bmiT * h * h)
  const fatPct = 12 + Math.random() * 18
  const fatMass = r1(weight * fatPct / 100)
  const ffm = weight - fatMass
  const waterMass = r1(ffm * 0.73)
  const proteinMass = r1(ffm * 0.19)
  const boneMass = r1(ffm * 0.055)
  const muscleMass = r1(ffm - boneMass)
  const armB = 260 + Math.random() * 60
  const legB = 230 + Math.random() * 50
  const trkB = 9 + Math.random() * 5
  return {
    weight, bmi: r1(weight / (h * h)),
    fatMass, fatPercent: r1(fatPct),
    waterMass, waterPercent: r1((waterMass / weight) * 100),
    muscleMass, musclePercent: r1((muscleMass / weight) * 100),
    boneMass, proteinMass, proteinPercent: r1((proteinMass / weight) * 100),
    visceralFat: Math.floor(3 + Math.random() * 12),
    metabolicAge: Math.floor(22 + Math.random() * 25),
    bmr: Math.floor(1300 + Math.random() * 600),
    impedances: {
      rightArm20:  r1(armB),
      rightArm100: r1(armB * 0.89),
      leftArm20:   r1(armB + (Math.random() - .5) * 20),
      leftArm100:  r1((armB + 5) * 0.89),
      trunk20:     r1(trkB),
      trunk100:    r1(trkB * 0.76),
      rightLeg20:  r1(legB),
      rightLeg100: r1(legB * 0.87),
      leftLeg20:   r1(legB + (Math.random() - .5) * 15),
      leftLeg100:  r1((legB + 5) * 0.87),
    },
  }
}

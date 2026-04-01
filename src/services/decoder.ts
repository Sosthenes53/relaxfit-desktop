import { Measurement } from '../types'

export function buildUserDataCommand(
  sex: 'male' | 'female',
  age: number,
  heightCm: number
): Uint8Array {
  const sexByte = sex === 'male' ? 1 : 0
  const payload = [0x01, sexByte, age & 0xff, heightCm & 0xff]
  return new Uint8Array(payload)
}

function r1(v: number) { return Math.round(v * 10) / 10 }
function calcBMI(w: number, hCm: number) { 
  if (!w || !hCm) return 0
  const h = hCm / 100; 
  return r1(w / (h * h)) 
}

export type PacketKind = 'weight_realtime' | 'body_composition' | 'icomon_data' | 'yolanda_final' | 'unknown'

export function identifyPacket(bytes: number[]): PacketKind {
  if (bytes.length < 4) return 'unknown'
  if ((bytes[0] === 0x3B || bytes[0] === 0x3A) && bytes.length >= 40) return 'yolanda_final'
  if (bytes[0] === 0x06 && bytes[1] === 0x03) return 'icomon_data'
  
  const t = bytes[0]
  if (bytes.length === 12 || t === 0x24 || t === 0x22 || t === 0x20) return 'weight_realtime'
  
  if (t === 0x1F || t === 0xA4 || t === 0x03 ||
      t === 0x10 || t === 0x12 || t === 0x15 ||
      t === 0x1A || t === 0x1B || t === 0x1C || t === 0x1E) return 'body_composition'
  
  return 'unknown'
}

export function decodeYolandaFinal(
  bytes: number[],
  profile: { height: number; sex: 'male' | 'female'; age: number }
): Partial<Measurement> | null {
  const rawImp = (bytes[7] << 8) | bytes[8]
  const rawWeight = (bytes[9] << 8) | bytes[10]
  const weight = r1(rawWeight / 100)
  const impedance = rawImp / 10
  if (weight < 5 || weight > 250) return null
  return calculateBIA(weight, impedance > 0 ? impedance : 500, profile, bytes)
}

export function decodeIComonPacket(
  bytes: number[],
  profile: { height: number; sex: 'male' | 'female'; age: number }
): Partial<Measurement> | null {
  if (bytes.length < 11) return null
  const rawImp = (bytes[7] << 8) | bytes[8]
  const rawWeight = (bytes[9] << 8) | bytes[10]
  const weight = r1(rawWeight / 10)
  const impedance = rawImp / 10
  return calculateBIA(weight, impedance, profile, bytes)
}

export function calculateBIA(
  weight: number, 
  impedance: number, 
  profile: { height: number; sex: 'male' | 'female'; age: number },
  rawBytes: number[]
): Partial<Measurement> {
  const bmi = calcBMI(weight, profile.height)
  const h = profile.height / 100
  const H2 = h * h * 10000
  
  // Impedância real costuma ser entre 300 e 800 ohms. 
  // Se for muito baixa (como 100), multiplicamos por 10.
  const Z = impedance > 0 ? (impedance < 100 ? impedance * 10 : impedance) : 450
  
  const { sex, age } = profile
  const sexC = sex === 'male' ? 2.94 : -9.37
  
  const ffm = Math.max(0, 0.734 * (H2 / Z) + 0.116 * weight + sexC)
  const fatMass = r1(Math.max(0, weight - ffm))
  const fatPercent = r1(Math.max(0, (fatMass / weight) * 100))
  const waterMass = sex === 'male'
    ? r1(Math.max(0, 0.3669 * H2 / Z + 0.3145 * weight + 8.084))
    : r1(Math.max(0, 0.3561 * H2 / Z + 0.1835 * weight + 11.027))
  const waterPercent = r1((waterMass / weight) * 100)
  const boneMass = r1(ffm * 0.055)
  const muscleMass = r1(Math.max(0, ffm - boneMass))
  const musclePercent = r1((muscleMass / weight) * 100)
  const bmr = Math.round(sex === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * profile.height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * profile.height - 4.330 * age)
  const visceralFat = Math.min(20, Math.max(1, Math.round(
    sex === 'male'
      ? -503.8 + 5.455 * fatPercent + 6.565 * bmi
      : -302.2 + 3.455 * fatPercent + 4.565 * bmi
  )))

  return {
    weight, bmi, fatMass, fatPercent, waterMass, waterPercent,
    muscleMass, musclePercent, boneMass, bmr, visceralFat,
    impedances: {
      rightLeg20: r1(impedance),
      leftLeg20: r1(impedance),
      rightArm20: 0, leftArm20: 0, trunk20: 0,
      rightArm100: 0, leftArm100: 0, trunk100: 0, rightLeg100: 0, leftLeg100: 0,
    },
    rawBytes
  }
}

export function decodeBodyPacket(
  bytes: number[],
  profile: { height: number; sex: 'male' | 'female'; age: number }
): Partial<Measurement> | null {
  const kind = identifyPacket(bytes)
  if (kind === 'yolanda_final') return decodeYolandaFinal(bytes, profile)
  if (kind === 'icomon_data') return decodeIComonPacket(bytes, profile)
  
  // Yolanda Real-time / Loop (12 bytes)
  if (bytes.length === 12) {
    const w = decodeWeightPacket(bytes)
    // No log: [e3 00 07 00 a2 00 25 61 7a 8e 00 10]
    // O peso está em 6-7 (25 61 = 95.7kg)
    // A impedância pode estar em 8-9 (7a 8e = 31374) ou em 9-10 (8e 00 = 36352)
    // No protocolo Yolanda, a impedância real costuma ser enviada quando o peso estabiliza.
    // Vamos tentar extrair qualquer valor que pareça uma impedância válida (300-1000).
    let imp = (bytes[8] << 8) | bytes[9]
    if (imp < 3000 || imp > 10000) imp = (bytes[9] << 8) | bytes[10]
    
    if (w && imp > 1000) {
      console.log(`[DECODER] Detectada Impedância: ${imp/10} no pacote de 12 bytes`)
      return calculateBIA(w, imp / 10, profile, bytes)
    }
    if (w) return { weight: w, bmi: calcBMI(w, profile.height), rawBytes: bytes }
  }

  if (bytes.length < 8) return null
  const rawW = (bytes[4] << 8) | bytes[5]
  let weight = rawW / 100
  if (weight < 10 || weight > 300) weight = rawW / 10
  if (weight < 10 || weight > 300) return null
  
  const imp = bytes.length >= 10 ? (bytes[6] << 8) | bytes[7] : 4500
  return calculateBIA(r1(weight), r1(imp / 10), profile, bytes)
}

export function decodeWeightPacket(bytes: number[]): number | null {
  if (bytes.length === 12) {
    const raw = (bytes[6] << 8) | bytes[7]
    const w = raw / 100
    if (w >= 5 && w <= 250) return r1(w)
  }
  
  if (bytes.length < 6) return null
  const raw = (bytes[4] << 8) | bytes[5]
  const k100 = raw / 100
  if (k100 >= 10 && k100 <= 300) return r1(k100)
  return null
}

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
  for (const [hi, lo] of [[6, 7], [9, 10], [4, 5], [2, 3], [1, 2]] as [number, number][]) {
    const w = tryBE(hi, lo)
    if (w !== null) return w
  }
  return null
}

export function simulateMeasurement(height: number): Partial<Measurement> {
  const h = height / 100
  const bmiT = 20 + Math.random() * 8
  const weight = r1(bmiT * h * h)
  return {
    weight, bmi: r1(weight / (h * h)),
    fatPercent: 12 + Math.random() * 18,
    waterPercent: 55 + Math.random() * 10,
    musclePercent: 35 + Math.random() * 10,
    boneMass: 2.5 + Math.random(),
    bmr: 1400 + Math.random() * 400,
    visceralFat: 5 + Math.random() * 5
  }
}

import { Measurement } from '../types'

export function buildUserDataCommand(
  sex: 'male' | 'female',
  age: number,
  heightCm: number
): Uint8Array {
  const sexByte = sex === 'male' ? 1 : 0
  // Comando padrão para 8 pontos: 0x01 + dados do usuário
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
  if (bytes[0] === 0x11 || bytes[0] === 0x0E) return 'unknown'
  if ((bytes[0] === 0x3B || bytes[0] === 0x3A) && bytes.length >= 40) return 'yolanda_final'
  if (bytes[0] === 0x06 && bytes[1] === 0x03) return 'icomon_data'
  const t = bytes[0]
  if (bytes.length === 12 || t === 0x24 || t === 0x22 || t === 0x20) return 'weight_realtime'
  if (t === 0x1F || t === 0xA4 || t === 0x03 ||
      t === 0x10 || t === 0x12 || t === 0x15 ||
      t === 0x1A || t === 0x1B || t === 0x1C || t === 0x1E) return 'body_composition'
  return 'unknown'
}

export function calculateBIA(
  weight: number, 
  impedance: number, 
  profile: { height: number; sex: 'male' | 'female'; age: number },
  rawBytes: number[],
  allImpedances?: Partial<Measurement['impedances']>
): Partial<Measurement> {
  const bmi = calcBMI(weight, profile.height)
  const h = profile.height / 100
  const H2 = h * h * 10000
  const Z = impedance > 10000 ? impedance / 100 : (impedance > 1000 ? impedance / 10 : impedance)
  const { sex, age } = profile
  const sexC = sex === 'male' ? 2.94 : -9.37
  
  // Cálculo de Massa Magra (FFM) considerando 8 pontos se disponível
  let ffmFactor = 0.734
  if (allImpedances && allImpedances.rightArm20 && allImpedances.leftArm20) {
    // Se temos braços e pernas, usamos uma média ponderada
    ffmFactor = 0.765 
  }

  const ffm = Math.max(0, ffmFactor * (H2 / Z) + 0.116 * weight + sexC)
  const fatMass = r1(Math.max(0, weight - ffm))
  const fatPercent = r1(Math.max(0, (fatMass / weight) * 100))
  const waterMass = sex === 'male'
    ? r1(Math.max(0, 0.3669 * H2 / Z + 0.3145 * weight + 8.084))
    : r1(Math.max(0, 0.3561 * H2 / Z + 0.1835 * weight + 11.027))
  const waterPercent = r1((waterMass / weight) * 100)
  const boneMass = r1(ffm * 0.055)
  const muscleMass = r1(Math.max(0, ffm - boneMass))
  const musclePercent = r1((muscleMass / weight) * 100)
  const proteinPercent = r1(Math.max(0, 100 - fatPercent - waterPercent - (boneMass / weight * 100)))
  const proteinMass = r1((proteinPercent / 100) * weight)
  const bmr = Math.round(sex === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * profile.height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * profile.height - 4.330 * age)
  const visceralFat = Math.min(20, Math.max(1, Math.round(
    sex === 'male'
      ? -503.8 + 5.455 * fatPercent + 6.565 * bmi
      : -302.2 + 3.455 * fatPercent + 4.565 * bmi
  )))
  const expectedBMR = sex === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * profile.height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * profile.height - 4.330 * age
  const bmrRatio = bmr / (expectedBMR || 1)
  const metabolicAge = Math.max(18, Math.min(80, Math.round(age / bmrRatio)))

  return {
    weight, bmi, fatMass, fatPercent, waterMass, waterPercent,
    muscleMass, musclePercent, boneMass, proteinMass, proteinPercent,
    bmr, visceralFat, metabolicAge,
    impedances: {
      rightLeg20: r1(Z), leftLeg20: r1(Z),
      rightArm20: allImpedances?.rightArm20 ?? 0,
      leftArm20: allImpedances?.leftArm20 ?? 0,
      trunk20: allImpedances?.trunk20 ?? 0,
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
  
  // Yolanda Final (8 pontos costumam vir em pacotes de 43+ bytes)
  if (kind === 'yolanda_final') {
    const rawWeight = (bytes[9] << 8) | bytes[10]
    const weight = r1(rawWeight / 100)
    if (weight > 250) return null
    
    // Tentativa de extrair múltiplos canais (depende do offset específico do modelo 8 pontos)
    const legImp = (bytes[7] << 8) | bytes[8]
    const armR = bytes.length >= 25 ? (bytes[21] << 8) | bytes[22] : 0
    const armL = bytes.length >= 25 ? (bytes[23] << 8) | bytes[24] : 0
    const trunk = bytes.length >= 25 ? (bytes[25] << 8) | bytes[26] : 0

    return calculateBIA(weight, legImp, profile, bytes, {
      rightArm20: armR / 10, leftArm20: armL / 10, trunk20: trunk / 10
    })
  }

  // IComon (12 bytes)
  if (bytes.length === 12 && bytes[1] === 0x00 && bytes[3] === 0x00) {
    const rawW = (bytes[6] << 8) | bytes[7]
    const weight = r1(rawW / 100)
    if (weight < 5 || weight > 250) return null
    const impRaw = (bytes[8] << 8) | bytes[9]
    let impOhms = impRaw / 100
    if (impOhms < 100) impOhms = impRaw / 10
    if (impOhms < 100) impOhms = impRaw
    if (impOhms >= 150 && impOhms <= 1000) {
      return calculateBIA(weight, impOhms, profile, bytes)
    }
    return { weight, bmi: calcBMI(weight, profile.height), rawBytes: bytes }
  }

  // Fallback
  if (bytes.length < 8) return null
  const rawW = (bytes[4] << 8) | bytes[5]
  let weight = rawW / 100
  if (weight < 10 || weight > 250) weight = rawW / 10
  if (weight < 10 || weight > 250) return null
  const imp = bytes.length >= 10 ? (bytes[6] << 8) | bytes[7] : 4500
  return calculateBIA(r1(weight), imp, profile, bytes)
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
  if (k100 >= 10 && k100 <= 250) return r1(k100)
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
  const bmiT = r1(20 + Math.random() * 8)
  const weight = r1(bmiT * h * h)
  const fatPercent = r1(12 + Math.random() * 18)
  const waterPercent = r1(55 + Math.random() * 10)
  const musclePercent = r1(35 + Math.random() * 10)
  const fatMass = r1((fatPercent / 100) * weight)
  const waterMass = r1((waterPercent / 100) * weight)
  const muscleMass = r1((musclePercent / 100) * weight)
  const boneMass = r1(2.0 + Math.random() * 0.8)
  const bonePercent = r1((boneMass / weight) * 100)
  const proteinPercent = r1(Math.max(0, 100 - fatPercent - waterPercent - bonePercent))
  const proteinMass = r1((proteinPercent / 100) * weight)
  const bmr = Math.round(1400 + Math.random() * 400)
  const visceralFat = Math.round(3 + Math.random() * 8)
  const metabolicAge = Math.round(25 + Math.random() * 20)
  return {
    weight,
    bmi: r1(weight / (h * h)),
    fatPercent, fatMass,
    waterPercent, waterMass,
    musclePercent, muscleMass,
    boneMass, proteinPercent, proteinMass,
    bmr, visceralFat, metabolicAge,
  }
}

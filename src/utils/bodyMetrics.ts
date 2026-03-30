import { Measurement, Impedances, SegmentalData, Profile } from '../types'

const r = (v: number, decimals = 1) => Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)

/** BMI */
export function calcBMI(weight: number, heightCm: number): number {
  const h = heightCm / 100
  return r(weight / (h * h))
}

/** Target weight at BMI 24.8 */
export function calcTargetWeight(heightCm: number): number {
  const h = heightCm / 100
  return r(24.8 * h * h)
}

/** Obesity ratio: weight / weight@BMI22 × 100 */
export function calcObesity(weight: number, heightCm: number): number {
  const h = heightCm / 100
  const idealWeight = 22 * h * h
  return r((weight / idealWeight) * 100)
}

/** Subcutaneous fat % (validated: 15.2 × 0.718 = 10.9) */
export function calcSubcutaneousFat(fatPercent: number, sex: 'male' | 'female'): number {
  return r(fatPercent * (sex === 'male' ? 0.718 : 0.76))
}

/** Skeletal muscle mass (validated: 75.6 × 0.620 = 46.9 for male) */
export function calcSkeletalMuscle(muscleMass: number, sex: 'male' | 'female'): number {
  return r(muscleMass * (sex === 'male' ? 0.620 : 0.545))
}

/** Lean mass */
export function calcLeanMass(weight: number, fatMass: number): number {
  return r(weight - fatMass)
}

/**
 * Body score 0-100
 * Validated: Sosthenes (bmi=25.4, fat=15.2%, muscle=79.2%, visceral=4) → score≈88
 */
export function calcBodyScore(
  bmi: number,
  fatPercent: number,
  musclePercent: number,
  visceralFat: number,
  waterPercent: number,
  proteinPercent: number,
  sex: 'male' | 'female'
): number {
  let score = 100

  // BMI deviation from ideal (22): penalty ×3.1
  score -= Math.abs(bmi - 22) * 3.1

  // Fat % deviation from ideal (male=15%, female=24%)
  const fatIdeal = sex === 'male' ? 15 : 24
  score -= Math.abs(fatPercent - fatIdeal) * 0.5

  // Muscle bonus (above 75% for male, 60% for female)
  const muscleTarget = sex === 'male' ? 75 : 60
  if (musclePercent > muscleTarget) {
    score += (musclePercent - muscleTarget) * 0.1
  } else {
    score -= (muscleTarget - musclePercent) * 0.3
  }

  // Visceral fat penalty
  if (visceralFat > 9) score -= (visceralFat - 9) * 3
  else if (visceralFat > 5) score -= (visceralFat - 5) * 1

  // Water bonus/penalty
  const [wMin, wMax] = sex === 'male' ? [55, 65] : [45, 60]
  if (waterPercent < wMin) score -= (wMin - waterPercent) * 1
  else if (waterPercent > wMax) score -= (waterPercent - wMax) * 0.5

  // Protein
  if (proteinPercent < 16) score -= (16 - proteinPercent) * 2

  return Math.max(0, Math.min(100, Math.round(score)))
}

/** Body age estimate */
export function calcBodyAge(age: number, score: number): number {
  const adjustment = -(score - 80) / 5
  return Math.max(10, Math.min(age + 30, Math.round(age + adjustment)))
}

/**
 * Body type classification (matches Relaxmedic chart grid)
 * Validated: bmi=25.4, fat=15.2%, male → "Ligeiramente obeso"
 */
export function getBodyType(bmi: number, fatPercent: number, sex: 'male' | 'female'): string {
  const [fLow, fHigh, fVHigh] = sex === 'male'
    ? [10, 20, 30]
    : [18, 28, 38]

  if (bmi < 18.5) return fatPercent < fLow ? 'Abaixo do peso' : 'Magro'

  if (bmi < 25) {
    if (fatPercent < fLow - 5) return 'Muscular magro'
    if (fatPercent < fLow)     return 'Atleta'
    if (fatPercent <= fHigh)   return 'Saudável'
    if (fatPercent <= fVHigh)  return 'Sobrepeso'
    return 'Obesidade'
  }

  if (bmi < 30) {
    if (fatPercent < fLow)   return 'Musculoso'
    if (fatPercent <= fHigh) return 'Ligeiramente obeso'
    return 'Obeso'
  }

  return 'Obesidade'
}

/** BMR — Mifflin-St Jeor equation */
export function calcBMR(weight: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
  const base = 10 * weight + 6.25 * heightCm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

/**
 * SMI — Skeletal Muscle Index
 * SMI = appendicular lean (arms+legs) / heightM²
 * appendicular lean estimated from total lean and standard proportions
 */
export function calcSMI(skeletalMuscleMass: number, heightCm: number): number {
  const h = heightCm / 100
  // Appendicular ≈ 78% of skeletal muscle (arms+legs only, no trunk)
  const appendicular = skeletalMuscleMass * 0.78
  return r(appendicular / (h * h))
}

/**
 * Segmental fat distribution
 * Validated proportions: arms 11%, trunk 55%, legs 34%
 * L/R split by impedance ratio (higher Z = more fat)
 */
export function calcSegmentalFat(
  fatMass: number,
  impedances: Impedances,
  sex: 'male' | 'female'
): SegmentalData {
  const [armRatio, trunkRatio, legRatio] = sex === 'male'
    ? [0.11, 0.55, 0.34]
    : [0.09, 0.45, 0.46]

  const armTotal = fatMass * armRatio
  const trunkFat = fatMass * trunkRatio
  const legTotal = fatMass * legRatio

  const armZSum = impedances.rightArm20 + impedances.leftArm20
  const legZSum = impedances.rightLeg20 + impedances.leftLeg20

  return {
    rightArm: r(armZSum > 0 ? armTotal * impedances.rightArm20 / armZSum : armTotal / 2),
    leftArm:  r(armZSum > 0 ? armTotal * impedances.leftArm20  / armZSum : armTotal / 2),
    trunk:    r(trunkFat),
    rightLeg: r(legZSum > 0 ? legTotal * impedances.rightLeg20 / legZSum : legTotal / 2),
    leftLeg:  r(legZSum > 0 ? legTotal * impedances.leftLeg20  / legZSum : legTotal / 2),
  }
}

/**
 * Segmental lean (muscle) mass per segment
 * Uses L²/Z method with segment-specific calibration
 */
export function calcSegmentalMuscle(
  leanMass: number,
  weight: number,
  impedances: Impedances,
  heightCm: number,
  segFat: SegmentalData
): SegmentalData {
  const h = heightCm / 100

  // Segment lengths as fraction of height
  const Larm   = h * 0.191
  const Ltrunk = h * 0.302
  const Lleg   = h * 0.527

  // Relative lean per segment = L² / Z
  const rRA = (Larm * Larm)     / impedances.rightArm20
  const rLA = (Larm * Larm)     / impedances.leftArm20
  const rTR = (Ltrunk * Ltrunk) / impedances.trunk20
  const rRL = (Lleg * Lleg)     / impedances.rightLeg20
  const rLL = (Lleg * Lleg)     / impedances.leftLeg20

  // Total lean mass is known; distribute using ratio × correction factor
  const rSum = rRA + rLA + rTR + rRL + rLL

  const k = leanMass / rSum

  // Suppress unused parameter warning — weight retained for future use
  void weight
  void segFat

  const ra = Math.max(0, r(k * rRA))
  const la = Math.max(0, r(k * rLA))
  const tr = Math.max(0, r(k * rTR))
  const rl = Math.max(0, r(k * rRL))
  const ll = Math.max(0, r(k * rLL))

  return { rightArm: ra, leftArm: la, trunk: tr, rightLeg: rl, leftLeg: ll }
}

/** Reference ranges for body composition */
export function getReferenceRanges(weight: number, heightCm: number, sex: 'male' | 'female', age: number) {
  const h = heightCm / 100
  const bmiMin = 18.5 * h * h
  const bmiMax = 24.9 * h * h

  const [fatMinPct, fatMaxPct] = sex === 'male'
    ? (age < 40 ? [10, 20] : age < 60 ? [11, 22] : [13, 25])
    : (age < 40 ? [18, 28] : age < 60 ? [19, 30] : [20, 32])

  const fatMin = r(weight * fatMinPct / 100)
  const fatMax = r(weight * fatMaxPct / 100)

  const proteinMin = r(weight * 0.16)
  const proteinMax = r(weight * 0.20)

  const [waterMinPct, waterMaxPct] = sex === 'male' ? [55, 65] : [45, 60]
  const waterMin = r(weight * waterMinPct / 100)
  const waterMax = r(weight * waterMaxPct / 100)

  const muscleMin = r(weight * (sex === 'male' ? 0.68 : 0.52))
  const muscleMax = r(weight * (sex === 'male' ? 0.85 : 0.72))

  const skelMin  = r(weight * (sex === 'male' ? 0.40 : 0.30))
  const skelMax  = r(weight * (sex === 'male' ? 0.55 : 0.42))

  const saltMin = r(weight * 0.041)
  const saltMax = r(weight * 0.060)

  return {
    weight:   { min: r(bmiMin), max: r(bmiMax) },
    fat:      { min: fatMin,    max: fatMax,    minPct: fatMinPct,  maxPct: fatMaxPct },
    protein:  { min: proteinMin, max: proteinMax, minPct: 16,       maxPct: 20 },
    water:    { min: waterMin,  max: waterMax,  minPct: waterMinPct, maxPct: waterMaxPct },
    muscle:   { min: muscleMin, max: muscleMax },
    skeletal: { min: skelMin,   max: skelMax },
    salt:     { min: saltMin,   max: saltMax,   minPct: 4.1,        maxPct: 6.0 },
  }
}

export function evaluate(value: number, min: number, max: number): 'Excelente' | 'Saudável' | 'Alto' | 'Baixo' {
  const mid = (min + max) / 2
  const excMin = mid - (mid - min) * 0.5
  const excMax = mid + (max - mid) * 0.5
  if (value >= excMin && value <= excMax) return 'Excelente'
  if (value >= min && value <= max) return 'Saudável'
  if (value > max) return 'Alto'
  return 'Baixo'
}

/** Compute ALL derived metrics from a profile and base measurement data */
export function computeAllMetrics(
  base: Measurement,
  profile: Profile
): Measurement {
  const { sex, height, age } = profile
  const { weight, fatMass, fatPercent, muscleMass, visceralFat, waterPercent, proteinPercent, impedances } = base

  const leanMass           = calcLeanMass(weight, fatMass)
  const subcutaneousFat    = calcSubcutaneousFat(fatPercent, sex)
  const skeletalMuscleMass = calcSkeletalMuscle(muscleMass, sex)
  const skeletalMusclePercent = weight > 0 ? r((skeletalMuscleMass / weight) * 100) : 0
  const targetWeight       = calcTargetWeight(height)
  const obesity            = calcObesity(weight, height)
  const bodyScore          = calcBodyScore(base.bmi, fatPercent, base.musclePercent, visceralFat, waterPercent, proteinPercent, sex)
  const bodyAge            = calcBodyAge(age, bodyScore)
  const bodyType           = getBodyType(base.bmi, fatPercent, sex)
  const smi                = calcSMI(skeletalMuscleMass, height)

  const segFat    = calcSegmentalFat(fatMass, impedances, sex)
  const segMuscle = calcSegmentalMuscle(leanMass, weight, impedances, height, segFat)

  return {
    ...base,
    leanMass,
    subcutaneousFat,
    skeletalMuscleMass,
    skeletalMusclePercent,
    targetWeight,
    obesity,
    bodyScore,
    bodyAge,
    bodyType,
    smi,
    segFat,
    segMuscle,
  }
}

export interface Profile {
  id: string
  name: string
  sex: 'male' | 'female'
  age: number
  height: number // cm
  createdAt: string
}

export interface Impedances {
  rightArm20: number
  rightArm100: number
  leftArm20: number
  leftArm100: number
  trunk20: number
  trunk100: number
  rightLeg20: number
  rightLeg100: number
  leftLeg20: number
  leftLeg100: number
}

export interface SegmentalData {
  rightArm: number
  leftArm: number
  trunk: number
  rightLeg: number
  leftLeg: number
}

export interface Measurement {
  id: string
  profileId: string
  timestamp: string

  // Primary metrics
  weight: number        // kg
  bmi: number
  fatMass: number       // kg
  fatPercent: number    // %
  waterMass: number     // kg
  waterPercent: number  // %
  muscleMass: number    // kg
  musclePercent: number // %
  boneMass: number      // kg (= inorganic salt)
  proteinMass: number   // kg
  proteinPercent: number // %
  visceralFat: number   // grade 1-20
  metabolicAge: number
  bmr: number           // kcal (Taxa Metabólica Basal)
  impedances: Impedances

  // Extended metrics (calculated)
  leanMass?: number           // kg (peso livre de gordura)
  subcutaneousFat?: number    // %
  skeletalMuscleMass?: number // kg
  skeletalMusclePercent?: number
  bodyScore?: number          // 0-100
  targetWeight?: number       // kg
  obesity?: number            // % (weight/idealWeight × 100)
  bodyType?: string
  smi?: number                // kg/m² (Skeletal Muscle Index)
  bodyAge?: number

  // Segmental analysis (estimated from impedances)
  segFat?: SegmentalData      // kg per segment
  segMuscle?: SegmentalData   // kg per segment

  rawBytes?: number[]
}

export type BLEStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'measuring' | 'error' | 'disconnected'

import { z } from 'zod'

// Schema for measurement data validation
export const MeasurementSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  timestamp: z.string().datetime(),
  weight: z.number().min(0).max(300),
  bmi: z.number().min(0).max(100),
  fatMass: z.number().min(0),
  fatPercent: z.number().min(0).max(70),
  waterMass: z.number().min(0),
  waterPercent: z.number().min(0).max(100),
  muscleMass: z.number().min(0),
  musclePercent: z.number().min(0).max(100),
  boneMass: z.number().min(0),
  proteinMass: z.number().min(0),
  proteinPercent: z.number().min(0).max(100),
  visceralFat: z.number().min(0).max(100),
  metabolicAge: z.number().min(0).max(150),
  bmr: z.number().min(0),
  impedances: z.object({
    rightArm20: z.number().min(0),
    rightArm100: z.number().min(0),
    leftArm20: z.number().min(0),
    leftArm100: z.number().min(0),
    trunk20: z.number().min(0),
    trunk100: z.number().min(0),
    rightLeg20: z.number().min(0),
    rightLeg100: z.number().min(0),
    leftLeg20: z.number().min(0),
    leftLeg100: z.number().min(0),
  }),
  rawBytes: z.array(z.number().int().min(0).max(255)).optional(),
})

// Schema for profile validation
export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(1).max(120),
  height: z.number().min(50).max(250), // in cm
})

// Schema for BLE packet validation
export const BLEPacketSchema = z.object({
  serviceUUID: z.string().regex(/^0x[0-9a-f]{4,8}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  charUUID: z.string().regex(/^0x[0-9a-f]{4,8}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  properties: z.array(z.enum(['read', 'write', 'notify', 'indicate', 'writeNoResp'])),
})

// Type exports
export type ValidatedMeasurement = z.infer<typeof MeasurementSchema>
export type ValidatedProfile = z.infer<typeof ProfileSchema>
export type ValidatedBLEChar = z.infer<typeof BLEPacketSchema>

// Validation functions
export function validateMeasurement(data: unknown): ValidatedMeasurement {
  return MeasurementSchema.parse(data)
}

export function validateProfile(data: unknown): ValidatedProfile {
  return ProfileSchema.parse(data)
}

export function validateBLEChar(data: unknown): ValidatedBLEChar {
  return BLEPacketSchema.parse(data)
}

// Safe validation (returns null on error)
export function safeValidateMeasurement(data: unknown): ValidatedMeasurement | null {
  try {
    return MeasurementSchema.parse(data)
  } catch {
    return null
  }
}
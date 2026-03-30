import { create } from 'zustand'
import { Profile, Measurement, BLEStatus } from '../types'
import { dbService } from '../services/dbService'

interface AppState {
  profiles: Profile[]
  activeProfileId: string | null
  measurements: Measurement[]
  lastMeasurement: Measurement | null
  bleStatus: BLEStatus
  weightUnit: 'kg' | 'lb'

  // Actions
  loadProfiles: () => Promise<void>
  setActiveProfile: (id: string) => void
  saveProfile: (profile: Profile) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  loadMeasurements: (profileId: string) => Promise<void>
  saveMeasurement: (measurement: Measurement) => Promise<void>
  setLastMeasurement: (m: Measurement | null) => void
  setBLEStatus: (status: BLEStatus) => void
  setWeightUnit: (unit: 'kg' | 'lb') => void
  clearAllData: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  measurements: [],
  lastMeasurement: null,
  bleStatus: 'idle',
  weightUnit: 'kg',

  loadProfiles: async () => {
    const profiles = await dbService.getProfiles()
    set({ profiles })
  },

  setActiveProfile: (id) => {
    set({ activeProfileId: id })
  },

  saveProfile: async (profile) => {
    await dbService.saveProfile(profile)
    await get().loadProfiles()
  },

  deleteProfile: async (id) => {
    await dbService.deleteProfile(id)
    const state = get()
    if (state.activeProfileId === id) {
      set({ activeProfileId: null, measurements: [] })
    }
    await state.loadProfiles()
  },

  loadMeasurements: async (profileId) => {
    const measurements = await dbService.getMeasurements(profileId)
    set({ measurements })
  },

  saveMeasurement: async (measurement) => {
    await dbService.saveMeasurement(measurement)
    await get().loadMeasurements(measurement.profileId)
    set({ lastMeasurement: measurement })
  },

  setLastMeasurement: (m) => set({ lastMeasurement: m }),

  setBLEStatus: (status) => set({ bleStatus: status }),

  setWeightUnit: (unit) => set({ weightUnit: unit }),

  clearAllData: async () => {
    await dbService.clearAll()
    set({ profiles: [], activeProfileId: null, measurements: [], lastMeasurement: null })
  },
}))

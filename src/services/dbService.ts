import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { Profile, Measurement } from '../types'

interface RelaxFitDB extends DBSchema {
  profiles: {
    key: string
    value: Profile
    indexes: { 'by-name': string }
  }
  measurements: {
    key: string
    value: Measurement
    indexes: { 'by-profile': string; 'by-timestamp': string }
  }
}

let db: IDBPDatabase<RelaxFitDB> | null = null

async function getDB(): Promise<IDBPDatabase<RelaxFitDB>> {
  if (db) return db
  db = await openDB<RelaxFitDB>('relaxfit-db', 1, {
    upgrade(database) {
      const profileStore = database.createObjectStore('profiles', { keyPath: 'id' })
      profileStore.createIndex('by-name', 'name')

      const measurementStore = database.createObjectStore('measurements', { keyPath: 'id' })
      measurementStore.createIndex('by-profile', 'profileId')
      measurementStore.createIndex('by-timestamp', 'timestamp')
    },
  })
  return db
}

export const dbService = {
  // Profiles
  async getProfiles(): Promise<Profile[]> {
    const database = await getDB()
    return database.getAll('profiles')
  },

  async getProfile(id: string): Promise<Profile | undefined> {
    const database = await getDB()
    return database.get('profiles', id)
  },

  async saveProfile(profile: Profile): Promise<void> {
    const database = await getDB()
    await database.put('profiles', profile)
  },

  async deleteProfile(id: string): Promise<void> {
    const database = await getDB()
    await database.delete('profiles', id)
    // Delete associated measurements
    const measurements = await database.getAllFromIndex('measurements', 'by-profile', id)
    for (const m of measurements) {
      await database.delete('measurements', m.id)
    }
  },

  // Measurements
  async getMeasurements(profileId: string): Promise<Measurement[]> {
    const database = await getDB()
    const measurements = await database.getAllFromIndex('measurements', 'by-profile', profileId)
    return measurements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },

  async saveMeasurement(measurement: Measurement): Promise<void> {
    const database = await getDB()
    await database.put('measurements', measurement)
  },

  async deleteMeasurement(id: string): Promise<void> {
    const database = await getDB()
    await database.delete('measurements', id)
  },

  async exportData(): Promise<string> {
    const database = await getDB()
    const profiles = await database.getAll('profiles')
    const measurements = await database.getAll('measurements')
    return JSON.stringify({ profiles, measurements }, null, 2)
  },

  async clearAll(): Promise<void> {
    const database = await getDB()
    await database.clear('profiles')
    await database.clear('measurements')
  },
}

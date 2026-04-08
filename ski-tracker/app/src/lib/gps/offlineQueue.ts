/**
 * IndexedDB queue for GPS positions when offline.
 * Positions are flushed to Supabase when connectivity is restored.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { Database } from '@/types/database'

type PositionInsert = Database['public']['Tables']['positions']['Insert']

interface OfflineDB {
  positions: {
    key: number
    value: PositionInsert & { _queuedAt: number }
    indexes: { 'by-session': string }
  }
}

let db: IDBPDatabase<OfflineDB> | null = null

async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (db) return db
  db = await openDB<OfflineDB>('ski-tracker-offline', 1, {
    upgrade(database) {
      const store = database.createObjectStore('positions', {
        autoIncrement: true,
        keyPath: undefined,
      })
      store.createIndex('by-session', 'session_id')
    },
  })
  return db
}

export async function queuePosition(position: PositionInsert): Promise<void> {
  const database = await getDB()
  await database.add('positions', { ...position, _queuedAt: Date.now() })
}

export async function flushPositions(
  flushFn: (positions: PositionInsert[]) => Promise<void>
): Promise<void> {
  const database = await getDB()
  const tx = database.transaction('positions', 'readwrite')
  const store = tx.objectStore('positions')
  const all = await store.getAll()
  const keys = await store.getAllKeys()

  if (all.length === 0) return

  const positions: PositionInsert[] = all.map(({ _queuedAt: _q, ...pos }) => pos)

  try {
    await flushFn(positions)
    // Delete flushed records
    for (const key of keys) {
      await store.delete(key)
    }
  } catch {
    // Keep records for next flush attempt
  }

  await tx.done
}

export async function queuedCount(): Promise<number> {
  const database = await getDB()
  return database.count('positions')
}

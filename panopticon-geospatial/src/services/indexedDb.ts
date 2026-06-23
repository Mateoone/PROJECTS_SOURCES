/**
 * Cache client IndexedDB avec cycle de vie de 2 heures.
 * Utilisé pour les jeux de données volumineux (TLE notamment) afin
 * d'éviter de retélécharger plusieurs Mo à chaque rechargement.
 */
const DB_NAME = 'panopticon';
const STORE = 'cache';
const TTL_MS = 2 * 60 * 60 * 1000; // 2 heures

interface Entry<T> {
  key: string;
  value: T;
  ts: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as Entry<T> | undefined;
        if (!entry) return resolve(null);
        if (Date.now() - entry.ts > TTL_MS) return resolve(null); // périmé
        resolve(entry.value);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value, ts: Date.now() } as Entry<T>);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* quota dépassé / mode privé : on ignore silencieusement */
  }
}

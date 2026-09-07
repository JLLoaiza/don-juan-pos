// IndexedDB is a local cache/queue, never the shared source of truth (see
// offline-sync-edge.md §25-26). Object stores mirror the design in
// implementation-plan.md §7; only `cache` has a real reader/writer so far.
const DB_NAME = "don-juan-web";
const DB_VERSION = 1;

export const STORES = {
  cache: "cache",
  pendingCommands: "pending_commands",
  printReceipts: "print_receipts",
  conflicts: "conflicts",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.cache)) db.createObjectStore(STORES.cache);
      if (!db.objectStoreNames.contains(STORES.pendingCommands)) db.createObjectStore(STORES.pendingCommands, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.printReceipts)) db.createObjectStore(STORES.printReceipts, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.conflicts)) db.createObjectStore(STORES.conflicts, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
  });
  return dbPromise;
}

export async function getCacheEntry<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORES.cache, "readonly").objectStore(STORES.cache).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer de IndexedDB."));
  });
}

export async function putCacheEntry<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cache, "readwrite");
    tx.objectStore(STORES.cache).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo escribir en IndexedDB."));
  });
}

export async function deleteCacheEntry(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cache, "readwrite");
    tx.objectStore(STORES.cache).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo borrar de IndexedDB."));
  });
}

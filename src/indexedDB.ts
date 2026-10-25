import { TAJournal, OfficerProfile } from './types';

export interface PendingSyncItem {
  id: string; // Unique queue action ID
  action: 'SAVE' | 'DELETE';
  dataType: 'JOURNALS' | 'PROFILES';
  dataId: string; // ID of the journal or profile
  payload?: any; // The entity body (for SAVE actions)
  timestamp: number;
  targetOwnerId?: string; // The explicit owner ID of the document (used in Admin operations)
}

const DB_NAME = 'rpf_offline_db';
const DB_VERSION = 1;

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open offline IndexedDB database');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      
      // Store current state of journals locally
      if (!db.objectStoreNames.contains('journals')) {
        db.createObjectStore('journals', { keyPath: 'id' });
      }

      // Store current state of profiles locally
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }

      // Store pending synchronized edits while offline
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { keyPath: 'id' });
      }
    };
  });
}

// --- Local Cached Journals Operations ---
export async function getLocalJournals(): Promise<TAJournal[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('journals', 'readonly');
      const store = transaction.objectStore('journals');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error fetching journals from IndexedDB', error);
    return [];
  }
}

export async function saveLocalJournal(journal: TAJournal): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('journals', 'readwrite');
      const store = transaction.objectStore('journals');
      const request = store.put(journal);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving journal to IndexedDB', error);
  }
}

export async function deleteLocalJournal(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('journals', 'readwrite');
      const store = transaction.objectStore('journals');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error deleting journal from IndexedDB', error);
  }
}

// --- Local Cached Profiles Operations ---
export async function getLocalProfiles(): Promise<OfficerProfile[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('profiles', 'readonly');
      const store = transaction.objectStore('profiles');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error fetching profiles from IndexedDB', error);
    return [];
  }
}

export async function saveLocalProfile(profile: OfficerProfile): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('profiles', 'readwrite');
      const store = transaction.objectStore('profiles');
      const request = store.put(profile);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving profile to IndexedDB', error);
  }
}

export async function deleteLocalProfile(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('profiles', 'readwrite');
      const store = transaction.objectStore('profiles');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error deleting profile from IndexedDB', error);
  }
}

// --- Pending Synchronization Action Queue Operations ---
export async function getPendingSyncQueue(): Promise<PendingSyncItem[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingSync', 'readonly');
      const store = transaction.objectStore('pendingSync');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        // Return sorted by timestamp so they playback in exact order
        resolve(results.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error fetching pending sync queue', error);
    return [];
  }
}

export async function addPendingSyncItem(item: Omit<PendingSyncItem, 'id' | 'timestamp'>): Promise<void> {
  try {
    const db = await openOfflineDB();
    const id = `${item.dataType}_${item.dataId}_${Date.now()}`;
    const timestamp = Date.now();
    const queueItem: PendingSyncItem = {
      ...item,
      id,
      timestamp
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingSync', 'readwrite');
      const store = transaction.objectStore('pendingSync');
      const request = store.put(queueItem);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error adding pending sync item', error);
  }
}

export async function removePendingSyncItem(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingSync', 'readwrite');
      const store = transaction.objectStore('pendingSync');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error removing pending sync item', error);
  }
}

export async function clearPendingSyncQueue(): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pendingSync', 'readwrite');
      const store = transaction.objectStore('pendingSync');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing pending sync queue', error);
  }
}

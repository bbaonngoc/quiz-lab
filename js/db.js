import { canResumeSession } from './model.js';

const DB_NAME = 'quizlab';
const DB_VERSION = 1; // Independent from the app/service worker version.
let connection;

export async function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' });
        store.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close(); connection = null;
        window.dispatchEvent(new CustomEvent('database-version-change'));
      };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { window.dispatchEvent(new CustomEvent('database-blocked')); };
  });
  return connection;
}

async function transaction(storeNames, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Không thể lưu dữ liệu.'));
    tx.onabort = () => reject(tx.error || new Error('Giao dịch đã bị hủy.'));
    operation(tx, value => { result = value; });
  });
}

export const getSessions = () => transaction(['sessions'], 'readonly', (tx, set) => {
  tx.objectStore('sessions').getAll().onsuccess = event => set(event.target.result);
});
export const getSession = id => transaction(['sessions'], 'readonly', (tx, set) => {
  tx.objectStore('sessions').get(id).onsuccess = event => set(event.target.result);
});
const checked = result => {
  if (result?.error) throw new Error(result.error);
  return result;
};

// Check role and save in the same transaction: another tab cannot switch roles
// between this check and insertion of an exam/practice session.
export const addSession = session => transaction(['sessions','settings'], 'readwrite', (tx,set) => {
  tx.objectStore('settings').get('user-role').onsuccess = event => {
    if (!canResumeSession(session,event.target.result?.value)) {
      set({error:'Vai trò đã thay đổi hoặc bài có câu hỏi không phù hợp. Hãy chọn lại bài làm.'});return;
    }
    tx.objectStore('sessions').add(session);
  };
}).then(checked);

// Read and write in one transaction to merge changes from multiple tabs safely.
export const updateSession = (id, update) => transaction(['sessions','settings'], 'readwrite', (tx, set) => {
  const store = tx.objectStore('sessions');
  store.get(id).onsuccess = event => {
    const session = event.target.result;
    if (!session) { tx.abort(); return; }
    if (session.status !== 'active') {set(session);return;}
    tx.objectStore('settings').get('user-role').onsuccess = selected => {
      if (!canResumeSession(session,selected.target.result?.value)) {
        set({error:'Bài đang làm thuộc vai trò khác hoặc thiếu thông tin chức danh. Hãy kiểm tra vai trò trong Cài đặt.'});return;
      }
      update(session);session.updatedAt=Date.now();store.put(session);set(session);
    };
  };
}).then(checked);

export const getSetting = key => transaction(['settings'], 'readonly', (tx, set) => {
  tx.objectStore('settings').get(key).onsuccess = event => set(event.target.result?.value);
});
export const setSetting = (key, value) => transaction(['settings'], 'readwrite', tx => tx.objectStore('settings').put({ key, value }));
export const deleteSetting = key => transaction(['settings'], 'readwrite', tx => tx.objectStore('settings').delete(key));

// Commit a complete, validated release and migrate the old override in one transaction.
// Never touch session snapshots; never discard a user's old imported bank silently.
export const commitOfficialBank = bank => transaction(['settings'], 'readwrite', tx => {
  const store = tx.objectStore('settings');
  store.get('bank-migration-v2').onsuccess = event => {
    if (!event.target.result) {
      for (const key of ['imported-bank', 'bundled-bank']) {
        store.get(key).onsuccess = found => {
          if (found.target.result) store.put({ key: `legacy-${key}`, value: found.target.result.value });
          store.delete(key);
        };
      }
      store.put({ key: 'bank-migration-v2', value: { completedAt: Date.now() } });
    }
    store.put({ key: 'official-bank', value: bank });
  };
});

export const restoreBackup = (sessions, preferences = {}) => transaction(['sessions', 'settings'], 'readwrite', tx => {
  const store = tx.objectStore('sessions');
  // Keep existing sessions on ID collisions, never replace local history.
  sessions.forEach(session => {
    store.get(session.id).onsuccess = event => { if (!event.target.result) store.add(session); };
  });
  for (const key of ['user-role', 'quiz-config', 'practice-config', 'exam-config']) {
    if (Object.hasOwn(preferences, key)) tx.objectStore('settings').put({ key, value: preferences[key] });
  }
});

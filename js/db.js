import { canResumeSession, isTimedExam, isExamExpired, ongoingExam, finishSession, nextExamAttemptNumber, EXAM_DURATION_MS } from './model.js';

const DB_NAME = 'quizlab';
const DB_VERSION = 1; // Independent from the app/service worker version.
const STORAGE_TIMEOUT_MS = 10000;
let connection;

export async function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true; connection = null;
      reject(new Error('Không mở được dữ liệu trên thiết bị. Hãy đóng các tab QuizLab khác rồi thử lại.'));
    }, STORAGE_TIMEOUT_MS);
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
      clearTimeout(timeout);
      if (timedOut) { db.close(); return; }
      db.onversionchange = () => {
        db.close(); connection = null;
        window.dispatchEvent(new CustomEvent('database-version-change'));
      };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    request.onerror = () => { clearTimeout(timeout); if (!timedOut) { connection = null; reject(request.error); } };
    request.onblocked = () => { window.dispatchEvent(new CustomEvent('database-blocked')); };
  });
  return connection;
}

async function transaction(storeNames, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    const timeout = setTimeout(() => {
      // Abort before unlocking the UI: a timed-out answer must never save later.
      try { tx.abort(); } catch { }
      reject(new Error('Dữ liệu trên thiết bị phản hồi quá lâu. Thao tác chưa được lưu. Hãy đóng các tab QuizLab khác rồi thử lại.'));
    }, STORAGE_TIMEOUT_MS);
    tx.oncomplete = () => { clearTimeout(timeout); resolve(result); };
    tx.onerror = () => { clearTimeout(timeout); reject(tx.error || new Error('Không thể lưu dữ liệu.')); };
    tx.onabort = () => { clearTimeout(timeout); reject(tx.error || new Error('Giao dịch đã bị hủy.')); };
    try { operation(tx, value => { result = value; }); }
    catch (error) { clearTimeout(timeout); try { tx.abort(); } catch { } reject(error); }
  });
}

export const getSessions = () => transaction(['sessions'], 'readwrite', (tx, set) => {
  const store = tx.objectStore('sessions');
  store.getAll().onsuccess = event => {
    const now=Date.now(), sessions=event.target.result;
    for (const session of sessions) if (isExamExpired(session,now)) store.put(finishSession(session,now));
    set(sessions);
  };
});
export const getSession = id => transaction(['sessions'], 'readwrite', (tx, set) => {
  const store=tx.objectStore('sessions');
  store.get(id).onsuccess = event => {
    const session=event.target.result, now=Date.now();
    if (isExamExpired(session,now)) store.put(finishSession(session,now));
    set(session);
  };
});
const checked = result => {
  if (result?.error) {
    const error=new Error(result.error);
    if (result.code) error.code=result.code;
    throw error;
  }
  return result;
};

// Check role and save in the same transaction: another tab cannot switch roles
// between this check and insertion of an exam/practice session.
export const addSession = session => isTimedExam(session) ? addExamSession(session) : transaction(['sessions','settings'], 'readwrite', (tx,set) => {
  tx.objectStore('settings').get('user-role').onsuccess = event => {
    if (!canResumeSession(session,event.target.result?.value)) {
      set({error:'Vai trò đã thay đổi hoặc bài có câu hỏi không phù hợp. Hãy chọn lại bài làm.'});return;
    }
    tx.objectStore('sessions').add(session);
  };
}).then(checked);

// Check for an unfinished exam, allocate its number and insert in one transaction.
export const addExamSession = session => transaction(['sessions','settings'],'readwrite',(tx,set) => {
  const settings=tx.objectStore('settings'), store=tx.objectStore('sessions');
  settings.get('user-role').onsuccess = selected => {
    if (!canResumeSession(session,selected.target.result?.value)) {set({error:'Vai trò đã thay đổi. Hãy chọn lại bài thi.'});return;}
    settings.get('exam-attempt-counter').onsuccess = counter => {
      store.getAll().onsuccess = found => {
        const now=Date.now(), sessions=found.target.result;
        for (const previous of sessions) if (isExamExpired(previous,now)) store.put(finishSession(previous,now));
        if (ongoingExam(sessions,now)) {
          set({code:'EXAM_IN_PROGRESS',error:'Bạn đang có bài thi chưa kết thúc. Hãy nộp bài hoặc chờ hết giờ trước khi bắt đầu bài mới.'});return;
        }
        const attemptNumber=nextExamAttemptNumber(sessions,counter.target.result?.value);
        const saved={...session,attemptNumber,createdAt:now,updatedAt:now,startTime:now,endTime:now+EXAM_DURATION_MS};
        store.add(saved);settings.put({key:'exam-attempt-counter',value:attemptNumber});set(saved);
      };
    };
  };
}).then(checked);

// Read and write in one transaction to merge changes from multiple tabs safely.
export const updateSession = (id, update) => transaction(['sessions','settings'], 'readwrite', (tx, set) => {
  const store = tx.objectStore('sessions');
  store.get(id).onsuccess = event => {
    const session = event.target.result;
    if (!session) { tx.abort(); return; }
    if (session.status !== 'active') {set(session);return;}
    if (isExamExpired(session)) {finishSession(session);store.put(session);set(session);return;}
    tx.objectStore('settings').get('user-role').onsuccess = selected => {
      if (isExamExpired(session)) {finishSession(session);store.put(session);set(session);return;}
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
  store.getAll().onsuccess = event => {
    const combined = new Map(event.target.result.map(s => [s.id,s]));
    for (const session of sessions) if (!combined.has(session.id)) {store.add(session);combined.set(session.id,session);}
    const settings=tx.objectStore('settings');
    settings.get('exam-attempt-counter').onsuccess = counter => {
      const restored=Number.isSafeInteger(preferences['exam-attempt-counter']) ? preferences['exam-attempt-counter'] : 0;
      const next=nextExamAttemptNumber([...combined.values()],Math.max(restored,counter.target.result?.value || 0));
      settings.put({key:'exam-attempt-counter',value:next-1});
    };
  };
  for (const key of ['user-role', 'quiz-config', 'practice-config', 'exam-config']) {
    if (Object.hasOwn(preferences, key)) tx.objectStore('settings').put({ key, value: preferences[key] });
  }
});

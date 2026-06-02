(function(){
  if (window.firebaseStorePromise) return;

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDmwyyymNaZuOKTujKeaf7r9AngBsIGFi8",
    authDomain: "nominal-10d2c.firebaseapp.com",
    databaseURL: "https://nominal-10d2c-default-rtdb.firebaseio.com",
    projectId: "nominal-10d2c",
    storageBucket: "nominal-10d2c.firebasestorage.app",
    messagingSenderId: "79527657013",
    appId: "1:79527657013:web:978ebe442fb34576a4fb7c"
  };

  const DB_ROOT = 'nominal_app_state';
  const WORKER_IDS = ['elias','jose','darwin','caro'];

  function parseJSON(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
  }

  function setLocalItem(key, value) {
    window.__SKIP_LOCAL_STORAGE_BACKUP__ = true;
    localStorage.setItem(key, value);
    window.__SKIP_LOCAL_STORAGE_BACKUP__ = false;
  }

  function removeLocalItem(key) {
    window.__SKIP_LOCAL_STORAGE_BACKUP__ = true;
    localStorage.removeItem(key);
    window.__SKIP_LOCAL_STORAGE_BACKUP__ = false;
  }

  function buildStateFromLocal() {
    const state = {
      month_schedule: parseJSON(localStorage.getItem('month_schedule'), null),
      daily_uploads: parseJSON(localStorage.getItem('daily_uploads'), []),
      last_upload_date: localStorage.getItem('last_upload_date') || '',
      monthly_history: parseJSON(localStorage.getItem('monthly_history'), []),
      extras_hours: {},
      extras_by_date: {},
      manual_rest: {},
      manual_flags: {}
    };

    WORKER_IDS.forEach(id => {
      state.extras_hours[id] = Number(localStorage.getItem(`extras_hours_${id}`) || 0);
    });

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('extras_by_date_')) {
        state.extras_by_date[key.slice('extras_by_date_'.length)] = parseJSON(localStorage.getItem(key), {});
      }
      if (key.startsWith('manual_rest_')) {
        state.manual_rest[key.slice('manual_rest_'.length)] = parseJSON(localStorage.getItem(key), {});
      }
      if (key.startsWith('manual_flags_')) {
        state.manual_flags[key.slice('manual_flags_'.length)] = parseJSON(localStorage.getItem(key), {});
      }
    }

    return state;
  }

  function applyStateToLocal(state) {
    if (!state || typeof state !== 'object') return;

    // Remove current app-managed keys before applying remote state
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === 'month_schedule' || key === 'daily_uploads' || key === 'last_upload_date' || key === 'monthly_history' || key.startsWith('extras_hours_') || key.startsWith('extras_by_date_') || key.startsWith('manual_rest_') || key.startsWith('manual_flags_')) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(removeLocalItem);

    if (state.month_schedule !== undefined && state.month_schedule !== null) {
      setLocalItem('month_schedule', JSON.stringify(state.month_schedule));
    }
    if (state.daily_uploads !== undefined) {
      if (state.daily_uploads === null) removeLocalItem('daily_uploads');
      else setLocalItem('daily_uploads', JSON.stringify(state.daily_uploads));
    }
    if (state.last_upload_date !== undefined) {
      if (state.last_upload_date === null) removeLocalItem('last_upload_date');
      else setLocalItem('last_upload_date', state.last_upload_date);
    }
    if (state.monthly_history !== undefined) {
      if (state.monthly_history === null) removeLocalItem('monthly_history');
      else setLocalItem('monthly_history', JSON.stringify(state.monthly_history));
    }

    Object.entries(state.extras_hours || {}).forEach(([id, value]) => {
      setLocalItem(`extras_hours_${id}`, String(value));
    });
    Object.entries(state.extras_by_date || {}).forEach(([date, value]) => {
      setLocalItem(`extras_by_date_${date}`, JSON.stringify(value));
    });
    Object.entries(state.manual_rest || {}).forEach(([week, value]) => {
      setLocalItem(`manual_rest_${week}`, JSON.stringify(value));
    });
    Object.entries(state.manual_flags || {}).forEach(([week, value]) => {
      setLocalItem(`manual_flags_${week}`, JSON.stringify(value));
    });
  }

  async function loadRemoteState() {
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js');
      const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js');
      const app = initializeApp(FIREBASE_CONFIG);
      const db = getDatabase(app);
      window.firebaseApp = app;
      window.firebaseDB = db;
      const snapshot = await get(ref(db, `${DB_ROOT}/state`));
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.warn('Firebase loadRemoteState failed:', error);
      return null;
    }
  }

  async function saveRemoteState(state) {
    if (!state || typeof state !== 'object') return;
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js');
      const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js');
      const app = window.firebaseApp || initializeApp(FIREBASE_CONFIG);
      const db = window.firebaseDB || getDatabase(app);
      window.firebaseApp = app;
      window.firebaseDB = db;
      await set(ref(db, `${DB_ROOT}/state`), state);
    } catch (error) {
      console.warn('Firebase saveRemoteState failed:', error);
    }
  }

  async function syncOnStart() {
    const remote = await loadRemoteState();
    if (remote) {
      applyStateToLocal(remote);
    } else {
      const localState = buildStateFromLocal();
      await saveRemoteState(localState);
    }
  }

  window.firebaseStorePromise = (async function() {
    try {
      await loadRemoteState();
      return window.firebaseStore;
    } catch (e) {
      console.warn('Firebase initialization failed', e);
      return null;
    }
  })();

  window.firebaseStore = {
    buildStateFromLocal,
    applyStateToLocal,
    loadRemoteState,
    saveRemoteState,
    syncOnStart
  };
})();

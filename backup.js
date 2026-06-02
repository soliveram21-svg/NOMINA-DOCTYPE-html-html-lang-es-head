// backup.js — respaldo automático para "horario y nomina"
// Coloca este archivo en la raíz del proyecto y asegúrate de incluirlo
// antes de los scripts que modifican localStorage (por ejemplo: <script src="backup.js"></script> antes de <script src="inicio/script.js"></script>).

/*
Requisitos cubiertos:
- Crear respaldo previo a cualquier cambio relevante en localStorage.
- Mantener dos copias: backup_actual y backup_anterior.
- Exponer crearBackupAutomatico() y restaurarUltimoBackup().
- Botón con id="restoreLast" invoca restaurarUltimoBackup().
*/

(function(){
  'use strict';
  const WORKER_IDS = ['elias','jose','darwin','caro'];
  let backupInProgress = false;

  function isAppKey(key) {
    if (!key) return false;
    const prefixes = ['month_schedule','daily_uploads','monthly_history','extras_hours_','extras_by_date_','last_upload_date','manual_rest_','manual_flags_','backup_actual','backup_anterior'];
    return prefixes.some(p => key === p || key.startsWith(p));
  }

  function gatherCurrentState() {
    const state = {};
    try { state.month_schedule = JSON.parse(localStorage.getItem('month_schedule') || 'null'); } catch(e){ state.month_schedule = null; }
    try { state.daily_uploads = JSON.parse(localStorage.getItem('daily_uploads') || '[]'); } catch(e){ state.daily_uploads = []; }
    try { state.monthly_history = JSON.parse(localStorage.getItem('monthly_history') || '[]'); } catch(e){ state.monthly_history = []; }
    WORKER_IDS.forEach(id => { state['extras_hours_' + id] = Number(localStorage.getItem('extras_hours_' + id) || 0); });
    state.last_upload_date = localStorage.getItem('last_upload_date') || '';

    // collect extras_by_date_*
    state.extras_by_date = {};
    const manualKeys = {};
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('extras_by_date_')){
        try { state.extras_by_date[k.slice('extras_by_date_'.length)] = JSON.parse(localStorage.getItem(k)); } catch(e){ state.extras_by_date[k.slice('extras_by_date_'.length)] = null; }
      }
      if (k.startsWith('manual_rest_') || k.startsWith('manual_flags_')){
        try { manualKeys[k] = JSON.parse(localStorage.getItem(k)); } catch(e){ manualKeys[k] = localStorage.getItem(k); }
      }
    }
    // merge manual keys
    Object.keys(manualKeys).forEach(k => { state[k] = manualKeys[k]; });

    state.fecha_backup = new Date().toISOString();
    return state;
  }

  function crearBackupAutomatico() {
    if (backupInProgress) return;
    try {
      backupInProgress = true;
      const currentActual = localStorage.getItem('backup_actual');
      if (currentActual) localStorage.setItem('backup_anterior', currentActual);
      const snapshot = gatherCurrentState();
      snapshot.fecha_backup = new Date().toISOString();
      localStorage.setItem('backup_actual', JSON.stringify(snapshot));
    } catch(e){ console.error('crearBackupAutomatico:', e); }
    finally { backupInProgress = false; }
  }

  function restoreStateObjectToLocalStorage(obj) {
    // remove existing app keys (except backups)
    const keysToRemove = [];
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (!k) continue;
      if (isAppKey(k) && k !== 'backup_actual' && k !== 'backup_anterior') keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // restore core keys
    if (obj.month_schedule !== undefined && obj.month_schedule !== null) localStorage.setItem('month_schedule', JSON.stringify(obj.month_schedule));
    else localStorage.removeItem('month_schedule');

    if (obj.daily_uploads !== undefined) localStorage.setItem('daily_uploads', JSON.stringify(obj.daily_uploads));
    else localStorage.removeItem('daily_uploads');

    if (obj.monthly_history !== undefined) localStorage.setItem('monthly_history', JSON.stringify(obj.monthly_history));
    else localStorage.removeItem('monthly_history');

    WORKER_IDS.forEach(id => {
      const key = 'extras_hours_' + id;
      if (obj[key] !== undefined) localStorage.setItem(key, String(obj[key])); else localStorage.removeItem(key);
    });

    if (obj.last_upload_date !== undefined) localStorage.setItem('last_upload_date', obj.last_upload_date); else localStorage.removeItem('last_upload_date');

    if (obj.extras_by_date) {
      Object.keys(obj.extras_by_date).forEach(date => {
        localStorage.setItem('extras_by_date_' + date, JSON.stringify(obj.extras_by_date[date]));
      });
    }

    // manual keys
    Object.keys(obj).forEach(k => {
      if (k.startsWith('manual_rest_') || k.startsWith('manual_flags_')){
        try { localStorage.setItem(k, JSON.stringify(obj[k])); } catch(e){ localStorage.setItem(k, obj[k]); }
      }
    });
  }

  function restaurarUltimoBackup() {
    const raw = localStorage.getItem('backup_actual');
    if (!raw) { alert('No existe respaldo para restaurar.'); return; }
    const toRestore = JSON.parse(raw);
    const proceed = confirm('¿Deseas restaurar el último estado guardado? Se perderán los cambios realizados después del último respaldo.');
    if (!proceed) return;

    try {
      // save current state as backup_anterior (safe-guard)
      const current = gatherCurrentState();
      localStorage.setItem('backup_anterior', JSON.stringify(current));

      backupInProgress = true;
      restoreStateObjectToLocalStorage(toRestore);
      // keep backup_actual as the restored object
      localStorage.setItem('backup_actual', JSON.stringify(toRestore));
    } catch(e){ console.error('restaurarUltimoBackup', e); alert('Error al restaurar: '+e.message); }
    finally { backupInProgress = false; }

    // reload to reflect restored state in UI
    try { window.location.reload(); } catch(e){ /* ignore in non-browser */ }
  }

  // Patch Storage setItem/removeItem to trigger backups before changes
  (function patchStorage(){
    const origSet = Storage.prototype.setItem;
    const origRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(k, v){
      try { if (!backupInProgress && !window.__SKIP_LOCAL_STORAGE_BACKUP__ && isAppKey(k) && k !== 'backup_actual' && k !== 'backup_anterior') crearBackupAutomatico(); } catch(e){}
      return origSet.apply(this, [k, v]);
    };
    Storage.prototype.removeItem = function(k){
      try { if (!backupInProgress && !window.__SKIP_LOCAL_STORAGE_BACKUP__ && isAppKey(k) && k !== 'backup_actual' && k !== 'backup_anterior') crearBackupAutomatico(); } catch(e){}
      return origRemove.apply(this, [k]);
    };
  })();

  // expose globally
  window.crearBackupAutomatico = crearBackupAutomatico;
  window.restaurarUltimoBackup = restaurarUltimoBackup;

  // attach UI button if present
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('restoreLast');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); restaurarUltimoBackup(); });
    // initial baseline backup
    crearBackupAutomatico();
  });

})();

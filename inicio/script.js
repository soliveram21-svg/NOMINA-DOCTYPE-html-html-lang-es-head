const WORKERS = [
  { id: 'elias', name: 'Elías David' },
  { id: 'jose', name: 'José Luis' },
  { id: 'darwin', name: 'Darwin' },
  { id: 'caro', name: 'Caro' },
];

// --- Default scheduled week definition (Mon..Sun)
const DEFAULT_WEEK_SCHEDULE = {
  elias:  [9,9,9,9,9,9,0],
  jose:   [9,0,9,9,9,9,9],
  darwin: [11,11,8,0,8,8,9],
  caro:   [0,9,9,9,9,9,8]
};

function scheduleStorageKey() { return 'month_schedule'; }
function loadSchedule() {
  try {
    const raw = localStorage.getItem(scheduleStorageKey());
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_WEEK_SCHEDULE));
    return JSON.parse(raw);
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_WEEK_SCHEDULE)); }
}
function saveSchedule(obj) { localStorage.setItem(scheduleStorageKey(), JSON.stringify(obj)); }

let WEEK_SCHEDULE = loadSchedule();

function getTodayDayIdx() {
  const d = new Date();
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  if (jsDay === 0) return 6; // Sunday -> 6
  return jsDay - 1; // Mon=0
}

function extrasKey(workerId) { return `extras_hours_${workerId}`; }
function getExtras(workerId) { return Number(localStorage.getItem(extrasKey(workerId)) || 0); }
function addExtras(workerId, amount) {
  // Ensure a clear backup before this high-level operation
  if (window && typeof window.crearBackupAutomatico === 'function') window.crearBackupAutomatico();
  // cumulative
  localStorage.setItem(extrasKey(workerId), String(getExtras(workerId) + amount));
  // per-day record
  const date = (new Date()).toISOString().slice(0,10);
  const dayKey = `extras_by_date_${date}`;
  const raw = localStorage.getItem(dayKey);
  const obj = raw ? JSON.parse(raw) : {};
  obj[workerId] = (obj[workerId] || 0) + amount;
  localStorage.setItem(dayKey, JSON.stringify(obj));

  if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
    window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
  }
}
function getExtrasForDate(workerId, date) {
  const dayKey = `extras_by_date_${date}`;
  const raw = localStorage.getItem(dayKey);
  const obj = raw ? JSON.parse(raw) : {};
  return Number(obj[workerId] || 0);
}
function resetExtras() { WORKERS.forEach(w => localStorage.removeItem(extrasKey(w.id))); }

function computeScheduledUpToToday(workerId) {
  const today = getTodayDayIdx();
  const arr = WEEK_SCHEDULE[workerId] || [];
  let sum = 0;
  for (let i = 0; i <= today && i < arr.length; i++) sum += Number(arr[i] || 0);
  return sum;
}

function renderAll() {
  let totalScheduled = 0;
  let totalExtras = 0;
  WORKERS.forEach(w => {
    const scheduled = computeScheduledUpToToday(w.id);
    const extras = getExtras(w.id);
    const total = scheduled + extras;
    const sEl = document.getElementById(`scheduled-${w.id}`);
    const eEl = document.getElementById(`extra-${w.id}`);
    const tEl = document.getElementById(`total-${w.id}`);
    if (sEl) sEl.textContent = `${scheduled} h`;
    if (eEl) eEl.textContent = `${extras} h`;
    if (tEl) tEl.textContent = `${total} h`;
    totalScheduled += scheduled; totalExtras += extras;
  });
  document.getElementById('sumScheduled').textContent = `${totalScheduled} h`;
  document.getElementById('sumExtras').textContent = `${totalExtras} h`;
  const todayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  document.getElementById('todayLabel').textContent = todayNames[getTodayDayIdx()];
}

// Modal handling
function openModal(defaultWorker) {
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.style.display = 'flex';
  const sel = document.getElementById('modalWorker');
  if (defaultWorker) sel.value = defaultWorker;
  document.getElementById('modalHours').value = '';
  document.getElementById('modalHours').focus();
}
function closeModal() { document.getElementById('modalBackdrop').style.display = 'none'; }

window.addEventListener('DOMContentLoaded', async () => {
  if (window.firebaseStorePromise) {
    await window.firebaseStorePromise.catch(() => {});
    if (window.firebaseStore && typeof window.firebaseStore.syncOnStart === 'function') {
      await window.firebaseStore.syncOnStart().catch((err) => { console.warn('Firebase sync failed', err); });
    }
  }
  renderAll();

  document.querySelectorAll('button[data-worker]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const w = e.currentTarget.dataset.worker;
      openModal(w);
    });
  });

  document.getElementById('modalCancel').addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
  document.getElementById('modalAdd').addEventListener('click', (e) => {
    e.preventDefault();
    const worker = document.getElementById('modalWorker').value;
    const hours = Number(document.getElementById('modalHours').value);
    if (!worker || !hours || hours <= 0) return alert('Selecciona colaborador y cantidad válida');
    addExtras(worker, hours);
    closeModal(); renderAll();
  });

  document.getElementById('resetTotals').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Reiniciar horas extra de todos?')) return;
    resetExtras();
    renderAll();
    if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
      window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
    }
  });
});

// Upload day handler: store today's totals under 'daily_uploads'
function uploadToday() {
  if (window && typeof window.crearBackupAutomatico === 'function') window.crearBackupAutomatico();
  const date = (new Date()).toISOString().slice(0,10);
  const uploadsRaw = localStorage.getItem('daily_uploads');
  const uploads = uploadsRaw ? JSON.parse(uploadsRaw) : [];
  // prevent double upload for same date
  if (uploads.find(u => u.date === date)) return false;
  const entry = { date, workers: {} };
  WORKERS.forEach(w => {
    const scheduledArr = WEEK_SCHEDULE[w.id] || DEFAULT_WEEK_SCHEDULE[w.id] || [];
    const todayIdx = getTodayDayIdx();
    const scheduledToday = Number(scheduledArr[todayIdx] || 0);
    const extrasToday = getExtrasForDate(w.id, date);
    entry.workers[w.id] = { scheduled: scheduledToday, extras: extrasToday, total: scheduledToday + extrasToday };
  });
  uploads.push(entry);
  localStorage.setItem('daily_uploads', JSON.stringify(uploads));
  localStorage.setItem('last_upload_date', date);
  renderAll();
  if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
    window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
  }
  return true;
}

// Reset month handler: optional new schedule JSON
function resetMonth(newScheduleText, clearUploads) {
  // Create a full backup before performing the month reset
  if (window && typeof window.crearBackupAutomatico === 'function') window.crearBackupAutomatico();
  try {
    const parsed = JSON.parse(newScheduleText);
    // basic validation
    for (const k of Object.keys(parsed)) {
      if (!Array.isArray(parsed[k]) || parsed[k].length !== 7) throw new Error('Formato incorrecto');
    }
    WEEK_SCHEDULE = parsed;
    saveSchedule(WEEK_SCHEDULE);
  } catch (e) {
    throw e;
  }
  // clear extras and optionally uploads
  resetExtras();
  if (clearUploads) {
    localStorage.removeItem('daily_uploads');
    localStorage.removeItem('last_upload_date');
    // remove per-day extras
    const keys = Object.keys(localStorage).filter(k => k.startsWith('extras_by_date_'));
    keys.forEach(k => localStorage.removeItem(k));
  }
  renderAll();
  if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
    window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
  }
}

// Attach UI for upload and reset
window.addEventListener('DOMContentLoaded', () => {
  const uploadBtn = document.getElementById('uploadDay');
  if (uploadBtn) uploadBtn.addEventListener('click', () => {
    if (confirm('Subir las horas del día actual? Esta acción guardará el registro para la fecha de hoy.')) {
      const ok = uploadToday();
      if (ok) alert('Horas del día subidas.'); else alert('Ya se subieron las horas de hoy.');
      const last = localStorage.getItem('last_upload_date') || '—';
      document.getElementById('lastUpload').textContent = last;
    }
  });

  const closeMonthBtn = document.getElementById('closeMonth');
  if (closeMonthBtn) closeMonthBtn.addEventListener('click', () => { cerrarMes(); });

  const historyBtn = document.getElementById('viewHistory');
  if (historyBtn) historyBtn.addEventListener('click', () => { mostrarHistoricoMensual(); });

  const resetBtn = document.getElementById('resetMonth');
  if (resetBtn) resetBtn.addEventListener('click', () => { document.getElementById('resetBackdrop').style.display = 'flex'; });
  document.getElementById('resetCancel').addEventListener('click', (e)=>{ e.preventDefault(); document.getElementById('resetBackdrop').style.display='none'; });
  document.getElementById('resetConfirm').addEventListener('click', (e)=>{
    e.preventDefault();
    const txt = document.getElementById('scheduleTextarea').value;
    const clear = document.getElementById('clearUploads').checked;
    try { resetMonth(txt, clear); alert('Reinicio completado.'); document.getElementById('resetBackdrop').style.display='none'; }
    catch(err){ alert('Error en formato de horario: ' + err.message); }
  });

  document.getElementById('reportClose').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('reportBackdrop').style.display='none'; });
  document.getElementById('historyClose').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('historyBackdrop').style.display='none'; });

  // set last upload label
  document.getElementById('lastUpload').textContent = localStorage.getItem('last_upload_date') || '—';
  
  const exportBtn = document.getElementById('exportCsv');
  if (exportBtn) exportBtn.addEventListener('click', () => { exportMonthlyCSV(); });
});

function exportMonthlyCSV() {
  const uploadsRaw = localStorage.getItem('daily_uploads');
  const uploads = uploadsRaw ? JSON.parse(uploadsRaw) : [];
  if (!uploads.length) { alert('No hay registros de subidas para exportar.'); return; }

  // Build CSV: Date,Worker,Scheduled,Extras,Total
  const rows = [];
  rows.push(['Fecha','Colaborador','Programado (h)','Extras (h)','Total (h)']);
  const workerTotals = {};
  uploads.forEach(u => {
    const date = u.date;
    for (const wid of Object.keys(u.workers)) {
      const w = u.workers[wid];
      rows.push([date, wid, String(w.scheduled), String(w.extras), String(w.total)]);
      workerTotals[wid] = (workerTotals[wid] || 0) + (w.total || 0);
    }
  });
  // blank line and totals
  rows.push(['','']);
  rows.push(['Resumen mensual por colaborador','','','','']);
  rows.push(['Colaborador','Total horas']);
  for (const wid of Object.keys(workerTotals)) rows.push([wid, String(workerTotals[wid])]);

  const csvContent = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `horas_mensuales_${(new Date()).toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getCurrentMonthLabel() {
  return new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

function getMonthEndDate() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.toISOString().slice(0, 10);
}

function generarReporteMensual() {
  const uploads = JSON.parse(localStorage.getItem('daily_uploads') || '[]');
  const reporte = {
    mes: getCurrentMonthLabel(),
    fecha_cierre: getMonthEndDate(),
    fecha_generacion: new Date().toISOString(),
    resumenPorTrabajador: {},
    totales: { programado: 0, extras: 0, total: 0 }
  };

  WORKERS.forEach(w => {
    reporte.resumenPorTrabajador[w.id] = { id: w.id, nombre: w.name, programado: 0, extras: 0, total: 0 };
  });

  uploads.forEach(entry => {
    Object.entries(entry.workers || {}).forEach(([wid, data]) => {
      if (!reporte.resumenPorTrabajador[wid]) return;
      reporte.resumenPorTrabajador[wid].programado += Number(data.scheduled || 0);
      reporte.resumenPorTrabajador[wid].extras += Number(data.extras || 0);
      reporte.resumenPorTrabajador[wid].total += Number(data.total || 0);
      reporte.totales.programado += Number(data.scheduled || 0);
      reporte.totales.extras += Number(data.extras || 0);
      reporte.totales.total += Number(data.total || 0);
    });
  });

  return reporte;
}

function guardarHistoricoMensual(reporte) {
  const history = JSON.parse(localStorage.getItem('monthly_history') || '[]');
  history.push(reporte);
  localStorage.setItem('monthly_history', JSON.stringify(history));
}

function prepararNuevoMes() {
  localStorage.removeItem('daily_uploads');
  localStorage.removeItem('last_upload_date');
  resetExtras();
  const cleanupKeys = Object.keys(localStorage).filter(k => k.startsWith('extras_by_date_'));
  cleanupKeys.forEach(k => localStorage.removeItem(k));
  renderAll();
}

function mostrarReporteMensual(reporte) {
  const body = document.getElementById('reportBody');
  const rows = Object.values(reporte.resumenPorTrabajador)
    .map(w => `<tr><td>${w.nombre}</td><td>${w.programado} h</td><td>${w.extras} h</td><td>${w.total} h</td></tr>`)
    .join('');

  body.innerHTML = `
    <p>Mes cerrado: <strong>${reporte.mes}</strong></p>
    <p>Fecha de cierre: <strong>${reporte.fecha_cierre}</strong></p>
    <table class="report-summary">
      <thead>
        <tr><th>Colaborador</th><th>Programado</th><th>Extras</th><th>Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><th>Total</th><th>${reporte.totales.programado} h</th><th>${reporte.totales.extras} h</th><th>${reporte.totales.total} h</th></tr>
      </tfoot>
    </table>
  `;

  document.getElementById('reportBackdrop').style.display = 'flex';
}

function mostrarHistoricoMensual() {
  const history = JSON.parse(localStorage.getItem('monthly_history') || '[]');
  const body = document.getElementById('historyBody');
  if (!history.length) {
    body.innerHTML = '<p>No hay cierres mensuales guardados aún.</p>';
    document.getElementById('historyBackdrop').style.display = 'flex';
    return;
  }

  const sorted = history.slice().sort((a, b) => b.fecha_cierre.localeCompare(a.fecha_cierre));
  const cards = sorted.map(item => `
      <div class="history-item">
        <strong>${item.mes}</strong><br />
        <span>Fecha cierre: ${item.fecha_cierre}</span><br />
        <small>${Object.values(item.resumenPorTrabajador).map(w => `${w.nombre}: ${w.total} h`).join(' · ')}</small>
      </div>
    `).join('');

  body.innerHTML = `<div class="history-list">${cards}</div>`;
  document.getElementById('historyBackdrop').style.display = 'flex';
}

function bloquearMesCerrado() {
  ['uploadDay', 'closeMonth', 'resetMonth', 'exportCsv', 'viewHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
}

function desbloquearMes() {
  ['uploadDay', 'closeMonth', 'resetMonth', 'exportCsv', 'viewHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

function cerrarMes() {
  if (!confirm('Cerrar el mes actual y generar el reporte mensual?')) return;
  if (window && typeof window.crearBackupAutomatico === 'function') window.crearBackupAutomatico();
  bloquearMesCerrado();
  const reporte = generarReporteMensual();
  guardarHistoricoMensual(reporte);
  prepararNuevoMes();
  if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
    window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
  }
  mostrarReporteMensual(reporte);
  desbloquearMes();
}

// --- Backup integration: cargar backup.js si existe
// Si el archivo `backup.js` está presente en la raíz, se espera que exponga
// `crearBackupAutomatico` y `restaurarUltimoBackup` en `window`.
if (!window.crearBackupAutomatico || !window.restaurarUltimoBackup) {
  // intenta cargar de forma dinámica (solo en navegador)
  try {
    const s = document.createElement('script');
    s.src = '../backup.js';
    s.onload = () => { console.log('backup.js cargado'); };
    s.onerror = () => { console.warn('No se encontró backup.js en la ruta esperada.'); };
    document.head.appendChild(s);
  } catch (e) { console.warn('No se pudo cargar backup.js', e); }
}

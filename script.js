// DATA

const WORKERS = [
  { id: 'elias',  name: 'Elías David', role: 'Senior',       initials: 'ED', color: '#0077ff', bg: 'rgba(0,119,255,0.15)' },
  { id: 'jose',   name: 'José Luis',   role: 'Colaborador',  initials: 'JL', color: '#00e5a0', bg: 'rgba(0,229,160,0.15)' },
  { id: 'darwin', name: 'Darwin',      role: 'Colaborador',  initials: 'DW', color: '#ff5e5e', bg: 'rgba(255,94,94,0.15)'  },
  { id: 'caro',   name: 'Caro',        role: 'Colaboradora', initials: 'CA', color: '#ffc542', bg: 'rgba(255,197,66,0.15)' },
];

// Days: 0=Lun 1=Mar 2=Mie 3=Jue 4=Vie 5=Sab 6=Dom
// Fixed rules:
//   - Mié (2) and Vie (4): NO descanso for anyone
//   - Elías: ONLY descanso on Dom (6), no other day
//   - Others (José, Darwin, Caro): 1 rotating rest per week,
//     never on Mié or Vie, progressive/sequential rotation

// Possible rest days for rotating workers (not Mié/Vie)
const REST_OPTIONS = [0, 1, 3, 5, 6]; // Lun, Mar, Jue, Sab, Dom

// We assign rest days progressively in a round-robin per worker
// Each worker advances 1 position each week
function getRestDay(workerIndex, weekNumber) {
  // workerIndex: 0=José,1=Darwin,2=Caro
  // offset so they don't all rest same day
  const baseOffset = workerIndex * 2; // spread them out
  const idx = (weekNumber + baseOffset) % REST_OPTIONS.length;
  return REST_OPTIONS[idx];
}

// Manual rest overrides storage helpers
function manualKeyForWeek(weekNumber) {
  return 'manual_rest_' + weekNumber;
}

function getManualRestForWeek(weekNumber) {
  try {
    const raw = localStorage.getItem(manualKeyForWeek(weekNumber));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function setManualRestForWeek(weekNumber, mapping) {
  // mapping: { elias: dayIdx, jose: dayIdx, darwin: dayIdx, caro: dayIdx }
  try {
    localStorage.setItem(manualKeyForWeek(weekNumber), JSON.stringify(mapping));
    if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
      window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
    }
    return true;
  } catch (e) { return false; }
}

// Flags storage for week (e.g., no-rest-on-Saturday)
function manualFlagsKeyForWeek(weekNumber) { return 'manual_flags_' + weekNumber; }
function getManualFlagsForWeek(weekNumber) {
  try { const raw = localStorage.getItem(manualFlagsKeyForWeek(weekNumber)); return raw ? JSON.parse(raw) : {}; } catch(e){return {}}
}
function setManualFlagsForWeek(weekNumber, flags) {
  try {
    localStorage.setItem(manualFlagsKeyForWeek(weekNumber), JSON.stringify(flags));
    if (window.firebaseStore && typeof window.firebaseStore.saveRemoteState === 'function') {
      window.firebaseStore.saveRemoteState(window.firebaseStore.buildStateFromLocal()).catch(() => {});
    }
    return true;
  } catch(e){return false}
}

// Shifts: two possible shifts
const SHIFTS = {
  A: { start: '7:00 am', end: '4:00 pm', hours: '9h' },
  B: { start: '11:00 am', end: '8:00 pm', hours: '9h' },
  C: { start: '9:00 am', end: '8:00 pm', hours: '11h' },
  D: { start: '8:00 am', end: '4:00 pm', hours: '8h' },
  E: { start: '10:00 am', end: '7:00 pm', hours: '9h' },
};

// Elías is always shift A Mon-Sat
function getEliasShift(dayIdx) {
  if (dayIdx === 6) return 'REST_ELIAS'; // Sunday
  return SHIFTS.A;
}

// FIXED shifts per worker: shifts do NOT change week-to-week
const FIXED_SHIFTS_PER_WORKER = {
  'elias': SHIFTS.A,   // Elías: 7:00 - 16:00 (Mon-Sat)
  'jose':  SHIFTS.B,   // José Luis: 11:00 - 20:00
  'darwin':SHIFTS.C,   // Darwin: 9:00 - 20:00
  'caro':  SHIFTS.D    // Caro: 8:00 - 16:00
};

// Note: only rest days rotate. Shifts remain the same per worker.

// WEEK UTILITIES

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Get Monday of the current schedule week
// Schedule updates Sunday 12pm: if today is Sunday >= 12pm, use next week's Monday
function getScheduleWeekStart(now) {
  const d = new Date(now);
  const dow = d.getDay(); // 0=Sun...6=Sat
  let diffToMon;
  if (dow === 0) {
    // Sunday
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 12) {
      // After 12pm: show next week (tomorrow is Monday)
      diffToMon = 1;
    } else {
      // Before 12pm: still current week (last Monday)
      diffToMon = -6;
    }
  } else {
    // Mon(1)...Sat(6) -> go back to Monday
    diffToMon = 1 - dow;
  }
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function formatDate(d) {
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function getDayName(dayIdx) {
  const names = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  return names[dayIdx];
}

function getExactThisWeekSchedule(weekNumber) {
  const now = new Date();
  const currentWeek = getWeekNumber(getScheduleWeekStart(now));
  if (weekNumber !== currentWeek) return null;

  return [
    {
      worker: WORKERS[0],
      days: [
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '7:00 am', end: '4:00 pm', hours: '9h' } },
        { type: 'rest', special: 'elias' }
      ]
    },
    {
      worker: WORKERS[1],
      days: [
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'rest' },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '8:00 am', end: '5:00 pm', hours: '9h' } }
      ]
    },
    {
      worker: WORKERS[2],
      days: [
        { type: 'shift', shift: { start: '9:00 am', end: '8:00 pm', hours: '11h' } },
        { type: 'shift', shift: { start: '9:00 am', end: '8:00 pm', hours: '11h' } },
        { type: 'shift', shift: { start: '8:00 am', end: '4:00 pm', hours: '8h' } },
        { type: 'rest' },
        { type: 'shift', shift: { start: '8:00 am', end: '4:00 pm', hours: '8h' } },
        { type: 'shift', shift: { start: '8:00 am', end: '4:00 pm', hours: '8h' } },
        { type: 'shift', shift: { start: '10:00 am', end: '7:00 pm', hours: '9h' } }
      ]
    },
    {
      worker: WORKERS[3],
      days: [
        { type: 'rest' },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '8:00 pm', hours: '9h' } },
        { type: 'shift', shift: { start: '11:00 am', end: '7:00 pm', hours: '8h' } }
      ]
    }
  ];
}

// BUILD SCHEDULE

function buildSchedule(weekStart, weekNumber) {
  // Returns array of 4 workers x 7 days
  const schedule = [];

  // Rotating workers: José(idx0), Darwin(idx1), Caro(idx2)

  const rotatingWorkers = [
    { w: WORKERS[1], idx: 0 },
    { w: WORKERS[2], idx: 1 },
    { w: WORKERS[3], idx: 2 },
  ];

  const exactSchedule = getExactThisWeekSchedule(weekNumber);
  if (exactSchedule) return exactSchedule;

  const rotatingRestDays = rotatingWorkers.map(rw => getRestDay(rw.idx, weekNumber));

  // Check for manual overrides stored for this specific week
  const manual = getManualRestForWeek(weekNumber) || {};
  const flags = getManualFlagsForWeek(weekNumber) || {};

  // Elías (fixed shift A Mon-Sat, rest on Sunday)
  const eliasRow = { worker: WORKERS[0], days: [] };
  for (let d = 0; d < 7; d++) {
    // allow manual override if provided (but never allow Wed/Fri as rest)
    const manualRestForElias = manual && manual['elias'] !== undefined ? manual['elias'] : null;
    if (manualRestForElias !== null) {
      // if manual says rest on this day index
      if (manual['elias'] === d) {
        eliasRow.days.push({ type: 'rest', special: 'elias' });
        continue;
      }
    }
    if (d === 6) eliasRow.days.push({ type: 'rest', special: 'elias' });
    else eliasRow.days.push({ type: 'shift', shift: FIXED_SHIFTS_PER_WORKER['elias'] });
  }
  schedule.push(eliasRow);

  // Rotating workers
  rotatingWorkers.forEach((rw, ri) => {
    const row = { worker: rw.w, days: [] };
    const restDay = rotatingRestDays[ri];
    for (let d = 0; d < 7; d++) {
      // manual override check per worker id
      const wid = rw.w.id;
      const manualDay = manual && manual[wid] !== undefined ? manual[wid] : null;

      // respect rule: no rests on Wednesday(2) or Friday(4)
      let cannotRest = (d === 2 || d === 4);
      // also respect user flags (e.g., no rest on Saturday)
      if (flags.noRestSaturday && d === 5) cannotRest = true;
      // per-worker forbidden days
      if (flags.forbidden && flags.forbidden[wid] && Array.isArray(flags.forbidden[wid]) && flags.forbidden[wid].includes(d)) cannotRest = true;

      if (manualDay !== null) {
        if (manualDay === d) {
          // if manual asks rest on a forbidden day, ignore it
          if (!cannotRest) {
            row.days.push({ type: 'rest' });
            continue;
          }
        }
      }

      // otherwise default rotating rest day (only if allowed)
      if (d === restDay && !cannotRest) {
        row.days.push({ type: 'rest' });
      } else {
        // fixed shift for the worker
        row.days.push({ type: 'shift', shift: FIXED_SHIFTS_PER_WORKER[wid] });
      }
    }
    schedule.push(row);
  });

  return schedule;
}

// RENDER

function renderTable(schedule, weekStart, todayDayIdx) {
  const tbody = document.getElementById('schedule-body');
  tbody.innerHTML = '';

  schedule.forEach((row, ri) => {
    const tr = document.createElement('tr');

    // Worker cell
    const tdName = document.createElement('td');
    tdName.innerHTML = `
      <div class="worker-cell">
        <div class="avatar" style="background:${row.worker.bg};color:${row.worker.color};">
          ${row.worker.initials}
        </div>
        <div>
          <div class="worker-name" style="color:${row.worker.color}">${row.worker.name}</div>
          <div class="worker-role">${row.worker.role}</div>
        </div>
      </div>`;
    tr.appendChild(tdName);

    // Day cells
    row.days.forEach((cell, di) => {
      const td = document.createElement('td');
      if (di === todayDayIdx) td.classList.add('today-col');
      if (ri === 0 && di === 6) td.classList.add('elias-domingo');

      if (cell.type === 'rest') {
        const icon = (ri === 0 && di === 6) ? '✦' : '☀';
        const label = (ri === 0 && di === 6) ? 'Descanso Fijo' : 'Descanso';
        td.innerHTML = `<div class="rest-cell">${icon} ${label}</div>`;
      } else {
        const s = cell.shift;
        td.innerHTML = `
          <div class="shift-cell">
            <span class="shift-start">${s.start}</span>
            <span class="shift-sep"></span>
            <span class="shift-end">${s.end}</span>
            <span class="shift-hours">${s.hours}</span>
          </div>`;
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function updateHeaders(weekStart, todayDayIdx) {
  const ids = ['th-lun','th-mar','th-mie','th-jue','th-vie','th-sab','th-dom'];
  ids.forEach((id, i) => {
    const th = document.getElementById(id);
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dayName = getDayName(i);
    const dateStr = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    th.innerHTML = `${dayName}<br><span style="font-size:0.65rem;color:var(--muted);font-weight:400;">${dateStr}</span>`;
    if (i === todayDayIdx) th.classList.add('today-col');
    else th.classList.remove('today-col');
  });
}

// COUNTDOWN & PROGRESS

function getNextSunday12(now) {
  const d = new Date(now);
  const dow = d.getDay();
  let daysToSun = (7 - dow) % 7;
  if (daysToSun === 0) {
    // today is Sunday
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 12) daysToSun = 7; // next Sunday
    // else: today Sunday before 12pm -> same Sunday at 12pm
  }
  const next = new Date(d);
  next.setDate(d.getDate() + daysToSun);
  next.setHours(12, 0, 0, 0);
  return next;
}

function padZ(n) { return String(n).padStart(2,'0'); }

function updateCountdown(now) {
  const target = getNextSunday12(now);
  const diff = target - now;
  if (diff <= 0) return;

  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  let str = '';
  if (days > 0) str += `${days}d `;
  str += `${padZ(hrs)}:${padZ(mins)}:${padZ(secs)}`;

  document.getElementById('countdown').textContent = str;

  // Week progress: from Monday 00:00 to Sunday 23:59
  const weekStart = getScheduleWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const total = weekEnd - weekStart;
  const elapsed = now - weekStart;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  document.getElementById('week-progress').style.width = pct.toFixed(1) + '%';
  document.getElementById('progress-pct').textContent = pct.toFixed(0) + '%';

  // Next update label
  document.getElementById('next-sunday').textContent =
    target.toLocaleDateString('es-CO', { weekday:'short', day:'2-digit', month:'short' }) + ' 12:00 PM';
}

// MAIN INIT & TICK

let lastRenderedWeek = null;

function getJSDayToColIdx(jsDay) {
  // JS: 0=Sun,1=Mon,...,6=Sat → col: 0=Mon,...,6=Sun
  if (jsDay === 0) return 6;
  return jsDay - 1;
}

function tick() {
  const now = new Date();
  const weekStart = getScheduleWeekStart(now);
  const weekNum = getWeekNumber(weekStart);
  const todayDayIdx = getJSDayToColIdx(now.getDay());

  // Stats
  const dayNames = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  document.getElementById('current-day-stat').textContent = dayNames[todayDayIdx];
  document.getElementById('current-time-stat').textContent =
    now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', hour12: true });
  document.getElementById('week-number').textContent = 'S' + weekNum;

  // Week range label
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const rangeStr = `${formatDate(weekStart)} — ${formatDate(weekEnd)}`;
  document.getElementById('week-range-pill').textContent = rangeStr;
  document.getElementById('week-label').textContent = `Semana ${weekNum} · ${weekStart.getFullYear()}`;

  // Re-render table only if week changed
  if (lastRenderedWeek !== weekNum) {
    lastRenderedWeek = weekNum;
    const schedule = buildSchedule(weekStart, weekNum);
    renderTable(schedule, weekStart, todayDayIdx);
    updateHeaders(weekStart, todayDayIdx);
  } else {
    // Just update today column highlight without full re-render
    // (handled by keeping todayDayIdx stable within a day)
  }

  updateCountdown(now);
}

function startApp() {
  tick();
  setInterval(tick, 1000);
}

if (window.firebaseStorePromise) {
  window.firebaseStorePromise.then(() => {
    if (window.firebaseStore && typeof window.firebaseStore.syncOnStart === 'function') {
      return window.firebaseStore.syncOnStart();
    }
    return null;
  }).catch((err) => { console.warn('Firebase sync failed', err); })
  .finally(() => { startApp(); });
} else {
  startApp();
}

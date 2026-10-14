'use strict';

/* ---------- storage ---------- */

const STORE_KEY = 'glute-cut-tracker-v1';

function blankState() {
  return {
    version: 1,
    unit: 'lb',
    schedule: DEFAULT_SCHEDULE.slice(),
    logs: {},      // 'YYYY-MM-DD' -> { w, entries: { exId: { sets:[{w,r}] } | { cardio:{min,incline,speed} } }, notes, done }
    daily: {},     // 'YYYY-MM-DD' -> { bw, steps }
    overrides: {}, // 'YYYY-MM-DD' -> workout id
    seen: { weeks: [], months: [] },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blankState();
    return Object.assign(blankState(), JSON.parse(raw));
  } catch (e) {
    return blankState();
  }
}

let state = loadState();
let storageOk = true;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
    toast('Could not save on this device. Export a backup from Program → Data.');
  }
}

/* ---------- helpers ---------- */

const app = document.getElementById('app');
const EX_BY_ID = {};
Object.values(PROGRAM).forEach(w => w.ex.forEach(ex => { if (!EX_BY_ID[ex.id]) EX_BY_ID[ex.id] = ex; }));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = n => Math.round(n).toLocaleString();
const fmtW = n => (Math.round(n * 10) / 10).toString();
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekdayIdx = d => (d.getDay() + 6) % 7; // Monday = 0
const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -weekdayIdx(d));
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayKey = () => key(new Date());
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const prettyDate = k => parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = k => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const u = () => state.unit;
const timed = ex => ex.type === 'cardio' || ex.type === 'class'; // logged in minutes, not sets

function timeLabel(t) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function workoutFor(k) {
  return state.overrides[k] || state.schedule[weekdayIdx(parseKey(k))] || 'REST';
}

function entryHasData(entry) {
  if (!entry) return false;
  if (entry.cardio) return num(entry.cardio.min) > 0;
  return (entry.sets || []).some(s => num(s.r) > 0);
}

function logHasData(log) {
  return !!log && Object.values(log.entries || {}).some(entryHasData);
}

// Every earlier session of an exercise, newest first.
function history(exId, beforeK) {
  return Object.keys(state.logs)
    .filter(k => (!beforeK || k < beforeK))
    .sort().reverse()
    .map(k => ({ date: k, entry: state.logs[k].entries && state.logs[k].entries[exId] }))
    .filter(h => entryHasData(h.entry));
}

function filledSets(entry) {
  return ((entry && entry.sets) || []).filter(s => num(s.r) > 0).map(s => ({ w: num(s.w), r: num(s.r) }));
}

function setsText(ex, entry) {
  if (timed(ex)) {
    const c = entry.cardio;
    const bits = [`${fmtW(num(c.min))} min`];
    if (num(c.incline)) bits.push(`${fmtW(num(c.incline))}% incline`);
    if (num(c.speed)) bits.push(`${fmtW(num(c.speed))} mph`);
    return bits.join(' · ');
  }
  const unit = ex.type === 'time' ? 's' : '';
  return filledSets(entry).map(s => s.w ? `${fmtW(s.w)}×${s.r}` : `${s.r}${unit}`).join(', ');
}

// A single number per session, used for PRs: estimated 1-rep max for weighted lifts, reps/seconds/minutes otherwise.
function score(ex, entry) {
  if (!entryHasData(entry)) return 0;
  if (timed(ex)) return num(entry.cardio.min);
  const sets = filledSets(entry);
  return Math.max(0, ...sets.map(s => s.w > 0 ? s.w * (1 + s.r / 30) : s.r));
}

const roundTo = (n, step) => Math.round(n / step) * step;

/* ---------- the smart part: next-session suggestions ---------- */

function suggest(ex, prev) {
  if (timed(ex)) return suggestCardio(ex, prev);
  const [lo, hi] = ex.reps;
  const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
  const unitR = ex.type === 'time' ? ' sec' : ' reps';
  const each = ex.each ? ' each side' : '';

  if (!prev) {
    return {
      first: true,
      w: '',
      targets: Array(ex.sets).fill(range),
      msg: ex.type === 'bw' || ex.type === 'time'
        ? `First time: do ${ex.sets} sets of ${range}${unitR}${each}. Stop 1–2 reps before form breaks.`
        : `First time: pick a weight you could lift about ${hi + 2} times, then do ${ex.sets} sets of ${range}${each}. ${ex.start || ''}`,
      goal: null,
    };
  }

  const sets = filledSets(prev.entry);

  if (ex.type === 'bw' || ex.type === 'time') {
    const step = ex.type === 'time' ? 5 : 1;
    const targets = [];
    for (let i = 0; i < ex.sets; i++) {
      const last = sets[Math.min(i, sets.length - 1)];
      targets.push(String((last ? last.r : lo) + step));
    }
    const best = Math.max(...sets.map(s => s.r));
    const allTop = sets.length >= ex.sets && sets.every(s => s.r >= hi);
    return {
      w: sets[0] && sets[0].w ? sets[0].w : '',
      targets,
      msg: allTop
        ? `You're past the ${range}${unitR} range. Keep adding ${step}${unitR}, or slow the tempo to make it harder.`
        : `Beat last time: add ${step}${unitR} to each set.`,
      goal: `${ex.type === 'time' ? best + 30 : best + 6}${unitR}${each}`,
    };
  }

  const W = Math.max(...sets.map(s => s.w));
  const work = sets.filter(s => s.w === W);
  const allTop = work.length >= ex.sets && work.every(s => s.r >= hi);
  const goalBumps = ex.type === 'heavy' ? 4 : 2;

  if (allTop) {
    const nw = W + ex.inc;
    return {
      w: nw,
      bumped: true,
      targets: Array(ex.sets).fill(String(lo)),
      msg: ex.type === 'arms'
        ? `All sets hit ${hi}! Move up to ${fmtW(nw)} ${u()} and build the reps back up from ${lo}.`
        : `You hit ${hi} on every set. Go up to ${fmtW(nw)} ${u()} and aim for ${lo}+ reps.`,
      goal: `${fmtW(W + ex.inc * (goalBumps + 1))} ${u()} × ${ex.type === 'arms' ? hi : lo}${each}`,
    };
  }

  const targets = [];
  for (let i = 0; i < ex.sets; i++) {
    const s = work[i];
    targets.push(String(s ? Math.min(hi, s.r + 1) : lo));
  }
  const struggled = ex.type === 'heavy' && work.length && work.every(s => s.r < lo);
  let msg;
  if (struggled) msg = `${fmtW(W)} ${u()} was a fight. Stay here and own ${lo} reps before adding weight.`;
  else if (ex.type === 'arms') msg = `Stay at ${fmtW(W)} ${u()}. Reps are the goal: beat last time by 1 rep per set, up to ${hi}.`;
  else if (ex.type === 'heavy') msg = `Stay at ${fmtW(W)} ${u()} and add a rep per set. Once every set hits ${hi}, add ${fmtW(ex.inc)} ${u()}.`;
  else msg = `Stay at ${fmtW(W)} ${u()} and add a rep per set, up to ${hi}.`;

  return {
    w: W || '',
    targets,
    msg,
    goal: W ? `${fmtW(W + ex.inc * goalBumps)} ${u()} × ${ex.type === 'arms' ? hi : lo}${each}` : null,
  };
}

function suggestCardio(ex, prev) {
  const goal = ex.goalMin;
  if (ex.type === 'class') {
    return {
      first: !prev,
      cardio: { min: prev ? num(prev.entry.cardio.min) : goal },
      msg: prev ? `Last class: ${fmtW(num(prev.entry.cardio.min))} min. Focus on control and breathing.` : 'Log how long the class was. It counts as a completed workout.',
      goal: null,
    };
  }
  if (!prev) {
    const start = Math.min(goal, goal >= 30 ? 30 : 15);
    return {
      first: true,
      cardio: { min: start, incline: 8, speed: 3.0 },
      msg: `First time: ${start} min at about 8% incline, 3.0 mph. You should be able to talk in full sentences.`,
      goal: `${goal} min at 12% incline`,
    };
  }
  const c = prev.entry.cardio;
  const min = num(c.min), inc = num(c.incline), spd = num(c.speed);
  let next = { min, incline: inc, speed: spd }, msg;
  if (min < goal) {
    next.min = Math.min(goal, min + 5);
    msg = `Build time first: go for ${fmtW(next.min)} min (goal ${goal}).`;
  } else if (inc < 12) {
    next.incline = Math.min(12, inc + 1);
    msg = `You hit ${goal} min. Bump the incline to ${fmtW(next.incline)}%.`;
  } else {
    next.speed = Math.round((spd + 0.1) * 10) / 10;
    msg = `Time and incline are maxed. Nudge the speed to ${fmtW(next.speed)} mph.`;
  }
  return { cardio: next, msg, goal: `${goal} min at 12% incline` };
}

function lastSession(exId, beforeK) {
  return history(exId, beforeK)[0] || null;
}

/* ---------- summaries ---------- */

function summarize(startK, endK) {
  const s = {
    planned: 0, done: 0, sets: 0, volume: 0, legVolume: 0, armReps: 0, cardioMin: 0, classMin: 0,
    prs: [], stepsDays: 0, stepsTotal: 0, bw: [], lifts: {}, days: [],
  };
  for (let d = parseKey(startK); key(d) <= endK; d = addDays(d, 1)) {
    const k = key(d);
    const wid = workoutFor(k);
    if (wid !== 'REST') s.planned++;
    const daily = state.daily[k];
    if (daily && num(daily.steps)) { s.stepsDays++; s.stepsTotal += num(daily.steps); }
    if (daily && num(daily.bw)) s.bw.push({ date: k, bw: num(daily.bw) });
    const log = state.logs[k];
    const dayInfo = { k, wid, done: logHasData(log), cardio: 0, volume: 0 };
    s.days.push(dayInfo);
    if (!logHasData(log)) continue;
    s.done++;
    Object.entries(log.entries).forEach(([exId, entry]) => {
      const ex = EX_BY_ID[exId];
      if (!ex || !entryHasData(entry)) return;
      if (ex.type === 'class') {
        s.classMin += num(entry.cardio.min);
      } else if (timed(ex)) {
        s.cardioMin += num(entry.cardio.min);
        dayInfo.cardio += num(entry.cardio.min);
      } else {
        const sets = filledSets(entry);
        s.sets += sets.length;
        sets.forEach(x => {
          const v = x.w * x.r;
          s.volume += v;
          dayInfo.volume += v;
          if (ex.type === 'heavy') s.legVolume += v;
          if (ex.type === 'arms') s.armReps += x.r;
        });
        if (ex.type !== 'bw' && ex.type !== 'time') {
          const maxW = Math.max(...sets.map(x => x.w));
          const repsAtMax = Math.max(...sets.filter(x => x.w === maxW).map(x => x.r));
          if (!s.lifts[exId]) s.lifts[exId] = { first: { k, w: maxW, r: repsAtMax } };
          s.lifts[exId].last = { k, w: maxW, r: repsAtMax };
        }
      }
      const prevBest = Math.max(0, ...history(exId, k).map(h => score(ex, h.entry)));
      const sc = score(ex, entry);
      if (prevBest > 0 && sc > prevBest) s.prs.push({ k, ex, text: setsText(ex, entry) });
    });
  }
  s.avgSteps = s.stepsDays ? s.stepsTotal / s.stepsDays : 0;
  return s;
}

function cheer(pct, done) {
  if (!done) return { emoji: '🌱', head: 'Fresh start ahead', sub: 'Nothing logged yet. The next session is the one that counts.' };
  if (pct >= 1) return { emoji: '🏆', head: 'Perfect week!', sub: 'Every planned session done. That is how bodies change.' };
  if (pct >= 0.8) return { emoji: '🔥', head: 'You crushed it', sub: 'Nearly every session checked off. Elite consistency.' };
  if (pct >= 0.5) return { emoji: '💪', head: 'Solid work', sub: 'More than half the plan done. Keep stacking weeks like this.' };
  return { emoji: '✨', head: 'Every rep counts', sub: 'You showed up. Next week, aim for one more session.' };
}

/* ---------- rendering ---------- */

function chip(wid, extra = '') {
  const w = PROGRAM[wid];
  return `<span class="chip k-${w.kind} ${extra}">${esc(w.short)}</span>`;
}

function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (route || 'cal')));
  switch (route) {
    case 'day': return renderDay(arg || todayKey());
    case 'log': return renderLog(arg || todayKey());
    case 'week': return renderWeek(arg || key(mondayOf(new Date())));
    case 'month': return renderMonth(arg || monthKey(new Date()));
    case 'progress': return renderProgress();
    case 'program': return renderProgram();
    default: return renderCalendar();
  }
}

let viewMonth = new Date();

function renderCalendar() {
  const tk = todayKey();
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = mondayOf(first);
  const todayW = workoutFor(tk);
  const todayLog = state.logs[tk];

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i === 35 && d.getMonth() !== viewMonth.getMonth()) break;
    const k = key(d);
    const wid = workoutFor(k);
    const log = state.logs[k];
    const done = logHasData(log) && log.done;
    const started = logHasData(log) && !log.done;
    const cls = ['cell', d.getMonth() !== viewMonth.getMonth() ? 'out' : '', k === tk ? 'today' : '', k < tk ? 'past' : ''].join(' ');
    cells += `<a class="${cls}" href="#/day/${k}" aria-label="${esc(prettyDate(k))}, ${esc(PROGRAM[wid].name)}${done ? ', done' : ''}">
      <span class="dnum">${d.getDate()}</span>
      ${chip(wid, done ? 'done' : '')}
      ${done ? '<span class="tick">✓</span>' : started ? '<span class="dot"></span>' : ''}
    </a>`;
  }

  const wk = key(mondayOf(new Date()));
  const ws = summarize(wk, key(addDays(parseKey(wk), 6)));
  const cardioPct = Math.min(1, ws.cardioMin / GOALS.cardioMinPerWeek);

  app.innerHTML = `
    <section class="hero-today k-${PROGRAM[todayW].kind}">
      <div>
        <div class="eyebrow">Today · ${esc(shortDate(tk))}${state.daily[tk] && state.daily[tk].time ? ` · ${esc(timeLabel(state.daily[tk].time))}` : ''}</div>
        <h1>${esc(PROGRAM[todayW].name)}</h1>
        <p>${esc(PROGRAM[todayW].blurb)}</p>
      </div>
      ${todayW === 'REST'
        ? `<a class="btn ghost" href="#/day/${tk}">Log steps</a>`
        : `<a class="btn primary" href="#/log/${tk}">${todayLog && todayLog.done ? 'View workout' : logHasData(todayLog) ? 'Continue' : 'Start workout'}</a>`}
    </section>

    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="prev-month" aria-label="Previous month">‹</button>
        <h2>${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}</h2>
        <button class="icon-btn" data-act="next-month" aria-label="Next month">›</button>
      </div>
      <div class="cal">
        ${DOW.map(d => `<div class="dow">${d[0]}</div>`).join('')}
        ${cells}
      </div>
      <div class="legend">
        <span>${chip('A')} Heavy legs</span><span>${chip('B')} High-rep arms</span><span>${chip('E')} Glute pump</span><span>${chip('CARDIO')} Cardio</span>
      </div>
      <div class="row-btns">
        <button class="btn ghost sm" data-act="today-month">Today</button>
        <a class="btn ghost sm" href="#/month/${monthKey(viewMonth)}">${MONTHS[viewMonth.getMonth()]} summary</a>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>This week</h2><a href="#/week/${wk}" class="link">Summary →</a></div>
      <div class="meter-row">
        <div class="meter-label"><span>Workouts</span><b>${ws.done} / ${ws.planned}</b></div>
        <div class="meter"><i style="width:${ws.planned ? Math.min(100, ws.done / ws.planned * 100) : 0}%"></i></div>
      </div>
      <div class="meter-row">
        <div class="meter-label"><span>Cardio</span><b>${fmt(ws.cardioMin)} / ${GOALS.cardioMinPerWeek} min</b></div>
        <div class="meter cardio"><i style="width:${cardioPct * 100}%"></i></div>
      </div>
      <div class="week-strip">
        ${ws.days.map((d, i) => `<a href="#/day/${d.k}" class="ws ${d.done ? 'done' : ''} ${d.k === tk ? 'today' : ''}"><span>${DOW[i][0]}</span>${d.done ? '✓' : PROGRAM[d.wid].short[0]}</a>`).join('')}
      </div>
    </section>

    <p class="fineprint">Cut day: about ${fmt(GOALS.calories)} cal and ${GOALS.protein} g protein.</p>
  `;
}

function renderDay(k) {
  const wid = workoutFor(k);
  const w = PROGRAM[wid];
  const log = state.logs[k];
  const daily = state.daily[k] || {};
  const prevK = key(addDays(parseKey(k), -1));
  const nextK = key(addDays(parseKey(k), 1));

  const exList = w.ex.map(ex => {
    const prev = lastSession(ex.id, k);
    const sg = suggest(ex, prev);
    const today = log && log.entries && log.entries[ex.id];
    let target;
    if (timed(ex)) target = `${fmtW(sg.cardio.min)} min`;
    else if (sg.w) target = `${fmtW(sg.w)} ${u()} · ${ex.sets}×${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')}`;
    else target = `${ex.sets}×${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')}${ex.type === 'time' ? 's' : ''}`;
    return `<li>
      <div><b>${esc(ex.name)}</b><span class="tag t-${ex.type}">${TYPE_LABEL[ex.type]}</span></div>
      <div class="muted">${entryHasData(today) ? `Logged: ${esc(setsText(ex, today))}` : `Target: ${esc(target)}${prev ? ` · last ${esc(setsText(ex, prev.entry))}` : ''}`}</div>
    </li>`;
  }).join('');

  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/day/${prevK}" aria-label="Previous day">‹</a>
      <div class="center"><div class="eyebrow">${k === todayKey() ? 'Today' : k < todayKey() ? 'Past day' : 'Coming up'}</div><h1 class="h-sm">${esc(prettyDate(k))}</h1></div>
      <a class="icon-btn" href="#/day/${nextK}" aria-label="Next day">›</a>
    </div>

    <section class="card k-${w.kind} accent">
      <div class="card-head">
        <h2>${esc(w.name)}</h2>
        <label class="swap">Swap
          <select data-act="override" data-k="${k}">
            ${Object.values(PROGRAM).map(p => `<option value="${p.id}" ${p.id === wid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <p class="muted">${esc(w.blurb)}</p>
      ${w.ex.length ? `<ul class="ex-list">${exList}</ul>
        <a class="btn primary block" href="#/log/${k}">${log && log.done ? 'Edit workout' : logHasData(log) ? 'Continue workout' : 'Start workout'}</a>` : ''}
    </section>

    <section class="card">
      <h2>Daily check-in</h2>
      <div class="grid3 checkin">
        <label class="field"><span>Workout time</span><input type="time" data-daily="time" data-k="${k}" value="${esc(daily.time || '')}"></label>
        <label class="field"><span>Steps</span><input type="number" inputmode="numeric" min="0" data-daily="steps" data-k="${k}" value="${esc(daily.steps || '')}" placeholder="${GOALS.stepsPerDay}"></label>
        <label class="field"><span>Body weight (${u()})</span><input type="number" inputmode="decimal" min="0" step="0.1" data-daily="bw" data-k="${k}" value="${esc(daily.bw || '')}" placeholder="optional"></label>
      </div>
    </section>

    <div class="row-btns">
      <a class="btn ghost sm" href="#/week/${key(mondayOf(parseKey(k)))}">Week summary</a>
      <a class="btn ghost sm" href="#/">Calendar</a>
    </div>
  `;
}

function ensureLog(k) {
  if (!state.logs[k]) state.logs[k] = { w: workoutFor(k), entries: {}, notes: '', done: false };
  return state.logs[k];
}

function renderLog(k) {
  const wid = workoutFor(k);
  const w = PROGRAM[wid];
  if (!w.ex.length) { location.hash = `#/day/${k}`; return; }
  const log = state.logs[k];

  const cards = w.ex.map(ex => {
    const prev = lastSession(ex.id, k);
    const sg = suggest(ex, prev);
    const entry = log && log.entries[ex.id];
    const head = `
      <div class="ex-head">
        <h3>${esc(ex.name)}</h3>
        <span class="tag t-${ex.type}">${TYPE_LABEL[ex.type]}</span>
      </div>
      <div class="muted">${timed(ex) ? `Goal ${ex.goalMin} min` : `${ex.sets} sets × ${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')}${ex.type === 'time' ? ' sec' : ''}${ex.each ? ' each side' : ''}`}
        ${prev ? ` · <span class="last">Last (${esc(shortDate(prev.date))}): ${esc(setsText(ex, prev.entry))}</span>` : ''}</div>
      <div class="coach ${sg.bumped ? 'up' : ''} ${sg.first ? 'first' : ''}">
        <span class="coach-ico">${sg.bumped ? '⬆️' : sg.first ? '👋' : '🎯'}</span>
        <div>${esc(sg.msg)}${sg.goal ? `<div class="goal">8-week goal: <b>${esc(sg.goal)}</b></div>` : ''}</div>
      </div>`;

    if (timed(ex)) {
      const c = (entry && entry.cardio) || {};
      return `<section class="card ex" data-ex="${ex.id}">${head}
        <div class="grid3">
          <label class="field"><span>Minutes</span><input type="number" inputmode="decimal" min="0" data-c="min" value="${esc(c.min || '')}" placeholder="${fmtW(sg.cardio.min)}"></label>
          ${ex.type === 'class' ? '' : `<label class="field"><span>Incline %</span><input type="number" inputmode="decimal" min="0" step="0.5" data-c="incline" value="${esc(c.incline || '')}" placeholder="${fmtW(sg.cardio.incline)}"></label>
          <label class="field"><span>Speed mph</span><input type="number" inputmode="decimal" min="0" step="0.1" data-c="speed" value="${esc(c.speed || '')}" placeholder="${fmtW(sg.cardio.speed)}"></label>`}
        </div>
        <button class="btn ghost sm" data-act="fill-cardio">${ex.type === 'class' ? 'Done' : 'Use target'}</button>
      </section>`;
    }

    const isW = ex.type !== 'time';
    const sets = (entry && entry.sets && entry.sets.length) ? entry.sets
      : Array.from({ length: ex.sets }, () => ({ w: sg.w === '' ? '' : sg.w, r: '' }));
    const rows = sets.map((s, i) => `
      <div class="set-row" data-i="${i}">
        <span class="set-n">${i + 1}</span>
        ${isW ? `<input type="number" inputmode="decimal" min="0" step="0.5" data-f="w" value="${esc(s.w)}" placeholder="${ex.type === 'bw' ? 'BW' : u()}" aria-label="Set ${i + 1} weight">` : '<span></span>'}
        <input type="number" inputmode="numeric" min="0" data-f="r" value="${esc(s.r)}" placeholder="${esc(sg.targets[i] || sg.targets[sg.targets.length - 1])}" aria-label="Set ${i + 1} ${ex.type === 'time' ? 'seconds' : 'reps'}">
        <button class="hit" data-act="hit" aria-label="Fill target">✓</button>
      </div>`).join('');

    return `<section class="card ex" data-ex="${ex.id}">${head}
      <div class="set-row set-labels"><span>Set</span><span>${isW ? u() : ''}</span><span>${ex.type === 'time' ? 'Sec' : 'Reps'}</span><span></span></div>
      ${rows}
      <div class="row-btns left">
        <button class="btn ghost sm" data-act="add-set">+ Set</button>
        ${sets.length > 1 ? '<button class="btn ghost sm" data-act="del-set">− Set</button>' : ''}
      </div>
    </section>`;
  }).join('');

  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/day/${k}" aria-label="Back">‹</a>
      <div class="center"><div class="eyebrow">${esc(shortDate(k))}</div><h1 class="h-sm">${esc(w.name)}</h1></div>
      <span class="icon-btn ghosted"></span>
    </div>
    ${w.ex.every(timed) ? '' : `<p class="hint">Weights are pre-filled from your last session. Grey numbers are today's rep targets: tap ✓ if you hit it, or type what you did.</p>`}
    ${cards}
    <section class="card">
      <label class="field"><span>Notes</span><textarea data-act="notes" rows="2" placeholder="How did it feel?">${esc((log && log.notes) || '')}</textarea></label>
    </section>
    <div class="sticky-save"><button class="btn primary block" data-act="finish" data-k="${k}">${log && log.done ? 'Save changes' : 'Finish workout'}</button></div>
  `;
  app.dataset.k = k;
}

function readLogFromDom(k) {
  const log = ensureLog(k);
  log.w = workoutFor(k);
  app.querySelectorAll('.card.ex').forEach(card => {
    const exId = card.dataset.ex;
    const ex = EX_BY_ID[exId];
    if (timed(ex)) {
      const c = {};
      card.querySelectorAll('[data-c]').forEach(inp => { c[inp.dataset.c] = inp.value; });
      log.entries[exId] = { cardio: c };
    } else {
      const sets = [...card.querySelectorAll('.set-row[data-i]')].map(row => ({
        w: row.querySelector('[data-f="w"]') ? row.querySelector('[data-f="w"]').value : '',
        r: row.querySelector('[data-f="r"]').value,
      }));
      log.entries[exId] = { sets };
    }
  });
  const notes = app.querySelector('[data-act="notes"]');
  if (notes) log.notes = notes.value;
  return log;
}

function weekStats(k) {
  const mon = key(mondayOf(parseKey(k)));
  return summarize(mon, key(addDays(parseKey(mon), 6)));
}

function statTiles(s, prev) {
  const delta = (a, b, unit = '') => {
    if (!prev || !b) return '';
    const d = a - b;
    if (Math.abs(d) < 0.5) return '<span class="delta">same as last</span>';
    return `<span class="delta ${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}${unit}</span>`;
  };
  const bwChange = s.bw.length > 1 ? s.bw[s.bw.length - 1].bw - s.bw[0].bw : null;
  return `<div class="tiles">
    <div class="tile"><span>Workouts</span><b>${s.done}<small>/${s.planned}</small></b>${delta(s.done, prev && prev.done)}</div>
    <div class="tile k-cardio"><span>Cardio</span><b>${fmt(s.cardioMin)}<small> min</small></b>${delta(s.cardioMin, prev && prev.cardioMin, ' min')}</div>
    <div class="tile k-legs"><span>Leg volume</span><b>${fmt(s.legVolume)}<small> ${u()}</small></b>${delta(s.legVolume, prev && prev.legVolume, ' ' + u())}</div>
    ${s.classMin ? `<div class="tile k-pilates"><span>Pilates</span><b>${fmt(s.classMin)}<small> min</small></b></div>` : ''}
    <div class="tile k-arms"><span>Arm reps</span><b>${fmt(s.armReps)}</b>${delta(s.armReps, prev && prev.armReps)}</div>
    <div class="tile"><span>Sets</span><b>${fmt(s.sets)}</b>${delta(s.sets, prev && prev.sets)}</div>
    <div class="tile"><span>Avg steps</span><b>${s.avgSteps ? fmt(s.avgSteps) : '—'}</b>${s.avgSteps ? delta(s.avgSteps, prev && prev.avgSteps) : ''}</div>
    ${bwChange !== null ? `<div class="tile"><span>Body weight</span><b>${bwChange > 0 ? '+' : ''}${fmtW(bwChange)}<small> ${u()}</small></b></div>` : ''}
    <div class="tile gold"><span>New PRs</span><b>${s.prs.length}</b></div>
  </div>`;
}

function prList(s) {
  if (!s.prs.length) return '';
  return `<h3>Personal records 🥇</h3><ul class="pr-list">${s.prs.map(p => `<li><b>${esc(p.ex.name)}</b><span>${esc(p.text)}</span><small>${esc(shortDate(p.k))}</small></li>`).join('')}</ul>`;
}

function focusTips(s) {
  const tips = [];
  if (s.cardioMin < GOALS.cardioMinPerWeek) tips.push(`Cardio: ${fmt(GOALS.cardioMinPerWeek - s.cardioMin)} min short of ${GOALS.cardioMinPerWeek}. Add the 20-min finisher after every lift.`);
  else tips.push(`Cardio goal hit (${fmt(s.cardioMin)} min). Next step: raise the incline.`);
  if (s.avgSteps && s.avgSteps < GOALS.stepsPerDay) tips.push(`Steps averaged ${fmt(s.avgSteps)}. A 15-minute walk after lunch closes most of that gap.`);
  if (s.done < s.planned) tips.push(`Schedule your ${s.planned - s.done} missed session${s.planned - s.done > 1 ? 's' : ''} like appointments next week.`);
  if (s.prs.length) tips.push(`You set ${s.prs.length} PR${s.prs.length > 1 ? 's' : ''}. The suggestions already include them, so trust the numbers.`);
  return `<h3>Next week's focus</h3><ul class="tips">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

function weekHtml(monK) {
  const endK = key(addDays(parseKey(monK), 6));
  const s = summarize(monK, endK);
  const prevMon = key(addDays(parseKey(monK), -7));
  const p = summarize(prevMon, key(addDays(parseKey(prevMon), 6)));
  const c = cheer(s.planned ? s.done / s.planned : 0, s.done);
  const maxDay = Math.max(1, ...s.days.map(d => d.volume));
  return `
    <div class="celebrate">
      <div class="big-emoji">${c.emoji}</div>
      <div class="eyebrow">Week of ${esc(shortDate(monK))} – ${esc(shortDate(endK))}</div>
      <h1>${esc(c.head)}</h1>
      <p>${esc(c.sub)}</p>
    </div>
    ${statTiles(s, endK < todayKey() ? p : null)}
    <h3>Day by day</h3>
    <div class="bars">${s.days.map((d, i) => `
      <div class="bar-col" title="${esc(prettyDate(d.k))}">
        <div class="bar-stack">
          <i class="b-lift" style="height:${d.volume / maxDay * 70}%"></i>
          <i class="b-cardio" style="height:${Math.min(30, d.cardio / 60 * 30)}%"></i>
        </div>
        <span class="${d.done ? 'ok' : ''}">${DOW[i][0]}</span>
      </div>`).join('')}
    </div>
    <div class="legend small"><span><i class="sw b-lift"></i>Lifting volume</span><span><i class="sw b-cardio"></i>Cardio minutes</span></div>
    ${prList(s)}
    ${focusTips(s)}
  `;
}

function renderWeek(monK) {
  monK = key(mondayOf(parseKey(monK)));
  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/week/${key(addDays(parseKey(monK), -7))}" aria-label="Previous week">‹</a>
      <div class="center"><div class="eyebrow">Weekly summary</div></div>
      <a class="icon-btn" href="#/week/${key(addDays(parseKey(monK), 7))}" aria-label="Next week">›</a>
    </div>
    <section class="card">${weekHtml(monK)}</section>`;
}

function monthHtml(mk) {
  const [y, m] = mk.split('-').map(Number);
  const startK = key(new Date(y, m - 1, 1));
  const endK = key(new Date(y, m, 0));
  const s = summarize(startK, endK);
  const pd = new Date(y, m - 2, 1);
  const p = summarize(key(pd), key(new Date(y, m - 1, 0)));
  const c = cheer(s.planned ? s.done / s.planned : 0, s.done);

  // Best week by workouts completed
  let bestWeek = null;
  for (let d = mondayOf(parseKey(startK)); key(d) <= endK; d = addDays(d, 7)) {
    const ws = summarize(key(d), key(addDays(d, 6)));
    if (!bestWeek || ws.done > bestWeek.s.done) bestWeek = { k: key(d), s: ws };
  }

  const lifts = Object.entries(s.lifts)
    .map(([id, l]) => ({ ex: EX_BY_ID[id], ...l }))
    .filter(l => l.ex.type === 'heavy' || l.ex.type === 'arms');
  const liftRows = lifts.map(l => {
    const dw = l.last.w - l.first.w, dr = l.last.r - l.first.r;
    const gain = dw ? `${dw > 0 ? '+' : ''}${fmtW(dw)} ${u()}` : dr ? `${dr > 0 ? '+' : ''}${dr} reps` : '—';
    return `<tr><td>${esc(l.ex.name)}<span class="tag t-${l.ex.type}">${TYPE_LABEL[l.ex.type]}</span></td>
      <td>${fmtW(l.first.w)}×${l.first.r}</td><td>${fmtW(l.last.w)}×${l.last.r}</td><td class="${dw > 0 || dr > 0 ? 'pos' : ''}">${gain}</td></tr>`;
  }).join('');

  return `
    <div class="celebrate">
      <div class="big-emoji">${s.done ? '🎉' : c.emoji}</div>
      <div class="eyebrow">${MONTHS[m - 1]} ${y} wrap-up</div>
      <h1>${s.done ? `${s.done} workout${s.done > 1 ? 's' : ''} in ${MONTHS[m - 1]}` : c.head}</h1>
      <p>${s.done ? `${Math.round(s.cardioMin / 6) / 10} hours of cardio, ${fmt(s.armReps)} arm reps and ${fmt(s.legVolume)} ${u()} moved on legs.` : c.sub}</p>
    </div>
    ${statTiles(s, endK < todayKey() ? p : null)}
    ${bestWeek && bestWeek.s.done ? `<p class="callout">⭐ Best week: <b>${esc(shortDate(bestWeek.k))}</b> with ${bestWeek.s.done} workouts and ${fmt(bestWeek.s.cardioMin)} cardio minutes.</p>` : ''}
    ${liftRows ? `<h3>Strength this month</h3>
      <div class="table-wrap"><table class="lifts"><thead><tr><th>Lift</th><th>First</th><th>Last</th><th>Change</th></tr></thead><tbody>${liftRows}</tbody></table></div>` : ''}
    ${prList(s)}
  `;
}

function renderMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/month/${monthKey(new Date(y, m - 2, 1))}" aria-label="Previous month">‹</a>
      <div class="center"><div class="eyebrow">Monthly summary</div></div>
      <a class="icon-btn" href="#/month/${monthKey(new Date(y, m, 1))}" aria-label="Next month">›</a>
    </div>
    <section class="card">${monthHtml(mk)}</section>`;
}

function renderProgress() {
  const groups = { heavy: 'Legs · heavier weight', arms: 'Arms · high reps', volume: 'Accessories', bw: 'Bodyweight & core', time: 'Holds', cardio: 'Cardio', class: 'Classes' };
  const seen = new Set();
  let html = '';
  Object.entries(groups).forEach(([type, label]) => {
    const exs = Object.values(PROGRAM).flatMap(w => w.ex).filter(ex => ex.type === type && !seen.has(ex.id) && seen.add(ex.id));
    const items = exs.map(ex => {
      const h = history(ex.id);
      const prev = h[0] || null;
      const sg = suggest(ex, prev);
      const best = h.reduce((b, x) => score(ex, x.entry) > (b ? score(ex, b.entry) : 0) ? x : b, null);
      return `<details class="prog">
        <summary><b>${esc(ex.name)}</b><span class="muted">${h.length ? `${h.length} session${h.length > 1 ? 's' : ''}` : 'not logged yet'}</span></summary>
        ${h.length ? `<div class="kv"><span>Last</span><b>${esc(setsText(ex, h[0].entry))}</b></div>
          <div class="kv"><span>Best</span><b>${esc(setsText(ex, best.entry))} <small>(${esc(shortDate(best.date))})</small></b></div>` : ''}
        <div class="coach ${sg.first ? 'first' : ''}"><span class="coach-ico">🎯</span><div>${esc(sg.msg)}${sg.goal ? `<div class="goal">8-week goal: <b>${esc(sg.goal)}</b></div>` : ''}</div></div>
        ${h.length > 1 ? `<ol class="hist">${h.slice(0, 10).map(x => `<li><span>${esc(shortDate(x.date))}</span>${esc(setsText(ex, x.entry))}</li>`).join('')}</ol>` : ''}
      </details>`;
    }).join('');
    if (items) html += `<section class="card"><h2>${esc(label)}</h2>${items}</section>`;
  });
  app.innerHTML = `<h1 class="page-title">Progress</h1>${html}`;
}

function renderProgram() {
  app.innerHTML = `
    <h1 class="page-title">Your program</h1>
    <section class="card goals">
      <h2>Goals</h2>
      <ul class="goal-list">
        <li class="k-legs"><b>Legs: heavier.</b> 5–8 reps. Once every set hits the top of the range, the app adds weight.</li>
        <li class="k-arms"><b>Arms: high reps.</b> 15–20 reps. Add a rep each session; weight only goes up after 20s on every set.</li>
        <li class="k-cardio"><b>More cardio.</b> 20-min incline walk after every lift, plus a long cardio day. ${GOALS.cardioMinPerWeek}+ min and ${fmt(GOALS.stepsPerDay)} steps a day.</li>
        <li><b>Cut.</b> About ${fmt(GOALS.calories)} cal and ${GOALS.protein} g protein. Aim to lose 0.5–1 lb a week while keeping strength.</li>
      </ul>
    </section>
    <section class="card">
      <h2>Weekly schedule</h2>
      <div class="sched">
        ${DOW.map((d, i) => `<label class="sched-row"><span>${d}</span>
          <select data-act="schedule" data-i="${i}">${Object.values(PROGRAM).map(p => `<option value="${p.id}" ${state.schedule[i] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}
      </div>
    </section>
    ${Object.values(PROGRAM).filter(w => w.ex.length).map(w => `
      <section class="card k-${w.kind} accent">
        <h2>${esc(w.name)}</h2>
        <p class="muted">${esc(w.blurb)}</p>
        <ul class="ex-list">${w.ex.map(ex => `<li><div><b>${esc(ex.name)}</b><span class="tag t-${ex.type}">${TYPE_LABEL[ex.type]}</span></div>
          <div class="muted">${timed(ex) ? `${ex.goalMin} min` : `${ex.sets} × ${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')}${ex.type === 'time' ? ' sec' : ''}${ex.each ? ' each side' : ''}`}</div></li>`).join('')}</ul>
      </section>`).join('')}
    <section class="card">
      <h2>Data</h2>
      <p class="muted">Your logs are saved in this browser on this device only. Export a backup now and then, and import it to move to a new phone.</p>
      <div class="row-btns left">
        <button class="btn ghost sm" data-act="export">Export backup</button>
        <label class="btn ghost sm file-btn">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <button class="btn danger sm" data-act="reset">Erase all data</button>
      </div>
    </section>`;
}

/* ---------- celebrations ---------- */

function modal(html, onClose) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${html}<button class="btn primary block" data-close>Nice!</button></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) close(); });
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const W = c.width = innerWidth, H = c.height = innerHeight;
  const colors = ['#d0457a', '#2a9d8f', '#f4a261', '#7b5cd6', '#e9c46a'];
  const ps = Array.from({ length: 140 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * 0.5, r: 4 + Math.random() * 5,
    vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: -0.2 + Math.random() * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
    });
    if (t - t0 < 3000) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function finishWorkout(k) {
  const log = readLogFromDom(k);
  const wasDone = log.done;
  log.done = true;
  log.finishedAt = new Date().toISOString();
  save();

  const w = PROGRAM[log.w];
  const prs = [];
  const bumps = [];
  w.ex.forEach(ex => {
    const entry = log.entries[ex.id];
    if (!entryHasData(entry)) return;
    const prevBest = Math.max(0, ...history(ex.id, k).map(h => score(ex, h.entry)));
    if (prevBest > 0 && score(ex, entry) > prevBest) prs.push(`${ex.name}: ${setsText(ex, entry)}`);
    const next = suggest(ex, { date: k, entry });
    if (next.bumped) bumps.push(`${ex.name} → ${fmtW(next.w)} ${u()}`);
  });

  const ws = weekStats(k);
  const weekComplete = ws.planned && ws.done >= ws.planned;

  if (wasDone && !prs.length) { toast('Saved'); location.hash = `#/day/${k}`; return; }

  confetti();
  modal(`
    <div class="celebrate">
      <div class="big-emoji">${weekComplete ? '🏆' : prs.length ? '🥇' : '🎉'}</div>
      <h1>${weekComplete ? 'Week complete!' : 'Workout done!'}</h1>
      <p>${weekComplete ? `All ${ws.planned} sessions this week. Go see your summary.` : `${ws.done} of ${ws.planned} sessions done this week.`}</p>
    </div>
    ${prs.length ? `<h3>New PRs</h3><ul class="pr-list">${prs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${bumps.length ? `<h3>Weight goes up next time ⬆️</h3><ul class="pr-list">${bumps.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
  `, () => { location.hash = weekComplete ? `#/week/${key(mondayOf(parseKey(k)))}` : `#/day/${k}`; });
}

// On open: celebrate any finished week or month you haven't seen yet.
function checkPendingSummaries() {
  const now = new Date();
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMon = key(addDays(mondayOf(now), -7));
  const queue = [];

  const [ly, lm] = lastMonth.split('-').map(Number);
  if (!state.seen.months.includes(lastMonth) &&
      summarize(key(new Date(ly, lm - 1, 1)), key(new Date(ly, lm, 0))).done > 0) {
    queue.push(() => { state.seen.months.push(lastMonth); save(); confetti(); modal(monthHtml(lastMonth), next); });
  }
  if (!state.seen.weeks.includes(lastMon) && summarize(lastMon, key(addDays(parseKey(lastMon), 6))).done > 0) {
    queue.push(() => { state.seen.weeks.push(lastMon); save(); confetti(); modal(weekHtml(lastMon), next); });
  }
  function next() { const f = queue.shift(); if (f) f(); }
  next();
}

/* ---------- events ---------- */

app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const k = app.dataset.k;

  if (act === 'prev-month') { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); }
  if (act === 'next-month') { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); }
  if (act === 'today-month') { viewMonth = new Date(); renderCalendar(); }

  if (act === 'hit') {
    const inp = t.parentElement.querySelector('[data-f="r"]');
    const target = inp.placeholder.split('–')[0];
    inp.value = target;
    readLogFromDom(k); save();
  }
  if (act === 'fill-cardio') {
    t.closest('.card').querySelectorAll('[data-c]').forEach(inp => { if (!inp.value) inp.value = inp.placeholder; });
    readLogFromDom(k); save();
  }
  if (act === 'add-set' || act === 'del-set') {
    const log = readLogFromDom(k);
    const exId = t.closest('.card').dataset.ex;
    const sets = log.entries[exId].sets;
    if (act === 'add-set') sets.push({ w: sets.length ? sets[sets.length - 1].w : '', r: '' });
    else if (sets.length > 1) sets.pop();
    save();
    const y = window.scrollY;
    renderLog(k);
    window.scrollTo(0, y);
  }
  if (act === 'finish') finishWorkout(t.dataset.k);

  if (act === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `glute-cut-tracker-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (act === 'reset' && confirm('Erase every workout you have logged on this device? Export a backup first if you might want it.')) {
    state = blankState(); save(); toast('All data erased'); render();
  }
});

app.addEventListener('input', e => {
  const t = e.target;
  if (t.closest('.card.ex') || t.dataset.act === 'notes') { readLogFromDom(app.dataset.k); save(); }
});

app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.daily) {
    const d = state.daily[t.dataset.k] || (state.daily[t.dataset.k] = {});
    d[t.dataset.daily] = t.value;
    save(); toast('Saved');
  }
  if (t.dataset.act === 'override') {
    const k = t.dataset.k;
    const def = state.schedule[weekdayIdx(parseKey(k))];
    if (t.value === def) delete state.overrides[k]; else state.overrides[k] = t.value;
    save(); renderDay(k);
  }
  if (t.dataset.act === 'schedule') {
    state.schedule[Number(t.dataset.i)] = t.value;
    save(); toast('Schedule updated');
  }
  if (t.dataset.act === 'import' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || typeof data.logs !== 'object') throw new Error('bad file');
        state = Object.assign(blankState(), data);
        save(); toast('Backup imported'); render();
      } catch (err) { toast('That file is not a tracker backup'); }
    };
    r.readAsText(t.files[0]);
  }
});

window.addEventListener('hashchange', render);
render();
checkPendingSummaries();

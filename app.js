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
    food: {},      // 'YYYY-MM-DD' -> [{ id, name, e, cal, p, f, qty, meal }]
    myFoods: [],
    store: [],     // [{ id, name, cat, done }]
    trips: [],     // finished shopping trips: [{ id, date, at, items: [{ name, cat }] }]
    wish: [],      // [{ id, name, price, url, e, goal, added, bought }]
    events: [],    // Amy & Cory calendar: [{ id, date, time, title, who, note }]
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
EXTRA_GROUPS.forEach(g => g.ex.forEach(ex => { if (!EX_BY_ID[ex.id]) EX_BY_ID[ex.id] = ex; }));

// Any exercise by id, including ones you created yourself.
const exDef = id => EX_BY_ID[id] || (state.customEx && state.customEx[id]) || null;

// The workouts you picked for a day. Nothing is planned ahead: a day is empty until you choose one.
function dayWorkouts(k) {
  const log = state.logs[k];
  if (!log || !log.w) return [];
  return [log.w, ...(log.also || [])].filter((id, i, a) => PROGRAM[id] && id !== 'REST' && a.indexOf(id) === i);
}

const workoutLogged = (k, id) => {
  const log = state.logs[k];
  return !!log && logExerciseGroups(k).some(g => g.id === id && g.exs.some(ex => entryHasData(log.entries[ex.id])));
};

// Every exercise for the day, tagged with the workout it belongs to. Added workouts skip their incline-walk
// finisher when the day already has one.
function logExerciseGroups(k) {
  const log = state.logs[k];
  const seen = new Set();
  const groups = dayWorkouts(k).map((id, gi) => {
    const exs = PROGRAM[id].ex.filter(ex => !seen.has(ex.id) && !(gi > 0 && ex.id.startsWith('walk-') && [...seen].some(x => x.startsWith('walk-'))));
    exs.forEach(ex => seen.add(ex.id));
    return { id, title: PROGRAM[id].name, exs };
  });
  const loggedIds = Object.keys((log && log.entries) || {}).filter(id => entryHasData(log.entries[id]));
  const extra = [...new Set([...((log && log.extra) || []), ...loggedIds])].map(exDef).filter(x => x && !seen.has(x.id) && (seen.add(x.id) || true));
  if (extra.length) {
    // Cardio goes with the Cardio Day if there is one; other added exercises go with the latest workout of the day.
    const cardioGroup = groups.find(g => g.id === 'CARDIO');
    extra.forEach(x => {
      const target = cardioGroup && x.type === 'cardio' ? cardioGroup : groups[groups.length - 1];
      if (target) target.exs.push(x);
      else groups.push({ id: 'extra', title: 'Added exercises', exs: [x] });
    });
  }
  return groups.filter(g => g.exs.length);
}

function logExercises(k) {
  return logExerciseGroups(k).flatMap(g => g.exs);
}

// How many workouts a logged day counts for: the main one plus each added workout you actually logged.
function sessionsOn(log) {
  return 1 + ((log && log.also) || []).filter(id => PROGRAM[id] && PROGRAM[id].ex.some(ex => entryHasData(log.entries[ex.id]))).length;
}

// A small flower, used instead of sparkles on the workout pages.
const FLOWER = '<svg class="flower" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="6.2" r="4"/><circle cx="17.5" cy="10.2" r="4"/><circle cx="15.4" cy="16.7" r="4"/><circle cx="8.6" cy="16.7" r="4"/><circle cx="6.5" cy="10.2" r="4"/></g><circle cx="12" cy="12" r="3.2" fill="#ffd166"/></svg>';

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

// Each set can be bodyweight on its own ("bw"); older logs marked the whole exercise instead.
function filledSets(entry) {
  return ((entry && entry.sets) || []).filter(s => num(s.r) > 0).map(s => ({ w: num(s.w), r: num(s.r), bw: !!(s.bw || entry.bw) }));
}

function setsText(ex, entry) {
  if (timed(ex)) {
    const c = entry.cardio;
    const bits = [`${fmtW(num(c.min))} min`];
    if (num(c.incline)) bits.push(`${fmtW(num(c.incline))}% incline`);
    if (num(c.speed)) bits.push(`${fmtW(num(c.speed))} mph`);
    if (num(c.miles)) bits.push(`${fmtW(num(c.miles))} mi`);
    return bits.join(' · ');
  }
  const unit = ex.type === 'time' ? 's' : '';
  return filledSets(entry).map(s => s.bw ? (s.w ? `BW+${fmtW(s.w)}×${s.r}` : `BW×${s.r}`) : s.w ? `${fmtW(s.w)}×${s.r}` : `${s.r}${unit}`).join(', ');
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

  const allSets = filledSets(prev.entry);
  const lastPattern = (prev.entry.sets || []).map(x => !!(x.bw || prev.entry.bw));
  const setBw = Array.from({ length: ex.sets }, (_, i) => !!lastPattern[Math.min(i, lastPattern.length - 1)]);
  const bwSets = allSets.filter(x => x.bw);
  const sets = ex.type === 'bw' || ex.type === 'time' || !bwSets.length || bwSets.length === allSets.length ? allSets : allSets.filter(x => !x.bw);

  // Bodyweight on a lift that normally takes weight (like a Bulgarian split squat with no dumbbells).
  if (ex.type !== 'bw' && ex.type !== 'time' && bwSets.length === allSets.length && allSets.every(x => !x.w)) {
    const allTop = sets.length >= ex.sets && sets.every(s => s.r >= hi);
    const best = Math.max(...sets.map(s => s.r));
    if (allTop) {
      const start = ex.inc >= 10 ? ex.inc * 2 : ex.inc * 2;
      return {
        w: start, bumped: true, setBw: Array(ex.sets).fill(false),
        targets: Array(ex.sets).fill(String(lo)),
        msg: `You hit ${hi} on every bodyweight set. Time to add weight: try ${fmtW(start)} ${u()} for ${lo}+ reps.`,
        goal: `${fmtW(start + ex.inc * 3)} ${u()} × ${lo}${each}`,
      };
    }
    const targets = [];
    for (let i = 0; i < ex.sets; i++) {
      const last = sets[Math.min(i, sets.length - 1)];
      targets.push(String(Math.min(hi, (last ? last.r : lo) + 1)));
    }
    return {
      w: '', setBw: Array(ex.sets).fill(true), targets,
      msg: `Bodyweight again: add a rep per set. Once every set hits ${hi}, you'll add weight.`,
      goal: `${fmtW(ex.inc * 2)} ${u()} × ${hi}${each}`,
    };
  }

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
  const mixed = sets.length < allSets.length;
  const weightedSlots = mixed ? Math.max(1, ex.sets - setBw.filter(Boolean).length) : ex.sets;
  const work = sets.filter(s => s.w === W);
  const allTop = work.length >= weightedSlots && work.every(s => s.r >= hi);
  const goalBumps = ex.type === 'heavy' ? 4 : 2;

  if (allTop) {
    const nw = W + ex.inc;
    return {
      w: nw,
      setBw,
      bumped: true,
      targets: Array(ex.sets).fill(String(lo)),
      msg: ex.type === 'arms'
        ? `All sets hit ${hi}! Move up to ${fmtW(nw)} ${u()} and build the reps back up from ${lo}.`
        : `You hit ${hi} on every set. Go up to ${fmtW(nw)} ${u()} and aim for ${lo}+ reps.`,
      goal: `${fmtW(W + ex.inc * (goalBumps + 1))} ${u()} × ${ex.type === 'arms' ? hi : lo}${each}`,
    };
  }

  // One target per set, in order: bodyweight slots follow last time's bodyweight sets, the rest follow the weighted ones.
  const targets = [];
  let wi = 0, bi = 0;
  for (let i = 0; i < ex.sets; i++) {
    const s = mixed && setBw[i] ? bwSets[bi++] : work[wi++];
    targets.push(String(s ? Math.min(hi, s.r + 1) : lo));
  }
  const struggled = ex.type === 'heavy' && work.length && work.every(s => s.r < lo);
  let msg;
  if (struggled) msg = `${fmtW(W)} ${u()} was a fight. Stay here and own ${lo} reps before adding weight.`;
  else if (ex.type === 'arms') msg = `Stay at ${fmtW(W)} ${u()}. Reps are the goal: beat last time by 1 rep per set, up to ${hi}.`;
  else if (ex.type === 'heavy') msg = `Stay at ${fmtW(W)} ${u()} and add a rep per set. Once every set hits ${hi}, add ${fmtW(ex.inc)} ${u()}.`;
  else msg = `Stay at ${fmtW(W)} ${u()} and add a rep per set, up to ${hi}.`;
  if (mixed) msg += ` (Last time ${bwSets.length} set${bwSets.length > 1 ? 's were' : ' was'} bodyweight.)`;

  return {
    w: W || '',
    setBw,
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
    reps: 0, prs: [], nutDays: 0, pHit: 0, fHit: 0, pSum: 0, fSum: 0, stepsDays: 0, stepsTotal: 0, bw: [], lifts: {}, days: [],
  };
  for (let d = parseKey(startK); key(d) <= endK; d = addDays(d, 1)) {
    const k = key(d);
    const wid = dayWorkouts(k)[0] || null;
    const daily = state.daily[k];
    if (daily && num(daily.steps)) { s.stepsDays++; s.stepsTotal += num(daily.steps); }
    if (daily && num(daily.bw)) s.bw.push({ date: k, bw: num(daily.bw) });
    if (dayFood(k).length) {
      const ft = foodTotals(k);
      s.nutDays++; s.pSum += ft.p; s.fSum += ft.f;
      if (ft.p >= GOALS.protein) s.pHit++;
      if (ft.f >= GOALS.fiber) s.fHit++;
    }
    const log = state.logs[k];
    const dayInfo = { k, wid, done: logHasData(log), cardio: 0, volume: 0 };
    s.days.push(dayInfo);
    if (!logHasData(log)) continue;
    s.done += sessionsOn(log);
    Object.entries(log.entries).forEach(([exId, entry]) => {
      const ex = exDef(exId);
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
          s.reps += x.r;
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
  s.planned = Math.max(1, Math.round(s.days.length / 7 * GOALS.workoutsPerWeek));
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

const KIND_EMOJI = { legs: '🍑', arms: '💪', pump: '🌸', cardio: '🏃‍♀️', pilates: '🧘‍♀️', rest: '😴' };

function chip(wid, extra = '') {
  const w = PROGRAM[wid];
  return `<span class="chip k-${w.kind} ${extra}"><i class="ce" aria-hidden="true">${KIND_EMOJI[w.kind]}</i><span class="ct">${esc(w.short)}</span></span>`;
}

function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  const section = ['store', 'food', 'wish', 'money', 'us'].includes(route) ? route : 'workouts';
  document.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === section));
  document.body.dataset.section = section;
  document.querySelectorAll('[data-sub]').forEach(a => a.classList.toggle('on', a.dataset.sub === (route || 'cal')));
  switch (route) {
    case 'store': return renderStore(arg);
    case 'food': return renderFood(arg || todayKey());
    case 'wish': return renderWish();
    case 'money': return renderMoney();
    case 'us': return renderUs(arg);
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

// A new affirmation each day, the same one all day.
const AFFIRMATIONS = [
  'I can and I will.',
  'My body responds to consistency.',
  'Strong looks good on me.',
  'I show up for myself.',
  'Every rep is a promise kept.',
  'Progress, not perfection.',
  'I am building the body I want.',
  'Discipline is self-love.',
  'I trust the process.',
  'My strength grows every day.',
  'I am worth the effort.',
  'Small steps, big results.',
  'I choose me today.',
  'I am stronger than my excuses.',
  'Consistency is my superpower.',
  'I fuel my body with love.',
  'I keep promises to myself.',
  'My only competition is yesterday\'s me.',
  'I am proud of how far I\'ve come.',
  'Rest is part of the work.',
  'I am becoming her.',
  'Hard things are worth doing.',
  'I move because I love my body.',
  'Today I get one step closer.',
  'I am patient with my progress.',
  'Confidence is built one workout at a time.',
  'I deserve to feel this good.',
  'Strong mind, strong body.',
  'I finish what I start.',
  'Glow up in progress.',
];

function affirmationFor(k) {
  const d = parseKey(k);
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return AFFIRMATIONS[(day + d.getFullYear()) % AFFIRMATIONS.length];
}

function workoutTabs(active) {
  const tabs = [['cal', '#/', 'Calendar'], ['week', '#/week', 'Week'], ['progress', '#/progress', 'Progress'], ['program', '#/program', 'Program']];
  return `<nav class="subtabs" aria-label="Workouts">${tabs.map(([id, href, label]) => `<a href="${href}" class="${id === active ? 'on' : ''}">${label}</a>`).join('')}</nav>`;
}

function renderCalendar() {
  const tk = todayKey();
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = mondayOf(first);
  const todayLog = state.logs[tk];

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i === 35 && d.getMonth() !== viewMonth.getMonth()) break;
    const k = key(d);
    const ids = dayWorkouts(k);
    const log = state.logs[k];
    const done = logHasData(log) && log.done;
    const started = logHasData(log) && !log.done;
    const cls = ['cell', d.getMonth() !== viewMonth.getMonth() ? 'out' : '', k === tk ? 'today' : '', k < tk ? 'past' : ''].join(' ');
    cells += `<a class="${cls}" href="#/day/${k}" aria-label="${esc(prettyDate(k))}${ids.length ? `, ${esc(ids.map(id => PROGRAM[id].name).join(' and '))}` : ''}${done ? ', done' : ''}">
      <span class="dnum">${d.getDate()}</span>
      ${ids.slice(0, 1).map(id => chip(id, workoutLogged(k, id) ? 'done' : '')).join('')}${ids.length > 1 ? `<span class="plus-n">+${ids.length - 1}</span>` : ''}
      ${done ? '<span class="tick">✓</span>' : started ? '<span class="dot"></span>' : ''}
      ${foodGoalsHit(k) ? '<span class="heart" title="Protein + fiber goals hit">💗</span>' : ''}
    </a>`;
  }

  const wk = key(mondayOf(new Date()));
  const ws = summarize(wk, key(addDays(parseKey(wk), 6)));
  const cardioPct = Math.min(1, ws.cardioMin / GOALS.cardioMinPerWeek);

  app.innerHTML = `${workoutTabs('cal')}
    <section class="hero-today k-legs">
      <div>
        <div class="eyebrow">${esc(prettyDate(tk))}${state.daily[tk] && state.daily[tk].time ? ` · ${esc(timeLabel(state.daily[tk].time))}` : ''}</div>
        <h1 class="affirmation">${esc(affirmationFor(tk))}</h1>
      </div>
      <a class="btn primary bloom" href="#/day/${tk}">${FLOWER}${logHasData(todayLog) ? 'Today\'s workout' : 'Log a workout'}</a>
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
        <span>${chip('A')} Heavy legs</span><span>${chip('B')} High-rep arms</span><span>${chip('E')} Glute pump</span><span>${chip('CARDIO')} Cardio, HIIT & spin</span><span>${chip('PILATES')} Pilates & yoga</span>
      </div>
      <div class="row-btns">
        <button class="btn ghost sm" data-act="today-month">Today</button>
        <a class="btn ghost sm" href="#/month/${monthKey(viewMonth)}">${MONTHS[viewMonth.getMonth()]} summary</a>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>This week</h2><a href="#/week/${wk}" class="link">Summary ${FLOWER}</a></div>
      <div class="meter-row">
        <div class="meter-label"><span>Workouts</span><b>${ws.done} / ${ws.planned}</b></div>
        <div class="meter"><i style="width:${ws.planned ? Math.min(100, ws.done / ws.planned * 100) : 0}%"></i></div>
      </div>
      <div class="meter-row">
        <div class="meter-label"><span>Cardio</span><b>${fmt(ws.cardioMin)} / ${GOALS.cardioMinPerWeek} min</b></div>
        <div class="meter cardio"><i style="width:${cardioPct * 100}%"></i></div>
      </div>
      <div class="week-strip">
        ${ws.days.map((d, i) => `<a href="#/day/${d.k}" class="ws ${d.done ? 'done' : ''} ${d.k === tk ? 'today' : ''}"><span>${DOW[i][0]}</span>${d.done ? '✓' : '·'}</a>`).join('')}
      </div>
    </section>

    <p class="fineprint">Cut day: about ${fmt(GOALS.calories)} cal and ${GOALS.protein} g protein.</p>
  `;
}

let dayChoosing = false;
let cardioPick = null;     // activity chosen in the Cardio Day logger

// Cardio Day: pick what you did (walk with Huey, jog, StairMaster…), minutes and optional miles. Log as many as you like.
function cardioCard(k, g) {
  const log = state.logs[k];
  const done = g.exs.filter(ex => ex.type === 'cardio' && entryHasData(log && log.entries[ex.id]));
  if (!cardioPick) cardioPick = CARDIO_CHOICES[0];
  return `<section class="card k-cardio accent day-workout cardio-day">
    <div class="dw-head">
      <h2>Cardio Day</h2>
      <span class="${done.length ? 'logged-tag' : 'pending-tag'}">${done.length ? '✓ Logged' : 'Not logged yet'}</span>
    </div>
    ${done.length ? `<ul class="cardio-done">${done.map(ex => `
      <li><b>${esc(ex.name)}</b><span class="muted">${esc(setsText(ex, log.entries[ex.id]))}</span>
        <button class="x" data-act="cardio-del" data-id="${ex.id}" data-k="${k}" aria-label="Remove ${esc(ex.name)}">✕</button></li>`).join('')}</ul>` : ''}
    <div class="cardio-logger">
      <div class="activity-chips" role="radiogroup" aria-label="What did you do?">
        ${CARDIO_CHOICES.map(id => exDef(id)).filter(Boolean).map(ex => `<button type="button" class="mchip ${ex.id === cardioPick ? 'on' : ''}" data-act="cardio-pick" data-id="${ex.id}" role="radio" aria-checked="${ex.id === cardioPick}">${ex.id === 'huey-walk' ? '🐾 ' : ''}${esc(ex.name)}</button>`).join('')}
      </div>
      <div class="cardio-inputs">
        <label class="field"><span>Minutes</span><input type="number" inputmode="decimal" min="1" step="1" data-cardio="min" placeholder="${exDef(cardioPick).goalMin || 30}"></label>
        <label class="field"><span>Miles (optional)</span><input type="number" inputmode="decimal" min="0" step="0.1" data-cardio="miles" placeholder="—"></label>
        <button class="btn primary" data-act="cardio-add" data-k="${k}">${done.length ? 'Add' : 'Log it'}</button>
      </div>
    </div>
    <div class="row-btns left"><button class="btn link-danger" data-act="day-remove" data-w="CARDIO" data-k="${k}">Remove</button></div>
  </section>`;
}   // showing the workout picker on a day that already has a workout

function renderDay(k) {
  const log = state.logs[k];
  const daily = state.daily[k] || {};
  const prevK = key(addDays(parseKey(k), -1));
  const nextK = key(addDays(parseKey(k), 1));
  const past = k < todayKey();
  const groups = logExerciseGroups(k);
  const chosen = dayWorkouts(k);

  const exItem = ex => {
    const entry = log && log.entries && log.entries[ex.id];
    return `<li>
      <div><b>${esc(ex.name)}</b><span class="tag t-${ex.type}">${TYPE_LABEL[ex.type]}</span></div>
      <div class="muted">${entryHasData(entry) ? esc(setsText(ex, entry)) : 'Not logged'}</div>
    </li>`;
  };

  const cards = groups.filter(g => PROGRAM[g.id]).map(g => {
    const p = PROGRAM[g.id];
    if (g.id === 'CARDIO') return cardioCard(k, g);
    const logged = workoutLogged(k, g.id);
    const loggedExs = g.exs.filter(ex => entryHasData(log && log.entries[ex.id]));
    return `<section class="card k-${p.kind} accent day-workout">
      <div class="dw-head">
        <h2>${esc(p.name)}</h2>
        <span class="${logged ? 'logged-tag' : 'pending-tag'}">${logged ? '✓ Logged' : 'Not logged yet'}</span>
      </div>
      ${logged ? `<details class="dw-summary"><summary>Summary</summary><ul class="ex-list">${loggedExs.map(exItem).join('')}</ul></details>` : ''}
      <div class="row-btns left">
        <a class="btn ${logged ? 'ghost' : 'primary'} sm" href="#/log/${k}">${logged ? 'Edit' : past ? 'Log it' : 'Start'}</a>
        <button class="btn link-danger" data-act="day-remove" data-w="${g.id}" data-k="${k}">Remove</button>
      </div>
    </section>`;
  }).join('');

  const choices = Object.values(PROGRAM).filter(p => p.id !== 'REST' && !chosen.includes(p.id));
  const picker = `<section class="card pick-card">
    <div class="card-head"><h2>${chosen.length ? 'Add workout' : past ? 'What did you do?' : 'What are you doing today?'}</h2>
      ${chosen.length ? '<button class="btn ghost sm" data-act="day-cancel">Cancel</button>' : ''}</div>
    <div class="pick-grid">
      ${choices.map(p => `<button class="pick k-${p.kind}" data-act="pick-workout" data-w="${p.id}" data-k="${k}">
        <b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></button>`).join('')}
    </div>
  </section>`;

  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/day/${prevK}" aria-label="Previous day">‹</a>
      <div class="center"><div class="eyebrow">${k === todayKey() ? 'Today' : past ? 'Past day' : 'Coming up'}</div><h1 class="h-sm">${esc(prettyDate(k))}</h1></div>
      <a class="icon-btn" href="#/day/${nextK}" aria-label="Next day">›</a>
    </div>

    ${cards}
    ${!chosen.length || dayChoosing ? picker : `<button class="btn ghost block add-workout-btn" data-act="day-add">+ Add workout</button>`}

    <section class="card">
      <h2>Daily check-in</h2>
      <div class="grid2 checkin">
        <label class="field"><span>Steps</span><input type="number" inputmode="numeric" min="0" data-daily="steps" data-k="${k}" value="${esc(daily.steps || '')}" placeholder="${GOALS.stepsPerDay}"></label>
        <label class="field"><span>Body weight (${u()})</span><input type="number" inputmode="decimal" min="0" step="0.1" data-daily="bw" data-k="${k}" value="${esc(daily.bw || '')}" placeholder="optional"></label>
      </div>
    </section>

    <div class="row-btns">
      <a class="btn ghost sm" href="#/food/${k}">🥗 Log food</a>
      <a class="btn ghost sm" href="#/week/${key(mondayOf(parseKey(k)))}">Week summary</a>
      <a class="btn ghost sm" href="#/">Calendar</a>
    </div>
  `;
  app.dataset.k = k;
}

function ensureLog(k, wid) {
  if (!state.logs[k]) state.logs[k] = { w: wid || null, entries: {}, notes: '', done: false };
  else if (!state.logs[k].w && wid) state.logs[k].w = wid;
  return state.logs[k];
}

function renderLog(k) {
  const wid = dayWorkouts(k)[0];
  if (!wid) { location.hash = `#/day/${k}`; return; }
  const w = PROGRAM[wid];
  const log = state.logs[k];
  const exs = logExercises(k);
  if (!exs.length && wid === 'REST') { location.hash = `#/day/${k}`; return; }
  const added = new Set((log && log.extra) || []);

  const groups = logExerciseGroups(k);
  const groupStart = {};
  if (groups.length > 1) groups.forEach(g => { if (g.exs[0]) groupStart[g.exs[0].id] = g.title; });

  const cards = exs.map(ex => {
    const heading = groupStart[ex.id] ? `<h2 class="log-group">${esc(groupStart[ex.id])}</h2>` : '';
    return heading + exCard(ex);
  }).join('');

  function exCard(ex) {
    const prev = lastSession(ex.id, k);
    const sg = suggest(ex, prev);
    const entry = log && log.entries[ex.id];
    if (entry && entry.done) {
      return `<section class="card ex collapsed" data-ex="${ex.id}">
        <div class="ex-done-row">
          <span class="done-check" aria-hidden="true">✓</span>
          <div class="ex-done-text"><b>${esc(ex.name)}</b><small class="muted">${entryHasData(entry) ? esc(setsText(ex, entry)) : 'Skipped'}</small></div>
          <button class="btn ghost sm" data-act="ex-edit">Edit</button>
        </div>
      </section>`;
    }
    const head = `
      <div class="ex-head">
        <h3>${esc(ex.name)}${added.has(ex.id) ? ' <span class="added-tag">Added</span>' : ''}</h3>
        <div class="ex-tools">
          <span class="tag t-${ex.type}">${TYPE_LABEL[ex.type]}</span>
          ${added.has(ex.id) ? `<button class="x" data-act="remove-ex" data-id="${ex.id}" aria-label="Remove ${esc(ex.name)}">✕</button>` : ''}
        </div>
      </div>
      <div class="muted">${timed(ex) ? `Goal ${ex.goalMin} min` : `${ex.sets} sets × ${ex.reps[0] === ex.reps[1] ? ex.reps[0] : ex.reps.join('–')}${ex.type === 'time' ? ' sec' : ''}${ex.each ? ' each side' : ''}`}
        ${prev ? ` · <span class="last">Last (${esc(shortDate(prev.date))}): ${esc(setsText(ex, prev.entry))}</span>` : ''}</div>
      <div class="coach ${sg.bumped ? 'up' : ''} ${sg.first ? 'first' : ''}">
        <span class="coach-ico">${FLOWER}</span>
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
        <div class="ex-foot">
          <div class="row-btns left"><button class="btn ghost sm" data-act="fill-cardio">Use target</button><button class="btn ghost sm" data-act="ex-skip">Skip</button></div>
          <button class="btn primary sm done-ex" data-act="ex-done">Done</button>
        </div>
      </section>`;
    }

    const isW = ex.type !== 'time';
    const canBw = ['heavy', 'volume', 'arms'].includes(ex.type);
    const sets = (entry && entry.sets && entry.sets.length) ? entry.sets.map(x => ({ ...x, bw: !!(x.bw || entry.bw) }))
      : Array.from({ length: ex.sets }, (_, i) => {
        const bw = canBw && !!(sg.setBw && sg.setBw[i]);
        return { w: bw || sg.w === '' ? '' : sg.w, r: '', bw };
      });
    const rows = sets.map((s, i) => {
      const bw = canBw && s.bw;
      return `
      <div class="set-row ${bw ? 'is-bw' : ''}" data-i="${i}" data-bw="${bw ? 1 : 0}">
        <span class="set-n">${i + 1}</span>
        ${isW ? `<div class="wcell">
          <input type="number" inputmode="decimal" min="0" step="0.5" data-f="w" value="${bw ? '' : esc(s.w)}" placeholder="${ex.type === 'bw' || bw ? 'BW' : u()}" ${bw ? 'disabled' : ''} aria-label="Set ${i + 1} weight">
          ${canBw ? `<button class="bw-chip ${bw ? 'on' : ''}" data-act="set-bw" aria-pressed="${bw}" aria-label="Set ${i + 1} bodyweight">BW</button>` : ''}
        </div>` : '<span></span>'}
        <input type="number" inputmode="numeric" min="0" data-f="r" value="${esc(s.r)}" placeholder="${esc(sg.targets[i] || sg.targets[sg.targets.length - 1])}" aria-label="Set ${i + 1} ${ex.type === 'time' ? 'seconds' : 'reps'}">
        <button class="hit" data-act="hit" aria-label="Fill target">✓</button>
      </div>`;
    }).join('');

    return `<section class="card ex" data-ex="${ex.id}">${head}
      <div class="set-row set-labels"><span>Set</span><span>${isW ? u() : ''}</span><span>${ex.type === 'time' ? 'Sec' : 'Reps'}</span><span></span></div>
      ${rows}
      <div class="ex-foot">
        <div class="row-btns left">
          <button class="btn ghost sm" data-act="add-set">+ Set</button>
          ${sets.length > 1 ? '<button class="btn ghost sm" data-act="del-set">− Set</button>' : ''}
          <button class="btn ghost sm" data-act="ex-skip">Skip</button>
        </div>
        <button class="btn primary sm done-ex" data-act="ex-done">Done</button>
      </div>
    </section>`;
  }

  app.innerHTML = `
    <div class="nav-row">
      <a class="icon-btn" href="#/day/${k}" aria-label="Back">‹</a>
      <div class="center"><div class="eyebrow">${esc(shortDate(k))}</div><h1 class="h-sm">${esc(dayWorkouts(k).map(id => PROGRAM[id].name).join(' + '))}</h1></div>
      <span class="icon-btn ghosted"></span>
    </div>
    ${exs.every(timed) ? '' : `<p class="hint">Weights are pre-filled from your last session. Grey numbers are today's rep targets: tap ✓ if you hit it, or type what you did. Did a set with no weight? Tap <b>BW</b> on that set.</p>`}
    ${cards}
    <section class="card add-ex">
      <h3>Add an exercise</h3>
      <p class="muted">Machine taken, or doing something extra? Add it here and it's tracked like the rest.</p>
      <div class="add-ex-row">
        <select data-act="pick-ex" aria-label="Exercise">
          <option value="">Choose an exercise…</option>
          ${EXTRA_GROUPS.map(g => `<optgroup label="${esc(g.label)}">${g.ex.filter(x => !exs.some(e => e.id === x.id)).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}
          <optgroup label="From your program">${Object.values(PROGRAM).flatMap(p => p.ex).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i && !exs.some(e => e.id === x.id) && !x.id.startsWith('walk-')).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>
          ${Object.keys(state.customEx || {}).length ? `<optgroup label="Your exercises">${Object.values(state.customEx).filter(x => !exs.some(e => e.id === x.id)).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>` : ''}
          <option value="custom">Something else…</option>
        </select>
        <button class="btn primary sm" data-act="add-ex">Add</button>
      </div>
      <div class="custom-ex" hidden>
        <label class="field"><span>Exercise name</span><input type="text" data-f="cx-name" maxlength="50" placeholder="e.g. Cable glute pull-back"></label>
        <label class="field"><span>Kind</span>
          <select data-f="cx-type">
            <option value="heavy">Legs: heavier weight</option>
            <option value="arms">Arms: high reps</option>
            <option value="volume" selected>Other weights</option>
            <option value="bw">Bodyweight</option>
            <option value="time">Timed hold</option>
            <option value="cardio">Cardio</option>
          </select></label>
      </div>
    </section>
    <section class="card">
      <label class="field"><span>Notes</span><textarea data-act="notes" rows="2" placeholder="How did it feel?">${esc((log && log.notes) || '')}</textarea></label>
    </section>
    <div class="sticky-save"><button class="btn primary block" data-act="finish" data-k="${k}">${log && log.done ? 'Save changes' : 'Finish workout'}</button></div>
  `;
  app.dataset.k = k;
}

function readLogFromDom(k) {
  const log = ensureLog(k);
  app.querySelectorAll('.card.ex:not(.collapsed)').forEach(card => {
    const exId = card.dataset.ex;
    const ex = exDef(exId);
    const done = !!(log.entries[exId] && log.entries[exId].done);
    if (timed(ex)) {
      const c = {};
      card.querySelectorAll('[data-c]').forEach(inp => { c[inp.dataset.c] = inp.value; });
      log.entries[exId] = { cardio: c, done };
    } else {
      const sets = [...card.querySelectorAll('.set-row[data-i]')].map(row => {
        const bw = row.dataset.bw === '1';
        const wInp = row.querySelector('[data-f="w"]');
        return { w: bw || !wInp ? '' : wInp.value, r: row.querySelector('[data-f="r"]').value, bw };
      });
      log.entries[exId] = { sets, done };
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
    return `<span class="delta ${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit}</span>`;
  };
  const bwChange = s.bw.length > 1 ? s.bw[s.bw.length - 1].bw - s.bw[0].bw : null;
  return `<div class="tiles">
    <div class="tile"><span>Workouts</span><b>${s.done}<small>/${s.planned}</small></b>${delta(s.done, prev && prev.done)}</div>
    <div class="tile k-cardio"><span>Cardio</span><b>${fmt(s.cardioMin)}<small> min</small></b>${delta(s.cardioMin, prev && prev.cardioMin, ' min')}</div>
    <div class="tile k-legs"><span>Leg volume</span><b>${fmt(s.legVolume)}<small> ${u()}</small></b>${delta(s.legVolume, prev && prev.legVolume, ' ' + u())}</div>
    ${s.classMin ? `<div class="tile k-pilates"><span>Pilates</span><b>${fmt(s.classMin)}<small> min</small></b></div>` : ''}
    <div class="tile k-arms"><span>Arm reps</span><b>${fmt(s.armReps)}</b>${delta(s.armReps, prev && prev.armReps)}</div>
    <div class="tile"><span>Sets · reps</span><b>${fmt(s.sets)}<small> · ${fmt(s.reps)}</small></b>${delta(s.reps, prev && prev.reps, ' reps')}</div>
    <div class="tile"><span>Avg steps</span><b>${s.avgSteps ? fmt(s.avgSteps) : '—'}</b>${s.avgSteps ? delta(s.avgSteps, prev && prev.avgSteps) : ''}</div>
    ${bwChange !== null ? `<div class="tile"><span>Body weight</span><b>${bwChange > 0 ? '+' : ''}${fmtW(bwChange)}<small> ${u()}</small></b></div>` : ''}
    ${s.nutDays ? `<div class="tile k-legs"><span>Protein goal</span><b>${s.pHit}<small>/${s.nutDays} days</small></b><span class="delta">avg ${fmt(s.pSum / s.nutDays)} g</span></div>
    <div class="tile k-pump"><span>Fiber goal</span><b>${s.fHit}<small>/${s.nutDays} days</small></b><span class="delta">avg ${fmt(s.fSum / s.nutDays)} g</span></div>` : ''}
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
  if (s.nutDays && s.pSum / s.nutDays < GOALS.protein) tips.push(`Protein averaged ${fmt(s.pSum / s.nutDays)} g. Add a Greek yogurt or whey shake to get to ${GOALS.protein} g.`);
  if (s.nutDays && s.fSum / s.nutDays < GOALS.fiber) tips.push(`Fiber averaged ${fmt(s.fSum / s.nutDays)} g. Raspberries and chia are the easiest way to reach ${GOALS.fiber} g.`);
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
  app.innerHTML = `${workoutTabs('week')}
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
    .map(([id, l]) => ({ ex: exDef(id), ...l })).filter(l => l.ex)
    .filter(l => l.ex.type === 'heavy' || l.ex.type === 'arms');
  const liftRows = lifts.map(l => {
    const dw = l.last.w - l.first.w, dr = l.last.r - l.first.r;
    const gain = dw ? `${dw > 0 ? '+' : ''}${fmtW(dw)} ${u()}` : dr ? `${dr > 0 ? '+' : ''}${dr} reps` : '—';
    return `<tr><td>${esc(l.ex.name)}<span class="tag t-${l.ex.type}">${TYPE_LABEL[l.ex.type]}</span></td>
      <td>${l.first.w ? fmtW(l.first.w) : 'BW'}×${l.first.r}</td><td>${l.last.w ? fmtW(l.last.w) : 'BW'}×${l.last.r}</td><td class="${dw > 0 || dr > 0 ? 'pos' : ''}">${gain}</td></tr>`;
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
    const pool = [...Object.values(PROGRAM).flatMap(w => w.ex), ...EXTRA_GROUPS.flatMap(g => g.ex).filter(x => history(x.id).length), ...Object.values(state.customEx || {})];
    const exs = pool.filter(ex => ex.type === type && !seen.has(ex.id) && seen.add(ex.id));
    const items = exs.map(ex => {
      const h = history(ex.id);
      const prev = h[0] || null;
      const sg = suggest(ex, prev);
      const best = h.reduce((b, x) => score(ex, x.entry) > (b ? score(ex, b.entry) : 0) ? x : b, null);
      return `<details class="prog">
        <summary><b>${esc(ex.name)}</b><span class="muted">${h.length ? `${h.length} session${h.length > 1 ? 's' : ''}` : 'not logged yet'}</span></summary>
        ${h.length ? `<div class="kv"><span>Last</span><b>${esc(setsText(ex, h[0].entry))}</b></div>
          <div class="kv"><span>Best</span><b>${esc(setsText(ex, best.entry))} <small>(${esc(shortDate(best.date))})</small></b></div>` : ''}
        <div class="coach ${sg.first ? 'first' : ''}"><span class="coach-ico">🎀</span><div>${esc(sg.msg)}${sg.goal ? `<div class="goal">8-week goal: <b>${esc(sg.goal)}</b></div>` : ''}</div></div>
        ${h.length > 1 ? `<ol class="hist">${h.slice(0, 10).map(x => `<li><span>${esc(shortDate(x.date))}</span>${esc(setsText(ex, x.entry))}</li>`).join('')}</ol>` : ''}
      </details>`;
    }).join('');
    if (items) html += `<section class="card"><h2>${esc(label)}</h2>${items}</section>`;
  });
  app.innerHTML = `${workoutTabs('progress')}<h1 class="page-title">Progress</h1>${html}`;
}

function renderProgram() {
  app.innerHTML = `
    ${workoutTabs('program')}
    <h1 class="page-title">Your program</h1>
    <section class="card goals">
      <h2>Goals</h2>
      <ul class="goal-list">
        <li class="k-legs"><b>Legs: heavier.</b> 5–8 reps. Once every set hits the top of the range, the app adds weight.</li>
        <li class="k-arms"><b>Arms: high reps.</b> 15–20 reps. Add a rep each session; weight only goes up after 20s on every set.</li>
        <li class="k-cardio"><b>More cardio.</b> 20-min incline walk after every lift, plus a long cardio day. ${GOALS.cardioMinPerWeek}+ min and ${fmt(GOALS.stepsPerDay)} steps a day.</li>
        <li class="k-pump"><b>Protein + fiber.</b> ${GOALS.protein} g protein to grow muscle, ${GOALS.fiber}+ g fiber to stay full. Track it on the Nutrition page.</li>
        <li><b>Cut.</b> About ${fmt(GOALS.calories)} cal and ${GOALS.protein} g protein. Aim to lose 0.5–1 lb a week while keeping strength.</li>
      </ul>
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
  const colors = ['#ff3d8b', '#ff7eb6', '#ff7a59', '#b48cff', '#ffd166', '#ffffff'];
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
  logExercises(k).forEach(ex => {
    const entry = log.entries[ex.id];
    if (!entryHasData(entry)) return;
    const prevBest = Math.max(0, ...history(ex.id, k).map(h => score(ex, h.entry)));
    if (prevBest > 0 && score(ex, entry) > prevBest) prs.push(`${ex.name}: ${setsText(ex, entry)}`);
    const next = suggest(ex, { date: k, entry });
    if (next.bumped) bumps.push(`${ex.name}: ${fmtW(next.w)} ${u()}`);
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
    ${bumps.length ? `<h3>Weight goes up next time</h3><ul class="pr-list">${bumps.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
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
    if (act === 'add-set') { const last = sets[sets.length - 1] || {}; sets.push({ w: last.w || '', r: '', bw: !!last.bw }); }
    else if (sets.length > 1) sets.pop();
    save();
    const y = window.scrollY;
    renderLog(k);
    window.scrollTo(0, y);
  }
  if (act === 'finish') finishWorkout(t.dataset.k);

  if (act === 'cardio-pick') {
    cardioPick = t.dataset.id;
    app.querySelectorAll('.activity-chips .mchip').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const m = app.querySelector('[data-cardio="min"]');
    if (m) { m.placeholder = exDef(cardioPick).goalMin || 30; m.focus(); }
  }
  if (act === 'cardio-add') {
    const day = t.dataset.k;
    const min = num(app.querySelector('[data-cardio="min"]').value);
    const miles = num(app.querySelector('[data-cardio="miles"]').value);
    if (!(min > 0)) { toast('Add the minutes'); app.querySelector('[data-cardio="min"]').focus(); return; }
    const log = ensureLog(day, 'CARDIO');
    if (log.w !== 'CARDIO' && !(log.also || []).includes('CARDIO')) log.also = [...(log.also || []), 'CARDIO'];
    const prev = log.entries[cardioPick] && log.entries[cardioPick].cardio;
    // Logging the same thing twice in a day adds the minutes and miles together.
    log.entries[cardioPick] = { cardio: { ...(prev || {}), min: String(num(prev && prev.min) + min), ...(miles || num(prev && prev.miles) ? { miles: String(r1(num(prev && prev.miles) + miles)) } : {}) }, done: true };
    if (!PROGRAM.CARDIO.ex.some(x => x.id === cardioPick) && !(log.extra || []).includes(cardioPick)) log.extra = [...(log.extra || []), cardioPick];
    log.done = true;
    log.finishedAt = new Date().toISOString();
    save();
    toast(`${exDef(cardioPick).name}: ${fmtW(min)} min ✓`);
    renderDay(day);
  }
  if (act === 'cardio-del') {
    const day = t.dataset.k;
    const log = state.logs[day];
    if (!log || !confirm(`Remove ${exDef(t.dataset.id).name} from ${prettyDate(day)}?`)) return;
    delete log.entries[t.dataset.id];
    log.extra = (log.extra || []).filter(x => x !== t.dataset.id);
    save(); renderDay(day);
  }
  if (act === 'day-add') { dayChoosing = true; renderDay(app.dataset.k); const pc = app.querySelector('.pick-card'); if (pc) pc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (act === 'day-cancel') { dayChoosing = false; renderDay(app.dataset.k); }
  if (act === 'pick-workout') {
    const day = t.dataset.k;
    const wid = t.dataset.w;
    const p = PROGRAM[wid];
    const log = ensureLog(day, wid);
    if (log.w !== wid && !(log.also || []).includes(wid)) log.also = [...(log.also || []), wid];
    dayChoosing = false;
    if (p.ex.length && p.ex.every(ex => ex.type === 'class')) {
      // A class is logged in one tap; open it to change the minutes.
      const ex = p.ex[0];
      if (!entryHasData(log.entries[ex.id])) log.entries[ex.id] = { cardio: { min: String(ex.goalMin || 45) }, done: true };
      log.done = true;
      log.finishedAt = new Date().toISOString();
      save(); confetti(); toast(`${p.name} logged ✓ (${ex.goalMin || 45} min)`);
      renderDay(day);
      return;
    }
    if (wid === 'CARDIO') {
      save(); renderDay(day);
      const c = app.querySelector('.cardio-day');
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    save();
    location.hash = `#/log/${day}`;
    setTimeout(() => {
      const first = p.ex[0];
      const card = first && app.querySelector(`.card.ex[data-ex="${first.id}"]`);
      if (card && log.w !== wid) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
  if (act === 'day-remove') {
    const day = t.dataset.k;
    const log = state.logs[day];
    if (!log) return;
    const wid = t.dataset.w;
    const p = PROGRAM[wid];
    const groups = logExerciseGroups(day);
    const mine = (groups.find(g => g.id === wid) || { exs: [] }).exs;
    const hasData = mine.some(ex => entryHasData(log.entries[ex.id]));
    if (!confirm(`Are you sure you want to remove ${p.name} from ${prettyDate(day)}?${hasData ? ' What you logged for it will be deleted.' : ''}`)) return;
    mine.forEach(ex => { delete log.entries[ex.id]; });
    if (log.w === wid) {
      log.extra = [];
      const rest = (log.also || []).filter(id => id !== wid);
      if (rest.length) { log.w = rest[0]; log.also = rest.slice(1); } else delete state.logs[day];
    } else log.also = (log.also || []).filter(id => id !== wid);
    save(); renderDay(day);
  }

  if (act === 'also-add') {
    const sel = app.querySelector('[data-act="pick-also"]');
    const day = t.dataset.k;
    if (!sel || !sel.value) return;
    const log = ensureLog(day);
    log.also = [...(log.also || []), sel.value];
    save();
    location.hash = `#/log/${day}`;
    setTimeout(() => {
      const first = PROGRAM[sel.value].ex[0];
      const card = first && app.querySelector(`.card.ex[data-ex="${first.id}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
  if (act === 'also-del') {
    const day = t.dataset.k;
    const log = state.logs[day];
    if (!log) return;
    const p = PROGRAM[t.dataset.w];
    const keep = new Set(logExerciseGroups(day).filter(g => g.id !== t.dataset.w).flatMap(g => g.exs.map(ex => ex.id)));
    const hasData = p.ex.some(ex => !keep.has(ex.id) && entryHasData(log.entries[ex.id]));
    if (hasData && !confirm(`Remove ${p.name} and what you logged for it?`)) return;
    log.also = (log.also || []).filter(id => id !== t.dataset.w);
    p.ex.forEach(ex => { if (!keep.has(ex.id)) delete log.entries[ex.id]; });
    save(); renderDay(day);
  }
  if (act === 'quick-done') {
    const day = t.dataset.k;
    const log = ensureLog(day);
    const p = PROGRAM[t.dataset.w];
    const ex = p.ex.find(timed);
    if (ex && !entryHasData(log.entries[ex.id])) log.entries[ex.id] = { cardio: { min: String(ex.goalMin || 30) }, done: true };
    log.done = true;
    log.finishedAt = new Date().toISOString();
    save();
    confetti();
    toast(`${p.name} logged ✓`);
    renderDay(day);
  }

  if (act === 'set-bw') {
    const row = t.closest('.set-row');
    const on = row.dataset.bw !== '1';
    const inp = row.querySelector('[data-f="w"]');
    row.dataset.bw = on ? '1' : '0';
    row.classList.toggle('is-bw', on);
    t.classList.toggle('on', on);
    t.setAttribute('aria-pressed', on);
    if (on) { inp.dataset.prev = inp.value; inp.value = ''; inp.placeholder = 'BW'; inp.disabled = true; }
    else { inp.disabled = false; inp.value = inp.dataset.prev || ''; inp.placeholder = u(); inp.focus(); }
    readLogFromDom(k); save();
  }
  if (act === 'ex-done' || act === 'ex-skip') {
    const card = t.closest('.card.ex');
    const exId = card.dataset.ex;
    const log = readLogFromDom(k);
    if (act === 'ex-skip') {
      // Didn't do it: clear what was typed so it doesn't count.
      const entry = log.entries[exId];
      if (entry.cardio) entry.cardio = {};
      if (entry.sets) entry.sets = entry.sets.map(x => ({ ...x, r: '' }));
    }
    log.entries[exId].done = true;
    save();
    renderLog(k);
    const folded = app.querySelector(`.card.ex[data-ex="${exId}"]`);
    let next = folded && folded.nextElementSibling;
    while (next && !(next.matches('.card.ex:not(.collapsed)') || next.matches('.sticky-save'))) next = next.nextElementSibling;
    const target = next && next.matches('.card.ex') ? next : app.querySelector('.card.ex:not(.collapsed)') || app.querySelector('.sticky-save');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (act === 'ex-edit') {
    const exId = t.closest('.card.ex').dataset.ex;
    const log = readLogFromDom(k);
    if (log.entries[exId]) log.entries[exId].done = false;
    save();
    renderLog(k);
    const card = app.querySelector(`.card.ex[data-ex="${exId}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (act === 'add-ex') {
    const card = t.closest('.add-ex');
    let id = card.querySelector('[data-act="pick-ex"]').value;
    if (!id) { toast('Choose an exercise first'); return; }
    if (id === 'custom') {
      const name = card.querySelector('[data-f="cx-name"]').value.trim();
      const type = card.querySelector('[data-f="cx-type"]').value;
      if (!name) { toast('Give it a name'); return; }
      id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!state.customEx) state.customEx = {};
      if (!state.customEx[id]) {
        state.customEx[id] = type === 'cardio'
          ? { id, name, type, goalMin: 20 }
          : { id, name, type, sets: 3, reps: type === 'heavy' ? [6, 10] : type === 'arms' ? [15, 20] : type === 'time' ? [30, 45] : [10, 15], inc: type === 'heavy' ? 10 : type === 'arms' ? 2.5 : 5 };
      }
    }
    const log = readLogFromDom(k);
    if (!log.extra) log.extra = [];
    if (!log.extra.includes(id)) log.extra.push(id);
    save();
    renderLog(k);
    const added = app.querySelector(`.card.ex[data-ex="${id}"]`);
    if (added) added.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`Added ${exDef(id).name}`);
  }
  if (act === 'remove-ex') {
    const log = readLogFromDom(k);
    log.extra = (log.extra || []).filter(x => x !== t.dataset.id);
    delete log.entries[t.dataset.id];
    save();
    const y = window.scrollY; renderLog(k); window.scrollTo(0, y);
  }

  if (act === 'export') {
    // The Debt goals data rides along still encrypted, so a backup never holds it in readable form.
    let vaultBox = null;
    try { vaultBox = localStorage.getItem(VAULT_KEY); } catch (err) { vaultBox = null; }
    const blob = new Blob([JSON.stringify({ ...state, vaultBox }, null, 2)], { type: 'application/json' });
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
  if (t.dataset.act === 'pick-ex') {
    t.closest('.add-ex').querySelector('.custom-ex').hidden = t.value !== 'custom';
  }
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
        const { vaultBox, ...rest } = data;
        state = Object.assign(blankState(), rest);
        if (vaultBox) { try { localStorage.setItem(VAULT_KEY, vaultBox); } catch (err) { toast('Could not restore Debt goals'); } }
        save(); toast('Backup imported'); render();
      } catch (err) { toast('That file is not a tracker backup'); }
    };
    r.readAsText(t.files[0]);
  }
});

window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', () => { render(); checkPendingSummaries(); });

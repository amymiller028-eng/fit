'use strict';

// Amy & Cory calendar: a shared month view for plans, dates, appointments and Huey things.

const WHO = [
  { id: 'Both', label: 'Both of us' },
  { id: 'Amy', label: 'Amy' },
  { id: 'Cory', label: 'Cory' },
  { id: 'Huey', label: 'Huey' },
];

// What kind of plan it is, for the insights at the top.
const US_CATS = [
  { id: 'date', label: 'Date night' },
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Friends' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'appt', label: 'Appointment' },
  { id: 'travel', label: 'Travel' },
  { id: 'huey', label: 'Huey' },
  { id: 'work', label: 'Work' },
  { id: 'other', label: 'Other' },
];
const catLabel = id => (US_CATS.find(c => c.id === id) || US_CATS[US_CATS.length - 1]).label;
// Events saved before categories existed get a best guess from their title until you pick one with Edit.
const CAT_WORDS = [
  ['huey', /\b(huey|vet|groom|groomer|dog park|petco|petsmart|chewy|daycare)\b/i],
  ['wedding', /\b(wedding|bridal|shower|bachelorette|bachelor|engagement|rehearsal|reception)\b/i],
  ['appt', /\b(doctor|dr\.?|dentist|dental|appt|appointment|checkup|physical|therapy|therapist|derm|dermatologist|eye|optometrist|haircut|hair|nails|lashes|brows|massage|oil change|car service|dmv|bank)\b/i],
  ['travel', /\b(trip|flight|fly|vacation|hotel|travel|airport|beach|cruise|road trip|getaway|airbnb)\b/i],
  ['work', /\b(work|meeting|conference|shift|presentation|interview|deadline|office)\b/i],
  ['family', /\b(mom|dad|mother|father|parents|family|grandma|grandpa|nana|papa|sister|brother|sis|bro|aunt|uncle|cousin|in-laws|niece|nephew|thanksgiving|christmas|easter|samuels)\b/i],
  ['date', /\b(date|date night|anniversary|dinner for two|just us|romantic|movie|movies|sushi|steakhouse)\b/i],
  ['friends', /\b(friends?|party|game night|brunch|girls|guys|drinks|happy hour|bbq|cookout|bday|birthday|hang|hangout|tailgate|concert|trivia)\b/i],
];
function guessUsCat(e) {
  if (e.who === 'Huey') return 'huey';
  const t = `${e.title || ''} ${e.note || ''}`;
  const hit = CAT_WORDS.find(([, re]) => re.test(t));
  return hit ? hit[0] : 'other';
}
const catOf = e => (US_CATS.some(c => c.id === e.cat) ? e.cat : guessUsCat(e));

let usPeriod = 'month';      // insights: week, month or year
let usAnchor = null;         // a date inside the period on screen
let usMonth = null;          // month on screen
let usDay = null;            // selected day
let usEditing = null;        // event id being edited, or 'new'

const usEvents = () => state.events || (state.events = []);
const eventsOn = k => usEvents().filter(e => e.date === k).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

function renderUs(arg) {
  const today = todayKey();
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) usDay = arg;
  if (!usDay) usDay = today;
  if (!usMonth || arg) usMonth = new Date(parseKey(usDay).getFullYear(), parseKey(usDay).getMonth(), 1);

  const first = usMonth;
  const start = mondayOf(first);
  let cells = DOW.map(d => `<div class="dow">${d[0]}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const k = key(d);
    const evs = eventsOn(k);
    cells += `<button class="ucell ${d.getMonth() !== first.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${k === usDay ? 'sel' : ''}" data-act="us-day" data-k="${k}" aria-label="${esc(prettyDate(k))}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}">
      <span class="dnum">${d.getDate()}</span>
      ${evs.slice(0, 2).map(e => `<span class="ev who-${e.who}">${esc(e.title)}</span>`).join('')}
      ${evs.length > 2 ? `<span class="ev-more">+${evs.length - 2}</span>` : ''}
    </button>`;
  }

  const dayEvs = eventsOn(usDay);
  const upcoming = usEvents().filter(e => e.date >= today).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, 6);

  app.innerHTML = `
    <div class="page-head"><h1 class="page-title">Amy &amp; Cory</h1></div>
    ${usInsights()}

    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="us-prev" aria-label="Previous month">‹</button>
        <h2>${MONTHS[first.getMonth()]} ${first.getFullYear()}</h2>
        <button class="icon-btn" data-act="us-next" aria-label="Next month">›</button>
      </div>
      <div class="cal us-cal">${cells}</div>
      <div class="legend us-legend">${WHO.map(w => `<span><i class="sw who-${w.id}"></i>${esc(w.label)}</span>`).join('')}</div>
      <div class="row-btns"><button class="btn ghost sm" data-act="us-today">Today</button></div>
    </section>

    <section class="card us-day">
      <div class="card-head">
        <h2>${usDay === today ? 'Today' : esc(prettyDate(usDay))}</h2>
        ${usEditing ? '' : '<button class="btn primary sm" data-act="us-new">+ Add event</button>'}
      </div>
      ${usEditing === 'new' ? eventForm(null) : ''}
      ${dayEvs.length ? `<ul class="us-list">${dayEvs.map(e => usEditing === e.id ? `<li class="editing">${eventForm(e)}</li>` : `
        <li>
          <span class="dot-who who-${e.who}" aria-hidden="true"></span>
          <div class="ul-main">
            <b>${esc(e.title)}</b>
            <small class="muted">${esc(catLabel(catOf(e)))} · ${e.time ? esc(timeLabel(e.time)) + ' · ' : ''}${esc(WHO.find(w => w.id === e.who)?.label || e.who)}${e.note ? ' · ' + esc(e.note) : ''}</small>
          </div>
          <button class="btn ghost sm" data-act="us-edit" data-id="${e.id}">Edit</button>
        </li>`).join('')}</ul>` : usEditing === 'new' ? '' : '<p class="muted">Nothing planned. Tap <b>+ Add event</b>.</p>'}
    </section>

    ${upcoming.length ? `<section class="card">
      <h2>Coming up</h2>
      <ul class="us-list upcoming">${upcoming.map(e => `
        <li data-act="us-day" data-k="${e.date}">
          <span class="dot-who who-${e.who}" aria-hidden="true"></span>
          <div class="ul-main"><b>${esc(e.title)}</b><small class="muted">${esc(shortDate(e.date))}${e.time ? ' · ' + esc(timeLabel(e.time)) : ''}</small></div>
        </li>`).join('')}</ul>
    </section>` : ''}

    <p class="fineprint">Saved on this device. Sharing it live with Cory comes with the shared-list sync.</p>
  `;
  app.dataset.k = usDay;
  const t = app.querySelector('.us-form [name="title"]');
  if (t) t.focus({ preventScroll: true });
}

// The period on screen: this week, month or year (or whichever you've stepped to).
function usRange() {
  const a = usAnchor || new Date();
  if (usPeriod === 'week') { const m = mondayOf(a); return { start: m, end: addDays(m, 6), label: `Week of ${shortDate(key(m))}` }; }
  if (usPeriod === 'year') return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31), label: String(a.getFullYear()) };
  return { start: new Date(a.getFullYear(), a.getMonth(), 1), end: new Date(a.getFullYear(), a.getMonth() + 1, 0), label: `${MONTHS[a.getMonth()]} ${a.getFullYear()}` };
}

// Bars for "over time": days in a week, weeks in a month, months in a year.
function usBuckets(start, end, evs) {
  const out = [];
  if (usPeriod === 'week') {
    for (let i = 0; i < 7; i++) { const k = key(addDays(start, i)); out.push({ label: DOW[i][0], full: prettyDate(k), n: evs.filter(e => e.date === k).length }); }
  } else if (usPeriod === 'month') {
    for (let m = mondayOf(start), i = 1; m <= end; m = addDays(m, 7), i++) {
      const a = key(m < start ? start : m), b = key(addDays(m, 6) > end ? end : addDays(m, 6));
      out.push({ label: `W${i}`, full: `${shortDate(a)} – ${shortDate(b)}`, n: evs.filter(e => e.date >= a && e.date <= b).length });
    }
  } else {
    for (let i = 0; i < 12; i++) { const mk = `${start.getFullYear()}-${pad(i + 1)}`; out.push({ label: MONTHS[i][0], full: `${MONTHS[i]} ${start.getFullYear()}`, n: evs.filter(e => e.date.startsWith(mk)).length }); }
  }
  return out;
}

function usInsights() {
  const all = usEvents();
  if (!all.length) return '';
  const { start, end, label } = usRange();
  const a = key(start), b = key(end);
  const evs = all.filter(e => e.date >= a && e.date <= b);
  // Averages count only the days that have happened so far in the current period.
  const today0 = parseKey(todayKey());
  const lastCounted = end > today0 && start <= today0 ? today0 : end;
  const days = Math.max(1, Math.round((lastCounted - start) / 86400000) + 1);
  const dates = evs.filter(e => catOf(e) === 'date');
  const byCat = US_CATS.map(c => ({ ...c, n: evs.filter(e => catOf(e) === c.id).length })).filter(c => c.n).sort((x, y) => y.n - x.n);
  const catMax = byCat.length ? byCat[0].n : 1;
  const buckets = usBuckets(start, end, evs);
  const bMax = Math.max(1, ...buckets.map(x => x.n));
  const perWeek = evs.length / (days / 7);
  const lastDate = all.filter(e => catOf(e) === 'date' && e.date <= todayKey()).map(e => e.date).sort().pop();
  const sinceDate = lastDate ? Math.round((parseKey(todayKey()) - parseKey(lastDate)) / 86400000) : null;
  const dow = DOW.map((d, i) => ({ d, n: evs.filter(e => weekdayIdx(parseKey(e.date)) === i).length }));
  const busiest = dow.reduce((m, x) => (x.n > m.n ? x : m), { n: 0 });

  return `<section class="card us-insights">
    <div class="ins-head">
      <div class="seg" role="group" aria-label="Period">
        ${['week', 'month', 'year'].map(p => `<button class="${usPeriod === p ? 'on' : ''}" data-act="us-period" data-p="${p}" aria-pressed="${usPeriod === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
      </div>
      <div class="ins-nav">
        <button class="icon-btn sm" data-act="us-ins-prev" aria-label="Previous ${usPeriod}">‹</button>
        <b>${esc(label)}</b>
        <button class="icon-btn sm" data-act="us-ins-next" aria-label="Next ${usPeriod}">›</button>
      </div>
    </div>

    <div class="tiles us-tiles">
      <div class="tile"><span>Plans</span><b>${evs.length}</b></div>
      <div class="tile"><span>Date nights</span><b>${dates.length}</b>${dates.length ? `<span class="delta">about every ${Math.max(1, Math.round(days / dates.length))} days</span>` : ''}</div>
      <div class="tile"><span>Average</span><b>${r1(perWeek)}<small> / week</small></b>${usPeriod === 'year' ? `<span class="delta">${r1(evs.length / Math.max(1, days / 30.4))} a month</span>` : ''}</div>
      <div class="tile"><span>Last date night</span><b>${sinceDate === null ? '—' : sinceDate === 0 ? 'Today' : `${sinceDate}<small> days ago</small>`}</b></div>
    </div>

    ${evs.length ? `<div class="ins-charts">
      <figure class="ins-chart">
        <figcaption>By category</figcaption>
        <ul class="hbars">${byCat.map(c => `<li title="${esc(c.label)}: ${c.n}">
          <span class="hb-label">${esc(c.label)}</span>
          <span class="hb-track"><i style="width:${c.n / catMax * 100}%"></i></span>
          <span class="hb-val">${c.n}</span></li>`).join('')}</ul>
      </figure>
      <figure class="ins-chart">
        <figcaption>Over time</figcaption>
        <div class="vbars" role="img" aria-label="${esc(buckets.map(x => `${x.full}: ${x.n}`).join(', '))}">
          ${buckets.map(x => `<div class="vb" title="${esc(x.full)}: ${x.n} plan${x.n === 1 ? '' : 's'}">
            <span class="vb-val">${x.n || ''}</span>
            <span class="vb-col"><i style="height:${x.n / bMax * 100}%"></i></span>
            <span class="vb-label">${esc(x.label)}</span></div>`).join('')}
        </div>
        ${busiest.n ? `<p class="muted ins-note">Busiest day: <b>${busiest.d}</b></p>` : ''}
      </figure>
    </div>` : `<p class="muted">No plans in this ${usPeriod} yet.</p>`}
  </section>`;
}

function eventForm(e) {
  const x = e || { title: '', time: '', who: 'Both', note: '', date: usDay, cat: 'date' };
  return `<form class="us-form" data-form="us-event" data-id="${e ? e.id : ''}">
    <label class="field"><span>What</span><input name="title" required maxlength="60" value="${esc(x.title)}" placeholder="e.g. Dinner with Cory's parents"></label>
    <div class="grid2">
      <label class="field"><span>Date</span><input name="date" type="date" required value="${esc(x.date)}"></label>
      <label class="field"><span>Time (optional)</span><input name="time" type="time" value="${esc(x.time || '')}"></label>
    </div>
    <div class="field"><span>Category</span>
      <div class="cat-chips" role="radiogroup" aria-label="Category">
        ${US_CATS.map(c => `<label class="cat-chip"><input type="radio" name="cat" value="${c.id}" ${catOf(x) === c.id ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}
      </div>
    </div>
    <div class="who-chips" role="radiogroup" aria-label="Who">
      ${WHO.map(w => `<label class="who-chip who-${w.id}"><input type="radio" name="who" value="${w.id}" ${x.who === w.id ? 'checked' : ''}><span>${esc(w.label)}</span></label>`).join('')}
    </div>
    <label class="field"><span>Note (optional)</span><input name="note" maxlength="120" value="${esc(x.note || '')}" placeholder="Address, what to bring…"></label>
    <div class="row-btns left">
      <button class="btn primary sm" type="submit">${e ? 'Save' : 'Add event'}</button>
      <button class="btn ghost sm" type="button" data-act="us-cancel">Cancel</button>
      ${e ? '<button class="btn link-danger" type="button" data-act="us-del">Delete</button>' : ''}
    </div>
  </form>`;
}

app.addEventListener('click', e => {
  if (document.body.dataset.section !== 'us') return;
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'us-period') { usPeriod = t.dataset.p; usAnchor = null; keepScroll(() => renderUs()); }
  if (act === 'us-ins-prev' || act === 'us-ins-next') {
    const a = usAnchor || new Date();
    const step = act === 'us-ins-prev' ? -1 : 1;
    usAnchor = usPeriod === 'week' ? addDays(a, 7 * step) : usPeriod === 'year' ? new Date(a.getFullYear() + step, a.getMonth(), 1) : new Date(a.getFullYear(), a.getMonth() + step, 1);
    keepScroll(() => renderUs());
  }
  if (act === 'us-day') { usDay = t.dataset.k; usEditing = null; const d = parseKey(usDay); usMonth = new Date(d.getFullYear(), d.getMonth(), 1); keepScroll(() => renderUs()); }
  if (act === 'us-prev' || act === 'us-next') { usMonth = new Date(usMonth.getFullYear(), usMonth.getMonth() + (act === 'us-prev' ? -1 : 1), 1); keepScroll(() => renderUs()); }
  if (act === 'us-today') { usDay = todayKey(); usMonth = null; usEditing = null; renderUs(); }
  if (act === 'us-new') { usEditing = 'new'; keepScroll(() => renderUs()); }
  if (act === 'us-edit') { usEditing = t.dataset.id; keepScroll(() => renderUs()); }
  if (act === 'us-cancel') { usEditing = null; keepScroll(() => renderUs()); }
  if (act === 'us-del') {
    const id = t.closest('form').dataset.id;
    const ev = usEvents().find(x => x.id === id);
    if (ev && confirm(`Delete "${ev.title}"?`)) {
      state.events = usEvents().filter(x => x.id !== id);
      usEditing = null; save(); keepScroll(() => renderUs()); toast('Event deleted');
    }
  }
});

app.addEventListener('submit', e => {
  const f = e.target;
  if (f.dataset.form !== 'us-event') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const fields = { title: d.title.trim(), date: d.date || usDay, time: d.time || '', who: d.who || 'Both', cat: d.cat || 'other', note: (d.note || '').trim() };
  if (!fields.title) return;
  const existing = usEvents().find(x => x.id === f.dataset.id);
  if (existing) Object.assign(existing, fields);
  else usEvents().push({ id: uid(), ...fields });
  usEditing = null;
  usDay = fields.date;
  const dd = parseKey(usDay); usMonth = new Date(dd.getFullYear(), dd.getMonth(), 1);
  save(); keepScroll(() => renderUs()); toast(existing ? 'Saved' : 'Added to your calendar');
});

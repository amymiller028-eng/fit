'use strict';

// Amy & Cory calendar: a shared month view for plans, dates, appointments and Huey things.

const WHO = [
  { id: 'Both', label: 'Both of us' },
  { id: 'Amy', label: 'Amy' },
  { id: 'Cory', label: 'Cory' },
  { id: 'Huey', label: 'Huey' },
];

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
            <small class="muted">${e.time ? esc(timeLabel(e.time)) + ' · ' : ''}${esc(WHO.find(w => w.id === e.who)?.label || e.who)}${e.note ? ' · ' + esc(e.note) : ''}</small>
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

function eventForm(e) {
  const x = e || { title: '', time: '', who: 'Both', note: '', date: usDay };
  return `<form class="us-form" data-form="us-event" data-id="${e ? e.id : ''}">
    <label class="field"><span>What</span><input name="title" required maxlength="60" value="${esc(x.title)}" placeholder="e.g. Dinner with Cory's parents"></label>
    <div class="grid2">
      <label class="field"><span>Date</span><input name="date" type="date" required value="${esc(x.date)}"></label>
      <label class="field"><span>Time (optional)</span><input name="time" type="time" value="${esc(x.time || '')}"></label>
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
  const fields = { title: d.title.trim(), date: d.date || usDay, time: d.time || '', who: d.who || 'Both', note: (d.note || '').trim() };
  if (!fields.title) return;
  const existing = usEvents().find(x => x.id === f.dataset.id);
  if (existing) Object.assign(existing, fields);
  else usEvents().push({ id: uid(), ...fields });
  usEditing = null;
  usDay = fields.date;
  const dd = parseKey(usDay); usMonth = new Date(dd.getFullYear(), dd.getMonth(), 1);
  save(); keepScroll(() => renderUs()); toast(existing ? 'Saved' : 'Added to your calendar');
});

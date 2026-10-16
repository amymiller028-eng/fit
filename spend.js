'use strict';

// Spend: a quick daily spending log inside the locked Money section.
// Entries live in the same encrypted vault as Debt goals.

const SPEND_CATS = [
  { id: 'Groceries', words: ['grocer', 'aldi', 'hy-vee', 'hyvee', 'dillons', 'trader joe', 'whole foods', 'costco', 'sam\'s', 'kroger', 'publix', 'market', 'walmart grocery'] },
  { id: 'Coffee', words: ['coffee', 'latte', 'starbucks', 'dutch', 'scooter', 'espresso', 'cold brew', 'matcha', 'chai'] },
  { id: 'Eating out', words: ['restaurant', 'lunch', 'dinner', 'breakfast', 'chipotle', 'taco', 'pizza', 'burger', 'sushi', 'doordash', 'uber eats', 'grubhub', 'chick-fil-a', 'mcdonald', 'sonic', 'panera', 'cava', 'sweetgreen', 'smoothie'] },
  { id: 'Gas', words: ['gas', 'fuel', 'shell', 'qt', 'quiktrip', 'casey', 'exxon', 'bp ', 'phillips'] },
  { id: 'Huey', words: ['huey', 'dog', 'petco', 'petsmart', 'chewy', 'vet', 'groomer', 'treats', 'kibble'] },
  { id: 'Self-care', words: ['nails', 'hair', 'lash', 'brow', 'sephora', 'ulta', 'skincare', 'massage', 'facial', 'makeup', 'wax'] },
  { id: 'Fitness', words: ['gym', 'pilates', 'class', 'protein', 'supplement', 'yoga', 'leggings'] },
  { id: 'Shopping', words: ['amazon', 'target', 'clothes', 'shoes', 'tj maxx', 'marshalls', 'home goods', 'homegoods', 'walmart', 'mall', 'gift'] },
  { id: 'Fun', words: ['movie', 'bar', 'drinks', 'wine', 'concert', 'tickets', 'game', 'bowling'] },
  { id: 'Bills', words: ['bill', 'subscription', 'netflix', 'spotify', 'hulu', 'phone', 'insurance', 'utility', 'electric', 'internet'] },
  { id: 'Other', words: [] },
];

function guessSpendCat(note) {
  const n = ` ${note.toLowerCase()} `;
  const hit = SPEND_CATS.find(c => c.words.some(w => n.includes(w)));
  return hit ? hit.id : 'Other';
}

// "4.50 latte", "$12 lunch with Cory", "latte 4.50" -> amount + note
function parseSpend(text) {
  const t = text.trim();
  const m = t.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(',', '.'));
  const note = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return amount > 0 ? { amount, note: note || 'Purchase' } : null;
}

// Cards and accounts you pay with: your cards from Debt goals, plus debit and cash.
function spendMethods() {
  const cards = vault.debts.filter(d => d.payInFull || d.type === 'card').map(d => d.name);
  const list = [...cards, 'Debit', 'Cash'];
  return [...new Set(list.length > 2 ? list : ['Amex', 'Discover', 'Debit', 'Cash'])];
}

const isDebtCard = method => vault.debts.some(d => d.name === method && !d.payInFull && d.type === 'card');

let spendDay = null;      // selected day on the calendar
let spendMonth = null;    // month shown on the calendar

const spendList = () => vault.spend || (vault.spend = []);
const sumOf = list => list.reduce((s, x) => s + num(x.amount), 0);
const spendOn = k => spendList().filter(x => x.date === k);
const spendBetween = (a, b) => spendList().filter(x => x.date >= a && x.date <= b);

function spendGoals() {
  if (!vault.spendGoals) {
    vault.spendGoals = {};
    const amex = spendMethods().find(m => /amex|american express/i.test(m));
    if (amex) vault.spendGoals[amex] = 1500;
  }
  return vault.spendGoals;
}

function moneyTabs(active) {
  return `<nav class="subtabs money-tabs" aria-label="Money">
    <a href="#/money/spend" class="${active === 'spend' ? 'on' : ''}">Spend</a>
    <a href="#/money" class="${active === 'debt' ? 'on' : ''}">Debt goals</a>
  </nav>`;
}

function renderSpend() {
  const today = todayKey();
  if (!spendDay) spendDay = today;
  if (!spendMonth) spendMonth = new Date(parseKey(spendDay).getFullYear(), parseKey(spendDay).getMonth(), 1);
  const methods = spendMethods();
  if (!vault.lastMethod || !methods.includes(vault.lastMethod)) vault.lastMethod = methods.find(m => /amex/i.test(m)) || methods[0];
  const goals = spendGoals();

  const monStart = key(mondayOf(new Date()));
  const monEnd = key(addDays(mondayOf(new Date()), 6));
  const mStart = key(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const mEnd = key(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  const todayTotal = sumOf(spendOn(today));
  const weekList = spendBetween(monStart, monEnd);
  const monthList = spendBetween(mStart, mEnd);
  const daysInMonth = parseKey(mEnd).getDate();
  const weeksInMonth = daysInMonth / 7;

  const goalCards = Object.entries(goals).filter(([, g]) => num(g) > 0).map(([method, goal]) => {
    const m = sumOf(monthList.filter(x => x.method === method));
    const w = sumOf(weekList.filter(x => x.method === method));
    const weekGoal = num(goal) / weeksInMonth;
    const mp = Math.min(100, m / num(goal) * 100);
    const wp = Math.min(100, w / weekGoal * 100);
    return `<section class="card goal-card">
      <div class="card-head"><h2>${esc(method)} goal</h2><span class="muted">${money(num(goal))}/month</span></div>
      <div class="goal-line"><span>This month</span><b>${money2(m)} <small>of ${money(num(goal))}</small></b></div>
      <div class="spend-bar ${m > num(goal) ? 'over' : mp > 85 ? 'near' : ''}"><i style="width:${mp}%"></i></div>
      <div class="goal-line"><span>This week</span><b>${money2(w)} <small>of ${money(weekGoal)}</small></b></div>
      <div class="spend-bar ${w > weekGoal ? 'over' : wp > 85 ? 'near' : ''}"><i style="width:${wp}%"></i></div>
      <p class="goal-msg">${m > num(goal) ? `${money(m - num(goal))} over this month. Tighten up and the rest of the month still counts.`
        : w > weekGoal ? `${money(w - weekGoal)} over this week's pace, but you have the rest of the month to even out.`
        : `${money(weekGoal - w)} left this week · ${money(num(goal) - m)} left this month.`}</p>
    </section>`;
  }).join('');

  const byMethod = methods.map(m => ({ m, total: sumOf(monthList.filter(x => x.method === m)) })).filter(x => x.total > 0);
  const byCat = SPEND_CATS.map(c => ({ c: c.id, total: sumOf(monthList.filter(x => x.cat === c.id)) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const catMax = byCat.length ? byCat[0].total : 1;
  const discover = byMethod.filter(x => isDebtCard(x.m));

  const sel = spendDay;
  const selList = spendOn(sel);
  const selNoSpend = vault.noSpend && vault.noSpend[sel];

  app.innerHTML = `
    ${moneyTabs('spend')}
    <div class="page-head"><h1 class="page-title">Spend</h1><button class="btn ghost sm" data-act="vault-lock">Lock</button></div>

    <section class="card spend-add">
      <form data-form="spend-add" class="spend-form">
        <input name="entry" class="spend-input" autocomplete="off" enterkeyhint="done" placeholder='e.g. "4.50 latte"' aria-label="Amount and what you bought" required>
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div class="method-chips" role="radiogroup" aria-label="Paid with">
        ${methods.map(m => `<button type="button" class="mchip ${m === vault.lastMethod ? 'on' : ''}" data-act="spend-method" data-m="${esc(m)}" role="radio" aria-checked="${m === vault.lastMethod}">${esc(m)}</button>`).join('')}
      </div>
      <p class="muted spend-for">Adding to <b>${sel === today ? 'today' : esc(prettyDate(sel))}</b>${sel !== today ? ` · <a href="#" data-act="spend-today">back to today</a>` : ''}</p>
    </section>

    <div class="tiles spend-tiles">
      <div class="tile"><span>Today</span><b>${money2(todayTotal)}</b></div>
      <div class="tile"><span>This week</span><b>${money2(sumOf(weekList))}</b></div>
      <div class="tile"><span>This month</span><b>${money2(sumOf(monthList))}</b></div>
    </div>

    ${goalCards}

    ${discover.length ? `<p class="callout">${discover.map(x => `<b>${money2(x.total)}</b> on ${esc(x.m)}`).join(', ')} this month. Charges on a card you're paying down add to that debt, so use debit or Amex when you can.</p>` : ''}

    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="spend-prev" aria-label="Previous month">‹</button>
        <h2>${MONTHS[spendMonth.getMonth()]} ${spendMonth.getFullYear()}</h2>
        <button class="icon-btn" data-act="spend-next" aria-label="Next month">›</button>
      </div>
      ${spendCalendar()}
      <div class="legend spend-legend"><span><i class="sw heat-1"></i>Low</span><span><i class="sw heat-3"></i>Medium</span><span><i class="sw heat-5"></i>High</span><span>✿ No-spend day</span></div>
    </section>

    <section class="card day-detail">
      <div class="card-head"><h2>${sel === today ? 'Today' : esc(prettyDate(sel))}</h2><b>${money2(sumOf(selList))}</b></div>
      ${selList.length ? `<ul class="spend-list">${selList.map(x => `
        <li>
          <div class="sl-main"><b>${esc(x.note)}</b><small class="muted">${esc(x.cat)} · ${esc(x.method)}</small></div>
          <span class="sl-amt">${money2(x.amount)}</span>
          <button class="x" data-act="spend-del" data-sid="${x.id}" aria-label="Delete ${esc(x.note)}">✕</button>
        </li>`).join('')}</ul>`
      : selNoSpend ? `<p class="no-spend-msg">✿ No-spend day. Nice.</p><button class="btn ghost sm" data-act="spend-nospend">Undo no-spend day</button>`
      : `<p class="muted">Nothing logged for this day.</p><button class="btn ghost sm" data-act="spend-nospend">✿ Mark as a no-spend day</button>`}
    </section>

    ${byCat.length ? `<section class="card">
      <h2>Where it went this month</h2>
      <ul class="trend-list">${byCat.map(x => `<li><div class="trend-top"><b>${esc(x.c)}</b><span>${money2(x.total)}</span></div><div class="trend-bar"><i style="width:${x.total / catMax * 100}%"></i></div></li>`).join('')}</ul>
      ${byMethod.length ? `<p class="muted method-split">${byMethod.map(x => `${esc(x.m)} ${money2(x.total)}`).join(' · ')}</p>` : ''}
    </section>` : ''}

    <details class="card goal-settings">
      <summary><b>Monthly spending goals</b></summary>
      <p class="muted">Set a monthly goal for any card. The weekly goal is worked out for you.</p>
      ${methods.filter(m => m !== 'Cash').map(m => `<label class="field"><span>${esc(m)} per month</span><input type="number" inputmode="decimal" min="0" step="10" data-spend-goal="${esc(m)}" value="${esc(goals[m] || '')}" placeholder="No goal"></label>`).join('')}
    </details>
  `;
  app.dataset.k = sel;
  const inp = app.querySelector('.spend-input');
  if (inp && !('ontouchstart' in window)) inp.focus({ preventScroll: true });
}

function spendCalendar() {
  const first = spendMonth;
  const start = mondayOf(first);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const monthDays = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) monthDays.push(sumOf(spendOn(key(d))));
  const max = Math.max(1, ...monthDays);
  const today = todayKey();
  let cells = DOW.map(d => `<div class="dow">${d[0]}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const k = key(d);
    const total = sumOf(spendOn(k));
    const ns = vault.noSpend && vault.noSpend[k];
    const heat = total > 0 ? Math.min(5, Math.max(1, Math.ceil(total / max * 5))) : 0;
    const out = d.getMonth() !== first.getMonth();
    cells += `<button class="scell ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${k === spendDay ? 'sel' : ''} ${heat ? `heat-${heat}` : ''} ${ns ? 'nospend' : ''}" data-act="spend-day" data-k="${k}" aria-label="${esc(prettyDate(k))}${total ? `, ${money2(total)}` : ns ? ', no-spend day' : ''}">
      <span class="dnum">${d.getDate()}</span>
      <span class="samt">${total ? `$${total < 100 ? total.toFixed(0) : Math.round(total)}` : ns ? '✿' : ''}</span>
    </button>`;
  }
  return `<div class="cal spend-cal">${cells}</div>`;
}

app.addEventListener('click', async e => {
  if (document.body.dataset.section !== 'money' || !vault || !location.hash.startsWith('#/money/spend')) return;
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'spend-method') {
    vault.lastMethod = t.dataset.m;
    app.querySelectorAll('.method-chips .mchip').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    await saveVault();
  }
  if (act === 'spend-day') {
    spendDay = t.dataset.k;
    const d = parseKey(spendDay);
    spendMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    keepScroll(renderSpend);
  }
  if (act === 'spend-today') { e.preventDefault(); spendDay = todayKey(); spendMonth = null; keepScroll(renderSpend); }
  if (act === 'spend-prev' || act === 'spend-next') {
    spendMonth = new Date(spendMonth.getFullYear(), spendMonth.getMonth() + (act === 'spend-prev' ? -1 : 1), 1);
    keepScroll(renderSpend);
  }
  if (act === 'spend-del') {
    vault.spend = spendList().filter(x => x.id !== t.dataset.sid);
    await saveVault(); keepScroll(renderSpend); toast('Removed');
  }
  if (act === 'spend-nospend') {
    if (!vault.noSpend) vault.noSpend = {};
    if (vault.noSpend[spendDay]) delete vault.noSpend[spendDay];
    else {
      vault.noSpend[spendDay] = true;
      const streak = noSpendThisMonth();
      toast(`No-spend day ✿ ${streak} this month`);
      if (streak && streak % 5 === 0) confetti();
    }
    await saveVault(); keepScroll(renderSpend);
  }
});

function noSpendThisMonth() {
  const mk = monthKey(parseKey(spendDay));
  return Object.keys(vault.noSpend || {}).filter(k => k.startsWith(mk)).length;
}

app.addEventListener('change', async e => {
  if (document.body.dataset.section !== 'money' || !vault) return;
  const t = e.target;
  if (t.dataset.spendGoal !== undefined) {
    const goals = spendGoals();
    const v = num(t.value);
    if (v > 0) goals[t.dataset.spendGoal] = v; else delete goals[t.dataset.spendGoal];
    await saveVault(); keepScroll(renderSpend);
  }
});

app.addEventListener('submit', async e => {
  const f = e.target;
  if (f.dataset.form !== 'spend-add' || !vault) return;
  e.preventDefault();
  const parsed = parseSpend(f.entry.value);
  if (!parsed) { toast('Start with the amount, like "4.50 latte"'); return; }
  const entry = { id: uid(), date: spendDay || todayKey(), amount: parsed.amount, note: parsed.note, method: vault.lastMethod, cat: guessSpendCat(parsed.note) };
  spendList().push(entry);
  if (vault.noSpend && vault.noSpend[entry.date]) delete vault.noSpend[entry.date];
  await saveVault();
  keepScroll(renderSpend);
  toast(`${money2(entry.amount)} ${entry.note} · ${entry.method}`);
});

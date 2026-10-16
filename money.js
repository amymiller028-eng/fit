'use strict';

// Debt goals: a password-locked payoff tracker. Everything here is encrypted with your
// password (AES-GCM, key from PBKDF2) and only ever stored on this device.

const VAULT_KEY = 'hueys-house-vault-v1';
const LOCK_AFTER_MS = 10 * 60 * 1000;
const textEnc = new TextEncoder();
const textDec = new TextDecoder();

let vault = null;       // decrypted data while unlocked
let vaultKey = null;    // CryptoKey while unlocked
let vaultSalt = null;
let idleTimer = null;
let moneyUi = { editing: null, paying: null, updating: null, adding: false };

const toB64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const money = n => `$${Math.round(n).toLocaleString()}`;
const money2 = n => `$${(Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = months => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months); return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };

const DEFAULT_BILLS = ['Rent', 'Car', 'Groceries', 'Gym', 'Utilities', 'Gas', 'Eating out'];

function blankVault() {
  return {
    debts: [], income: '', bills: DEFAULT_BILLS.map(name => ({ id: uid(), name, amount: '' })),
    cushionGoal: 1000, cushionSaved: 0, extra: null, strategy: 'avalanche', created: todayKey(),
  };
}

// Older saves had one "must-pays" total: keep it as its own line next to the new categories.
function migrateVault(data) {
  if (!Array.isArray(data.bills)) {
    data.bills = DEFAULT_BILLS.map(name => ({ id: uid(), name, amount: '' }));
    if (num(data.mustPays) > 0) data.bills.push({ id: uid(), name: 'Other must-pays', amount: data.mustPays });
  }
  delete data.mustPays;
  return data;
}

const billsTotal = () => (vault.bills || []).reduce((s, b) => s + num(b.amount), 0);

function hasVault() {
  try { return !!localStorage.getItem(VAULT_KEY); } catch (e) { return false; }
}

async function deriveVaultKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', textEnc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function sealVault() {
  if (!vault || !vaultKey) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, textEnc.encode(JSON.stringify(vault)));
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify({ v: 1, salt: toB64(vaultSalt), iv: toB64(iv), ct: toB64(ct) }));
  } catch (e) { toast('Could not save on this device'); }
}

async function createVault(password) {
  vaultSalt = crypto.getRandomValues(new Uint8Array(16));
  vaultKey = await deriveVaultKey(password, vaultSalt);
  vault = blankVault();
  await sealVault();
}

async function unlockVault(password) {
  const box = JSON.parse(localStorage.getItem(VAULT_KEY));
  const salt = fromB64(box.salt);
  const key = await deriveVaultKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  vault = migrateVault(Object.assign(blankVault(), { bills: undefined }, JSON.parse(textDec.decode(plain))));
  vaultKey = key;
  vaultSalt = salt;
}

function lockVault() {
  vault = null;
  vaultKey = null;
  vaultSalt = null;
  moneyUi = { editing: null, paying: null, updating: null, adding: false };
  clearTimeout(idleTimer);
}

function touchVault() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    lockVault();
    if (document.body.dataset.section === 'money') renderMoney();
  }, LOCK_AFTER_MS);
}

async function saveVault() { touchVault(); await sealVault(); }

/* ---------- the math ---------- */

// Combined rate for an account with several loans (each loan's rate weighted by its balance).
function debtRate(d) {
  if (d.loans && d.loans.length) {
    const total = d.loans.reduce((s, l) => s + num(l.balance), 0);
    return total ? d.loans.reduce((s, l) => s + num(l.balance) * num(l.apr), 0) / total : 0;
  }
  return num(d.apr);
}
function debtBalance(d) {
  return d.loans && d.loans.length ? d.loans.reduce((s, l) => s + num(l.balance), 0) : num(d.balance);
}
// What you've actually paid on a debt (logged payments), so fixing a typo never counts as progress.
const paidSoFar = d => (d.payments || []).reduce((t, p) => t + num(p.amount), 0);
const payoffDebts = () => vault.debts.filter(d => !d.payInFull);
const openDebts = () => payoffDebts().filter(d => debtBalance(d) > 0.005);

// Month-by-month payoff: interest accrues, every debt gets its minimum, the extra (plus minimums freed
// up by paid-off debts) goes to the next debt in line.
function simulate(extra, strategy) {
  const ds = openDebts().map(d => ({ id: d.id, bal: debtBalance(d), apr: debtRate(d), min: num(d.min) }));
  const order = [...ds].sort(strategy === 'snowball'
    ? (a, b) => a.bal - b.bal || b.apr - a.apr
    : (a, b) => b.apr - a.apr || a.bal - b.bal).map(d => d.id);
  const payoff = {};
  let interest = 0, month = 0;
  while (ds.some(d => d.bal > 0.005) && month < 600) {
    month++;
    let pool = num(extra);
    ds.forEach(d => {
      if (d.bal <= 0.005) { pool += d.min; return; }
      const i = d.bal * d.apr / 100 / 12;
      d.bal += i;
      interest += i;
      const p = Math.min(d.min, d.bal);
      d.bal -= p;
      pool += d.min - p;
    });
    for (const id of order) {
      if (pool <= 0) break;
      const d = ds.find(x => x.id === id);
      if (d.bal <= 0.005) continue;
      const p = Math.min(pool, d.bal);
      d.bal -= p;
      pool -= p;
    }
    ds.forEach(d => { if (d.bal <= 0.005 && !payoff[d.id]) payoff[d.id] = month; });
  }
  return { months: month, interest, payoff, order, stuck: ds.some(d => d.bal > 0.005) };
}

function monthlyPlan() {
  const minTotal = openDebts().reduce((s, d) => s + num(d.min), 0);
  const income = num(vault.income), must = billsTotal();
  const available = income - must - minTotal;
  const cushionLeft = Math.max(0, num(vault.cushionGoal) - num(vault.cushionSaved));
  const toCushion = cushionLeft > 0 && available > 0 ? Math.min(cushionLeft, Math.max(50, Math.round(available * 0.3 / 10) * 10)) : 0;
  const suggested = Math.max(0, Math.floor((available - toCushion) * 0.9 / 10) * 10);
  const extra = vault.extra === null || vault.extra === undefined || vault.extra === '' ? suggested : num(vault.extra);
  return { minTotal, income, must, available, cushionLeft, toCushion, suggested, extra, hasIncome: income > 0 };
}

function paymentStreak() {
  const months = new Set();
  vault.debts.forEach(d => (d.payments || []).forEach(p => months.add(p.date.slice(0, 7))));
  let streak = 0;
  const d = new Date(); d.setDate(1);
  if (!months.has(monthKey(d))) d.setMonth(d.getMonth() - 1); // this month isn't over yet
  while (months.has(monthKey(d))) { streak++; d.setMonth(d.getMonth() - 1); }
  return streak;
}

/* ---------- screens ---------- */

const DEBT_TYPES = { student: 'Student loan', card: 'Credit card', personal: 'Personal loan', car: 'Car loan', other: 'Other' };

function renderMoney() {
  document.body.dataset.section = 'money';
  if (!vault) return renderLockScreen();
  touchVault();
  if (location.hash.startsWith('#/money/spend')) return renderSpend();
  const debts = vault.debts;
  if (!debts.length && !moneyUi.adding) return renderMoneyWelcome();

  const plan = monthlyPlan();
  const chosen = simulate(plan.extra, vault.strategy);
  const owed = debts.filter(d => !d.payInFull);
  const inFull = debts.filter(d => d.payInFull);
  const startTotal = owed.reduce((s, d) => s + num(d.startBalance), 0);
  const nowTotal = owed.reduce((s, d) => s + debtBalance(d), 0);
  const paid = Math.max(0, startTotal - nowTotal);
  const pct = startTotal ? paid / startTotal : 0;
  const streak = paymentStreak();
  const target = chosen.order.map(id => debts.find(d => d.id === id)).find(d => d && debtBalance(d) > 0.005);
  const lastUpdate = debts.map(d => d.updated || d.created).sort().pop();
  const stale = lastUpdate && (parseKey(todayKey()) - parseKey(lastUpdate)) / 86400000 > 30;
  const due = duePayments();

  app.innerHTML = `
    ${moneyTabs('debt')}
    <div class="page-head">
      <h1 class="page-title">Debt goals</h1>
      <button class="btn ghost sm" data-act="vault-lock">Lock</button>
    </div>

    <section class="card debt-hero">
      ${nowTotal > 0.005 ? `
        <div class="eyebrow">${chosen.stuck ? 'At this pace' : 'Debt-free by'}</div>
        <div class="free-date">${chosen.stuck ? 'Not yet in sight' : esc(monthLabel(chosen.months))}</div>
        <p class="muted">${chosen.stuck ? 'Your payments don\'t cover the interest yet. Raise the extra amount below.' : `${chosen.months} month${chosen.months === 1 ? '' : 's'} to go${streak ? ` · ${streak}-month payment streak` : ''}`}</p>`
      : `<div class="free-date">Debt-free!</div><p class="muted">Every balance is at $0. You did it.</p>`}
      <div class="total-bar" role="img" aria-label="${Math.round(pct * 100)}% of your debt paid off">
        <i class="paid-fill" data-anim-w="${(pct * 100).toFixed(2)}"></i>
      </div>
      <div class="total-row"><span><b class="countup" data-to="${paid}">${money(paid)}</b> paid off</span><span><b>${money(nowTotal)}</b> to go</span></div>
    </section>

    ${stale ? `<p class="callout">It's been over a month since your balances were updated. Tap <b>Update balance</b> on each debt with the number from your statement.</p>` : ''}

    ${due.length ? `<section class="card due-card">
      <h2>Did these payments go through?</h2>
      ${due.map(({ debt, s }) => `<div class="due-row" data-debt="${debt.id}" data-sid="${s.id}">
        <div><b>${money2(s.amount)}</b> to ${esc(debt.name)}<small class="muted">Scheduled for ${esc(shortDate(s.date))}</small></div>
        <div class="due-btns"><button class="btn primary sm" data-act="sched-yes">Yes, it posted</button><button class="btn ghost sm" data-act="sched-no">No</button></div>
      </div>`).join('')}
    </section>` : ''}

    ${nowTotal > 0.005 ? `
    <section class="card game-plan">
      <h2>This month's game plan</h2>
      <ol class="plan-steps">
        <li><b>Pay every minimum</b> <span>${money(plan.minTotal)}</span></li>
        ${plan.toCushion ? `<li><b>Add to your cushion</b> <span>${money(plan.toCushion)}</span></li>` : ''}
        <li><b>Send extra to ${target ? esc(target.name) : 'your next debt'}</b> <span>${money(plan.extra)}</span></li>
      </ol>
      ${!plan.hasIncome ? '<p class="muted">Add your take-home pay below to see what you can afford each month.</p>' : ''}
    </section>` : ''}

    <div class="debt-list">${[...owed].sort((a, b) => {
      const ra = chosen.order.indexOf(a.id), rb = chosen.order.indexOf(b.id);
      return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    }).map(d => debtCard(d, chosen)).join('')}</div>
    ${inFull.length ? `<section class="card full-section">
      <h2>Paid in full every month</h2>
      <p class="muted">Not debt, so it's left out of your payoff plan. Check it off each month to keep your streak.</p>
      ${inFull.map(fullCard).join('')}
    </section>` : ''}
    ${moneyUi.adding || moneyUi.editing === 'new' ? debtForm(null) : `<button class="btn ghost block" data-act="debt-add">+ Add a debt or card</button>`}


    <section class="card">
      <h2>Your monthly numbers</h2>
      <label class="field"><span>Take-home pay / month</span><input type="number" inputmode="decimal" min="0" data-vault="income" value="${esc(vault.income)}" placeholder="$"></label>
      <h3 class="bills-head"><span>Must-pays each month</span><b>${money(plan.must)}</b></h3>
      <div class="bill-rows">${vault.bills.map(b => `
        <div class="bill-row" data-bill="${b.id}">
          <input type="text" data-bill-field="name" maxlength="30" value="${esc(b.name)}" placeholder="Name" aria-label="Must-pay name">
          <div class="bill-amt"><span>$</span><input type="number" inputmode="decimal" min="0" step="1" data-bill-field="amount" value="${esc(b.amount)}" placeholder="0" aria-label="${esc(b.name || 'Must-pay')} per month"></div>
          <button class="x" type="button" data-act="bill-del" aria-label="Remove ${esc(b.name || 'line')}">✕</button>
        </div>`).join('')}
      </div>
      <button class="btn ghost sm" type="button" data-act="bill-add">+ Add a must-pay</button>
      <p class="muted small-gap">Minimums on your debts (${money(plan.minTotal)}) are added automatically, so don't list them here.</p>
      <div class="grid2">
        <label class="field"><span>Emergency cushion goal</span><input type="number" inputmode="decimal" min="0" data-vault="cushionGoal" value="${esc(vault.cushionGoal)}"></label>
        <label class="field"><span>Cushion saved so far</span><input type="number" inputmode="decimal" min="0" data-vault="cushionSaved" value="${esc(vault.cushionSaved)}"></label>
      </div>
      <div class="cushion-bar"><i style="width:${Math.min(100, num(vault.cushionGoal) ? num(vault.cushionSaved) / num(vault.cushionGoal) * 100 : 0)}%"></i></div>
      <p class="muted">${plan.cushionLeft > 0 ? `${money(plan.cushionLeft)} to go on your cushion. Until it's full, part of each month goes there first.` : 'Cushion is full. Every extra dollar can go to debt.'}</p>
      ${plan.hasIncome ? `<p class="avail">Left after must-pays and minimums: <b>${money(plan.available)}</b></p>` : ''}
      <label class="field"><span>Extra toward debt each month</span>
        <div class="extra-row">
          <input type="range" min="0" max="${Math.max(1000, Math.ceil(Math.max(plan.available, plan.extra) * 1.5 / 50) * 50)}" step="10" value="${plan.extra}" data-act="extra-slider" aria-label="Extra per month">
          <input type="number" inputmode="decimal" min="0" step="10" value="${plan.extra}" data-act="extra-input" aria-label="Extra per month in dollars">
        </div>
      </label>
      <p class="muted">${plan.hasIncome ? `Suggested: ${money(plan.suggested)}, which keeps about 10% of what's left as breathing room${plan.toCushion ? ' after your cushion' : ''}.` : 'Add your pay and must-pays to get a suggestion.'} <a href="#" data-act="extra-reset">Use suggestion</a></p>
      <p class="what-if" id="what-if">${whatIf(plan.extra)}</p>
    </section>

    <p class="fineprint">This page does the math and shows options; it isn't financial advice. Interest is estimated monthly, so update balances from your statements. For student loans, ask your servicer to apply extra payments to the highest-rate loan.</p>
  `;
  animateMoney();
}

function whatIf(extra) {
  const r = simulate(extra, vault.strategy);
  if (!openDebts().length) return '';
  if (r.stuck) return 'At this amount the debts never finish. Try a higher number.';
  return `At ${money(extra)}/month extra: debt-free by <b>${esc(monthLabel(r.months))}</b>, about ${money(r.interest)} in interest.`;
}


function debtCard(d, plan) {
  if (moneyUi.editing === d.id) return debtForm(d);
  const bal = debtBalance(d);
  const start = num(d.startBalance) || bal;
  const pct = start ? Math.max(0, (start - bal) / start) : 0;
  const done = bal <= 0.005;
  const rank = plan.order.indexOf(d.id);
  const month = plan.payoff[d.id];
  return `<section class="card debt ${done ? 'paid-off' : ''}" data-id="${d.id}">
    <div class="debt-head">
      <div><h3>${esc(d.name)}</h3><span class="muted">${esc(DEBT_TYPES[d.type] || 'Debt')} · ${Math.round(debtRate(d) * 100) / 100}%${d.loans && d.loans.length ? ` avg of ${d.loans.length} loans` : ''} · ${money(num(d.min))} min</span></div>
      ${done ? '<span class="stamp">PAID OFF</span>' : rank >= 0 ? `<span class="rank">#${rank + 1}</span>` : ''}
    </div>
    <div class="debt-amount"><b class="countdown" data-to="${bal}">${money2(bal)}</b><span class="muted">of ${money(start)}</span></div>
    <div class="debt-bar" role="img" aria-label="${Math.round(pct * 100)}% paid off">
      <i class="remain" data-anim-w="${((1 - pct) * 100).toFixed(2)}"></i>
      ${[25, 50, 75].map(m => `<span class="tick ${pct * 100 >= m ? 'hit' : ''}" style="left:${100 - m}%"></span>`).join('')}
    </div>
    <div class="debt-meta"><span>${Math.round(pct * 100)}% paid off</span><span>${done ? `Done ${esc(shortDate(d.paidOffAt || todayKey()))}` : month ? `Debt-free ${esc(monthLabel(month))}` : ''}</span></div>
    ${(d.scheduled || []).filter(s => s.date > todayKey()).map(s => `
      <div class="sched-pill"><span>Scheduled <b>${money2(s.amount)}</b> · ${esc(shortDate(s.date))}</span>
        <button class="x" data-act="sched-cancel" data-sid="${s.id}" aria-label="Cancel scheduled payment">✕</button></div>`).join('')}
    ${moneyUi.paying === d.id ? paymentForm(d) : moneyUi.updating === d.id ? updateForm(d) : done ? `
      <div class="row-btns left">
        <button class="btn ghost sm" data-act="update-open">Not paid off? Fix balance</button>
        <button class="btn ghost sm" data-act="debt-edit">Edit</button>
      </div>` : `
      <div class="row-btns left">
        <button class="btn primary sm" data-act="pay-open">Log payment</button>
        <button class="btn ghost sm" data-act="update-open">Update balance</button>
        <button class="btn ghost sm" data-act="debt-edit">Edit</button>
      </div>`}
    ${payHistory(d)}
  </section>`;
}

// Logged payments, newest first, each with a delete button. Opens itself while you're deleting.
function payHistory(d) {
  const list = d.payments || [];
  if (!list.length) return '';
  return `<details class="pay-history" ${moneyUi.historyOpen === d.id ? 'open' : ''}><summary>Payments (${list.length})</summary><ul>${list.slice().reverse().map(p => `
    <li><span>${esc(shortDate(p.date))}</span><b>${money2(p.amount)}</b>${p.extra > 0 ? `<small>${money2(p.extra)} extra</small>` : '<small></small>'}
      <button class="x" data-act="pay-del" data-pid="${p.id}" aria-label="Delete ${money2(p.amount)} payment from ${esc(shortDate(p.date))}">✕</button></li>`).join('')}</ul></details>`;
}

function fullStreak(d) {
  const months = new Set((d.payments || []).map(p => p.date.slice(0, 7)));
  let streak = 0;
  const m = new Date(); m.setDate(1);
  if (!months.has(monthKey(m))) m.setMonth(m.getMonth() - 1);
  while (months.has(monthKey(m))) { streak++; m.setMonth(m.getMonth() - 1); }
  return streak;
}

function fullCard(d) {
  if (moneyUi.editing === d.id) return debtForm(d);
  const thisMonth = monthKey(new Date());
  const paidNow = (d.payments || []).filter(p => p.date.startsWith(thisMonth));
  const streak = fullStreak(d);
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
  return `<div class="full-card ${paidNow.length ? 'is-paid' : ''}" data-id="${d.id}">
    <div class="full-top">
      <span class="full-check" aria-hidden="true">${paidNow.length ? '✓' : ''}</span>
      <div class="full-text">
        <b>${esc(d.name)}</b>
        <small class="muted">${paidNow.length ? `Paid in full for ${monthName}: ${money2(paidNow.reduce((t, p) => t + num(p.amount), 0))}` : `Not paid yet for ${monthName}`}${streak ? ` · ${streak}-month streak` : ''}</small>
      </div>
    </div>
    ${(d.scheduled || []).filter(x => x.date > todayKey()).map(x => `
      <div class="sched-pill"><span>Scheduled <b>${money2(x.amount)}</b> · ${esc(shortDate(x.date))}</span>
        <button class="x" data-act="sched-cancel" data-sid="${x.id}" aria-label="Cancel scheduled payment">✕</button></div>`).join('')}
    ${moneyUi.paying === d.id ? paymentForm(d) : `<div class="row-btns left">
      <button class="btn ${paidNow.length ? 'ghost' : 'primary'} sm" data-act="pay-open">${paidNow.length ? 'Log another payment' : 'Log this month\'s payment'}</button>
      <button class="btn ghost sm" data-act="debt-edit">Edit</button>
    </div>`}
    ${payHistory(d)}
  </div>`;
}

function paymentForm(d) {
  return `<form class="inline-form" data-form="pay" data-id="${d.id}">
    <div class="grid2">
      <label class="field"><span>${d.payInFull ? 'Statement amount paid' : 'Amount paid'}</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${d.payInFull ? '' : num(d.min) || ''}"></label>
      <label class="field"><span>Date</span><input name="date" type="date" value="${todayKey()}"></label>
    </div>
    <p class="muted form-note">Pick a future date to schedule it. It won't change your balance until you confirm it went through.</p>
    <div class="row-btns left"><button class="btn primary sm" type="submit">Save payment</button><button class="btn ghost sm" type="button" data-act="money-cancel">Cancel</button></div>
  </form>`;
}

function updateForm(d) {
  const loans = d.loans && d.loans.length;
  return `<form class="inline-form" data-form="update" data-id="${d.id}">
    <p class="muted">Type the current balance from your statement or app.</p>
    ${loans ? d.loans.map((l, i) => `<label class="field"><span>${esc(l.name || `Loan ${i + 1}`)} (${r1(num(l.apr))}%)</span><input name="loan-${i}" type="number" inputmode="decimal" min="0" step="0.01" value="${num(l.balance)}"></label>`).join('')
      : `<label class="field"><span>Current balance</span><input name="balance" type="number" inputmode="decimal" min="0" step="0.01" value="${debtBalance(d)}"></label>`}
    <label class="check"><input type="checkbox" name="correction"> I typed it wrong before. Fix it without counting it as progress.</label>
    <div class="row-btns left"><button class="btn primary sm" type="submit">Save balance</button><button class="btn ghost sm" type="button" data-act="money-cancel">Cancel</button></div>
  </form>`;
}

function debtForm(d) {
  const x = d || { name: '', type: 'card', balance: '', apr: '', min: '', loans: [] };
  const multi = x.loans && x.loans.length;
  return `<section class="card debt-form-card"><form data-form="debt" data-id="${d ? d.id : ''}">
    <h3>${d ? 'Edit debt' : 'Add a debt'}</h3>
    <div class="grid2">
      <label class="field"><span>Nickname</span><input name="name" required maxlength="40" value="${esc(x.name)}" placeholder="e.g. Chase card, Nelnet"></label>
      <label class="field"><span>Type</span><select name="type">${Object.entries(DEBT_TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <label class="check"><input type="checkbox" name="payInFull" data-act="infull-toggle" ${x.payInFull ? 'checked' : ''}> I pay this off in full every month (like Amex)</label>
    <div class="owed-fields" ${x.payInFull ? 'hidden' : ''}>
    <label class="check"><input type="checkbox" name="multi" data-act="multi-toggle" ${multi ? 'checked' : ''}> This account has several loans (like Nelnet)</label>
    <div class="single-fields" ${multi ? 'hidden' : ''}>
      <div class="grid2">
        <label class="field"><span>Balance</span><input name="balance" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(multi ? '' : x.balance)}"></label>
        <label class="field"><span>Interest rate (APR %)</span><input name="apr" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(multi ? '' : x.apr)}"></label>
      </div>
    </div>
    <div class="loan-fields" ${multi ? '' : 'hidden'}>
      <div class="loan-rows">${(multi ? x.loans : [{}, {}]).map((l, i) => loanRow(l, i)).join('')}</div>
      <button class="btn ghost sm" type="button" data-act="loan-add">+ Add a loan</button>
    </div>
    <label class="field"><span>Monthly payment (minimum)</span><input name="min" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(x.min)}"></label>
    ${d && !d.payInFull ? `<label class="field"><span>Starting balance (where the progress bar starts)</span><input name="startBalance" type="number" inputmode="decimal" min="0" step="0.01" value="${Math.round(num(d.startBalance) * 100) / 100}"></label>
    <p class="muted form-note">Changing the balance here is treated as a correction, not a payment. To start this bar fresh, set the starting balance to the same number as the balance.</p>` : ''}
    </div>
    <p class="muted form-note infull-note" ${x.payInFull ? '' : 'hidden'}>Paid-in-full cards stay out of your debt plan. Their spending already lives in your must-pays (groceries, gas and so on), so don't add the card there too.</p>
    <div class="row-btns left">
      <button class="btn primary sm" type="submit">${d ? 'Save' : 'Add debt'}</button>
      <button class="btn ghost sm" type="button" data-act="money-cancel">Cancel</button>
      ${d ? '<button class="btn link-danger" type="button" data-act="debt-delete">Delete</button>' : ''}
    </div>
  </form></section>`;
}

function loanRow(l, i) {
  return `<div class="loan-row">
    <input name="loan-name" maxlength="30" placeholder="Loan ${i + 1}" value="${esc(l.name || '')}" aria-label="Loan name">
    <input name="loan-balance" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Balance" value="${esc(l.balance || '')}" aria-label="Loan balance">
    <input name="loan-apr" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Rate %" value="${esc(l.apr || '')}" aria-label="Loan rate">
  </div>`;
}

function renderMoneyWelcome() {
  app.innerHTML = `
    ${moneyTabs('debt')}
    <div class="page-head"><h1 class="page-title">Debt goals</h1><button class="btn ghost sm" data-act="vault-lock">Lock</button></div>
    <section class="card debt-hero">
      <div class="free-date">Let's get you debt-free.</div>
      <ol class="welcome-steps">
        <li><b>Add each debt</b> with its balance, interest rate and monthly payment. For Nelnet, tick "several loans" and list them, or start with the total.</li>
        <li><b>Add your take-home pay</b> and a rough monthly must-pays number.</li>
        <li><b>Log payments</b> and watch every bar shrink.</li>
      </ol>
      <button class="btn primary block" data-act="debt-add">+ Add your first debt</button>
    </section>
    <p class="fineprint">Everything here is encrypted with your password and stays on this device.</p>`;
}

function renderLockScreen() {
  const first = !hasVault();
  app.innerHTML = `
    <section class="card lock-card">
      <div class="lock-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></div>
      <h1 class="h-sm">${first ? 'Set a password' : 'Money'}</h1>
      <p class="muted">${first ? 'This section is private. Your password encrypts everything here on this device. If you forget it, the data can\'t be recovered, so pick something you\'ll remember.' : 'Enter your password to open Spend and Debt goals.'}</p>
      <form data-form="${first ? 'vault-create' : 'vault-unlock'}" class="lock-form">
        <input name="pw" type="password" autocomplete="${first ? 'new-password' : 'current-password'}" required minlength="${first ? 5 : 1}" placeholder="Password" aria-label="Password">
        ${first ? '<input name="pw2" type="password" autocomplete="new-password" required placeholder="Type it again" aria-label="Confirm password">' : ''}
        <button class="btn primary block" type="submit">${first ? 'Create my private space' : 'Unlock'}</button>
        <p class="lock-msg" role="alert"></p>
      </form>
    </section>`;
  const inp = app.querySelector('.lock-form input');
  if (inp) inp.focus();
}

/* ---------- motion: bars shrink, numbers count ---------- */

let moneyPrev = {};   // previous values so a change animates from where it was

function animateMoney() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  app.querySelectorAll('[data-anim-w]').forEach(el => {
    const card = el.closest('[data-id]');
    const keyName = card ? `bar-${card.dataset.id}` : 'bar-total';
    const to = parseFloat(el.dataset.animW);
    const from = moneyPrev[keyName] !== undefined ? moneyPrev[keyName] : to;
    el.style.width = `${from}%`;
    moneyPrev[keyName] = to;
    if (from !== to && !reduce) requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = `${to}%`; }));
    else el.style.width = `${to}%`;
  });
  app.querySelectorAll('.countdown, .countup').forEach(el => {
    const card = el.closest('[data-id]');
    const keyName = card ? `num-${card.dataset.id}` : 'num-total';
    const to = parseFloat(el.dataset.to);
    const from = moneyPrev[keyName] !== undefined ? moneyPrev[keyName] : to;
    moneyPrev[keyName] = to;
    if (from === to || reduce) return;
    const fmtFn = el.classList.contains('countup') ? money : money2;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 1100);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtFn(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---------- events ---------- */

app.addEventListener('click', async e => {
  if (document.body.dataset.section !== 'money') return;
  const t = e.target.closest('[data-act]');
  if (!t || !vault) return;
  const act = t.dataset.act;
  const card = t.closest('[data-id]');
  const id = card && card.dataset.id;

  if (act === 'vault-lock') { lockVault(); renderMoney(); return; }
  if (act === 'debt-add') { moneyUi = { editing: 'new', paying: null, updating: null, adding: true }; renderMoney(); scrollToForm(); }
  if (act === 'debt-edit') { moneyUi = { editing: id, paying: null, updating: null, adding: false }; renderMoney(); scrollToForm(); }
  if (act === 'pay-open') { moneyUi = { editing: null, paying: id, updating: null, adding: false }; renderMoney(); focusIn(id); }
  if (act === 'update-open') { moneyUi = { editing: null, paying: null, updating: id, adding: false }; renderMoney(); focusIn(id); }
  if (act === 'money-cancel') { moneyUi = { editing: null, paying: null, updating: null, adding: false }; renderMoney(); }
  if (act === 'extra-reset') { e.preventDefault(); vault.extra = null; await saveVault(); keepScroll(renderMoney); }
  if (act === 'pay-del') {
    const debt = vault.debts.find(x => x.id === id);
    const p = debt && (debt.payments || []).find(x => x.id === t.dataset.pid);
    if (!p || !confirm(`Delete the ${money2(p.amount)} payment from ${shortDate(p.date)}?`)) return;
    debt.payments = debt.payments.filter(x => x.id !== p.id);
    if (!debt.payInFull) {
      // Put the money back on the balance, but never above where the bar started.
      const room = Math.max(0, num(debt.startBalance) - debtBalance(debt));
      const back = Math.min(num(p.applied !== undefined ? p.applied : p.amount), room || num(p.amount));
      if (debt.loans && debt.loans.length) {
        const total = debtBalance(debt);
        debt.loans.forEach((l, i) => { l.balance = num(l.balance) + (total ? back * num(l.balance) / total : i === 0 ? back : 0); });
      } else debt.balance = debtBalance(debt) + back;
      if (debtBalance(debt) > 0.005) delete debt.paidOffAt;
    }
    moneyUi.historyOpen = debt.id;
    await saveVault(); keepScroll(renderMoney);
    toast('Payment deleted');
  }
  if (act === 'sched-cancel') {
    const debt = vault.debts.find(x => x.id === id);
    debt.scheduled = (debt.scheduled || []).filter(s => s.id !== t.dataset.sid);
    await saveVault(); keepScroll(renderMoney); toast('Scheduled payment removed');
  }
  if (act === 'sched-yes' || act === 'sched-no') {
    const row = t.closest('.due-row');
    const debt = vault.debts.find(x => x.id === row.dataset.debt);
    const s = (debt.scheduled || []).find(x => x.id === row.dataset.sid);
    if (!s) return;
    debt.scheduled = debt.scheduled.filter(x => x.id !== s.id);
    if (act === 'sched-yes') await applyPayment(debt, s.amount, s.date);
    else { await saveVault(); keepScroll(renderMoney); toast('Removed. Log it when it goes through.'); }
  }
  if (act === 'bill-add') {
    vault.bills.push({ id: uid(), name: '', amount: '' });
    await saveVault();
    keepScroll(renderMoney);
    const rows = app.querySelectorAll('.bill-row [data-bill-field="name"]');
    if (rows.length) rows[rows.length - 1].focus({ preventScroll: true });
  }
  if (act === 'bill-del') {
    const bid = t.closest('.bill-row').dataset.bill;
    vault.bills = vault.bills.filter(b => b.id !== bid);
    await saveVault(); keepScroll(renderMoney);
  }
  if (act === 'loan-add') {
    const rows = t.closest('.loan-fields').querySelector('.loan-rows');
    rows.insertAdjacentHTML('beforeend', loanRow({}, rows.children.length));
  }
  if (act === 'debt-delete') {
    const fid = t.closest('form').dataset.id;
    const d = vault.debts.find(x => x.id === fid);
    if (d && confirm(`Delete ${d.name} and its payment history?`)) {
      vault.debts = vault.debts.filter(x => x.id !== fid);
      moneyUi.editing = null;
      await saveVault(); renderMoney();
    }
  }
});

function scrollToForm() { const f = app.querySelector('.debt-form-card'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = f.querySelector('input'); if (i) i.focus({ preventScroll: true }); } }
function focusIn(id) { const c = app.querySelector(`.debt[data-id="${id}"] .inline-form input`); if (c) { c.focus({ preventScroll: true }); c.select && c.select(); } }
function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

app.addEventListener('change', async e => {
  if (document.body.dataset.section !== 'money' || !vault) return;
  const t = e.target;
  if (t.dataset.vault) { vault[t.dataset.vault] = t.value; await saveVault(); keepScroll(renderMoney); }
  if (t.dataset.billField) {
    const bill = vault.bills.find(b => b.id === t.closest('.bill-row').dataset.bill);
    if (!bill) return;
    bill[t.dataset.billField] = t.dataset.billField === 'name' ? t.value.trim() : t.value;
    await saveVault(); keepScroll(renderMoney);
  }
  if (t.dataset.act === 'infull-toggle') {
    const form = t.closest('form');
    form.querySelector('.owed-fields').hidden = t.checked;
    form.querySelector('.infull-note').hidden = !t.checked;
  }
  if (t.dataset.act === 'multi-toggle') {
    const form = t.closest('form');
    form.querySelector('.single-fields').hidden = t.checked;
    form.querySelector('.loan-fields').hidden = !t.checked;
  }
  if (t.dataset.act === 'extra-input' || t.dataset.act === 'extra-slider') { vault.extra = Math.max(0, num(t.value)); await saveVault(); keepScroll(renderMoney); }
});

app.addEventListener('input', e => {
  if (document.body.dataset.section !== 'money' || !vault) return;
  const t = e.target;
  if (t.dataset.act === 'extra-slider') {
    const other = app.querySelector('[data-act="extra-input"]');
    if (other) other.value = t.value;
    const w = document.getElementById('what-if');
    if (w) w.innerHTML = whatIf(num(t.value));
  }
});

app.addEventListener('submit', async e => {
  const f = e.target;
  const form = f.dataset.form;
  if (!form || !['vault-create', 'vault-unlock', 'debt', 'pay', 'update'].includes(form)) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const msg = f.querySelector('.lock-msg');

  if (form === 'vault-create') {
    if (d.pw !== d.pw2) { msg.textContent = 'Those don\'t match. Try again.'; return; }
    if (d.pw.length < 5) { msg.textContent = 'Use at least 5 characters.'; return; }
    msg.textContent = 'Setting up…';
    await createVault(d.pw);
    touchVault(); renderMoney(); toast('Your private space is ready');
    return;
  }
  if (form === 'vault-unlock') {
    msg.textContent = 'Unlocking…';
    try { await unlockVault(d.pw); touchVault(); renderMoney(); }
    catch (err) { msg.textContent = 'That password didn\'t work.'; f.pw.value = ''; f.pw.focus(); }
    return;
  }
  if (!vault) return;

  if (form === 'debt') {
    const multi = !!d.multi;
    const loans = multi ? [...f.querySelectorAll('.loan-row')].map(r => ({
      name: r.querySelector('[name="loan-name"]').value.trim(),
      balance: num(r.querySelector('[name="loan-balance"]').value),
      apr: num(r.querySelector('[name="loan-apr"]').value),
    })).filter(l => l.balance > 0) : [];
    if (multi && !loans.length && !d.payInFull) { toast('Add at least one loan with a balance'); return; }
    const payInFull = !!d.payInFull;
    if (!payInFull && !(num(d.min) > 0)) { toast('Add the monthly payment'); return; }
    const fields = payInFull
      ? { name: d.name.trim(), type: d.type, payInFull: true, min: 0, loans: [], balance: 0, apr: 0, updated: todayKey() }
      : { name: d.name.trim(), type: d.type, payInFull: false, min: num(d.min), loans, balance: multi ? 0 : num(d.balance), apr: multi ? 0 : num(d.apr), updated: todayKey() };
    const existing = vault.debts.find(x => x.id === f.dataset.id);
    if (existing) {
      // Editing is fixing what you typed, never progress: the starting point moves with the balance
      // so the bar and "% paid off" stay where they were. You can also set the starting balance yourself.
      const before = debtBalance(existing);
      Object.assign(existing, fields);
      const after = debtBalance(existing);
      const typedStart = num(d.startBalance);
      const changedStart = typedStart > 0 && Math.abs(typedStart - num(existing.startBalance)) > 0.005;
      existing.startBalance = Math.max(after, changedStart ? typedStart : after + paidSoFar(existing));
      if (after > 0.005) delete existing.paidOffAt;
    } else {
      const debt = { id: uid(), created: todayKey(), payments: [], ...fields };
      debt.startBalance = debtBalance(debt);
      vault.debts.push(debt);
    }
    moneyUi = { editing: null, paying: null, updating: null, adding: false };
    await saveVault(); renderMoney();
    return;
  }

  const debt = vault.debts.find(x => x.id === f.dataset.id);
  if (!debt) return;

  if (form === 'update') {
    const before = debtBalance(debt);
    if (debt.loans && debt.loans.length) debt.loans.forEach((l, i) => { l.balance = num(d[`loan-${i}`]); });
    else debt.balance = num(d.balance);
    const after = debtBalance(debt);
    const correction = !!d.correction;
    debt.updated = todayKey();
    if (correction) {
      // A typo fix: shift the starting point too, so it doesn't count as paying anything off.
      debt.startBalance = after + paidSoFar(debt);
    } else {
      debt.history = [...(debt.history || []), { date: todayKey(), from: before, to: after }];
      if (after > num(debt.startBalance)) debt.startBalance = after;
    }
    if (after > 0.005) delete debt.paidOffAt;
    else if (!correction) debt.paidOffAt = todayKey();
    moneyUi.updating = null;
    await saveVault(); keepScroll(renderMoney);
    if (correction) toast('Balance corrected');
    else celebrate(debt, before, after, null);
    return;
  }

  if (form === 'pay') {
    const amount = num(d.amount);
    if (amount <= 0) return;
    const date = d.date || todayKey();
    moneyUi.paying = null;
    if (date > todayKey()) {
      // A future date is a scheduled payment: it waits until you confirm it went through.
      debt.scheduled = [...(debt.scheduled || []), { id: uid(), date, amount }].sort((a, b) => a.date.localeCompare(b.date));
      await saveVault(); keepScroll(renderMoney);
      toast(`Scheduled ${money2(amount)} for ${shortDate(date)}`);
      return;
    }
    await applyPayment(debt, amount, date);
  }
});

async function applyPayment(debt, amount, date) {
  if (debt.payInFull) {
    debt.payments = [...(debt.payments || []), { id: uid(), date, amount, extra: 0 }];
    await saveVault(); keepScroll(renderMoney);
    const streak = fullStreak(debt);
    toast(`${debt.name} paid in full${streak > 1 ? ` · ${streak} months in a row` : ''} ✓`);
    if (streak && streak % 6 === 0) confetti();
    return;
  }
  const before = debtBalance(debt);
  const freeBefore = simulate(monthlyPlan().extra, vault.strategy);
  const applied = Math.min(amount, before);
  if (debt.loans && debt.loans.length) {
    // Spread the payment across the loans by balance so the combined rate stays honest.
    const total = before;
    debt.loans.forEach(l => { l.balance = Math.max(0, num(l.balance) - applied * num(l.balance) / total); });
  } else debt.balance = Math.max(0, before - applied);
  debt.payments = [...(debt.payments || []), { id: uid(), date, amount, applied, extra: Math.max(0, amount - num(debt.min)) }];
  const after = debtBalance(debt);
  if (after <= 0.005) debt.paidOffAt = todayKey();
  const freeAfter = simulate(monthlyPlan().extra, vault.strategy);
  await saveVault(); keepScroll(renderMoney);
  celebrate(debt, before, after, freeBefore.stuck || freeAfter.stuck ? 0 : freeBefore.months - freeAfter.months);
}

// Scheduled payments whose date has arrived, waiting for a yes or no.
function duePayments() {
  const due = [];
  vault.debts.forEach(d => (d.scheduled || []).forEach(s => { if (s.date <= todayKey()) due.push({ debt: d, s }); }));
  return due.sort((a, b) => a.s.date.localeCompare(b.s.date));
}

function celebrate(debt, before, after, monthsSooner) {
  const start = num(debt.startBalance) || before;
  const pBefore = start ? (start - before) / start * 100 : 0;
  const pAfter = start ? (start - after) / start * 100 : 0;
  if (after <= 0.005 && before > 0.005) {
    confetti();
    modal(`<div class="celebrate"><div class="paid-stamp">PAID OFF</div><h1>${esc(debt.name)} is gone!</h1><p>That's ${money(start)} you never have to think about again. Its ${money(num(debt.min))} minimum now rolls into your next debt.</p></div>`);
    return;
  }
  const milestone = [75, 50, 25].find(m => pBefore < m && pAfter >= m);
  if (milestone) {
    confetti();
    modal(`<div class="celebrate"><div class="big-num">${milestone}%</div><h1>${esc(debt.name)} is ${milestone}% paid off</h1><p>${milestone === 75 ? 'The finish line is right there.' : milestone === 50 ? 'Halfway. Everything from here is downhill.' : 'A quarter of the way. The snowball is rolling.'}</p></div>`);
    return;
  }
  if (monthsSooner > 0) toast(`Debt-free date moved up ${monthsSooner} month${monthsSooner > 1 ? 's' : ''}!`);
  else if (after < before) toast(`${money2(before - after)} off ${debt.name}`);
}

// Leaving the section locks it again.
window.addEventListener('hashchange', () => {
  if (vault && !location.hash.startsWith('#/money')) lockVault();
});

/* ============================================================
   spending.js — quick expense capture + simple summaries
   Deliberately low-friction: amount + category in two taps.
   (This is where your existing Claude finance tracker can plug
   in later — same data shape, richer views.)
   ============================================================ */

const CATEGORIES = [
  { id: "food",      label: "Food/Shop", emoji: "🛒" },
  { id: "eatingout", label: "Eating out", emoji: "🍕" },
  { id: "transport", label: "Transport", emoji: "🚌" },
  { id: "home",      label: "Home",      emoji: "🏠" },
  { id: "health",    label: "Health",    emoji: "💊" },
  { id: "fun",       label: "Fun",       emoji: "🎉" },
  { id: "other",     label: "Other",     emoji: "📦" },
];

function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

function money(n) {
  return "£" + Number(n || 0).toFixed(2);
}

/* Add an expense and persist. */
function addExpense(db, { amount, category, who, note }) {
  db.expenses.unshift({
    id: uid(),
    amount: Number(amount),
    category,
    who,
    note: note || "",
    date: todayKey(),
    ts: Date.now(),
  });
  saveDB(db);
}

function deleteExpense(db, id) {
  db.expenses = db.expenses.filter((e) => e.id !== id);
  saveDB(db);
}

/* Total spent on a given date key. */
function spentOn(db, dateKey) {
  return db.expenses
    .filter((e) => e.date === dateKey)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

/* Total spent in the last N days (inclusive of today). */
function spentLastDays(db, n) {
  const cutoff = Date.now() - n * 24 * 60 * 60 * 1000;
  return db.expenses
    .filter((e) => e.ts >= cutoff)
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

/* ---- Render the Spending view ---- */
function renderSpendingView(db) {
  const summary = document.getElementById("spendSummary");
  summary.innerHTML = `
    <div class="stat"><div class="stat__label">Today</div><div class="stat__value">${money(spentOn(db, todayKey()))}</div></div>
    <div class="stat"><div class="stat__label">Last 7 days</div><div class="stat__value">${money(spentLastDays(db, 7))}</div></div>
    <div class="stat"><div class="stat__label">Last 30 days</div><div class="stat__value">${money(spentLastDays(db, 30))}</div></div>
  `;

  const list = document.getElementById("expensesList");
  if (!db.expenses.length) {
    list.innerHTML = emptyState("💷", "No expenses yet", "Tap + Add to log your first one. Quick and guilt-free.");
    return;
  }
  list.innerHTML = db.expenses.map((e) => expenseCardHTML(db, e)).join("");
}

function expenseCardHTML(db, e) {
  const cat = categoryById(e.category);
  const p = personById(db, e.who);
  const whoBit = p ? `<span class="tag tag--person" style="--person-colour:${p.colour}">${p.name}</span>` : "";
  const noteBit = e.note ? `<span class="tag">${escapeHTML(e.note)}</span>` : "";
  return `
    <article class="card expense" data-expense="${e.id}">
      <div class="card__main">
        <div>
          <div class="card__title">${cat.emoji} ${cat.label}</div>
          <div class="card__meta">${whoBit}${noteBit}<span class="tag">${formatNiceDate(e.date)}</span></div>
        </div>
        <span class="expense__amt">${money(e.amount)}</span>
      </div>
      <button class="icon-btn" data-del-expense="${e.id}" aria-label="Delete">🗑️</button>
    </article>`;
}

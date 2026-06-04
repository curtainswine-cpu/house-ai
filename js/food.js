/* ============================================================
   food.js — Fridge & Freezer (shared)
   A stock list with use-by dates + gentle "use this soon" nudges
   as things approach their date. Saves in localStorage like the rest.
   ============================================================ */

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - n) / 86400000);
}

function addFood(db, { name, where, useBy }) {
  db.food.items.push({ id: uid(), name, where: where || "fridge", useBy: useBy || null, added: todayKey() });
  saveDB(db);
}
function deleteFood(db, id) {
  db.food.items = db.food.items.filter((i) => i.id !== id);
  saveDB(db);
}

/* Items at or near their use-by (today or the next 2 days, or overdue). */
function foodUseSoon(db) {
  return db.food.items
    .filter((i) => { const d = daysUntil(i.useBy); return d !== null && d <= 2; })
    .sort((a, b) => daysUntil(a.useBy) - daysUntil(b.useBy));
}

function useByTag(useBy) {
  const d = daysUntil(useBy);
  if (d === null) return "";
  if (d < 0) return `<span class="tag tag--due">${-d}d over</span>`;
  if (d === 0) return `<span class="tag tag--due">today</span>`;
  if (d <= 2) return `<span class="tag tag--due">${d}d left</span>`;
  return `<span class="tag">${d}d left</span>`;
}

function foodRow(db, i) {
  return `
    <article class="card routine routine--compact food-item">
      <div class="card__main">
        <div class="card__title">${escapeHTML(i.name)}</div>
        <div class="card__meta">${useByTag(i.useBy)}</div>
      </div>
      <button class="icon-btn" data-del-food="${i.id}" aria-label="Remove">🗑️</button>
    </article>`;
}

/* Count helper for a tab badge if we want it later. */
function foodSoonCount(db) { return foodUseSoon(db).length; }

function renderFood(db) {
  const wrap = document.getElementById("foodBody");
  if (!wrap) return;

  const addForm = `
    <div class="card" style="flex-direction:column;align-items:stretch;gap:12px;margin-bottom:18px">
      <div class="field"><label for="fdName">Add an item</label>
        <input id="fdName" placeholder="e.g. Chicken breasts" /></div>
      <div class="chip-row" id="fdWhere">
        <button class="chip" data-fd-where="fridge" aria-pressed="true">🧊 Fridge</button>
        <button class="chip" data-fd-where="freezer" aria-pressed="false">❄️ Freezer</button>
      </div>
      <div class="field"><label for="fdUseBy">Use by (optional)</label>
        <input id="fdUseBy" type="date" /></div>
      <button class="btn btn--primary btn--block" data-fd-add>Add to list</button>
    </div>`;

  const soon = foodUseSoon(db);
  const soonHTML = soon.length
    ? `<div class="section-label">⏳ Use this soon</div>${soon.map((i) => foodRow(db, i)).join("")}`
    : "";

  const sortByDate = (a, b) => {
    const da = daysUntil(a.useBy), dbb = daysUntil(b.useBy);
    if (da === null) return 1; if (dbb === null) return -1; return da - dbb;
  };
  const freezer = db.food.items.filter((i) => i.where === "freezer").sort(sortByDate);
  const fridge = db.food.items.filter((i) => i.where === "fridge").sort(sortByDate);

  const list = (label, items) =>
    `<div class="section-label">${label}</div>` +
    (items.length ? items.map((i) => foodRow(db, i)).join("")
      : `<p class="goal__hint" style="margin:0 0 6px">Nothing in yet.</p>`);

  wrap.innerHTML = addForm + soonHTML + list("❄️ Freezer", freezer) + list("🧊 Fridge", fridge);
}

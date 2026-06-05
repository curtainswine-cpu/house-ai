/* ============================================================
   food.js — Fridge & Freezer (shared)
   A stock list with use-by dates + gentle "use this soon" nudges
   as things approach their date. Saves in localStorage like the rest.
   ============================================================ */

/* ---- Meal-app bridge: auto-stock the freezer with dishes collected from Mum ----
   Reads the public, read-only `collected_dishes` view from the meal planner's
   Supabase (publishable key only — no private data). */
const MEAL_SUPABASE_URL = "https://jqsizkhasbvsyplgcwjm.supabase.co";
const MEAL_SUPABASE_KEY = "sb_publishable_awfUJeR7Y-JX0K9eYFf6IA_qYn-tmr1";

async function syncCollectedMeals(db) {
  try {
    const res = await fetch(
      `${MEAL_SUPABASE_URL}/rest/v1/collected_dishes?select=id,name,collected_at,portions&order=collected_at.desc`,
      { headers: { apikey: MEAL_SUPABASE_KEY, Authorization: "Bearer " + MEAL_SUPABASE_KEY }, cache: "no-store" }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const dishes = await res.json();
    if (!Array.isArray(db.food.importedIds)) db.food.importedIds = [];
    let added = 0, updated = 0;
    dishes.forEach((d) => {
      if (!d.id) return;
      const qty = Math.max(1, Number(d.portions) || 1);
      const existing = db.food.items.find((i) => i.mealId === d.id);
      if (existing) {
        if (existing.qty !== qty) { existing.qty = qty; updated++; } // mum amended the portions
      } else if (!db.food.importedIds.includes(d.id)) {
        let useBy = null;
        if (d.collected_at) { const dt = new Date(d.collected_at); dt.setDate(dt.getDate() + 90); useBy = todayKey(dt); }
        db.food.items.push({ id: uid(), mealId: d.id, name: d.name || "Meal from Mum", qty, where: "freezer", useBy, added: todayKey(), note: "From Mum's" });
        db.food.importedIds.push(d.id);
        added++;
      }
      // else: previously imported then deleted (used up) — leave it gone
    });
    if (added || updated) saveDB(db);
    return { ok: true, added, updated };
  } catch (e) {
    return { ok: false, error: "network" };
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - n) / 86400000);
}

function addFood(db, { name, where, useBy, qty }) {
  db.food.items.push({ id: uid(), name, where: where || "fridge", useBy: useBy || null, qty: Math.max(1, Number(qty) || 1), added: todayKey() });
  saveDB(db);
}
function deleteFood(db, id) {
  db.food.items = db.food.items.filter((i) => i.id !== id);
  saveDB(db);
}
/* Use one portion — decrement, removing the item when it hits zero. */
function useOneFood(db, id) {
  const i = db.food.items.find((x) => x.id === id);
  if (!i) return;
  i.qty = (i.qty || 1) - 1;
  if (i.qty <= 0) db.food.items = db.food.items.filter((x) => x.id !== id);
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
  const qty = i.qty || 1;
  const qtyTag = qty > 1 ? `<span class="tag tag--time">×${qty}</span>` : "";
  const src = i.note ? `<span class="tag">${escapeHTML(i.note)}</span>` : "";
  const useBtn = qty > 1 ? `<button class="btn btn--mini btn--quiet" data-food-useone="${i.id}">− use one</button>` : "";
  return `
    <article class="card routine routine--compact food-item">
      <div class="card__main">
        <div class="card__title">${escapeHTML(i.name)} ${qtyTag}</div>
        <div class="card__meta">${useByTag(i.useBy)}${src}</div>
      </div>
      ${useBtn}
      <button class="icon-btn" data-del-food="${i.id}" aria-label="Remove">🗑️</button>
    </article>`;
}

/* Count helper for a tab badge if we want it later. */
function foodSoonCount(db) { return foodUseSoon(db).length; }

function renderFood(db) {
  const wrap = document.getElementById("foodBody");
  if (!wrap) return;

  const mealSync = `
    <div class="goal__actions" style="margin-bottom:14px">
      <button class="btn btn--mini" data-fd-sync>↻ Pull in collected meals</button>
      <span class="goal__hint" id="fdSyncStatus" style="align-self:center"></span>
    </div>`;

  const addForm = `
    <div class="card" style="flex-direction:column;align-items:stretch;gap:12px;margin-bottom:18px">
      <div class="field"><label for="fdName">Add an item</label>
        <input id="fdName" placeholder="e.g. Chicken breasts" /></div>
      <div class="chip-row" id="fdWhere">
        <button class="chip" data-fd-where="fridge" aria-pressed="true">🧊 Fridge</button>
        <button class="chip" data-fd-where="freezer" aria-pressed="false">❄️ Freezer</button>
      </div>
      <div class="field"><label for="fdQty">How many?</label>
        <input id="fdQty" type="number" inputmode="numeric" min="1" step="1" value="1" /></div>
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

  wrap.innerHTML = mealSync + addForm + soonHTML + list("❄️ Freezer", freezer) + list("🧊 Fridge", fridge);
}

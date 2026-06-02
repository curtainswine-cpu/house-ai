/* ============================================================
   trackers.js — gentle daily goals (water + steps)
   Tappable, satisfying, resets each day, never guilt-trips.
   Water is logged in-app (tap a glass). Steps come from your
   watch — tap to type the current count when you glance at it.
   ============================================================ */

/* Get (and lazily create) today's tracker row. */
function trackerFor(db, dateKey) {
  if (!db.trackers[dateKey]) db.trackers[dateKey] = { waterMl: 0, steps: 0 };
  return db.trackers[dateKey];
}

function addWater(db, ml) {
  const t = trackerFor(db, todayKey());
  t.waterMl = Math.max(0, t.waterMl + ml);
  saveDB(db);
}

function setSteps(db, n) {
  const t = trackerFor(db, todayKey());
  t.steps = Math.max(0, Math.round(Number(n)) || 0);
  saveDB(db);
}

/* A clamped 0–100 % for a progress bar. */
function pct(value, goal) {
  if (!goal) return 0;
  return Math.max(0, Math.min(100, Math.round((value / goal) * 100)));
}

function litres(ml) {
  return (ml / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/* ---- Render the Today "Daily goals" card ---- */
function renderTodayGoals(db) {
  const wrap = document.getElementById("todayGoals");
  const t = trackerFor(db, todayKey());
  const g = db.goals;

  const waterPct = pct(t.waterMl, g.waterMl);
  const stepsPct = pct(t.steps, g.steps);
  const waterDone = t.waterMl >= g.waterMl;
  const stepsDone = t.steps >= g.steps;

  wrap.innerHTML = `
    <div class="goals">
      <div class="goals__head">Daily goals</div>

      <div class="goal">
        <div class="goal__row">
          <span class="goal__name">💧 Water ${waterDone ? "✓" : ""}</span>
          <span class="goal__val">${litres(t.waterMl)} / ${litres(g.waterMl)} L</span>
        </div>
        <div class="bar"><div class="bar__fill" style="width:${waterPct}%"></div></div>
        <div class="goal__actions">
          <button class="btn btn--mini" data-water="${g.glassMl}">+ Glass</button>
          <button class="btn btn--mini btn--quiet" data-water="${-g.glassMl}">Undo</button>
        </div>
      </div>

      <div class="goal">
        <div class="goal__row">
          <span class="goal__name">👟 Steps ${stepsDone ? "✓" : ""}</span>
          <span class="goal__val">${t.steps.toLocaleString()} / ${g.steps.toLocaleString()}</span>
        </div>
        <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${stepsPct}%"></div></div>
        <div class="goal__actions">
          <button class="btn btn--mini" data-steps-edit>Update from watch</button>
        </div>
      </div>
    </div>`;
}

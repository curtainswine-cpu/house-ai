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

/* ---------- Rest ("do nothing") days ---------- */
function isRestDay(db, dateKey) {
  return !!db.restDays[dateKey];
}
function toggleRestDay(db, dateKey) {
  if (db.restDays[dateKey]) delete db.restDays[dateKey];
  else db.restDays[dateKey] = true;
  saveDB(db);
}

/* ---------- Gym (gentle weekly goal) ---------- */
/* Monday-start week key for a date. */
function weekStartKey(d) {
  d = d || new Date();
  const offset = (d.getDay() + 6) % 7; // 0 = Monday
  return todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
}
function inThisWeek(dateKey) {
  const start = new Date(weekStartKey() + "T00:00:00");
  const end = new Date(start); end.setDate(start.getDate() + 7);
  const d = new Date(dateKey + "T00:00:00");
  return d >= start && d < end;
}
function gymThisWeek(db) {
  return db.gym.sessions.filter(inThisWeek).length;
}
function logGym(db) {
  const today = todayKey();
  if (!db.gym.sessions.includes(today)) db.gym.sessions.push(today);
  saveDB(db);
}
function undoGymToday(db) {
  db.gym.sessions = db.gym.sessions.filter((d) => d !== todayKey());
  saveDB(db);
}

function gymHoursToday(db) {
  const h = db.gym.hours || {};
  const wknd = [0, 6].includes(new Date().getDay());
  return wknd ? h.weekend : h.weekday;
}

function renderTodayGym(db) {
  const wrap = document.getElementById("todayGym");
  const count = gymThisWeek(db);
  const goal = db.gym.perWeek;
  const loggedToday = db.gym.sessions.includes(todayKey());
  const hit = count >= goal;
  const note = count === 0 ? "Ease back in — one session counts."
    : hit ? "Goal smashed this week. 💪"
    : "Nice — keep it gentle.";
  const place = db.gym.place ? `${escapeHTML(db.gym.place)}` : "";
  const hrs = gymHoursToday(db);
  const openLine = (place || hrs)
    ? `<div class="goal__hint">📍 ${place}${hrs ? ` · open today ${hrs}` : ""}</div>`
    : "";
  wrap.innerHTML = `
    <div class="goals">
      <div class="goals__head">Gym · this week</div>
      <div class="goal">
        <div class="goal__row">
          <span class="goal__name">💪 Sessions ${hit ? "✓" : ""}</span>
          <span class="goal__val">${count} / ${goal}</span>
        </div>
        <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pct(count, goal)}%"></div></div>
        <div class="goal__hint">${note}</div>
        ${openLine}
        <div class="goal__actions">
          ${loggedToday
            ? `<button class="btn btn--mini btn--quiet" data-gym-undo>Logged today — undo</button>`
            : `<button class="btn btn--mini" data-gym>I went to the gym 💪</button>`}
        </div>
      </div>
    </div>`;
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
          <button class="btn btn--mini" data-water="${g.glassMl}">+ ${g.glassMl} ml</button>
          <button class="btn btn--mini" data-water-add>+ Add…</button>
          <button class="btn btn--mini btn--quiet" data-water="${-g.glassMl}">− ${g.glassMl}</button>
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

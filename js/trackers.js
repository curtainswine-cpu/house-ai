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

/* ---- One slim "At a glance" card: water, steps, gym ---- */
function renderTodayHealth(db) {
  const wrap = document.getElementById("todayHealth");
  if (!wrap) return;
  const t = trackerFor(db, todayKey());
  const g = db.goals;
  const gymCount = gymThisWeek(db);
  const loggedGymToday = db.gym.sessions.includes(todayKey());

  const row = (emoji, label, value, pctVal, gold, actions, hint) => `
    <div class="glance">
      <div class="glance__top">
        <span class="glance__label">${emoji} ${label}</span>
        <span class="glance__val">${value}</span>
      </div>
      <div class="bar"><div class="bar__fill ${gold ? "bar__fill--gold" : ""}" style="width:${pctVal}%"></div></div>
      ${hint ? `<div class="glance__hint">${hint}</div>` : ""}
      <div class="glance__actions">${actions}</div>
    </div>`;

  const gymHrs = gymHoursToday(db);
  const gymHint = db.gym.place ? `📍 ${escapeHTML(db.gym.place)}${gymHrs ? ` · open today ${gymHrs}` : ""}` : "";

  wrap.innerHTML = `
    <div class="glance-card">
      ${row("💧", "Water", `${litres(t.waterMl)} / ${litres(g.waterMl)} L`, pct(t.waterMl, g.waterMl), false,
        `<button class="btn btn--mini" data-water="${g.glassMl}">+ ${g.glassMl}</button>
         <button class="btn btn--mini btn--quiet" data-water-add>more…</button>
         <button class="btn btn--mini btn--quiet" data-water="${-g.glassMl}">−</button>`)}
      ${row("👟", "Steps", `${t.steps.toLocaleString()} / ${g.steps.toLocaleString()}`, pct(t.steps, g.steps), true,
        `<button class="btn btn--mini btn--quiet" data-steps-edit>update</button>`)}
      ${row("💪", "Gym this week", `${gymCount} / ${db.gym.perWeek}`, pct(gymCount, db.gym.perWeek), true,
        loggedGymToday
          ? `<button class="btn btn--mini btn--quiet" data-gym-undo>logged ✓ · undo</button>`
          : `<button class="btn btn--mini btn--quiet" data-gym>log a session</button>`,
        gymHint)}
    </div>`;
}

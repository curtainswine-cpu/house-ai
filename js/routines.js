/* ============================================================
   routines.js — recurring routines & chores
   Pure-ish helpers + the render functions for the Routines view
   and the Today list. Kept separate so it's easy to find/edit.
   ============================================================ */

const TIME_ORDER = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
const TIME_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", anytime: "Anytime" };

const REPEAT_LABEL = { daily: "Daily", weekly: "Weekly", fortnightly: "Fortnightly", once: "One-off" };

/* Ready-made routines Kirsten can add with one tap (fills gaps the live
   app may be missing). Shown in the "Suggestions" picker. */
const SUGGESTED_ROUTINES = [
  { title: "Put watch on (before work)", timeOfDay: "morning", repeat: "daily", assignedTo: "kirsten", steps: ["Grab watch off charge", "Put it on"] },
  { title: "Put watch on charge", timeOfDay: "evening", repeat: "daily", assignedTo: "kirsten", steps: ["Pop it on charge (~2 hrs) so it's ready for the morning"] },
  { title: "Morning meds + vitamins", timeOfDay: "morning", repeat: "daily", assignedTo: "kirsten", steps: ["Take meds", "Take vitamins", "Big glass of water"] },
  { title: "Kitchen reset", timeOfDay: "evening", repeat: "daily", assignedTo: "either", steps: ["Dishes away", "Wipe surfaces", "Start dishwasher"] },
  { title: "Bins out", timeOfDay: "evening", repeat: "fortnightly", anchorDate: todayKey(), assignedTo: "either", steps: ["Check there's a bin liner ready", "Put the bins out"] },
  { title: "10-minute tidy", timeOfDay: "anytime", repeat: "daily", assignedTo: "either", steps: ["Set a timer", "Just 10 minutes, then stop"] },
];

/* Whole days between two dates, ignoring the time of day. */
function daysBetween(a, b) {
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0 - a0) / 86400000);
}

/* Is this routine due on the given date? */
function isRoutineDue(routine, date) {
  if (routine.repeat === "daily") return true;
  if (routine.repeat === "weekly") return date.getDay() === (routine.repeatDay ?? 1);
  if (routine.repeat === "fortnightly") {
    if (!routine.anchorDate) return false;
    const anchor = new Date(routine.anchorDate + "T00:00:00");
    const diff = daysBetween(anchor, date);
    return diff >= 0 && diff % 14 === 0; // every 2 weeks from the anchor bin day
  }
  if (routine.repeat === "once") return true; // shows until completed
  return true;
}

/* Has this routine been completed today? */
function isDone(db, routineId, dateKey) {
  return !!db.completions[`${routineId}|${dateKey}`];
}

/* Toggle completion for a routine on a date. */
function toggleDone(db, routineId, dateKey) {
  const key = `${routineId}|${dateKey}`;
  if (db.completions[key]) delete db.completions[key];
  else db.completions[key] = true;
  saveDB(db);
}

/* Routines that should appear today, sorted by time of day. */
function routinesForToday(db, date) {
  return db.routines
    .filter((r) => isRoutineDue(r, date))
    .sort((a, b) => (TIME_ORDER[a.timeOfDay] ?? 9) - (TIME_ORDER[b.timeOfDay] ?? 9));
}

function personById(db, id) {
  return db.people.find((p) => p.id === id);
}

/* Build the little coloured "who" tag. "either"/"both" handled gently. */
function whoTag(db, assignedTo) {
  if (assignedTo === "either") return `<span class="tag">Either of us</span>`;
  if (assignedTo === "both")   return `<span class="tag">Both</span>`;
  const p = personById(db, assignedTo);
  if (!p) return "";
  return `<span class="tag tag--person" style="--person-colour:${p.colour}">${p.name}</span>`;
}

/* ---- Render a single routine card ---- */
function routineCardHTML(db, r, dateKey, opts = {}) {
  const done = isDone(db, r.id, dateKey);
  const steps = (opts.showSteps && r.steps && r.steps.length)
    ? `<ul class="steps">${r.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>`
    : "";
  const editBtn = opts.editable
    ? `<button class="icon-btn" data-edit-routine="${r.id}" aria-label="Edit routine">✎</button>`
    : "";
  return `
    <article class="card routine ${done ? "is-done" : ""}" data-routine="${r.id}">
      <button class="check" data-toggle="${r.id}" aria-label="Mark done">✓</button>
      <div class="card__main">
        <div class="card__title">${escapeHTML(r.title)}</div>
        <div class="card__meta">
          ${whoTag(db, r.assignedTo)}
          <span class="tag tag--time">${TIME_LABEL[r.timeOfDay] || "Anytime"}</span>
          <span class="tag">${REPEAT_LABEL[r.repeat] || "Daily"}</span>
        </div>
        ${steps}
      </div>
      ${editBtn}
    </article>`;
}

/* Delete a routine and tidy up its completion history. */
function deleteRoutine(db, id) {
  db.routines = db.routines.filter((r) => r.id !== id);
  Object.keys(db.completions).forEach((k) => {
    if (k.startsWith(id + "|")) delete db.completions[k];
  });
  saveDB(db);
}

/* ---- Render the full Routines view ---- */
function renderRoutinesView(db) {
  const list = document.getElementById("routinesList");
  if (!db.routines.length) {
    list.innerHTML = emptyState("🔁", "No routines yet", "Add the things you do regularly — meds, kitchen reset, bins.");
    return;
  }
  const dateKey = todayKey();
  list.innerHTML = db.routines
    .map((r) => routineCardHTML(db, r, dateKey, { showSteps: true, editable: true }))
    .join("");
}

/* ---- Render today's routines (dashboard) ---- */
function renderTodayRoutines(db) {
  const wrap = document.getElementById("todayRoutines");
  const date = new Date();
  const dateKey = todayKey(date);
  const due = routinesForToday(db, date);

  if (!due.length) {
    wrap.innerHTML = emptyState("✨", "Nothing scheduled", "Enjoy the calm — or add a routine.");
    return;
  }
  wrap.innerHTML = due.map((r) => routineCardHTML(db, r, dateKey, { showSteps: true })).join("");
}

/* Count of done / total for today, used in the summary line. */
function todayProgress(db) {
  const date = new Date();
  const dateKey = todayKey(date);
  const due = routinesForToday(db, date);
  const done = due.filter((r) => isDone(db, r.id, dateKey)).length;
  return { done, total: due.length };
}

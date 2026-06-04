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

function byTime(a, b) { return (TIME_ORDER[a.timeOfDay] ?? 9) - (TIME_ORDER[b.timeOfDay] ?? 9); }
function isSharedTask(r) { return r.area === "cleaning" || r.area === "household"; }

/* All due routines (used by the manage list). */
function routinesForToday(db, date) {
  return db.routines.filter((r) => isRoutineDue(r, date)).sort(byTime);
}
/* MY personal tasks due today (Home screen) — yours + shown to you only. */
function personalTasksToday(db, date) {
  return db.routines
    .filter((r) => r.area === "me" && r.assignedTo === db.activePerson && isRoutineDue(r, date))
    .sort(byTime);
}
/* Shared household chores due today (cleaning + household), for both of you. */
function sharedChoresToday(db, date) {
  return db.routines.filter((r) => isSharedTask(r) && isRoutineDue(r, date)).sort(byTime);
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

/* Which routine cards currently have their steps expanded (Today screen). */
const _expandedRoutines = new Set();

/* ---- Render a single routine card ---- */
function routineCardHTML(db, r, dateKey, opts = {}) {
  const done = isDone(db, r.id, dateKey);
  const hasSteps = r.steps && r.steps.length;

  let stepsBlock = "";
  if (hasSteps) {
    if (opts.compact) {
      // Collapsed by default — a calm one-liner you can tap to open.
      const open = _expandedRoutines.has(r.id);
      const list = open
        ? `<ul class="steps">${r.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>`
        : "";
      stepsBlock = `
        <button class="steps-toggle" data-steps-toggle="${r.id}">
          ${open ? "▾ hide steps" : `▸ ${r.steps.length} step${r.steps.length > 1 ? "s" : ""}`}
        </button>${list}`;
    } else if (opts.showSteps) {
      stepsBlock = `<ul class="steps">${r.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>`;
    }
  }

  const editBtn = opts.editable
    ? `<button class="icon-btn" data-edit-routine="${r.id}" aria-label="Edit routine">✎</button>`
    : "";

  return `
    <article class="card routine ${done ? "is-done" : ""} ${opts.compact ? "routine--compact" : ""}" data-routine="${r.id}">
      <button class="check" data-toggle="${r.id}" aria-label="Mark done">✓</button>
      <div class="card__main">
        <div class="card__title">${escapeHTML(r.title)}</div>
        <div class="card__meta">
          ${whoTag(db, r.assignedTo)}
          ${opts.compact ? "" : `<span class="tag tag--time">${TIME_LABEL[r.timeOfDay] || "Anytime"}</span>`}
        </div>
        ${stepsBlock}
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

/* ---- More → "Your routines": personal ones only (chores live in Cleaning) ---- */
function renderRoutinesView(db) {
  const list = document.getElementById("routinesList");
  if (!list) return;
  const mine = db.routines.filter((r) => r.area === "me");
  if (!mine.length) {
    list.innerHTML = emptyState("🔁", "No personal routines", "Add things like meds, watch, teeth.");
    return;
  }
  const dateKey = todayKey();
  list.innerHTML = mine
    .map((r) => routineCardHTML(db, r, dateKey, { compact: true, editable: true }))
    .join("");
}

/* Render a list of routines grouped by time of day into a container. */
function renderGroupedRoutines(wrap, db, list, dateKey, opts) {
  let html = "", lastGroup = null;
  list.forEach((r) => {
    const g = r.timeOfDay || "anytime";
    if (g !== lastGroup) { html += `<div class="time-group">${TIME_LABEL[g] || "Anytime"}</div>`; lastGroup = g; }
    html += routineCardHTML(db, r, dateKey, opts);
  });
  wrap.innerHTML = html;
}

/* ---- Home: only MY personal tasks for today ---- */
function renderTodayRoutines(db) {
  const wrap = document.getElementById("todayRoutines");
  const date = new Date();
  const due = personalTasksToday(db, date);
  if (!due.length) {
    wrap.innerHTML = emptyState("✨", "Nothing personal today", "Enjoy the calm.");
    return;
  }
  renderGroupedRoutines(wrap, db, due, todayKey(date), { compact: true });
}

/* ---- Home: a quiet "household jobs today" line → taps to Cleaning ---- */
function renderTodayHousehold(db) {
  const wrap = document.getElementById("todayHousehold");
  if (!wrap) return;
  const date = new Date();
  const dateKey = todayKey(date);
  const chores = sharedChoresToday(db, date);
  if (!chores.length) { wrap.innerHTML = ""; return; }
  const doneN = chores.filter((r) => isDone(db, r.id, dateKey)).length;
  wrap.innerHTML = `
    <button class="household-line" data-goto="cleaning">
      🧹 <span>${doneN}/${chores.length} household jobs today</span>
      <span class="household-line__go">›</span>
    </button>`;
}

/* ---- Cleaning tab: shared chores (cleaning + other household) ---- */
function renderCleaning(db) {
  const wrap = document.getElementById("cleaningList");
  if (!wrap) return;
  const dateKey = todayKey();
  const cleaning = db.routines.filter((r) => r.area === "cleaning").sort(byTime);
  const household = db.routines.filter((r) => r.area === "household").sort(byTime);
  if (!cleaning.length && !household.length) {
    wrap.innerHTML = emptyState("🧹", "No household jobs yet", "Add cleaning or chores you share — bins, hoovering, kitchen.");
    return;
  }
  const section = (label, list) => list.length
    ? `<div class="time-group">${label}</div>` +
      list.map((r) => routineCardHTML(db, r, dateKey, { compact: true, editable: true })).join("")
    : "";
  wrap.innerHTML = section("Cleaning", cleaning) + section("Other household", household);
}

/* Count of done / total for MY personal tasks today (Home summary). */
function todayProgress(db) {
  const date = new Date();
  const dateKey = todayKey(date);
  const due = personalTasksToday(db, date);
  const done = due.filter((r) => isDone(db, r.id, dateKey)).length;
  return { done, total: due.length };
}

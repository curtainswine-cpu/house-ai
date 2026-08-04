/* ============================================================
   routines.js — recurring routines & chores
   Pure-ish helpers + the render functions for the Routines view
   and the Today list. Kept separate so it's easy to find/edit.
   ============================================================ */

const TIME_ORDER = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
const TIME_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", anytime: "Anytime" };

const REPEAT_LABEL = { daily: "Daily", weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", once: "One-off", periodic: "Every few weeks" };

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
  if (routine.repeat === "periodic") {
    // Plain fixed-interval fallback — used when nearestDayOff can't be
    // resolved (see resolvePeriodicDayOff, which normally takes over instead).
    if (!routine.anchorDate) return false;
    const anchor = new Date(routine.anchorDate + "T00:00:00");
    const diff = daysBetween(anchor, date);
    const interval = routine.intervalDays || 21;
    return diff >= 0 && diff % interval === 0;
  }
  if (routine.repeat === "monthly") {
    // Same day-of-month as the anchor, every month from then on. Clamped
    // for short months (e.g. anchor day 31 becomes the last day of Feb).
    if (!routine.anchorDate) return false;
    const anchor = new Date(routine.anchorDate + "T00:00:00");
    if (daysBetween(anchor, date) < 0) return false;
    const lastDayThisMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(anchor.getDate(), lastDayThisMonth);
    return date.getDate() === targetDay;
  }
  if (routine.repeat === "once") return true; // shows until completed
  return true;
}

/* Default search window for "nearest day off": the target date itself
   first, then a few days either side, closest first (ties favour the
   earlier day — better to do something a bit early than let it run out). */
const DAYOFF_SEARCH_AROUND = [0, -1, 1, -2, 2, -3, 3, 4];
/* Backward-only: prefer the target day itself; only step earlier (never
   later) if it isn't free. Used for things anchored to a fixed day (e.g.
   "refill the pot on Saturday, or Friday if that's a day off instead"). */
const DAYOFF_SEARCH_BEFORE = [0, -1, -2, -3];

/* Which search window a routine wants — set on the routine itself so each
   one can look around its target date or only earlier, never later. */
function periodicSearchOffsets(r) {
  return r.dayOffSearch === "before" ? DAYOFF_SEARCH_BEFORE : DAYOFF_SEARCH_AROUND;
}

/* For a "periodic" routine with nearestDayOff, work out which day off falls
   closest to this cycle's target date (e.g. ~3 weeks after the anchor).
   Falls back to the plain target date if no day-off data is available yet
   (calendar not connected, or nothing known within the search window).
   cycleOffset lets a caller look ahead to a future cycle (e.g. 1 = "the one
   after this one") without touching the routine's own due-date logic. */
function resolvePeriodicDayOff(db, r, refDate, cycleOffset, offsets) {
  const interval = r.intervalDays || 21;
  const anchor = new Date((r.anchorDate || todayKey()) + "T00:00:00");
  const diff = Math.max(0, daysBetween(anchor, refDate));
  const cycleIndex = Math.floor(diff / interval) + (cycleOffset || 0);
  const target = new Date(anchor);
  target.setDate(target.getDate() + cycleIndex * interval);

  for (const o of (offsets || periodicSearchOffsets(r))) {
    const d = new Date(target);
    d.setDate(d.getDate() + o);
    const dk = todayKey(d);
    if (typeof ownerOffOnDate === "function" && ownerOffOnDate(db, dk)) return dk;
  }
  return todayKey(target);
}

/* Has this routine been completed today? */
function isDone(db, routineId, dateKey) {
  return !!db.completions[`${routineId}|${dateKey}`];
}

/* A one-off completed on an EARLIER day is finished — it shouldn't come back.
   (It still shows, ticked, for the rest of the day it was done.) */
function onceFinished(db, r, dateKey) {
  if (r.repeat !== "once") return false;
  return Object.keys(db.completions).some((k) => k.startsWith(r.id + "|") && k !== `${r.id}|${dateKey}`);
}

/* Due on this date AND not a finished one-off. */
function isDueOn(db, r, date) {
  if (r.repeat === "periodic" && r.nearestDayOff) {
    return todayKey(date) === resolvePeriodicDayOff(db, r, date);
  }
  return isRoutineDue(r, date) && !onceFinished(db, r, todayKey(date));
}

/* Is this personal-area task this person's? ("either"/"both" show for both) */
function isPersonalFor(r, personId) {
  return r.area === "me" &&
    (r.assignedTo === personId || r.assignedTo === "either" || r.assignedTo === "both");
}

/* Toggle completion for a routine on a date. */
function toggleDone(db, routineId, dateKey) {
  const key = `${routineId}|${dateKey}`;
  const marking = !db.completions[key]; // ticking on, not undoing
  if (db.completions[key]) delete db.completions[key];
  else db.completions[key] = true;

  // A "periodic" routine flagged rollOnTick (bookings, repeat orders — things
  // where WHEN you actually did it matters) rolls its cycle forward from
  // whenever it's ticked, so the next occurrence counts from the real date.
  // Fixed-cadence ones (e.g. an every-other-day supplement) are NOT flagged —
  // missing a dose shouldn't shift the whole schedule, it should just stay on
  // its calendar rhythm and catch up next scheduled day.
  if (marking) {
    const r = db.routines.find((x) => x.id === routineId);
    if (r && r.repeat === "periodic" && r.rollOnTick) r.anchorDate = dateKey;
    if (r && isSharedTask(r)) {
      spawnFollowUp(db, r);
      awardXp(db, db.activePerson, choreXpForRoutine(r)); // whoever actually ticked it
    }
    if (r) { const xp = selfCareXpForRoutine(r); if (xp) awardXp(db, db.activePerson, xp); }
  }
  saveDB(db);
}

/* Chore XP — a bigger one-off (declutter/deep-clean) job earns more than a
   quick recurring tick, same split as the room time-estimate. */
function choreXpForRoutine(r) { return r.repeat === "once" ? 10 : 5; }

/* ---- Follow-up rules: completing certain jobs quietly creates the next
   one, so she doesn't have to remember to add it herself. A small named
   lookup, not a general engine — only these specific, real chains. ---- */
const FOLLOWUP_RULES = {
  "Change bedding": (db) => addLaundryLoad(db, "Bedding"),
  "Change towels": (db) => addLaundryLoad(db, "Towels"),
  "Wash dog bedding": (db) => addLaundryLoad(db, "Dog bedding"),
};
function spawnFollowUp(db, r) {
  const rule = FOLLOWUP_RULES[r.title];
  if (rule) rule(db);
}

function byTime(a, b) { return (TIME_ORDER[a.timeOfDay] ?? 9) - (TIME_ORDER[b.timeOfDay] ?? 9); }
function isSharedTask(r) { return r.area === "cleaning" || r.area === "household"; }

/* All due routines (used by the manage list). */
function routinesForToday(db, date) {
  return db.routines.filter((r) => isDueOn(db, r, date)).sort(byTime);
}
/* MY personal tasks due today (Home screen) — yours + shown to you only. */
function personalTasksToday(db, date) {
  return db.routines
    .filter((r) => isPersonalFor(r, db.activePerson) && isDueOn(db, r, date))
    .sort(byTime);
}
/* Shared household chores due today (cleaning + household), for both of you. */
function sharedChoresToday(db, date) {
  return db.routines.filter((r) => isSharedTask(r) && isDueOn(db, r, date)).sort(byTime);
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
  return `<span class="tag tag--person" style="--person-colour:${p.colour}">${escapeHTML(p.name)}</span>`;
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

/* ---- Manage → Routines: person-aware dispatch ---- */
function renderRoutinesView(db) {
  const h2 = document.querySelector("#view-manage .view__head h2");
  if (h2) h2.textContent = db.activePerson === "kirsten" ? "Day plan" : "Routines";
  if (db.activePerson === "kirsten") renderKirstenPlanner(db);
  else renderJackFreeflow(db);
}

/* Format "14:30" → "2:30 pm" */
function formatTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* Pick the right clock time for a routine based on today's shift type.
   Falls back: night → v.night → r.time; work → v.work → r.time; off → v.off → r.time */
function resolveTime(r, shiftType) {
  const v = r.timeVariants || {};
  if (shiftType === "night" || shiftType === "postnight") return v.night || r.time || null;
  if (!shiftType || shiftType === "off" || shiftType === "annualleave") return v.off || r.time || null;
  return v.work || r.time || null; // longday, early, late, work
}

/* Get today's shift type from calendar.js (which must already be loaded). */
function currentShiftType(db) {
  if (typeof todayShift !== "function") return null;
  const s = todayShift(db);
  return s ? s.type : null;
}

/* For a "periodic" nearestDayOff routine, a heads-up about when to book the
   NEXT occurrence — shown alongside today's card so she can book ahead
   instead of waiting to be reminded again in 3 weeks. */
function periodicSuggestOpts(db, r) {
  if (r.repeat !== "periodic" || !r.nearestDayOff) return {};
  const nextDate = resolvePeriodicDayOff(db, r, new Date(), 1);
  const label = typeof formatNiceDate === "function" ? formatNiceDate(nextDate) : nextDate;
  return { suggestedDate: label };
}

/* Compact card for the planner — check + title + steps toggle + edit.
   opts.nextUp = true marks it as the first undone item in the active band.
   opts.suggestedDate, if set, shows a booking-ahead hint under the title. */
function plannerCardHTML(db, r, dateKey, opts = {}) {
  const done = isDone(db, r.id, dateKey);
  const isNextUp = !done && !!opts.nextUp;
  const hasSteps = r.steps && r.steps.length;
  const open = _expandedRoutines.has(r.id);
  const stepsBlock = hasSteps
    ? `<button class="steps-toggle" data-steps-toggle="${r.id}">${
        open ? "▾ hide steps" : `▸ ${r.steps.length} step${r.steps.length > 1 ? "s" : ""}`
      }</button>${open ? `<ul class="steps">${r.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>` : ""}`
    : "";
  const suggestBlock = opts.suggestedDate
    ? `<div class="planner__suggest-date">📅 Suggested next booking: ${escapeHTML(opts.suggestedDate)}</div>`
    : "";
  return `
    <article class="card routine routine--compact planner__card ${done ? "is-done" : ""} ${isNextUp ? "is-next-up" : ""}" data-routine="${r.id}">
      <button class="check" data-toggle="${r.id}" aria-label="Mark done">✓</button>
      <div class="card__main">
        <div class="card__title">${escapeHTML(r.title)}</div>
        ${stepsBlock ? `<div style="margin-top:4px">${stepsBlock}</div>` : ""}
        ${suggestBlock}
      </div>
      <button class="icon-btn" data-edit-routine="${r.id}" aria-label="Edit">✎</button>
    </article>`;
}

/* ---- Kirsten: shift-aware day planner ---- */
function renderKirstenPlanner(db) {
  const list = document.getElementById("routinesList");
  if (!list) return;
  const dateKey = todayKey();
  // Only HER tasks, and only ones actually due today (weekly/fortnightly
  // items appear on their day, finished one-offs stay gone).
  const mine = db.routines.filter((r) =>
    isPersonalFor(r, db.activePerson) && isDueOn(db, r, new Date()));

  if (!mine.length) {
    list.innerHTML = emptyState("📅", "Your day plan is empty", "Tap '+ Add something' in any section to build your daily schedule.");
    return;
  }

  const shiftType = currentShiftType(db);
  const isNight = shiftType === "night";
  const isPostnight = shiftType === "postnight";

  /* Band layout — nights flip morning ↔ evening so the schedule reads
     chronologically: pre-work evening first, then post-shift morning. */
  const BANDS = isNight ? [
    { keys: ["evening", "afternoon"], label: "Before work",  addKey: "evening", hours: [12, 24] },
    { keys: ["morning"],              label: "Before sleep", addKey: "morning", hours: [0,  12] },
  ] : isPostnight ? [
    { keys: ["morning"],   label: "Before sleep",  addKey: "morning",   hours: [0,  12] },
    { keys: ["afternoon"], label: "Afternoon",      addKey: "afternoon", hours: [12, 18] },
    { keys: ["evening"],   label: "Evening",        addKey: "evening",   hours: [18, 24] },
  ] : [
    // Morning starts at midnight so very early times (e.g. 5:45 before an
    // early shift) still land in a band instead of vanishing.
    { keys: ["morning"],   label: "Morning",   addKey: "morning",   hours: [0,  12] },
    { keys: ["afternoon"], label: "Afternoon", addKey: "afternoon", hours: [12, 18] },
    { keys: ["evening"],   label: "Evening",   addKey: "evening",   hours: [18, 24] },
  ];

  let html = "";

  /* Shift context note — tells you which set of times you're looking at */
  const SHIFT_NOTE = {
    night:       "🌙 Night shift — showing your pre-work and post-shift routine.",
    postnight:   "😴 Post-night — focus on rest. Just the essentials before sleep.",
    off:         "🎉 Day off — your relaxed times.",
    annualleave: "🏖️ Annual leave — your relaxed times.",
    longday:     "💪 Long day — your earlier work times.",
    early:       "🌅 Early shift — your early times today.",
    late:        "🌆 Late shift — your times for today.",
    work:        "🏥 Work day — your work times.",
  };
  if (shiftType && SHIFT_NOTE[shiftType]) {
    html += `<div class="planner__shift-note">${SHIFT_NOTE[shiftType]}</div>`;
  }

  /* Work out which band is "now" vs past vs future based on the current hour */
  const nowHour = new Date().getHours();
  let activeIndex = -1;
  BANDS.forEach((band, i) => {
    if (nowHour >= band.hours[0] && nowHour < band.hours[1]) activeIndex = i;
  });

  /* Anytime routines: timeOfDay = "anytime" with no resolved clock time.
     These are always shown at full opacity — they're relevant any time. */
  const anytime = mine.filter((r) => {
    return (r.timeOfDay === "anytime" || !r.timeOfDay) && !resolveTime(r, shiftType);
  });
  if (anytime.length) {
    html += `<div class="planner__band" data-band="anytime">
      <div class="planner__band-label">Anytime</div>
      <div class="planner__flex-group">${anytime.map((r) => plannerCardHTML(db, r, dateKey, periodicSuggestOpts(db, r))).join("")}</div>
      <button class="planner__add-btn link-btn" data-add-at-band="anytime">+ Add</button>
    </div>`;
  }

  /* One global "next up" tracker — first undone item in the active band */
  let nextUpFound = false;

  BANDS.forEach((band, i) => {
    const isActive = i === activeIndex;
    // Past = listed before the active band AND its hours have actually gone by.
    // (On nights the "Before work" band sits first but covers the evening — at
    // 10am it's still ahead of you, so it must not be dimmed.)
    const isPast   = activeIndex > -1 && i < activeIndex && nowHour >= band.hours[1];

    /* Flexible routines: timeOfDay matches this band, no resolved time today */
    const flex = mine.filter((r) => {
      if (resolveTime(r, shiftType)) return false;
      return band.keys.includes(r.timeOfDay || "anytime");
    });

    /* Timed routines: resolved clock time falls within this band's hours */
    const timed = mine.filter((r) => {
      const t = resolveTime(r, shiftType);
      if (!t) return false;
      const h = parseInt(t, 10);
      return h >= band.hours[0] && h < band.hours[1];
    }).sort((a, b) =>
      (resolveTime(a, shiftType) || "").localeCompare(resolveTime(b, shiftType) || ""));

    /* Helper: render a card, marking the first undone one in the active band */
    const renderCard = (r, wrapFn) => {
      const done = isDone(db, r.id, dateKey);
      const nextUp = isActive && !done && !nextUpFound;
      if (nextUp) nextUpFound = true;
      return wrapFn(plannerCardHTML(db, r, dateKey, Object.assign({ nextUp }, periodicSuggestOpts(db, r))));
    };

    const bandClasses = ["planner__band", isActive ? "is-active" : "", isPast ? "is-past" : ""].filter(Boolean).join(" ");
    html += `<div class="${bandClasses}" data-band="${band.addKey}">`;
    html += `<div class="planner__band-label">${band.label}</div>`;

    if (!flex.length && !timed.length) {
      html += `<div class="planner__empty">Nothing planned
        <button class="link-btn" data-add-at-band="${band.addKey}">+ Add something</button>
      </div>`;
    } else {
      if (flex.length) {
        html += `<div class="planner__flex-group">`;
        if (timed.length) html += `<div class="planner__flex-label">Flexible time</div>`;
        flex.forEach((r) => { html += renderCard(r, (c) => c); });
        html += `</div>`;
      }
      if (timed.length) {
        if (flex.length) html += `<div class="planner__flex-label">Scheduled</div>`;
        timed.forEach((r) => {
          html += renderCard(r, (c) => `<div class="planner__timed-row">
            <div class="planner__time-pin">${formatTime12(resolveTime(r, shiftType))}</div>
            <div class="planner__event">${c}</div>
          </div>`);
        });
      }
      html += `<button class="planner__add-btn link-btn" data-add-at-band="${band.addKey}">+ Add to ${band.label.toLowerCase()}</button>`;
    }

    html += `</div>`;
  });

  list.innerHTML = html;
}

/* ---- Jack: relaxed free-flow list — no clock times, no strict structure ---- */
function renderJackFreeflow(db) {
  const list = document.getElementById("routinesList");
  if (!list) return;
  // Only JACK's tasks — Kirsten's personal routines stay hers.
  const mine = db.routines.filter((r) =>
    isPersonalFor(r, db.activePerson) && isDueOn(db, r, new Date()));
  if (!mine.length) {
    list.innerHTML = emptyState("🔁", "No personal routines yet", "Add things you do regularly — mornings, evenings, whenever.");
    return;
  }
  const dateKey = todayKey();
  const groups = { morning: [], afternoon: [], evening: [], anytime: [] };
  mine.forEach((r) => { (groups[r.timeOfDay || "anytime"] || groups.anytime).push(r); });
  const order = [["morning","Morning"],["afternoon","Afternoon"],["evening","Evening"],["anytime","Anytime"]];
  let html = `<p class="planner__jack-note">Your routines, your way — no strict schedule.</p>`;
  order.forEach(([key, label]) => {
    if (!groups[key].length) return;
    html += `<div class="time-group">${label}</div>`;
    groups[key].forEach((r) => { html += routineCardHTML(db, r, dateKey, { compact: true, editable: true }); });
  });
  list.innerHTML = html;
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

/* ============================================================
   Cleaning: interactive house blueprint (Kirsten only)
   Default view is Focus Mode — up to 3 priority-ranked jobs, revealed
   one at a time. "See whole house" switches to a clickable blueprint
   where tapping a room opens its full job list.
   ============================================================ */

let _cleaningMode = "focus"; // "focus" | "blueprint"

/* Calm "last done" phrasing — no red/urgent colour, just informative. */
function daysAgoLabel(dateKey) {
  if (!dateKey) return "not logged yet";
  const days = daysBetween(new Date(dateKey + "T00:00:00"), new Date());
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

/* Log a full room clean — stamps today's date and accounts for the rubbish
   a full clean generally turns up (~2 bin bags per room, per her estimate). */
function logFullClean(db, roomId) {
  const room = db.cleaningGame.rooms.find((r) => r.id === roomId);
  if (!room) return;
  room.lastFullClean = todayKey();
  addWasteBags(db, 2);
  saveDB(db);
}

/* Cycle a room's priority green -> amber -> red -> green. Manual only —
   never auto-escalated from days-since-clean (that's a guilt mechanic). */
const PRIORITY_ORDER = ["green", "amber", "red"];
const PRIORITY_LABEL = { green: "🟢 Low priority", amber: "🟠 Medium priority", red: "🔴 High priority" };
function cycleRoomPriority(db, roomId) {
  const room = db.cleaningGame.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const i = PRIORITY_ORDER.indexOf(room.priority);
  room.priority = PRIORITY_ORDER[(i + 1) % PRIORITY_ORDER.length];
  saveDB(db);
}

/* Today's due, not-yet-done jobs for a room. Because a "once" task stays
   due every day until it's actually ticked (see isDueOn), this already
   folds in the room's standing deep-clean/declutter backlog alongside
   whatever's due today from the daily/weekly/monthly rhythm — not just a
   same-day snapshot. */
function roomDueTasks(db, roomId) {
  return db.routines.filter((r) => r.room === roomId && isSharedTask(r) && isDueOn(db, r, new Date()));
}

/* Rough minutes for a task, used only to give a "~20 min left" feel — not
   tracked per-task, so no data migration needed. */
function taskMinutes(r) {
  if (r.repeat === "once") return 25;    // deep-clean / declutter jobs
  if (r.repeat === "monthly") return 15;
  return 8;                              // daily/weekly/fortnightly quick jobs
}

function roomProgress(db, roomId) {
  const dateKey = todayKey();
  const due = roomDueTasks(db, roomId);
  const undone = due.filter((r) => !isDone(db, r.id, dateKey));
  const done = due.length - undone.length;
  const total = due.length;
  return {
    done, total,
    remaining: undone.length,
    pct: total ? Math.round((done / total) * 100) : 100,
    mins: undone.reduce((sum, r) => sum + taskMinutes(r), 0),
  };
}

/* ============================================================
   Laundry — a live stage queue. "Complete washing/drying/folding" from
   the spec isn't modelled as separate tickable tasks (that would just be
   the same load duplicated across two systems) — advancing a load's stage
   IS completing that step. Reaching "away" removes it: an immediate,
   visible win rather than a pile of finished cards to scroll past.
   ============================================================ */
const LAUNDRY_STAGES = ["dirty", "waiting", "washing", "drying", "folded", "away"];
const LAUNDRY_STAGE_LABEL = {
  dirty: "Dirty", waiting: "Waiting to wash", washing: "Washing",
  drying: "Drying", folded: "Folded", away: "Put away",
};
/* A load-per-worn-outfit would add 2 new cards to the queue every single
   day forever — the opposite of calm. Daily wear tallies quietly instead,
   and only becomes an actual load once there's realistically enough for a
   wash (roughly a week per person). */
const DAILY_WEAR_LOAD_THRESHOLD = 6;

function addLaundryLoad(db, type, stage) {
  db.laundry.loads.push({ id: uid(), type, stage: stage || "waiting", createdDate: todayKey() });
}

/* Move a load to its next stage; "away" clears it from the queue entirely. */
function advanceLoadStage(db, loadId) {
  const load = db.laundry.loads.find((l) => l.id === loadId);
  if (!load) return;
  const i = LAUNDRY_STAGES.indexOf(load.stage);
  if (i === -1 || i === LAUNDRY_STAGES.length - 1) {
    db.laundry.loads = db.laundry.loads.filter((l) => l.id !== loadId);
  } else {
    load.stage = LAUNDRY_STAGES[i + 1];
  }
  saveDB(db);
}

/* Move every load currently in `stage` forward one step at once — the
   realistic action is "put a wash on" for the whole waiting pile, not
   tapping each item individually. */
function advanceStageAll(db, stage) {
  db.laundry.loads.filter((l) => l.stage === stage).forEach((l) => advanceLoadStage(db, l.id));
}

function laundryStanding(db) {
  const counts = {};
  LAUNDRY_STAGES.forEach((s) => { counts[s] = 0; });
  db.laundry.loads.forEach((l) => { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  counts.totalActive = db.laundry.loads.length;
  return counts;
}

/* Quietly tallies today's worn outfit for each of you (once per day), and
   turns the tally into a real load once it's worth a wash. */
function ensureDailyWearLaundry(db) {
  const today = todayKey();
  if (db.laundry.lastDailyWearDate === today) return;
  db.laundry.lastDailyWearDate = today;
  ["kirsten", "jack"].forEach((person) => {
    db.laundry.dailyWear[person] = (db.laundry.dailyWear[person] || 0) + 1;
    if (db.laundry.dailyWear[person] >= DAILY_WEAR_LOAD_THRESHOLD) {
      const label = personById(db, person);
      addLaundryLoad(db, `${label ? label.name + "'s" : "Everyday"} clothes`, "waiting");
      db.laundry.dailyWear[person] = 0;
    }
  });
  saveDB(db);
}

/* ============================================================
   Waste — a running estimate of bin bags waiting for a tip run. The
   fortnightly outside-bin-day routine already exists separately; this is
   only for rubbish that's piled up beyond what the normal bin day clears
   (deep cleans mainly), where a car trip becomes worth planning for.
   ============================================================ */
/* Add a shopping item once, wherever "Bits for the house" lives — used by
   automated rules so a triggered need actually reaches the list instead of
   staying invisible until she happens to think of it. Silently does
   nothing if it's already there (dedupe by text, case-insensitive). */
function ensureShoppingItem(db, text) {
  const list = db.shopping.lists.find((l) => l.title === "Bits for the house") || db.shopping.lists[0];
  if (!list) return;
  const already = list.items.some((i) => i.text.toLowerCase() === text.toLowerCase());
  if (!already) list.items.push({ id: uid(), text, done: false });
}

function addWasteBags(db, n) {
  const wasSuggested = tipRunSuggested(db);
  db.waste.outsideBagsWaiting = Math.max(0, db.waste.outsideBagsWaiting + n);
  if (!wasSuggested && tipRunSuggested(db)) ensureShoppingItem(db, "Extra bin bags (tip run building up)");
}
function tipRunSuggested(db) {
  return db.waste.outsideBagsWaiting >= db.waste.carCapacity - 2; // a heads-up before it's actually full
}
function logTipRun(db) {
  db.waste.outsideBagsWaiting = 0;
  db.waste.lastTipRun = todayKey();
  saveDB(db);
}

/* ---- Laundry + waste panel (Kirsten's Cleaning page) ---- */
function laundryWastePanelHTML(db) {
  const counts = laundryStanding(db);
  const stageChip = (stage) => {
    const n = counts[stage];
    if (!n) return "";
    const bulkLabel = { dirty: "Bag it up", waiting: "Start washing", washing: "Move to drying", drying: "Fold it", folded: "Put it away" }[stage];
    return `<div class="laundry-stage">
      <div class="laundry-stage__row">
        <span class="laundry-stage__label">${LAUNDRY_STAGE_LABEL[stage]}</span>
        <span class="laundry-stage__count">${n}</span>
      </div>
      ${bulkLabel ? `<button class="btn btn--mini btn--ghost" data-laundry-advance-all="${stage}">${bulkLabel} (all ${n})</button>` : ""}
    </div>`;
  };
  const stagesHTML = LAUNDRY_STAGES.filter((s) => s !== "away").map(stageChip).join("");

  const waste = db.waste;
  const wasteNote = tipRunSuggested(db)
    ? `<p class="waste-note waste-note--suggest">🚗 ~${waste.outsideBagsWaiting} bags waiting — worth a tip run soon (car holds about ${waste.carCapacity}).</p>`
    : `<p class="waste-note">${waste.outsideBagsWaiting ? `~${waste.outsideBagsWaiting} bag${waste.outsideBagsWaiting === 1 ? "" : "s"} waiting for a tip run.` : "No extra rubbish piled up right now."}</p>`;

  return `
    <div class="ops-panel">
      <button class="ops-panel__head" data-toggle-ops-panel>
        <span>🧺 Laundry &amp; waste</span>
        <span class="ops-panel__sub">${counts.totalActive} load${counts.totalActive === 1 ? "" : "s"} on the go</span>
      </button>
      <div class="ops-panel__body" ${_opsPanelOpen ? "" : "hidden"}>
        ${counts.totalActive ? stagesHTML : `<p style="color:var(--muted);font-size:.85rem;margin:4px 0">Nothing in the wash right now.</p>`}
        <div class="ops-panel__divider"></div>
        ${wasteNote}
        ${waste.outsideBagsWaiting ? `<button class="btn btn--mini btn--ghost" data-log-tip-run>✓ Log a tip run</button>` : ""}
      </div>
    </div>`;
}
let _opsPanelOpen = false;
function renderLaundryWaste(db) {
  const wrap = document.getElementById("laundryWaste");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  ensureDailyWearLaundry(db);
  wrap.innerHTML = laundryWastePanelHTML(db);
}

/* ============================================================
   Self-care character panel (Health page, Kirsten only) — a portrait +
   icon ring + gentle wellbeing gauges. Gauges are computed live from real
   completion history rather than a separate stored value that ticks up
   or down on its own — a decaying stored stat is exactly the shape of bug
   that already bit the periodic-routine rewrite once, and it would mean
   two sources of truth for "did I do this" drifting apart. Only stats
   with a real signal behind them are shown (Hygiene/Health/Hydration) —
   Energy/Mood/Focus aren't backed by any data the app actually has, and
   a made-up number would be worse than no number.
   ============================================================ */
const SELF_CARE = {
  teeth:       { icon: "🦷", label: "Teeth",         titles: ["Brush teeth"], cycleDays: 2, dailyDue: true },
  meds:        { icon: "💊", label: "Meds",          titles: ["Morning meds + vitamins", "Biotin supplement (every other day)", "Magnesium supplement (every other day)", "Iron supplement"], cycleDays: 2, dailyDue: true },
  hairWash:    { icon: "💇", label: "Wash hair",      titles: ["Wash hair"], cycleDays: 10, dailyDue: false },
  hairBrush:   { icon: "💆", label: "Brush hair",     titles: ["Brush hair"], cycleDays: 2, dailyDue: true },
  bath:        { icon: "🛁", label: "Bath",          titles: ["Bath/shower"], cycleDays: 6, dailyDue: false },
  skinOil:     { icon: "✨", label: "Skin oil",       titles: ["Apply skin oil"], cycleDays: 2, dailyDue: true },
  hairDye:     { icon: "🎨", label: "Hair dye",       titles: ["Dye hair"], cycleDays: 183, dailyDue: false },
  shave:       { icon: "🪒", label: "Shave",          titles: ["Shave"], cycleDays: 9, dailyDue: false },
  lashesBrows: { icon: "💅", label: "Lashes/brows",   titles: ["Lash infill + brow wax/tint"], cycleDays: 23, dailyDue: false },
};

/* Home page groups this into three clickable stats — health (meds +
   hydration), hygiene (washing/cleanliness), appearance (grooming/styling
   that's more "how I present" than "am I clean"). */
const STAT_GROUPS = {
  health:     { icon: "❤️", label: "Health",     items: ["meds"], includeHydration: true },
  hygiene:    { icon: "🧼", label: "Hygiene",    items: ["teeth", "bath", "hairWash", "hairBrush"] },
  appearance: { icon: "💄", label: "Appearance", items: ["skinOil", "hairDye", "shave", "lashesBrows"] },
};

function selfCareRoutines(db, key) {
  const titles = SELF_CARE[key].titles;
  return db.routines.filter((r) => titles.includes(r.title));
}

/* Most recent completion date across a set of routine ids, or null. */
function lastCompletedDate(db, routineIds) {
  let latest = null;
  Object.keys(db.completions).forEach((k) => {
    const sep = k.lastIndexOf("|");
    const rid = k.slice(0, sep), dateKey = k.slice(sep + 1);
    if (routineIds.includes(rid) && (!latest || dateKey > latest)) latest = dateKey;
  });
  return latest;
}

/* A calm 40–100 gauge that eases off the more days pass since it was last
   done — never all the way to zero (nothing here should ever read as
   "failing"), and starts at a neutral middle rather than empty if it's
   never been logged at all. */
function recencyGauge(lastDateKey, cycleDays) {
  if (!lastDateKey) return 55;
  const days = daysBetween(new Date(lastDateKey + "T00:00:00"), new Date());
  const frac = Math.max(0, 1 - days / cycleDays);
  return Math.round(40 + frac * 60);
}

function selfCareStatus(db, key) {
  const cfg = SELF_CARE[key];
  const routines = selfCareRoutines(db, key);
  const last = lastCompletedDate(db, routines.map((r) => r.id));
  const dateKey = todayKey();
  const due = cfg.dailyDue && routines.some((r) => isDueOn(db, r, new Date()) && !isDone(db, r.id, dateKey));
  return { last, gauge: recencyGauge(last, cfg.cycleDays), due, routines };
}

function hydrationStat(db) { return pct(trackerFor(db, todayKey()).waterMl, db.goals.waterMl); }

/* Blended 0–100 for a stat group — same "never reads as failing" spirit
   as the individual gauges, just averaged across the group's items. */
function statGroupGauge(db, groupKey) {
  const g = STAT_GROUPS[groupKey];
  const gauges = g.items.map((k) => selfCareStatus(db, k).gauge);
  if (g.includeHydration) gauges.push(hydrationStat(db));
  return Math.round(gauges.reduce((a, b) => a + b, 0) / gauges.length);
}
/* Anything in this group due today and not yet done? (Or hydration short
   of today's goal, for Health.) Drives the small dot on the stat bar. */
function statGroupDue(db, groupKey) {
  const g = STAT_GROUPS[groupKey];
  const itemDue = g.items.some((k) => selfCareStatus(db, k).due);
  const hydrationDue = g.includeHydration && trackerFor(db, todayKey()).waterMl < db.goals.waterMl;
  return itemDue || hydrationDue;
}

/* Self-care XP — additive only. Bath/hair are bigger acts of self-care
   than a quick daily tick, so they earn more. */
function selfCareXpForRoutine(r) {
  const big = ["hairWash", "bath", "hairDye"];   // bigger acts of self-care/appearance
  const small = ["teeth", "meds", "hairBrush", "skinOil", "shave", "lashesBrows"];
  if (big.some((k) => SELF_CARE[k].titles.includes(r.title))) return 15;
  if (small.some((k) => SELF_CARE[k].titles.includes(r.title))) return 5;
  return 0;
}

/* XP — one additive-only pool per person (see db.xp comment in
   storage.js). Level starts at that person's baseLevel (their age, by her
   choice) rather than 1, and climbs from real XP earned — self-care ticks
   for Kirsten, chore ticks for either of you. */
function awardXp(db, personId, n) {
  if (!n) return;
  db.xp[personId] = (db.xp[personId] || 0) + n;
}

const XP_PER_LEVEL = 150;
function personLevel(db, personId) {
  const xp = db.xp[personId] || 0;
  const base = (personById(db, personId) || {}).baseLevel || 1;
  return { level: base + Math.floor(xp / XP_PER_LEVEL), into: xp % XP_PER_LEVEL, span: XP_PER_LEVEL, xp };
}

/* ---- Home hero: full-length portrait + level, with Health/Hygiene/
   Appearance as three tappable bars (not an icon ring — one clear tap
   target per group, opening exactly the jobs in it). ---- */
function characterPanelHTML(db) {
  const lvl = personLevel(db, "kirsten");
  const pctLvl = Math.round((lvl.into / lvl.span) * 100);

  const statBar = (key) => {
    const g = STAT_GROUPS[key];
    const val = statGroupGauge(db, key);
    return `
      <button class="hero-stat" data-statgroup="${key}">
        <div class="hero-stat__row">
          <span>${g.icon} ${g.label}</span>
          <span>${statGroupDue(db, key) ? `<span class="hero-stat__due"></span>` : ""}${val}%</span>
        </div>
        <div class="bar"><div class="bar__fill" style="width:${val}%"></div></div>
      </button>`;
  };

  return `
    <div class="hero-char">
      <div class="hero-char__top">
        <div class="hero-char__portrait">
          <img src="img/people/kirsten-full.jpg" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
          <div class="hero-char__fallback" hidden>K</div>
        </div>
        <div class="hero-char__level">
          <div class="hero-char__level-row">Level ${lvl.level}</div>
          <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pctLvl}%"></div></div>
          <div class="hero-char__level-sub">${lvl.into} / ${lvl.span} XP</div>
        </div>
      </div>
      <div class="hero-char__stats">
        ${statBar("health")}${statBar("hygiene")}${statBar("appearance")}
      </div>
    </div>`;
}

/* ---- Level strip: shown to BOTH of you at the top of Cleaning, quiet and
   compact on purpose (no icon ring, no gauges) — Jack's side of the app
   has deliberately stayed low-key everywhere else, so this only adds the
   one thing asked for: seeing your own level rise as chores get done. ---- */
function levelStripHTML(db, personId) {
  const person = personById(db, personId);
  if (!person) return "";
  const lvl = personLevel(db, personId);
  const pctLvl = Math.round((lvl.into / lvl.span) * 100);
  return `
    <div class="level-strip">
      <div class="level-strip__avatar">
        <img src="img/people/${personId}.jpg" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
        <div class="level-strip__fallback" hidden>${escapeHTML((person.name || "?")[0])}</div>
      </div>
      <div class="level-strip__main">
        <div class="level-strip__row"><span>${escapeHTML(person.name)} · Level ${lvl.level}</span><span>${lvl.into} / ${lvl.span} XP</span></div>
        <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pctLvl}%"></div></div>
      </div>
    </div>`;
}
function renderCleaningLevel(db) {
  const wrap = document.getElementById("cleaningLevel");
  if (!wrap) return;
  wrap.innerHTML = levelStripHTML(db, db.activePerson);
}

function renderCharacterPanel(db) {
  const wrap = document.getElementById("homeCharacter");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  wrap.innerHTML = characterPanelHTML(db);
}

/* Is it a work day? Reused to keep Focus Mode quiet on shift days. */
function isWorkShiftDay(db) {
  return ["longday", "night", "early", "late", "work"].includes(currentShiftType(db));
}

/* Up to 3 due, undone room jobs. One slot is reserved for the next due
   DAILY job (any room) — that can't wait behind a bigger backlog. The rest
   come from the single highest-priority room that still has anything
   outstanding, so focus stays themed to one room rather than scattering
   across the house. */
function focusQueue(db) {
  const dateKey = todayKey();
  const isOpenTask = (r) => r.room && isSharedTask(r) && isDueOn(db, r, new Date()) && !isDone(db, r.id, dateKey);

  const dailyDue = db.routines.filter((r) => isOpenTask(r) && r.repeat === "daily");
  const queue = dailyDue.length ? [dailyDue[0]] : [];

  const priorityRank = { red: 0, amber: 1, green: 2 };
  const rooms = [...db.cleaningGame.rooms].sort((a, b) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));
  for (const room of rooms) {
    if (queue.length >= 3) break;
    const roomTasks = db.routines.filter((r) => r.room === room.id && isOpenTask(r)).sort(byTime);
    for (const r of roomTasks) {
      if (queue.length >= 3) break;
      if (!queue.includes(r)) queue.push(r);
    }
  }

  return queue.slice(0, 3).map((r) => ({ r, room: db.cleaningGame.rooms.find((rm) => rm.id === r.room) }));
}

/* ---- Focus Mode: the default landing state ---- */
function focusModeHTML(db) {
  if (isWorkShiftDay(db)) {
    return `<div class="focus-mode">
      <div class="focus-mode__head">🎯 Today's focus</div>
      <p class="focus-mode__empty">🏥 On shift today — nothing expected. The house can wait. 💙</p>
      <button class="link-btn" data-goto-blueprint>browse the whole house anyway</button>
    </div>`;
  }

  const queue = focusQueue(db);
  if (!queue.length) {
    return `<div class="focus-mode">
      <div class="focus-mode__head">🎯 Today's focus</div>
      <p class="focus-mode__empty">All clear for today. 🎉 Nothing's expected — the house can wait.</p>
      <button class="link-btn" data-goto-blueprint>browse the whole house anyway</button>
    </div>`;
  }

  const { r: task, room } = queue[0];
  const more = queue.length - 1;
  return `<div class="focus-mode">
    <div class="focus-mode__head">🎯 Today's focus</div>
    <div class="focus-mode__room">${room.icon || "🏠"} ${escapeHTML(room.name)}</div>
    <div class="focus-mode__task">${escapeHTML(task.title)}</div>
    <button class="check focus-mode__check" data-toggle="${task.id}" aria-label="Mark done">✓ Done</button>
    ${more ? `<div class="focus-mode__more">${more} more queued after this</div>` : ""}
    <button class="link-btn" data-goto-blueprint>see the whole house</button>
  </div>`;
}

/* ---- Blueprint: a real spatial floor plan per level, one floor at a
   time (a 4-level terrace can't sensibly show all floors at once on a
   phone). Room rectangles are schematic, not measured — there's no floor
   plan on file — but positioned front-to-back the way a narrow terrace
   actually runs, with the stairwell in a fixed spot for orientation. ---- */
const FLOOR_TAB_ORDER = ["Lower Ground Floor", "Ground Floor", "First Floor", "Loft Floor"];
const FLOOR_PLAN_LAYOUT = {
  "Lower Ground Floor": {
    viewBox: "0 0 300 320",
    rooms: { "Kitchen": [20, 20, 260, 280] },
  },
  "Ground Floor": {
    viewBox: "0 0 300 320",
    rooms: {
      "Entryway":    [20, 20, 260, 70],
      "Stairs":      [20, 100, 70, 200],
      "Living Room": [100, 100, 180, 140],
      "Dog Area":    [100, 250, 180, 50],
    },
  },
  "First Floor": {
    viewBox: "0 0 300 320",
    stairwell: [20, 90, 70, 210],
    rooms: {
      "Landing":  [20, 20, 260, 60],
      "Bedroom":  [100, 90, 180, 140],
      "Bathroom": [100, 240, 180, 60],
    },
  },
  "Loft Floor": {
    viewBox: "0 0 300 320",
    rooms: { "Loft": [20, 20, 260, 280] },
  },
};

/* One room's rect + icon + name + live stats, coloured brighter as it's
   completed today (a reward channel) with priority shown as a separate
   small dot (a manual channel) — kept apart so a busy room never reads as
   "wrong", only a quiet room reads as "not started yet". */
function floorPlanRoomHTML(db, room, box) {
  const [x, y, w, h] = box;
  const prog = roomProgress(db, room.id);
  const fillOpacity = (0.08 + (prog.pct / 100) * 0.22).toFixed(2);
  const cx = x + w / 2, cy = y + h / 2;
  const sub = prog.total
    ? `${prog.remaining ? `${prog.remaining} left · ~${prog.mins}m` : "all done today"}`
    : daysAgoLabel(room.lastFullClean);
  return `
    <g class="fp-room" data-open-room="${room.id}" tabindex="0" role="button" aria-label="${escapeHTML(room.name)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="fp-room__rect" style="fill:rgba(70,214,245,${fillOpacity})" />
      <circle cx="${x + w - 14}" cy="${y + 14}" r="5" class="fp-room__dot fp-room__dot--${room.priority || "green"}" />
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="fp-room__icon">${room.icon || "🏠"}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="fp-room__name">${escapeHTML(room.name)}</text>
      <text x="${cx}" y="${cy + 31}" text-anchor="middle" class="fp-room__sub">${escapeHTML(sub)}</text>
    </g>`;
}

function floorPlanSVG(db, floorName) {
  const layout = FLOOR_PLAN_LAYOUT[floorName];
  if (!layout) return "";
  const roomsOnFloor = db.cleaningGame.rooms.filter((r) => r.floor === floorName);
  const stairwell = layout.stairwell
    ? `<rect x="${layout.stairwell[0]}" y="${layout.stairwell[1]}" width="${layout.stairwell[2]}" height="${layout.stairwell[3]}" class="fp-stairwell" />`
    : "";
  const roomsHTML = Object.entries(layout.rooms)
    .map(([name, box]) => { const room = roomsOnFloor.find((r) => r.name === name); return room ? floorPlanRoomHTML(db, room, box) : ""; })
    .join("");
  return `<svg viewBox="${layout.viewBox}" class="fp-svg" preserveAspectRatio="xMidYMid meet">${stairwell}${roomsHTML}</svg>`;
}

let _blueprintFloor = "Ground Floor";
function blueprintHTML(db) {
  const rooms = db.cleaningGame.rooms;
  if (!rooms.length) return "";
  const floorsPresent = FLOOR_TAB_ORDER.filter((f) => rooms.some((r) => r.floor === f));
  if (!floorsPresent.includes(_blueprintFloor)) _blueprintFloor = floorsPresent[0];

  const tabs = floorsPresent.map((f) =>
    `<button class="fp-tab" data-blueprint-floor="${escapeAttr(f)}" aria-pressed="${f === _blueprintFloor}">${escapeHTML(f.replace(" Floor", ""))}</button>`
  ).join("");

  return `
    <button class="link-btn" data-goto-focus>‹ back to today's focus</button>
    <div class="fp-tabs" role="tablist">${tabs}</div>
    <div class="fp-wrap">${floorPlanSVG(db, _blueprintFloor)}</div>`;
}

function renderCleaningHouse(db) {
  const wrap = document.getElementById("cleaningHouse");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  if (!db.cleaningGame.rooms.length) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = _cleaningMode === "blueprint" ? blueprintHTML(db) : focusModeHTML(db);
}

/* ---- Cleaning tab: shared chores (cleaning + other household) ----
   Jack sees the full flat list, unchanged. Kirsten sees only jobs NOT
   tagged to a room here — room-tagged ones live inside their room card. */
function renderCleaning(db) {
  const wrap = document.getElementById("cleaningList");
  if (!wrap) return;
  const dateKey = todayKey();
  const isKirsten = db.activePerson === "kirsten";
  const cleaning = db.routines.filter((r) => r.area === "cleaning" && (!isKirsten || !r.room)).sort(byTime);
  const household = db.routines.filter((r) => r.area === "household" && (!isKirsten || !r.room)).sort(byTime);
  if (!cleaning.length && !household.length) {
    wrap.innerHTML = isKirsten ? "" : emptyState("🧹", "No household jobs yet", "Add cleaning or chores you share — bins, hoovering, kitchen.");
    return;
  }
  const section = (label, list) => list.length
    ? `<div class="time-group">${label}</div>` +
      list.map((r) => routineCardHTML(db, r, dateKey, { compact: true, editable: true })).join("")
    : "";
  wrap.innerHTML = section(isKirsten ? "Other jobs" : "Cleaning", cleaning) + section("Other household", household);
}

/* ---- Jack's task load panel (shown to Kirsten on the Cleaning page) ----
   Lets Kirsten see what Jack has been allocated before piling more on. */
function renderJackLoad(db) {
  const wrap = document.getElementById("jackLoad");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }

  const jackTasks = db.routines.filter((r) => r.area === "me" && r.assignedTo === "jack");
  const dateKey = todayKey();
  const doneCount = jackTasks.filter((r) => isDone(db, r.id, dateKey)).length;

  let html = `<div class="jack-load">
    <div class="jack-load__head">
      <span class="jack-load__label">💛 Jack's tasks</span>
      <span class="jack-load__count">${jackTasks.length ? `${jackTasks.length} allocated · ${doneCount} done today` : "nothing yet"}</span>
    </div>`;

  if (!jackTasks.length) {
    html += `<p class="jack-load__empty">Nothing allocated to Jack personally yet. Add something so you can see his load before piling more on.</p>`;
  } else {
    jackTasks.forEach((r) => {
      const done = isDone(db, r.id, dateKey);
      html += `<div class="jack-load__item ${done ? "is-done" : ""}">
        <span class="jack-load__item-title">${escapeHTML(r.title)}</span>
        <button class="icon-btn" data-edit-routine="${r.id}" aria-label="Edit">✎</button>
      </div>`;
    });
  }

  html += `<button class="btn btn--ghost btn--block jack-load__alloc" data-allocate-jack>+ Allocate something to Jack</button>
  </div>`;

  wrap.innerHTML = html;
}

/* Count of done / total for MY personal tasks today (Home summary). */
function todayProgress(db) {
  const date = new Date();
  const dateKey = todayKey(date);
  const due = personalTasksToday(db, date);
  const done = due.filter((r) => isDone(db, r.id, dateKey)).length;
  return { done, total: due.length };
}

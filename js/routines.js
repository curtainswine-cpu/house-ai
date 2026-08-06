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

/* Chore XP — picked explicitly per job at creation time (see the intensity
   chips in openRoutineModal) rather than guessed from repeat frequency.
   Jobs created before intensity existed fall back to the old flat rule. */
const CLEANING_INTENSITY_XP = { light: 5, medium: 10, hard: 20, intensive: 35 };
const CLEANING_INTENSITY_LABEL = { light: "Light", medium: "Medium", hard: "Hard", intensive: "Intensive" };
function choreXpForRoutine(r) {
  if (r.intensity && CLEANING_INTENSITY_XP[r.intensity] != null) return CLEANING_INTENSITY_XP[r.intensity];
  return r.repeat === "once" ? 10 : 5;
}

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
/* True for anything already tracked on the Health/Hygiene/Appearance bar
   pages (teeth, meds, bath, skin oil…) — kept out of Mini missions so it
   isn't a job in two places at once; tick it from its bar page instead. */
function isSelfCareRoutine(r) {
  return Object.values(SELF_CARE).some((cfg) => cfg.titles.includes(r.title));
}

/* MY personal tasks due today (Home screen) — yours + shown to you only,
   minus anything already covered by a bar-tracked group. */
function personalTasksToday(db, date) {
  return db.routines
    .filter((r) => isPersonalFor(r, db.activePerson) && isDueOn(db, r, date) && !isSelfCareRoutine(r))
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
  watch:       { icon: "⌚", label: "Watch",          titles: ["Put watch on (before work)", "Put watch on charge"], cycleDays: 2, dailyDue: true },
  medsReorder: { icon: "📦", label: "Order meds",     titles: ["Order anxiety medication (repeat prescription)"], cycleDays: 21, dailyDue: true },
  medsPot:     { icon: "💊", label: "Refill pot",     titles: ["Refill meds pot (3 weeks)"], cycleDays: 21, dailyDue: true },
  mumsMeals:   { icon: "🍳", label: "Mum's meal planning", titles: ["Photograph a cookbook"], cycleDays: 30, dailyDue: true },
};

/* Home page groups this into three clickable stats — health (meds +
   hydration + meds logistics + meal planning), hygiene (washing/
   cleanliness), appearance (grooming/styling — "how I present", which
   turns out to include the watch, by her own call). */
const STAT_GROUPS = {
  health:     { icon: "❤️", label: "Health",     items: ["meds", "medsReorder", "medsPot", "mumsMeals"], includeHydration: true },
  hygiene:    { icon: "🧼", label: "Hygiene",    items: ["teeth", "bath", "hairWash", "hairBrush"] },
  appearance: { icon: "💄", label: "Appearance", items: ["skinOil", "hairDye", "shave", "lashesBrows", "watch"] },
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

/* ---- Medication: one tick for everything due today. All her supplements
   and meds live in a single self-filled dosette compartment per day, so
   the real-world action is one tick, not four separate ones — the
   underlying routines (different cadences: daily / every-other-day /
   Saturdays-only) still exist individually for the refill checklist and
   Mini missions, this just bulk-actions whichever of them are due today. */
function medsTakenToday(db) {
  const due = selfCareRoutines(db, "meds").filter((r) => isDueOn(db, r, new Date()));
  return { due, allDone: due.length > 0 && due.every((r) => isDone(db, r.id, todayKey())) };
}
function toggleMedsToday(db) {
  const { due, allDone } = medsTakenToday(db);
  const dateKey = todayKey();
  due.forEach((r) => {
    const isDoneNow = isDone(db, r.id, dateKey);
    if (allDone === isDoneNow) toggleDone(db, r.id, dateKey); // mark all done, or undo all if already all done
  });
}

/* ---- Hygiene/Appearance: tap ticks the next undone item in that
   category; once everything's done, tapping again undoes the most
   recent one (a quick way back if it was a mis-tap). Works the same for
   single-routine categories (bath, skin oil…) and multi-routine ones
   (teeth: AM then PM). */
function tickNextInCategory(db, key) {
  const routines = selfCareRoutines(db, key).sort(byTime);
  const dateKey = todayKey();
  const undone = routines.filter((r) => !isDone(db, r.id, dateKey));
  if (undone.length) { toggleDone(db, undone[0].id, dateKey); return; }
  if (routines.length) toggleDone(db, routines[routines.length - 1].id, dateKey);
}

/* ---- Stat detail pages (real views now, not modals) ---- */
function categoryTileHTML(db, key) {
  const cfg = SELF_CARE[key];
  const routines = selfCareRoutines(db, key);
  const dateKey = todayKey();
  const allDone = routines.length > 0 && routines.every((r) => isDone(db, r.id, dateKey));
  const status = selfCareStatus(db, key);
  const sub = allDone ? "done today ✓" : (status.last ? daysAgoLabel(status.last) : "not logged yet");
  return `
    <button class="nav-tile ${allDone ? "is-done" : ""}" data-cat-tick="${key}">
      <span class="nav-tile__icon">${cfg.icon}</span>
      <span class="nav-tile__label">${cfg.label}</span>
      <span class="nav-tile__sub">${sub}</span>
    </button>`;
}

function renderStatHealthPage(db) {
  const wrap = document.getElementById("statHealthBody");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  const meds = medsTakenToday(db);

  wrap.innerHTML = `
    <button class="nav-tile ${meds.allDone ? "is-done" : ""}" data-meds-tick>
      <span class="nav-tile__icon">💊</span>
      <span class="nav-tile__label">Medication</span>
      <span class="nav-tile__sub">${meds.allDone ? "taken today ✓" : meds.due.length ? `${meds.due.length} due today` : "nothing due today"}</span>
    </button>
    ${categoryTileHTML(db, "medsPot")}
    ${categoryTileHTML(db, "medsReorder")}
    ${categoryTileHTML(db, "mumsMeals")}
  `;
}

function renderStatHygienePage(db) {
  const wrap = document.getElementById("statHygieneBody");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  wrap.innerHTML = STAT_GROUPS.hygiene.items.map((k) => categoryTileHTML(db, k)).join("");
}

function renderStatAppearancePage(db) {
  const wrap = document.getElementById("statAppearanceBody");
  if (!wrap) return;
  if (db.activePerson !== "kirsten") { wrap.innerHTML = ""; return; }
  wrap.innerHTML = STAT_GROUPS.appearance.items.map((k) => categoryTileHTML(db, k)).join("");
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
   storage.js). Level starts at that person's baseLevel (0, by her choice)
   rather than 1, and climbs from real XP earned — self-care ticks for
   Kirsten, chore ticks for either of you. */
function awardXp(db, personId, n) {
  if (!n) return;
  db.xp[personId] = (db.xp[personId] || 0) + n;
}

const XP_PER_LEVEL = 150;
function personLevel(db, personId) {
  const xp = db.xp[personId] || 0;
  const p = personById(db, personId);
  const base = (p && typeof p.baseLevel === "number") ? p.baseLevel : 0;
  return { level: base + Math.floor(xp / XP_PER_LEVEL), into: xp % XP_PER_LEVEL, span: XP_PER_LEVEL, xp };
}

/* ============================================================
   Pet care (Effie & Oddie) — each dog has its own profile (portrait,
   level, XP), separate from either human's. Feed/water/bed are once-a-
   day toggles; walk/play are logged in real 15-minute chunks and can be
   tapped again and again through the day (a 45-minute walk is three
   taps, not one). Every action feeds three numbers: the dog's own XP,
   a per-person companionship score with that specific dog (shown as a
   bar on THAT person's hero — Kirsten's bond with Effie and Jack's bond
   with Effie are tracked separately, since they're different
   relationships), and a smaller boost to the acting person's own level
   — dog care is still real household care.
   ============================================================ */
const PET_XP_PER_LEVEL = 150;
const PET_COMPANIONSHIP_CAP = 200; // companionship XP at which the bar reads 100% (still climbs past it underneath)
const PET_DISCRETE_ACTIONS = {
  feed:  { icon: "🍖", label: "Food",  xp: 5 },
  water: { icon: "💧", label: "Water", xp: 5 },
  bed:   { icon: "🛏️", label: "Bed",   xp: 5 },
};
const PET_TIME_ACTIONS = {
  walk: { icon: "🚶", label: "Walk", xpPer15: 5 },
  play: { icon: "🎾", label: "Play", xpPer15: 5 },
};

function petById(db, id) { return db.pets.find((p) => p.id === id); }

function petActionDoneToday(db, petId, action) {
  return !!db.petCare.doneToday[`${petId}|${action}|${todayKey()}`];
}
function petMinutesToday(db, petId, action) {
  return db.petCare.minutesToday[`${petId}|${action}|${todayKey()}`] || 0;
}

/* Credits the dog's own XP, the acting person's companionship with that
   dog, and a half-rate boost to that person's own level. */
function awardPetCare(db, petId, amount) {
  db.petCare.xp[petId] = (db.petCare.xp[petId] || 0) + amount;
  const key = `${db.activePerson}|${petId}`;
  db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) + amount;
  awardXp(db, db.activePerson, Math.round(amount / 2));
}

/* Feed/water/bed — once each per day. Tapping again undoes it (no XP
   removed, same no-guilt rule as everything else). */
function togglePetDiscreteAction(db, petId, action) {
  const key = `${petId}|${action}|${todayKey()}`;
  if (db.petCare.doneToday[key]) { delete db.petCare.doneToday[key]; saveDB(db); return; }
  db.petCare.doneToday[key] = true;
  awardPetCare(db, petId, PET_DISCRETE_ACTIONS[action].xp);
  saveDB(db);
}

/* Walk/play — stacks in real 15-minute increments through the day. */
function logPetTime(db, petId, action) {
  const key = `${petId}|${action}|${todayKey()}`;
  db.petCare.minutesToday[key] = (db.petCare.minutesToday[key] || 0) + 15;
  awardPetCare(db, petId, PET_TIME_ACTIONS[action].xpPer15);
  saveDB(db);
}
/* Corrects an over-tap (e.g. meant to log one 15-min walk, hit it four
   times) by taking 15 minutes back off today's total. XP already earned
   isn't clawed back — same no-guilt rule as every other undo in this
   app — this only fixes the displayed record, not the reward. */
function undoPetTime(db, petId, action) {
  const key = `${petId}|${action}|${todayKey()}`;
  db.petCare.minutesToday[key] = Math.max(0, (db.petCare.minutesToday[key] || 0) - 15);
  saveDB(db);
}

/* ---- Flea & worm treatment — every 3 months, unknown history so this
   starts fresh rather than guessing. ---- */
function fleaWormDue(db, petId) {
  const last = db.petCare.fleaWorm[petId].lastDone;
  return last != null && daysBetween(new Date(last + "T00:00:00"), new Date()) >= 90;
}
function logFleaWorm(db, petId) {
  db.petCare.fleaWorm[petId].lastDone = todayKey();
  awardPetCare(db, petId, 15); // bigger, infrequent job
  saveDB(db);
}

/* ---- Claw clipping — 18 claws per dog (5 front incl. dewclaw, 4 back),
   logged one at a time since neither dog sits for a full set. Finishing
   all 18 resets the set and banks a completed cycle; two cycles unlocks
   the jabs/insurance suggestion with a bonus (harder to reach = worth
   more). ---- */
const PAW_CLAW_COUNTS = { fl: 5, fr: 5, bl: 4, br: 4 };
const PAW_LABELS = { fl: "Front left", fr: "Front right", bl: "Back left", br: "Back right" };
function clawKeys() {
  const keys = [];
  Object.keys(PAW_CLAW_COUNTS).forEach((paw) => {
    for (let i = 1; i <= PAW_CLAW_COUNTS[paw]; i++) keys.push(`${paw}-${i}`);
  });
  return keys; // 18 total
}
function clawsDoneCount(db, petId) {
  const done = db.petCare.claws[petId].done;
  return clawKeys().filter((k) => done[k]).length;
}
function toggleClaw(db, petId, clawKey) {
  const rec = db.petCare.claws[petId];
  if (rec.done[clawKey]) { delete rec.done[clawKey]; saveDB(db); return; }
  rec.done[clawKey] = true;
  awardPetCare(db, petId, 3); // fiddly one-at-a-time job, worth a bit more than a quick tick
  if (clawKeys().every((k) => rec.done[k])) {
    rec.done = {};
    rec.cyclesCompleted = (rec.cyclesCompleted || 0) + 1;
    if (rec.cyclesCompleted === 2) awardPetCare(db, petId, 50); // milestone — harder to attain, worth more
  }
  saveDB(db);
}

/* ---- Toilet training — one shared schedule for both dogs (added while
   she's off on sick leave working the plan with them). Regenerated fresh
   each day from this template. A failed walk doesn't just get marked and
   dropped — it auto-adds a retry 20 minutes later, chaining again if that
   one fails too, per her explicit instruction. ---- */
/* Read-only reference tips per day of the plan, keyed by day number —
   distinct from db.toiletTraining.notes (which stays hers, freeform).
   Auto-advances from startDate so this never needs manual correction as
   the days pass. */
const TOILET_TRAINING_DAY_TIPS = {
  1: "Day 1 — revised after today's accidents:\n" +
     "• Morning Walk 1 shifts to a 9:30–10:00am window, and must happen within 30–60 minutes of you waking (keeps it flexible if illness shifts your wake time) — protects Oddie (can't hold his morning poo past ~10:30) and Effie (had a morning wee accident).\n" +
     "• Midday Walk 2 stays 1:00pm — keeps the afternoon bladder window tight, prevents mid-afternoon accidents.\n" +
     "• Dinner moves earlier to 6:00pm (was 6:30pm) — Effie's evening accident happened around 6:20pm, so earlier dinner buys more time before the post-dinner walk. Water stays down until 8pm.\n" +
     "• Final water cutoff at 8pm protects against Effie's evening wee accidents.\n" +
     "• No luck after 10 min? Bring them in, lead attached nearby, try again in 20 minutes (the app adds that retry for you automatically).\n" +
     "• Be boring at the grass: stand still, no chat, no play.\n" +
     "• Reward the instant they go — sausage + enthusiastic praise.\n" +
     "• Accident → straight outside for a 2-minute reset walk.",
  2: "Day 2 — revised after yesterday's two accidents:\n" +
     "• Both accidents were Oddie's, and both fell in the GAPS between walks, not at a scheduled walk itself (every walk succeeded for both dogs) — noon (mid-way through the old 9:30am–1pm gap) and 10:45pm (1h45m after the old 9pm final walk, right when you were still up).\n" +
     "• Midday Walk 2 moves to 12:00pm (was 1pm) — closes the gap where the noon accident happened. Oddie's margin here is tight — running ~15 min late may have contributed yesterday, so treat 12:00 as a real deadline, not just a rough target.\n" +
     "• Final Night Walk 4 moves to 10:00pm (was 9pm) — closer to your actual bedtime, based on last night.\n" +
     "• Open one extra room (e.g. bedroom + hallway) to test if they'll hold it or sneak off.\n" +
     "• Watch for \"the ask\" around 11:55am / 9:25pm — staring, standing by the door, waking from a nap.\n" +
     "• Vary the reward — don't sausage a lazy dribble; save the big rewards for poops or a full first-morning-walk empty.",
  3: "Day 3 — teaching them to cope alone in their Safe Zone:\n" +
     "• 1:15pm: Safe Zone confinement — tiled/carpet-free area only, no sofa, no following you. Give each a safe chew or a frozen Kong stuffed with a tiny bit of wet food/plain yoghurt — keeps them busy the first 20 min and the licking soothes them to sleep. Close the door.\n" +
     "• Ghost departures: coat + keys, step outside 5–10 min during the afternoon stretch, prove the routine holds even when you leave the flat.\n" +
     "• Sausage roulette: reward 2 of 3 successful trips with sausage, just verbal praise for the third — variable reward makes it stronger.\n" +
     "• Whining at the Safe Zone door: ignore completely, no talking/opening/scolding. Wait for 2 full minutes of silence before checking on them.",
  4: "Day 4 — stretching crate endurance (halfway point!):\n" +
     "• No bonus walk this time — full 1:15–6:30pm block (5+ hrs) in the crate, undisturbed. They can hold it much longer confined and asleep than loose.\n" +
     "• Move the crate to a different room than Day 3 (e.g. living room/hallway) — they need to settle without seeing/hearing you nearby.\n" +
     "• 1:15pm: sausage crumb inside, frozen Kong/chews, close and cover the crate.\n" +
     "• 6:30pm \"no fuss\" exit: open calmly, no cuddles/excitement, straight to water + dinner — keeps arousal low so they don't leak.\n" +
     "• Keep sausage pieces small to protect their weight. If they handle this stretch, they're officially halfway to the new routine.",
  5: "Day 5 — earlier wakeup + real-world separation:\n" +
     "• Morning walk shifts to 8:30am (see the schedule below) to start moving their body clock earlier.\n" +
     "• The afternoon crate stretch naturally grows to 5.25 hours as a result.\n" +
     "• Leave the flat completely for at least 2 hours during the crate block — a walk, a friend's, shopping. They need to practice being alone without your scent in the building, not just behind a closed door.",
  6: "Day 6 — pushing toward the real return-to-work sequence:\n" +
     "• Morning walk shifts earlier again, to 7:45am (alarm for 7:40) — working toward the eventual 6:15am goal.\n" +
     "• Morning gap before Walk 2 stretches to 5.25 hours — keep them confined with you so they settle and nap.\n" +
     "• By now they should walk into the crate on their own once they see the frozen Kongs come out at 1:15pm.\n" +
     "• Start phasing out sausage for a simple, lazy pee — save the top rewards for poops and the 7:45am morning empty-out.",
  7: "Day 7 — the final milestone: locking in the real workday rhythm:\n" +
     "• Real wakeup: alarm 6:10am, walk at 6:15am — the actual time your body needs to adjust to for going back to work.\n" +
     "• Double morning routine: a second walk at 10:10am — this becomes Jack's future walk slot before he leaves for the office.\n" +
     "• Full workday simulation: crate from 10:25am to 6:30pm, the real 8-hour stretch you'll both face at work. Try to leave the flat for several hours to make it real.",
};

/* Day-specific overrides (time and/or label), applied on top of the base
   schedule when generating that day's items — so a change like Day 7
   introducing an actual new walk slot doesn't need a separate schedule
   template, just an override on the existing "Midday Walk 2" entry. */
const TOILET_TRAINING_OVERRIDES = {
  1: {
    "Morning Walk 1": { time: "09:30", label: "Morning Walk 1 (9:30–10:00am window)" },
    "Dinner & water": { time: "18:00" },
  },
  // Days 2-4 carry forward the Day 1 morning/dinner fix (confirmed working —
  // zero repeat of Day 1's original accidents) since overrides don't
  // inherit between days on their own. Day 5 takes over the morning time
  // from here as the earlier-wakeup taper begins.
  2: {
    "Morning Walk 1": { time: "09:30", label: "Morning Walk 1 (9:30–10:00am window)" },
    "Midday Walk 2": { time: "12:00" },
    "Dinner & water": { time: "18:00" },
    "Final Night Walk 4": { time: "22:00" },
  },
  3: {
    "Morning Walk 1": { time: "09:30", label: "Morning Walk 1 (9:30–10:00am window)" },
    "Dinner & water": { time: "18:00" },
  },
  4: {
    "Morning Walk 1": { time: "09:30", label: "Morning Walk 1 (9:30–10:00am window)" },
    "Dinner & water": { time: "18:00" },
  },
  5: { "Morning Walk 1": { time: "08:30" }, "Dinner & water": { time: "18:00" } },
  6: { "Morning Walk 1": { time: "07:45" }, "Dinner & water": { time: "18:00" } },
  7: {
    "Morning Walk 1": { time: "06:15", duration: "10 min" },
    "Midday Walk 2": { time: "10:10", label: "Pre-Work Walk 2 (Jack's future slot)" },
    "Dinner & water": { time: "18:00" },
  },
};
function toiletTrainingDayNumber(db) {
  if (!db.toiletTraining.startDate) db.toiletTraining.startDate = todayKey();
  return Math.max(1, daysBetween(new Date(db.toiletTraining.startDate + "T00:00:00"), new Date()) + 1);
}
/* Tomorrow's first walk — so she can see tonight what time to set her
   alarm for, rather than only finding out once tomorrow's schedule has
   already generated. Mirrors ensureToiletTrainingToday's own warm-up vs.
   real-day branching, just one day ahead. */
function toiletTrainingTomorrowPreview(db) {
  if (!db.toiletTraining.startDate) return null;
  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowKey = todayKey(tomorrow);
  if (tomorrowKey < db.toiletTraining.startDate) {
    const first = TOILET_TRAINING_WARMUP_SCHEDULE[0];
    return { dayLabel: "warm-up", time: first.time, title: first.label };
  }
  const dayNum = Math.max(1, daysBetween(new Date(db.toiletTraining.startDate + "T00:00:00"), tomorrow) + 1);
  const overrides = TOILET_TRAINING_OVERRIDES[dayNum] || {};
  const first = TOILET_TRAINING_SCHEDULE[0];
  const ov = overrides[first.label] || {};
  return { dayLabel: `Day ${dayNum}`, time: ov.time || first.time, title: ov.label || first.label };
}

/* True on any day before the real Day 1 begins — e.g. after pushing the
   start back a day. Today still gets a lighter warm-up schedule (see
   TOILET_TRAINING_WARMUP_SCHEDULE) rather than silently showing full
   Day 1 content a day early. */
function isBeforeToiletTrainingStart(db) {
  if (!db.toiletTraining.startDate) return false;
  return todayKey() < db.toiletTraining.startDate;
}

/* The next not-yet-marked item in today's schedule — shown on the hero so
   it actively prompts the next action instead of waiting to be found on
   the Pets page. */
function toiletTrainingCurrentStep(db) {
  ensureToiletTrainingToday(db);
  const items = [...db.toiletTraining.items].sort((a, b) => a.time.localeCompare(b.time));
  return items.find((i) => i.status === null) || null;
}
function isTimeDueNow(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

/* Lighter warm-up for the day(s) before the real Day 1 starts — shorter,
   more spread-out walks rather than the full six-item Day 1 block, but
   the same fail → retry-in-20-min logic (that lives in markToiletTraining
   and applies to any "walk" item regardless of which schedule it came
   from) and the same water/feeding handling as Day 1. */
const TOILET_TRAINING_WARMUP_SCHEDULE = [
  { time: "12:15", label: "Midday Walk", type: "walk", duration: "5–7 min",
    steps: ["Straight outside — no lounging, no phones", "Stand still at the grass, be boring", "Reward the instant they go — sausage + praise", "Water bowl down the moment you're back inside"] },
  { time: "15:00", label: "Afternoon Walk", type: "walk", duration: "5–7 min",
    steps: ["Boring, business-only trip", "Reward on the grass", "Water bowl lifted up the moment you're back inside"] },
  { time: "18:00", label: "Early Evening Walk", type: "walk", duration: "5–7 min",
    steps: ["Boring, business-only trip", "Reward on the grass"] },
  { time: "18:30", label: "Dinner & water", type: "event",
    steps: ["Water bowl back down", "Feed their single daily meal (slightly less — they've had sausage today)"] },
  { time: "19:00", label: "Post-Dinner Walk", type: "walk", duration: "15 min",
    steps: ["Out 30 min after eating — eating stimulates them", "Watch closely, reward poops instantly"] },
  { time: "20:00", label: "Final water cutoff", type: "event",
    steps: ["Water bowl up for the rest of the night"] },
  { time: "21:00", label: "Final Night Walk", type: "walk", duration: "10 min",
    steps: ["One last boring trip to empty their bladder before bed"] },
];

const TOILET_TRAINING_SCHEDULE = [
  { time: "09:00", label: "Morning Walk 1", type: "walk", duration: "10–15 min",
    steps: ["Straight outside — no lounging, no phones", "Stand still at the grass, be boring", "Reward the instant they go — sausage + praise", "Water bowl down the moment you're back inside"] },
  { time: "13:00", label: "Midday Walk 2", type: "walk", duration: "15 min",
    steps: ["Boring, business-only trip", "Reward on the grass", "Water bowl lifted up the moment you're back inside"] },
  { time: "18:30", label: "Dinner & water", type: "event",
    steps: ["Water bowl back down", "Feed their single daily meal (slightly less — they've had sausage today)"] },
  { time: "19:00", label: "Post-Dinner Walk 3", type: "walk", duration: "15 min",
    steps: ["Out 30 min after eating — eating stimulates them", "Watch closely, reward poops instantly"] },
  { time: "20:00", label: "Final water cutoff", type: "event",
    steps: ["Water bowl up for the rest of the night"] },
  { time: "21:00", label: "Final Night Walk 4", type: "walk", duration: "10 min",
    steps: ["One last boring trip to empty their bladder before bed"] },
];

function ensureToiletTrainingToday(db) {
  const today = todayKey();
  if (db.toiletTraining.lastGeneratedDate === today) return;
  db.toiletTraining.lastGeneratedDate = today;

  if (isBeforeToiletTrainingStart(db)) {
    db.toiletTraining.items = TOILET_TRAINING_WARMUP_SCHEDULE.map((t, i) => ({
      id: `warmup-${i}`, time: t.time, label: t.label, type: t.type,
      duration: t.duration || null, steps: t.steps, status: null,
    }));
    saveDB(db);
    return;
  }

  const overrides = TOILET_TRAINING_OVERRIDES[toiletTrainingDayNumber(db)] || {};
  db.toiletTraining.items = TOILET_TRAINING_SCHEDULE.map((t, i) => {
    const ov = overrides[t.label] || {};
    return {
      id: `base-${i}`, time: ov.time || t.time, label: ov.label || t.label, type: t.type,
      duration: ov.duration || t.duration || null, steps: t.steps, status: null,
    };
  });
  saveDB(db);
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const TOILET_OUTPUT_LABEL = { wee: "💧 Wee", poo: "💩 Poo", both: "💧💩 Both" };
/* "Effie: 💧 Wee · Oddie: —" — per-dog, since one can go while the other
   doesn't, or one wees while the other poos. outcomes is {petId: "wee"|
   "poo"|"both"|null} or null for older entries logged before this existed. */
function toiletOutcomeSummary(db, outcomes) {
  if (!outcomes) return "";
  return db.pets.map((p) => `${p.name}: ${outcomes[p.id] ? TOILET_OUTPUT_LABEL[outcomes[p.id]] : "—"}`).join(" · ");
}

/* Trying counts, per the app's usual no-guilt rule — success just earns
   more. Credited PER DOG from outcomes (one dog going while the other
   doesn't is common, not an all-or-nothing pair event any more), plus the
   acting person's own level once, not doubled per dog.

   Also doubles as the correction path: if this walk was already marked
   (item.status set), whatever was credited for the OLD outcome is
   reversed first, so fixing a mis-entered walk corrects the record
   instead of stacking extra XP on top. Safe to call repeatedly. */
function markToiletWalk(db, itemId, outcomes) {
  const item = db.toiletTraining.items.find((i) => i.id === itemId);
  if (!item) return;

  if (item.status) {
    db.pets.forEach((p) => {
      const oldAmt = (item.outcomes && item.outcomes[p.id]) ? 8 : 3;
      db.petCare.xp[p.id] = (db.petCare.xp[p.id] || 0) - oldAmt;
      const key = `${db.activePerson}|${p.id}`;
      db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) - oldAmt;
    });
    awardXp(db, db.activePerson, -(item.status === "success" ? 8 : 3));

    // A fail auto-added a retry — if it's still untouched, the correction
    // no longer needs it; if she's already acted on it, leave it alone.
    if (item.status === "fail") {
      const retryIdx = db.toiletTraining.items.findIndex((i) =>
        i.label === item.label.replace(/ \(retry\)$/, "") + " (retry)" && i.status === null);
      if (retryIdx !== -1) db.toiletTraining.items.splice(retryIdx, 1);
    }
  }

  const anySuccess = db.pets.some((p) => outcomes[p.id]);
  item.status = anySuccess ? "success" : "fail";
  item.outcomes = outcomes;

  db.pets.forEach((p) => {
    const amt = outcomes[p.id] ? 8 : 3;
    db.petCare.xp[p.id] = (db.petCare.xp[p.id] || 0) + amt;
    const key = `${db.activePerson}|${p.id}`;
    db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) + amt;
  });
  awardXp(db, db.activePerson, anySuccess ? 8 : 3);

  if (!anySuccess) {
    const [h, m] = item.time.split(":").map(Number);
    const total = h * 60 + m + 20;
    const retryTime = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    db.toiletTraining.items.push({
      id: uid(), time: retryTime, label: item.label.replace(/ \(retry\)$/, "") + " (retry)",
      type: "walk", duration: item.duration, steps: item.steps, status: null, adhoc: true,
    });
  }

  const logEntry = db.toiletTraining.log.find((e) => e.itemId === item.id);
  if (logEntry) { logEntry.kind = item.status; logEntry.outcomes = outcomes; }
  else db.toiletTraining.log.push({ id: uid(), date: todayKey(), time: item.time, kind: item.status, outcomes, itemId: item.id, label: item.label });
  saveDB(db);
}

/* Non-walk schedule items (Dinner & water, water cutoffs) — no dog/output
   picker, just a plain done tick, unchanged from before. */
function markToiletEvent(db, itemId) {
  const item = db.toiletTraining.items.find((i) => i.id === itemId);
  if (!item) return;
  item.status = "success";
  awardXp(db, db.activePerson, 3);
  db.toiletTraining.log.push({ id: uid(), date: todayKey(), time: item.time, kind: "success", outcomes: null, itemId: item.id, label: item.label });
  saveDB(db);
}

/* Ad-hoc — not tied to a scheduled slot, for a proactive extra trip
   ("went again after the final walk to be safe") or an accident whenever
   it actually happened. "success" here earns the same as a scheduled
   walk success (arguably more praiseworthy — she went out of her way);
   "accident" earns nothing, per the no-guilt rule — it's a data point for
   spotting patterns, not something to be penalised for.

   Shows up as a normal card in today's timeline (not just the log list at
   the bottom) — marked `adhoc: true` so it's fully deletable rather than
   resettable-to-pending like a scheduled slot. Pass an existing itemId to
   correct one already logged (reverses its old credit first, same
   pattern as markToiletWalk) instead of creating a duplicate. */
function logToiletTrip(db, { itemId, time, kind, outcomes }) {
  const finalTime = time || nowTimeStr();
  const label = kind === "accident" ? "Accident" : "Extra trip";
  let item = itemId ? db.toiletTraining.items.find((i) => i.id === itemId) : null;

  if (item && item.status === "success") {
    db.pets.forEach((p) => {
      if (!item.outcomes || !item.outcomes[p.id]) return;
      db.petCare.xp[p.id] = (db.petCare.xp[p.id] || 0) - 8;
      const key = `${db.activePerson}|${p.id}`;
      db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) - 8;
    });
    if (db.pets.some((p) => item.outcomes && item.outcomes[p.id])) awardXp(db, db.activePerson, -8);
  }

  if (kind === "success") {
    db.pets.forEach((p) => {
      if (!outcomes[p.id]) return;
      db.petCare.xp[p.id] = (db.petCare.xp[p.id] || 0) + 8;
      const key = `${db.activePerson}|${p.id}`;
      db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) + 8;
    });
    if (db.pets.some((p) => outcomes[p.id])) awardXp(db, db.activePerson, 8);
  }

  if (item) {
    item.time = finalTime; item.status = kind; item.outcomes = outcomes; item.label = label;
  } else {
    item = { id: uid(), time: finalTime, label, type: "walk", duration: null, steps: [], status: kind, outcomes, adhoc: true };
    db.toiletTraining.items.push(item);
  }

  const logEntry = db.toiletTraining.log.find((e) => e.itemId === item.id);
  if (logEntry) { logEntry.time = finalTime; logEntry.kind = kind; logEntry.outcomes = outcomes; logEntry.label = label; }
  else db.toiletTraining.log.push({ id: uid(), date: todayKey(), time: finalTime, kind, outcomes, itemId: item.id, label });
  saveDB(db);
}

/* Removes a walk entirely (ad-hoc trips/accidents, and stray auto-added
   retries) or, for a fixed scheduled slot, resets it back to pending
   rather than deleting the slot itself — fixes an accidental duplicate
   log without leaving a hole in the day's template. Reverses whatever
   XP/companionship it credited either way. */
function deleteToiletWalk(db, itemId) {
  const idx = db.toiletTraining.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const item = db.toiletTraining.items[idx];

  if (item.status) {
    // Scheduled walks (markToiletWalk) credit every dog something — 8 if
    // they went, 3 "tried" either way. Ad-hoc trips/accidents
    // (logToiletTrip) only ever credit a dog that actually has an
    // outcome — no consolation amount for the other one. Reversal has to
    // match whichever scheme actually created the credit, or a dog with
    // no outcome on an ad-hoc entry goes negative.
    const perDogAmt = (p) => {
      if (item.status === "accident") return 0;
      const went = item.outcomes && item.outcomes[p.id];
      if (went) return 8;
      return item.adhoc ? 0 : 3;
    };
    db.pets.forEach((p) => {
      const amt = perDogAmt(p);
      if (!amt) return;
      db.petCare.xp[p.id] = (db.petCare.xp[p.id] || 0) - amt;
      const key = `${db.activePerson}|${p.id}`;
      db.petCare.companionship[key] = (db.petCare.companionship[key] || 0) - amt;
    });
    const anyWent = db.pets.some((p) => item.outcomes && item.outcomes[p.id]);
    const humanAmt = item.status === "accident" ? 0 : (item.adhoc ? (anyWent ? 8 : 0) : (item.status === "success" ? 8 : 3));
    if (humanAmt) awardXp(db, db.activePerson, -humanAmt);
  }

  db.toiletTraining.log = db.toiletTraining.log.filter((e) => e.itemId !== itemId);

  if (item.adhoc) {
    db.toiletTraining.items.splice(idx, 1);
  } else {
    item.status = null;
    item.outcomes = null;
    const retryIdx = db.toiletTraining.items.findIndex((i) =>
      i.label === item.label.replace(/ \(retry\)$/, "") + " (retry)" && i.status === null);
    if (retryIdx !== -1) db.toiletTraining.items.splice(retryIdx, 1);
  }
  saveDB(db);
}

function todaysToiletLog(db) {
  const today = todayKey();
  return db.toiletTraining.log.filter((e) => e.date === today).sort((a, b) => a.time.localeCompare(b.time));
}

function toiletTrainingItemHTML(db, item) {
  const stepsHTML = (item.steps || []).length
    ? `<ul class="steps">${item.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>` : "";
  let actions;
  const editBtn = item.adhoc
    ? `<button class="icon-btn" data-tt-trip-edit="${item.id}" aria-label="Edit">✎</button>`
    : `<button class="icon-btn" data-tt-log="${item.id}" aria-label="Edit this walk">✎</button>`;
  const deleteBtn = `<button class="icon-btn" data-tt-delete="${item.id}" aria-label="Delete">🗑</button>`;
  if (item.status === "success" && item.type === "walk") {
    const summary = toiletOutcomeSummary(db, item.outcomes);
    actions = `<span class="tag" style="background:var(--accent-soft);color:var(--accent);border-color:transparent">✓${summary ? " " + summary : ""}</span>${editBtn}${deleteBtn}`;
  } else if (item.status === "fail" && item.type === "walk") {
    actions = `<span class="tag">✗ Neither went — retry added below</span>${editBtn}${deleteBtn}`;
  } else if (item.status === "accident") {
    const summary = toiletOutcomeSummary(db, item.outcomes);
    actions = `<span class="tag" style="background:#5a3a1a;color:#ffb84d;border-color:transparent">🚨${summary ? " " + summary : ""}</span>${editBtn}${deleteBtn}`;
  } else if (item.status === "success") {
    actions = `<span class="tag" style="background:var(--accent-soft);color:var(--accent);border-color:transparent">✓ Done</span>`;
  } else if (item.type === "walk") {
    actions = `<button class="btn btn--mini" data-tt-log="${item.id}">📝 Log this walk</button>`;
  } else {
    actions = `<button class="btn btn--mini" data-tt-mark="${item.id}">✓ Done</button>`;
  }
  return `
    <article class="card" style="flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <strong>${formatTime12(item.time)} — ${escapeHTML(item.label)}</strong>
        ${item.duration ? `<span class="tag tag--time">${escapeHTML(item.duration)}</span>` : ""}
      </div>
      ${stepsHTML}
      <div class="glance__actions">${actions}</div>
    </article>`;
}

/* Wipes the schedule/day-counter back to a clean Day 1 — for when she's
   been testing the buttons rather than actually running the plan. Only
   touches the schedule state, not her own notes (typed content, not a
   "test") and not XP (already mixed in with real actions across all the
   pet-care features, not cleanly separable to "just this"). */
function resetToiletTraining(db) {
  db.toiletTraining.items = [];
  db.toiletTraining.lastGeneratedDate = null;
  db.toiletTraining.startDate = todayKey();
  saveDB(db);
}

/* Pushes the whole schedule back by one day — for mornings that don't go to
   plan (missed the start, sick day, etc). Shifts from the current startDate
   rather than from today, so tapping it more than once keeps stacking. */
function postponeToiletTrainingStart(db) {
  const d = new Date(db.toiletTraining.startDate + "T00:00:00");
  d.setDate(d.getDate() + 1);
  db.toiletTraining.startDate = todayKey(d);
  db.toiletTraining.items = [];
  db.toiletTraining.lastGeneratedDate = null;
  saveDB(db);
}

function renderToiletTraining(db) {
  const wrap = document.getElementById("toiletTraining");
  if (!wrap) return;
  ensureToiletTrainingToday(db);
  const items = [...db.toiletTraining.items].sort((a, b) => a.time.localeCompare(b.time));
  const warmup = isBeforeToiletTrainingStart(db);
  const dayNum = toiletTrainingDayNumber(db);
  const dayTips = TOILET_TRAINING_DAY_TIPS[dayNum];
  const heading = warmup ? "🚽 Toilet training — warm-up (Day 1 starts tomorrow)" : `🚽 Toilet training — Day ${dayNum}`;
  const tomorrow = toiletTrainingTomorrowPreview(db);

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <h3 class="section-label" style="margin:0">${heading}</h3>
      <span style="display:flex;gap:10px">
        <button class="link-btn" data-tt-postpone>⏭ Push start back a day</button>
        <button class="link-btn" data-tt-reset>↺ Reset (back to Day 1)</button>
      </span>
    </div>
    ${tomorrow ? `<p class="view__sub" style="margin:4px 0 0">⏰ Tomorrow (${tomorrow.dayLabel}): first walk "${escapeHTML(tomorrow.title)}" at ${formatTime12(tomorrow.time)} — set your alarm.</p>` : ""}
    <div class="card-list">${items.map((i) => toiletTrainingItemHTML(db, i)).join("")}</div>
    <button class="btn btn--ghost btn--block" style="margin-top:10px" data-tt-log-trip>➕ Log a toilet trip</button>
    <p class="view__sub" style="margin-top:8px">Between walks: keep them relaxing with you and ignore sniffing/circling — if you spot it, break the schedule and go straight out instead of waiting for the next slot. Went again outside the schedule (or had an accident)? Log it above — every trip counts toward spotting their real pattern.</p>

    ${warmup ? `
    <p class="view__sub" style="margin-top:14px">Just a light warm-up today — shorter walks, same reward-and-retry approach, water/dinner handled the same as Day 1. The real Day 1 schedule and tips kick in tomorrow.</p>` : dayTips ? `
    <div class="card" style="flex-direction:column;align-items:stretch;gap:6px;margin-top:14px">
      <strong>📋 Day ${dayNum} plan</strong>
      <p class="view__sub" style="margin:0;white-space:pre-line">${escapeHTML(dayTips)}</p>
    </div>` : `
    <p class="view__sub" style="margin-top:14px">Day ${dayNum} — no specific plan notes yet for this day. Paste the next day's guidance whenever you have it and I'll add it here.</p>`}

    <div class="card" style="flex-direction:column;align-items:stretch;gap:6px;margin-top:14px">
      <strong>🧼 If there's an accident</strong>
      <ul class="steps">
        <li>Don't react — no scolding, clapping, or loud noise</li>
        <li>Move them calmly to the bathroom while you clean</li>
        <li>Clean immediately with the enzymatic solution so the smell is gone within minutes</li>
        <li>Tighten restrictions — back to one room for the rest of the afternoon; they're just not ready for the extra freedom yet</li>
      </ul>
    </div>

    ${(() => {
      const log = todaysToiletLog(db);
      if (!log.length) return "";
      const KIND_LABEL = { success: "✓", fail: "✗", accident: "🚨" };
      const rows = log.map((e) => `
        <li>${formatTime12(e.time)} — ${KIND_LABEL[e.kind] || ""} ${escapeHTML(e.label)}${e.outcomes ? ` — ${escapeHTML(toiletOutcomeSummary(db, e.outcomes))}` : ""}</li>
      `).join("");
      return `
        <div class="card" style="flex-direction:column;align-items:stretch;gap:6px;margin-top:14px">
          <strong>📋 Today's toileting log</strong>
          <ul class="steps">${rows}</ul>
        </div>`;
    })()}

    <div class="field" style="margin-top:14px">
      <label for="ttNotes">Your own notes</label>
      <textarea id="ttNotes" rows="3" placeholder="Anything you want to jot down yourself…">${escapeHTML(db.toiletTraining.notes || "")}</textarea>
    </div>`;

  const notesEl = document.getElementById("ttNotes");
  if (notesEl) notesEl.onblur = () => { db.toiletTraining.notes = notesEl.value; saveDB(db); };
}

function petLevel(db, petId) {
  const xp = db.petCare.xp[petId] || 0;
  return { level: Math.floor(xp / PET_XP_PER_LEVEL), into: xp % PET_XP_PER_LEVEL, span: PET_XP_PER_LEVEL, xp };
}
function companionshipPct(db, personId, petId) {
  const xp = db.petCare.companionship[`${personId}|${petId}`] || 0;
  return Math.min(100, Math.round((xp / PET_COMPANIONSHIP_CAP) * 100));
}

/* Computed live from a stored birthdate rather than a static number, so
   it doesn't quietly go stale a year from now. Used for both the humans
   and the dogs. */
function ageFromBirthdate(birthdate) {
  if (!birthdate) return null;
  const dob = new Date(birthdate + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear = (today.getMonth() > dob.getMonth()) ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

/* ---- Pets page: one card per dog ---- */
function petCardHTML(db, petId) {
  const pet = petById(db, petId);
  const lvl = petLevel(db, petId);
  const pctLvl = Math.round((lvl.into / lvl.span) * 100);
  const age = ageFromBirthdate(pet.birthdate);

  const traitsHTML = (pet.traits || []).map((t) =>
    `<span class="tag">${t.icon} ${escapeHTML(t.label)}</span>`).join("");
  const flavourHTML = (pet.traits || pet.snack || pet.mood) ? `
    <div class="pet-flavour">
      ${traitsHTML ? `<div class="pet-flavour__traits">${traitsHTML}</div>` : ""}
      ${pet.snack ? `<div class="pet-flavour__row"><span>🍖 Favourite snack</span><span>${escapeHTML(pet.snack)}</span></div>` : ""}
      ${pet.mood ? `<div class="pet-flavour__row"><span>💭 Current mood</span><span>${escapeHTML(pet.mood)}</span></div>` : ""}
    </div>` : "";

  const discreteButtons = Object.keys(PET_DISCRETE_ACTIONS).map((key) => {
    const cfg = PET_DISCRETE_ACTIONS[key];
    const done = petActionDoneToday(db, petId, key);
    return `
      <button class="nav-tile ${done ? "is-done" : ""}" data-pet-tick="${petId}|${key}">
        <span class="nav-tile__icon">${cfg.icon}</span>
        <span class="nav-tile__label">${cfg.label}</span>
        <span class="nav-tile__sub">${done ? "done today ✓" : "not yet"}</span>
      </button>`;
  }).join("");

  const timeButtons = Object.keys(PET_TIME_ACTIONS).map((key) => {
    const cfg = PET_TIME_ACTIONS[key];
    const mins = petMinutesToday(db, petId, key);
    return `
      <div class="pet-time-tile">
        <button class="nav-tile" data-pet-time="${petId}|${key}">
          <span class="nav-tile__icon">${cfg.icon}</span>
          <span class="nav-tile__label">${cfg.label} +15m</span>
          <span class="nav-tile__sub">${mins ? `${mins} min today` : "not logged yet"}</span>
        </button>
        ${mins ? `<button class="link-btn" data-pet-time-undo="${petId}|${key}">− undo last 15m</button>` : ""}
      </div>`;
  }).join("");

  const fw = db.petCare.fleaWorm[petId];
  const fleaWormTile = `
    <button class="nav-tile ${fleaWormDue(db, petId) ? "" : "is-done"}" data-pet-fleaworm="${petId}">
      <span class="nav-tile__icon">💊</span>
      <span class="nav-tile__label">Flea &amp; worm</span>
      <span class="nav-tile__sub">${fw.lastDone ? daysAgoLabel(fw.lastDone) : "not logged yet"}</span>
    </button>`;

  const clawRec = db.petCare.claws[petId];
  const clawsDone = clawsDoneCount(db, petId);
  const pawRows = Object.keys(PAW_CLAW_COUNTS).map((paw) => {
    const dots = Array.from({ length: PAW_CLAW_COUNTS[paw] }, (_, i) => {
      const key = `${paw}-${i + 1}`;
      const done = !!clawRec.done[key];
      return `<button class="claw-dot ${done ? "is-done" : ""}" data-pet-claw="${petId}|${key}" aria-label="${PAW_LABELS[paw]} claw ${i + 1}"></button>`;
    }).join("");
    return `<div class="claw-paw"><span class="claw-paw__label">${PAW_LABELS[paw]}</span><span class="claw-paw__dots">${dots}</span></div>`;
  }).join("");
  const clawTracker = `
    <div class="claw-tracker">
      <div class="claw-tracker__head">
        <span>💅 Claws — ${clawsDone} / 18 this round</span>
        <span class="claw-tracker__cycles">${clawRec.cyclesCompleted} cycle${clawRec.cyclesCompleted === 1 ? "" : "s"} completed</span>
      </div>
      ${pawRows}
      ${clawRec.cyclesCompleted >= 2 ? `<p class="claw-tracker__unlock">🎉 Claws have been consistently trimmed — worth booking jabs &amp; insurance now.</p>` : ""}
    </div>`;

  return `
    <div class="hero-char">
      <div class="hero-char__top">
        <div class="hero-char__portrait">
          <img src="img/people/${petId}.jpg" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
          <div class="hero-char__fallback" hidden>🐾</div>
        </div>
        <div class="hero-char__level">
          ${pet.nickname ? `<div class="hero-char__schedule">"${escapeHTML(pet.nickname)}"${age != null ? ` · ${age} year${age === 1 ? "" : "s"} old` : ""}</div>` : ""}
          <div class="hero-char__level-row">${escapeHTML(pet.name)} · Level ${lvl.level}</div>
          <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pctLvl}%"></div></div>
          <div class="hero-char__level-sub">${lvl.into} / ${lvl.span} XP</div>
        </div>
      </div>
      ${flavourHTML}
      <div class="nav-grid">${discreteButtons}${timeButtons}${fleaWormTile}</div>
      ${clawTracker}
    </div>`;
}
function renderPetsPage(db) {
  const wrap = document.getElementById("petsBody");
  if (!wrap) return;
  wrap.innerHTML = db.pets.map((p) => petCardHTML(db, p.id)).join("");
}

/* ---- Home hero: full-length portrait + level, with Health/Hygiene/
   Appearance as three tappable bars (not an icon ring — one clear tap
   target per group, opening exactly the jobs in it). ---- */
/* Whole-house cleanliness — the average of every room's today-progress
   (see roomProgress). Not gated to Kirsten's rooms list existing; reads
   0 rooms as 100% (nothing outstanding to report). */
function houseCleanPct(db) {
  const rooms = db.cleaningGame.rooms;
  if (!rooms.length) return 100;
  const pcts = rooms.map((r) => roomProgress(db, r.id).pct);
  return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
}

/* One-line "what's next today" for the hero panel — the full schedule
   card further down the page still has the whole list; this is just
   enough to glance at without leaving Home. */
function heroScheduleSummary(db, personId) {
  const person = personById(db, personId);
  // Jack has no personal calendar — his schedule comes from his work
  // pattern instead (same source as his own "Today's schedule" card).
  if (person && person.work) {
    if (typeof generateWorkEvents !== "function") return "📅 Today's plan";
    const events = eventsForDay(generateWorkEvents(db, person, 1), todayKey());
    if (!events.length) return "📅 Not a work day today";
    return `📅 ${eventTime(events[0])} ${escapeHTML(events[0].summary)}`;
  }
  if (typeof calendarConfigured !== "function" || !calendarConfigured(db)) return "📅 Connect your calendar to see today's plan";
  const today = eventsForDay(db.calendar.lastEvents || [], todayKey());
  if (!today.length) return "📅 Nothing on today";
  const next = today[0];
  const more = today.length - 1;
  return `📅 ${eventTime(next)} ${escapeHTML(next.summary)}${more ? ` · +${more} more` : ""}`;
}

/* Same hero layout for both of you — portrait, name, level, house-cleaned
   bar. The personal self-care bars (Health/Hygiene/Appearance) stay
   Kirsten-only: there's no equivalent data for Jack (no meds/hygiene
   routines tracked for him), and this is the "limited functionality"
   version discussed for his side of the app — same design, smaller
   surface, not a cut-down clone of hers. */
function characterPanelHTML(db, personId) {
  const person = personById(db, personId);
  if (!person) return "";
  const isKirsten = personId === "kirsten";
  const lvl = personLevel(db, personId);
  const pctLvl = Math.round((lvl.into / lvl.span) * 100);

  const houseVal = houseCleanPct(db);
  const houseBar = `
    <button class="hero-stat" data-goto="cleaning">
      <div class="hero-stat__row"><span>🏠 House cleaned</span><span>${houseVal}%</span></div>
      <div class="bar"><div class="bar__fill" style="width:${houseVal}%"></div></div>
    </button>`;

  const statBar = (key) => {
    const g = STAT_GROUPS[key];
    const val = statGroupGauge(db, key);
    return `
      <button class="hero-stat" data-goto="stat-${key}">
        <div class="hero-stat__row">
          <span>${g.icon} ${g.label}</span>
          <span>${statGroupDue(db, key) ? `<span class="hero-stat__due"></span>` : ""}${val}%</span>
        </div>
        <div class="bar"><div class="bar__fill" style="width:${val}%"></div></div>
      </button>`;
  };

  const ttStep = isKirsten ? toiletTrainingCurrentStep(db) : null;

  const petBars = db.pets.map((pet) => {
    const val = companionshipPct(db, personId, pet.id);
    return `
      <button class="hero-stat" data-goto="pets">
        <div class="hero-stat__row"><span>🐕 ${escapeHTML(pet.name)}</span><span>${val}%</span></div>
        <div class="bar"><div class="bar__fill" style="width:${val}%"></div></div>
      </button>`;
  }).join("");

  return `
    <div class="hero-char">
      <button class="hero-char__blueprint" data-goto="cleaning" aria-label="Cleaning blueprint — house ${houseCleanPct(db)}% clean">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <line x1="3" y1="13" x2="11" y2="13" />
          <line x1="13" y1="3" x2="13" y2="21" />
          <line x1="16" y1="21" x2="16" y2="17" />
        </svg>
      </button>
      <div class="hero-char__top">
        <div class="hero-char__portrait">
          <img src="img/people/${personId}-full.jpg" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
          <div class="hero-char__fallback" hidden>${escapeHTML((person.name || "?")[0])}</div>
        </div>
        <div class="hero-char__level">
          <button class="hero-char__schedule" data-goto="calendar">${heroScheduleSummary(db, personId)}</button>
          ${!isKirsten && typeof liftBlockForJack === "function" ? liftBlockForJack(db) : ""}
          ${ttStep ? `
            <button class="hero-char__schedule" data-goto="pets">
              🚽 ${isTimeDueNow(ttStep.time) ? `<span class="hero-stat__due"></span> Due now — ` : "Next: "}${formatTime12(ttStep.time)} ${escapeHTML(ttStep.label)}
            </button>` : ""}
          <div class="hero-char__level-row">${escapeHTML(person.name)}${ageFromBirthdate(person.birthdate) != null ? ` · ${ageFromBirthdate(person.birthdate)}` : ""} · Level ${lvl.level}</div>
          <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pctLvl}%"></div></div>
          <div class="hero-char__level-sub">${lvl.into} / ${lvl.span} XP</div>
        </div>
      </div>
      <div class="hero-char__stats">
        ${isKirsten ? `${statBar("health")}${statBar("hygiene")}${statBar("appearance")}` : ""}${houseBar}${petBars}
      </div>
    </div>`;
}

/* ---- Level strip: shown to BOTH of you at the top of Cleaning, quiet and
   compact on purpose (no icon ring, no gauges) — Jack's side of the app
   has deliberately stayed low-key everywhere else, so this only adds the
   one thing asked for: seeing your own level rise as chores get done. ---- */

function renderCharacterPanel(db) {
  const wrap = document.getElementById("homeCharacter");
  if (!wrap) return;
  wrap.innerHTML = characterPanelHTML(db, db.activePerson);
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
    rooms: {
      "Stairs":  [20, 20, 60, 280],
      "Kitchen": [90, 20, 190, 280],
    },
  },
  "Ground Floor": {
    viewBox: "0 0 300 320",
    // Two separate voids for orientation only — the actual clickable rooms
    // for each flight live where they lead TO (Lower Ground and First Floor).
    stairwell: [[20, 20, 60, 70], [20, 100, 70, 200]],
    rooms: {
      "Entryway":    [90, 20, 190, 70],
      "Living Room": [100, 100, 180, 140],
      "Dog Area":    [100, 250, 180, 50],
    },
  },
  "First Floor": {
    viewBox: "0 0 300 320",
    rooms: {
      "Landing":  [20, 20, 260, 60],
      "Stairs":   [20, 90, 70, 210],
      "Bedroom":  [100, 90, 180, 140],
      "Bathroom": [100, 240, 180, 60],
    },
  },
  "Loft Floor": {
    viewBox: "0 0 300 320",
    rooms: {
      "Stairs": [20, 20, 60, 280],
      "Loft":   [90, 20, 190, 280],
    },
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
  // Accepts either one box or several (Ground Floor has a void for each
  // flight — down to Lower Ground, up to First) — decorative only, the
  // actual clickable Stairs room lives on whichever floor the flight leads to.
  const stairwellBoxes = layout.stairwell ? (Array.isArray(layout.stairwell[0]) ? layout.stairwell : [layout.stairwell]) : [];
  const stairwell = stairwellBoxes
    .map((box) => `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" class="fp-stairwell" />`)
    .join("");
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

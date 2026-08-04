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
  const wasZero = t.waterMl === 0;
  t.waterMl = Math.max(0, t.waterMl + ml);
  if (wasZero && ml > 0) awardXp(db, db.activePerson, 5); // first drink logged today
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

/* Monday-start week key for a date — small general-purpose helper, used
   wherever something needs to know "which week is this". */
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

/* ---------- Weight (fortnightly-minimum, fully manual) ---------- */
function lastWeightEntry(db) {
  const entries = db.weight.entries;
  return entries.length ? entries[entries.length - 1] : null;
}
function logWeight(db, kg) {
  const n = Number(kg);
  if (!n || n <= 0) return;
  const today = todayKey();
  const entries = db.weight.entries.filter((e) => e.date !== today); // one entry per day, latest wins
  entries.push({ date: today, kg: n });
  db.weight.entries = entries;
  awardXp(db, db.activePerson, 5);
  saveDB(db);
}
/* Calm nudge, not a warning — true from day 15 (a fortnight + a day),
   never phrased as overdue. */
function weighInDue(db) {
  const last = lastWeightEntry(db);
  if (!last) return false;
  return daysBetween(new Date(last.date + "T00:00:00"), new Date()) >= 15;
}

/* ---------- 7-minute workout (replaces the old gym-membership goal) ---------- */
const WORKOUT_SETS = {
  low:    { label: "Low",    exercises: ["Marching on the spot", "Wall push-ups", "Standing knee lifts", "Seated leg extensions", "Gentle side bends", "Standing calf raises", "Deep breathing stretch"] },
  medium: { label: "Medium", exercises: ["Jumping jacks", "Wall sit", "Push-ups (knees down if needed)", "Ab crunches", "Step-ups", "Squats", "Plank"] },
  high:   { label: "High",   exercises: ["Jumping jacks", "Wall sit", "Push-ups", "Ab crunches", "Step-up onto a stair", "Squats", "Triceps dips (on a chair)", "Plank", "High knees", "Lunges"] },
};
/* ~30 sec on / 10 sec off per exercise, whatever the count — always
   lands close to 7 minutes, so it's left approximate rather than exact. */

/* Suggests an intensity from real signals only: today's shift, chores
   already ticked, and steps IF she's updated them today (never assumed).
   Demanding shift or a rest day -> low, nothing more expected. Otherwise
   reads how active today's already been and suggests the opposite end
   for balance. */
function suggestedWorkoutIntensity(db) {
  const shiftType = currentShiftType(db);
  if (["night", "longday"].includes(shiftType) || isRestDay(db, todayKey())) return "low";

  const dateKey = todayKey();
  const choresDone = db.routines.filter((r) => isSharedTask(r) && isDone(db, r.id, dateKey)).length;
  const t = trackerFor(db, dateKey);
  const stepsLoggedToday = t.steps > 0;

  if (choresDone >= 5 || (stepsLoggedToday && t.steps >= db.goals.steps)) return "low";
  if (choresDone < 2 && (!stepsLoggedToday || t.steps < 3000)) return "high";
  return "medium";
}
function workoutDoneToday(db) { return db.workout.sessions.includes(todayKey()); }
function logWorkout(db) {
  const today = todayKey();
  if (!db.workout.sessions.includes(today)) db.workout.sessions.push(today);
  awardXp(db, db.activePerson, 10);
  saveDB(db);
}
function undoWorkoutToday(db) {
  db.workout.sessions = db.workout.sessions.filter((d) => d !== todayKey());
  saveDB(db);
}

/* ---- One slim "At a glance" card: water only (steps + weight live on
   the Fitness page now) ---- */
function renderTodayHealth(db) {
  const wrap = document.getElementById("todayHealth");
  if (!wrap) return;
  const t = trackerFor(db, todayKey());
  const g = db.goals;

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

  wrap.innerHTML = `
    <div class="glance-card">
      ${row("💧", "Water", `${litres(t.waterMl)} / ${litres(g.waterMl)} L`, pct(t.waterMl, g.waterMl), false,
        `<button class="btn btn--mini" data-water="${g.glassMl}">+ ${g.glassMl}</button>
         <button class="btn btn--mini btn--quiet" data-water-add>more…</button>
         <button class="btn btn--mini btn--quiet" data-water="${-g.glassMl}">−</button>`)}
    </div>`;

  renderWorkout(db);
}

/* ============================================================
   Fitness page — weight trend, steps + history, and a couple of
   plain-language tips read off her own logged data. No charting
   library (this is a dependency-free static PWA) — small hand-rolled
   SVG line/bar graphs instead, same approach as the cleaning blueprint.
   ============================================================ */

/* A calm line graph for a chronological series of numbers. Never claims
   more precision than the data has — draws nothing but a note if there
   isn't enough to show a trend. */
function svgLineGraph(values, opts) {
  opts = opts || {};
  const w = 300, h = 90, pad = 10;
  if (values.length < 2) return `<p class="view__sub" style="margin:6px 0 0">Log a couple more entries to see a trend line here.</p>`;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * stepX, pad + (1 - (v - min) / range) * (h - pad * 2)]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${opts.color || "var(--accent)"}" />`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="mini-graph" preserveAspectRatio="xMidYMid meet">
    <path d="${path}" fill="none" stroke="${opts.color || "var(--accent)"}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
  </svg>`;
}

/* A calm bar graph, for day-by-day counts (steps). Days with no logged
   value show as an (honest) empty bar rather than a guessed one. */
function svgBarGraph(values, opts) {
  opts = opts || {};
  const w = 300, h = 90, pad = 8, gap = 6;
  if (!values.length) return `<p class="view__sub" style="margin:6px 0 0">No days logged yet.</p>`;
  const max = Math.max(...values, 1);
  const barW = (w - pad * 2 - gap * (values.length - 1)) / values.length;
  const bars = values.map((v, i) => {
    const barH = Math.max(2, (v / max) * (h - pad * 2));
    const x = pad + i * (barW + gap);
    const y = h - pad - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${opts.color || "var(--gold)"}" />`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="mini-graph" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

/* Last N days of steps, in order, oldest first. 0 for a day never
   logged — not guessed, just honestly empty. */
function stepsHistory(db, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push((db.trackers[todayKey(d)] || {}).steps || 0);
  }
  return out;
}

/* Plain-language notes read off her own data — never phrased as a
   target missed, just what the numbers say. */
function fitnessTips(db) {
  const tips = [];
  const entries = db.weight.entries;
  if (entries.length >= 2) {
    const delta = +(entries[entries.length - 1].kg - entries[0].kg).toFixed(1);
    if (Math.abs(delta) >= 0.1) {
      tips.push(`Weight's ${delta < 0 ? "down" : "up"} ${Math.abs(delta)} kg since your first log — just a trend to notice, not a target.`);
    }
  }
  const loggedSteps = stepsHistory(db, 7).filter((s) => s > 0);
  if (loggedSteps.length >= 3) {
    const avg = Math.round(loggedSteps.reduce((a, b) => a + b, 0) / loggedSteps.length);
    tips.push(avg >= db.goals.steps
      ? `Averaging ~${avg.toLocaleString()} steps on the days you've logged — comfortably around your goal.`
      : `Averaging ~${avg.toLocaleString()} steps on the days you've logged — a short walk on quieter days can help close the gap.`);
  }
  if (!tips.length) tips.push("Log a few weigh-ins and step counts and JARVIS will start noticing trends here.");
  return tips;
}

/* ---- Fitness page: weight trend, step history, tips ---- */
function renderFitnessPage(db) {
  const wrap = document.getElementById("fitnessBody");
  if (!wrap) return;
  const last = lastWeightEntry(db);
  const weightSub = last ? `${last.kg} kg · ${daysAgoLabel(last.date)}` : "not logged yet";
  const nudge = weighInDue(db) ? `<p class="glance__hint" style="margin-top:6px">A fortnight or so since your last check-in — worth doing whenever suits.</p>` : "";
  const t = trackerFor(db, todayKey());
  const g = db.goals;

  wrap.innerHTML = `
    <div class="glance-card">
      <div class="glance">
        <div class="glance__top">
          <span class="glance__label">⚖️ Weight</span>
          <span class="glance__val">${weightSub}</span>
        </div>
        ${svgLineGraph(db.weight.entries.slice(-14).map((e) => e.kg))}
        ${nudge}
        <div class="glance__actions">
          <input id="weightInput" type="number" inputmode="decimal" step="0.1" min="0" placeholder="kg" style="width:80px;padding:8px 10px;border-radius:var(--radius-sm);border:1.5px solid var(--line);background:var(--surface-2);color:var(--ink)" />
          <button class="btn btn--mini" data-log-weight>Log</button>
        </div>
      </div>
    </div>
    <div class="glance-card" style="margin-top:14px">
      <div class="glance">
        <div class="glance__top">
          <span class="glance__label">👟 Steps</span>
          <span class="glance__val">${t.steps.toLocaleString()} / ${g.steps.toLocaleString()}</span>
        </div>
        <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pct(t.steps, g.steps)}%"></div></div>
        ${svgBarGraph(stepsHistory(db, 7))}
        <div class="glance__actions">
          <button class="btn btn--mini btn--quiet" data-steps-edit>update today's count</button>
        </div>
      </div>
    </div>
    <div class="glance-card" style="margin-top:14px">
      <div class="glance__top" style="margin-bottom:6px"><span class="glance__label">💡 Notes</span></div>
      ${fitnessTips(db).map((t) => `<p class="view__sub" style="margin:0 0 6px">${escapeHTML(t)}</p>`).join("")}
    </div>`;
}

/* ---- 7-minute workout — suggested intensity, logged with one tap ---- */
function renderWorkout(db) {
  const wrap = document.getElementById("workoutCard");
  if (!wrap) return;
  const done = workoutDoneToday(db);
  const intensity = suggestedWorkoutIntensity(db);
  const set = WORKOUT_SETS[intensity];
  const exList = set.exercises.map((e) => `<li>${escapeHTML(e)}</li>`).join("");

  wrap.innerHTML = `
    <div class="glance-card">
      <div class="glance">
        <div class="glance__top">
          <span class="glance__label">🏃 7-minute workout</span>
          <span class="glance__val">Suggested: ${set.label}</span>
        </div>
        <button class="steps-toggle" data-workout-toggle>▸ see exercises</button>
        <ul class="steps" id="workoutExercises" hidden>${exList}</ul>
        <div class="glance__actions">
          ${done
            ? `<button class="btn btn--mini btn--quiet" data-workout-undo>done today ✓ · undo</button>`
            : `<button class="btn btn--mini" data-workout-done>✓ Done today</button>`}
        </div>
      </div>
    </div>`;
}

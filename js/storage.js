/* ============================================================
   storage.js — the single source of truth (for now)
   Everything is saved in the browser's localStorage. Later
   (Phase 2) we swap this one file for a sync backend so Kirsten
   and Jack share the same data — nothing else needs to change.
   ============================================================ */

const STORAGE_KEY = "houseai.v1";

/* Default data the very first time the app is opened. */
function defaultData() {
  return {
    people: [
      { id: "kirsten", name: "Kirsten", colour: "#46d6f5" }, // arc-reactor cyan
      { id: "jack",    name: "Jack",    colour: "#e7b54a" }, // Iron Man gold
    ],
    activePerson: "kirsten",
    routines: [
      {
        id: uid(),
        title: "Put watch on (before work)",
        assignedTo: "kirsten",
        timeOfDay: "morning",
        repeat: "daily",
        steps: ["Grab watch off charge", "Put it on"],
      },
      {
        id: uid(),
        title: "Morning meds + vitamins",
        assignedTo: "kirsten",
        timeOfDay: "morning",
        repeat: "daily",
        steps: ["Take meds", "Take vitamins", "Big glass of water"],
      },
      {
        id: uid(),
        title: "Kitchen reset",
        assignedTo: "either",
        timeOfDay: "evening",
        repeat: "daily",
        steps: ["Dishes away", "Wipe surfaces", "Start dishwasher"],
      },
      {
        id: uid(),
        title: "Put watch on charge",
        assignedTo: "kirsten",
        timeOfDay: "evening",
        repeat: "daily",
        steps: ["Pop it on charge (~2 hrs) so it's ready for the morning"],
      },
      {
        id: uid(),
        title: "Bins out",
        assignedTo: "either",
        timeOfDay: "evening",
        repeat: "fortnightly",
        anchorDate: "2026-06-03", // a known bin day; repeats every 2 weeks from here
        steps: ["Check there's a bin liner ready", "Put the bins out"],
      },
      {
        id: uid(),
        title: "Take rubbish to the tip",
        assignedTo: "either",
        timeOfDay: "anytime",
        repeat: "once",
        steps: ["Missed bin day — drop the extra bags at the tip"],
      },
    ],
    completions: {}, // key: "routineId|YYYY-MM-DD" -> true

    // Blocked chains broken into a sequence — only the NEXT step ever shows.
    projects: [
      {
        id: uid(),
        emoji: "🧺",
        title: "Sort the laundry system",
        steps: [
          { title: "Get more baskets for the unit", done: false },
          { title: "Organise the drawers with the new baskets", done: false },
          { title: "Put away the laundry backlog", done: false },
          { title: "Catch up on the washing", done: false },
        ],
      },
    ],

    // Daily health goals + per-day tracking.
    goals: { waterMl: 2000, glassMl: 250, steps: 8000 },
    trackers: {}, // key: "YYYY-MM-DD" -> { waterMl, steps }

    // Gentle, guilt-free extras.
    gym: { perWeek: 2, sessions: [] }, // sessions = ["YYYY-MM-DD", ...]
    restDays: {},                      // "YYYY-MM-DD" -> true (a chosen do-nothing day)
    appliedSeeds: {},                  // one-time seed additions already applied

    // Link to the existing Google-Sheets finance tracker (set up in the Money tab).
    finance: {
      sheetUrl: "",      // the normal Sheet link, opened by the "Open Finances" button
      csvUrl: "",        // "Publish to web" CSV link for the Dashboard tab (read-only)
      lastValue: null,   // cached Safe-to-Spend number
      lastFetched: null, // timestamp of last successful fetch
    },

    // Live Google Calendar (read-only). clientId = her OAuth Web client ID.
    calendar: {
      clientId: "",      // safe to store (public, origin-restricted)
      lastEvents: [],    // cached events so today's plan shows instantly/offline
      lastFetched: null,
    },
  };
}

/* Fill in anything missing so older saved data gains new features
   without losing what's already there. Runs on every load. */
function normalize(db) {
  const d = defaultData();
  if (!Array.isArray(db.routines)) db.routines = d.routines;
  if (!Array.isArray(db.people) || !db.people.length) db.people = d.people;
  if (!db.activePerson) db.activePerson = d.activePerson;
  if (!db.completions) db.completions = {};
  if (!db.trackers) db.trackers = {};
  if (!Array.isArray(db.projects)) db.projects = d.projects;
  if (!db.restDays) db.restDays = {};
  if (!db.gym || typeof db.gym !== "object") db.gym = d.gym;
  if (db.gym.perWeek == null) db.gym.perWeek = d.gym.perWeek;
  if (!Array.isArray(db.gym.sessions)) db.gym.sessions = [];
  db.goals = Object.assign({}, d.goals, db.goals || {});
  db.finance = Object.assign({}, d.finance, db.finance || {});
  db.calendar = Object.assign({}, d.calendar, db.calendar || {});
  if (!Array.isArray(db.calendar.lastEvents)) db.calendar.lastEvents = [];
  if (!db.appliedSeeds) db.appliedSeeds = {};
  // Friendly migration of the old seed data
  db.people.forEach((p) => {
    if (p.name === "Kirsty") { p.name = "Kirsten"; p.colour = "#46d6f5"; }
    if (p.name === "Jack") { p.colour = "#e7b54a"; }
  });
  applySeedAdditions(db);
  return db;
}

/* One-time routine additions that should reach EXISTING installs too.
   Each block runs once (tracked in db.appliedSeeds) — so deleting an added
   routine later won't make it reappear, and nothing ever duplicates. */
function applySeedAdditions(db) {
  const additions = [
    {
      key: "brushTeeth",
      routines: [
        { title: "Brush teeth", assignedTo: "kirsten", timeOfDay: "morning", repeat: "daily",
          steps: [] },
        { title: "Brush teeth", assignedTo: "kirsten", timeOfDay: "evening", repeat: "daily",
          steps: ["2 mins — stick a song or a video on to beat the boredom"] },
      ],
    },
  ];
  additions.forEach((a) => {
    if (db.appliedSeeds[a.key]) return;
    a.routines.forEach((r) => db.routines.push(Object.assign({ id: uid() }, r)));
    db.appliedSeeds[a.key] = true;
  });
}

/* Load the whole database. Falls back to defaults on first run. */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const db = normalize(raw ? JSON.parse(raw) : defaultData());
    saveDB(db);
    return db;
  } catch (err) {
    console.warn("Could not read saved data, starting fresh.", err);
    return defaultData();
  }
}

/* Save the whole database. */
function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/* Tiny unique-id helper (no Math.random dependency on crypto). */
function uid() {
  return "id-" + (uid._n = (uid._n || 0) + 1) + "-" + Date.now().toString(36)
    + "-" + (performance.now() | 0).toString(36);
}

/* Today's date as a stable YYYY-MM-DD string (local time). */
function todayKey(d) {
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ============================================================
   storage.js — the single source of truth (for now)
   Everything is saved in the browser's localStorage. Later
   (Phase 2) we swap this one file for a sync backend so Kirsty
   and Jack share the same data — nothing else needs to change.
   ============================================================ */

const STORAGE_KEY = "houseai.v1";

/* Default data the very first time the app is opened. */
function defaultData() {
  return {
    people: [
      { id: "kirsty", name: "Kirsty", colour: "#5b8c7e" },
      { id: "jack",   name: "Jack",   colour: "#6c7bb0" },
    ],
    activePerson: "kirsty",
    routines: [
      {
        id: uid(),
        title: "Morning meds + water",
        assignedTo: "kirsty",
        timeOfDay: "morning",
        repeat: "daily",
        steps: ["Take meds", "Big glass of water"],
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
        title: "Bins out",
        assignedTo: "jack",
        timeOfDay: "evening",
        repeat: "weekly",
        repeatDay: 0, // Sunday
        steps: [],
      },
    ],
    expenses: [],
    completions: {}, // key: "routineId|YYYY-MM-DD" -> true
  };
}

/* Load the whole database. Falls back to defaults on first run. */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = defaultData();
      saveDB(seed);
      return seed;
    }
    return JSON.parse(raw);
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

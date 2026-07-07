/* ============================================================
   storage.js — the single source of truth (for now)
   Everything is saved in the browser's localStorage. Later
   (Phase 2) we swap this one file for a sync backend so Kirsten
   and Jack share the same data — nothing else needs to change.
   ============================================================ */

const STORAGE_KEY = "houseai.v1";

/* Kirsten's Google OAuth Web client ID (public + locked to the GitHub Pages
   origin, so safe to ship). Pre-configures the live calendar. */
const DEFAULT_CALENDAR_CLIENT_ID = "1070575707230-frs2bctfil1q6f05j92uic1u6s4i1i2h.apps.googleusercontent.com";

/* Default data the very first time the app is opened. */
function defaultData() {
  return {
    people: [
      { id: "kirsten", name: "Kirsten", colour: "#46d6f5" }, // arc-reactor cyan (has a calendar)
      // Jack has no calendar — JARVIS builds one from this regular work pattern.
      { id: "jack", name: "Jack", colour: "#e7b54a", // Iron Man gold
        work: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:30",
                note: "Usually in by 10–10:30 · sometimes works from home" } },
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
    gym: {
      perWeek: 2, sessions: [], // sessions = ["YYYY-MM-DD", ...]
      place: "TruGym, Huddersfield",
      hours: { weekday: "05:00–23:00", weekend: "06:00–22:00" }, // editable if they change
    },
    restDays: {},                      // "YYYY-MM-DD" -> true (a chosen do-nothing day)
    workOverrides: {},                 // "personId|YYYY-MM-DD" -> "wfh"
    liftRequests: {},                  // "YYYY-MM-DD" -> true (Jack asked for a lift)
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
      clientId: DEFAULT_CALENDAR_CLIENT_ID, // safe to store (public, origin-restricted)
      lastEvents: [],    // cached events so today's plan shows instantly/offline
      lastFetched: null,
      connectedOnce: false, // only auto-refresh after she's signed in once
      token: "",         // remembered access token (so a refresh doesn't re-login)
      tokenExp: 0,       // when that token expires (epoch ms)
      owner: "",         // which person this calendar belongs to (whoever signed in)
    },

    // Shopping — multiple sticky-note style lists.
    shopping: {
      lists: [
        { id: uid(), title: "Bits for the house", colour: "y", items: [
          { id: uid(), text: "Bin liners", done: false },
          { id: uid(), text: "More baskets for the unit", done: false },
        ] },
      ],
    },

    // Events Kirsten adds for Jack (anniversaries, appointments etc.)
    jackEvents: [],

    // Fridge/Freezer — shared stock with use-by dates (the Food page).
    food: {
      items: [],         // {id, name, where:"fridge"|"freezer", useBy:"YYYY-MM-DD"|null, added, note?}
      importedIds: [],   // meal-app dish ids already pulled in (so we don't re-add)
    },

    // Learn Punjabi — starter words (verify/correct freely; add your own).
    punjabi: {
      words: [
        { id: uid(), en: "Hello (greeting)", pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", rom: "Sat sri akaal" },
        { id: uid(), en: "Thank you", pa: "ਧੰਨਵਾਦ", rom: "Dhanvaad" },
        { id: uid(), en: "Yes", pa: "ਹਾਂ", rom: "Haan" },
        { id: uid(), en: "No", pa: "ਨਹੀਂ", rom: "Nahin" },
        { id: uid(), en: "Water", pa: "ਪਾਣੀ", rom: "Paani" },
        { id: uid(), en: "Pain", pa: "ਦਰਦ", rom: "Dard" },
        { id: uid(), en: "Medicine", pa: "ਦਵਾਈ", rom: "Davaai" },
        { id: uid(), en: "Are you okay?", pa: "ਕੀ ਤੁਸੀਂ ਠੀਕ ਹੋ?", rom: "Ki tusi theek ho?" },
        { id: uid(), en: "Please", pa: "ਕਿਰਪਾ ਕਰਕੇ", rom: "Kirpa karke" },
        { id: uid(), en: "Food", pa: "ਖਾਣਾ", rom: "Khaana" },
      ],
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
  if (!db.workOverrides) db.workOverrides = {};
  if (!db.liftRequests) db.liftRequests = {};
  if (!db.gym || typeof db.gym !== "object") db.gym = d.gym;
  if (db.gym.perWeek == null) db.gym.perWeek = d.gym.perWeek;
  if (!Array.isArray(db.gym.sessions)) db.gym.sessions = [];
  if (!db.gym.place) db.gym.place = d.gym.place;
  if (!db.gym.hours) db.gym.hours = d.gym.hours;
  db.goals = Object.assign({}, d.goals, db.goals || {});
  db.finance = Object.assign({}, d.finance, db.finance || {});
  db.calendar = Object.assign({}, d.calendar, db.calendar || {});
  if (!db.calendar.clientId) db.calendar.clientId = DEFAULT_CALENDAR_CLIENT_ID; // reaches older installs too
  if (!Array.isArray(db.calendar.lastEvents)) db.calendar.lastEvents = [];
  // Existing connections were Kirsten's — tag her as the owner so it's hidden from Jack.
  if (!db.calendar.owner && db.calendar.connectedOnce) db.calendar.owner = "kirsten";
  if (!db.punjabi || !Array.isArray(db.punjabi.words)) db.punjabi = d.punjabi;
  if (!db.food || !Array.isArray(db.food.items)) db.food = d.food;
  if (!Array.isArray(db.food.importedIds)) db.food.importedIds = [];
  if (!db.shopping || !Array.isArray(db.shopping.lists)) db.shopping = d.shopping;
  if (!Array.isArray(db.jackEvents)) db.jackEvents = [];
  if (!db.appliedSeeds) db.appliedSeeds = {};
  // Friendly migration of the old seed data
  db.people.forEach((p) => {
    if (p.name === "Kirsty") { p.name = "Kirsten"; p.colour = "#46d6f5"; }
    if (p.name === "Jack") {
      p.colour = "#e7b54a";
      if (!p.work || typeof p.work !== "object") {
        p.work = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:30",
                   note: "Usually in by 10–10:30 · sometimes works from home" };
      }
    }
  });
  applySeedAdditions(db); // may add new routines — tag areas AFTER this
  // Tag every task with an "area": 'me' (personal) | 'cleaning' | 'household'.
  db.routines.forEach((r) => { if (!r.area) r.area = inferArea(r); });
  return db;
}

/* Guess a task's area from its wording / assignment (for tasks made before
   areas existed). 'me' = personal, else a shared household area. */
function inferArea(r) {
  const t = (r.title || "").toLowerCase();
  if (/\bbin|tip|dog|pet|feed|hoover|vacuum|rubbish|recycl/.test(t)) return "household";
  if (/clean|kitchen|bathroom|dust|mop|dish|wipe|tidy|surface|laundry|wash|hoover|floor/.test(t)) return "cleaning";
  if (r.assignedTo === "either" || r.assignedTo === "both") return "household";
  return "me";
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
    {
      key: "feedDogs",
      routines: [
        { title: "Feed dogs", assignedTo: "jack", timeOfDay: "evening", repeat: "daily",
          steps: ["Usually Jack — Kirsten on her days off"] },
      ],
    },
  ];
  additions.forEach((a) => {
    if (db.appliedSeeds[a.key]) return;
    a.routines.forEach((r) => db.routines.push(Object.assign({ id: uid() }, r)));
    db.appliedSeeds[a.key] = true;
  });

  // One-time seed of Jack's upcoming gigs & events (added June 2026).
  if (!db.appliedSeeds.jackEvents2026) {
    const jackGigs = [
      { title: "Dylan Gossett · Millennium Square, Leeds", date: "2026-06-30", time: "18:30", allDay: false },
      { title: "The Wombats · The Piece Hall, Halifax", date: "2026-08-21", time: "18:00", allDay: false },
      { title: "The Black Keys · Eventim Apollo, London", date: "2026-08-31", time: "19:00", allDay: false },
      { title: "Benidorm 🌞 (back 14 Sep)", date: "2026-09-11", time: null, allDay: true },
      { title: "Shinedown · AO Arena, Manchester", date: "2026-11-20", time: "18:00", allDay: false },
      { title: "Nothing But Thieves · Co-op Live, Manchester", date: "2027-02-12", time: "19:00", allDay: false },
    ];
    jackGigs.forEach((e) => db.jackEvents.push(Object.assign({ id: uid() }, e)));
    db.appliedSeeds.jackEvents2026 = true;
  }

  // Bottomless brunch with Jack's school mates — TBC, not booked yet (added June 2026).
  if (!db.appliedSeeds.jackEvents2026b) {
    db.jackEvents.push({ id: uid(), title: "Bottomless brunch · Jack's school mates (TBC)", date: "2026-08-08", time: null, allDay: true });
    db.appliedSeeds.jackEvents2026b = true;
  }

  // Benidorm is 11–14 Sep — give the already-seeded event its full range
  // now that multi-day events are supported (July 2026).
  if (!db.appliedSeeds.benidormRange) {
    const b = db.jackEvents.find((e) => (e.title || "").startsWith("Benidorm"));
    if (b) { b.endDate = "2026-09-14"; b.title = "Benidorm 🌞"; }
    db.appliedSeeds.benidormRange = true;
  }

  // Lash infill + brow wax/tint — every 3 weeks, landing on her nearest day
  // off rather than a fixed date (added July 2026, last done 7 Jul 2026).
  // rollOnTick: it's a booking, so the cycle should count from whenever she
  // actually goes, not a rigid schedule.
  if (!db.appliedSeeds.lashBrowRoutine) {
    db.routines.push({
      id: uid(),
      title: "Lash infill + brow wax/tint",
      area: "me",
      assignedTo: "kirsten",
      timeOfDay: "anytime",
      repeat: "periodic",
      intervalDays: 21,
      nearestDayOff: true,
      rollOnTick: true,
      anchorDate: "2026-07-07",
      steps: [],
    });
    db.appliedSeeds.lashBrowRoutine = true;
  }

  // Order anxiety meds — her 3-week pill pot started Sun 5 Jul 2026 and the
  // meds run out exactly when the pot does, ~26 Jul. Reminder fires a week
  // ahead (19 Jul) to leave time for the repeat prescription to arrive, then
  // rolls forward 3 weeks from whichever date she actually orders on
  // (added July 2026).
  if (!db.appliedSeeds.anxietyMedsRoutine) {
    db.routines.push({
      id: uid(),
      title: "Order anxiety medication (repeat prescription)",
      area: "me",
      assignedTo: "kirsten",
      timeOfDay: "anytime",
      repeat: "periodic",
      intervalDays: 21,
      rollOnTick: true,
      anchorDate: "2026-07-19",
      steps: ["Pill pot runs out 26 Jul — order in good time for the prescription to arrive"],
    });
    db.appliedSeeds.anxietyMedsRoutine = true;
  }

  // Retrofit rollOnTick + the clarified meds note onto her ALREADY-created
  // routines from the two seeds above (their creation blocks only run once,
  // so editing those object literals doesn't reach her live device).
  if (!db.appliedSeeds.periodicRollFlag) {
    db.routines.forEach((r) => {
      if (r.repeat !== "periodic") return;
      if (r.title.startsWith("Lash infill")) r.rollOnTick = true;
      if (r.title.startsWith("Order anxiety")) {
        r.rollOnTick = true;
        r.steps = ["Pill pot runs out 26 Jul — order in good time for the prescription to arrive"];
      }
    });
    db.appliedSeeds.periodicRollFlag = true;
  }

  // Biotin + magnesium, alternating every other day (one or the other, every
  // single day) — biotin's next dose is tomorrow, magnesium fills the day in
  // between. Fixed calendar cadence, NOT rollOnTick: missing a dose shouldn't
  // shift the whole rhythm, it should just resume on the next scheduled day
  // (added July 2026).
  if (!db.appliedSeeds.biotinMagnesium) {
    db.routines.push(
      {
        id: uid(), title: "Biotin supplement (every other day)", area: "me",
        assignedTo: "kirsten", timeOfDay: "morning", repeat: "periodic",
        intervalDays: 2, anchorDate: "2026-07-08", steps: [],
      },
      {
        id: uid(), title: "Magnesium supplement (every other day)", area: "me",
        assignedTo: "kirsten", timeOfDay: "morning", repeat: "periodic",
        intervalDays: 2, anchorDate: "2026-07-09", steps: [],
      },
    );
    db.appliedSeeds.biotinMagnesium = true;
  }

  // Iron supplement, weekly on Saturdays (added July 2026).
  if (!db.appliedSeeds.ironWeekly) {
    db.routines.push({
      id: uid(), title: "Iron supplement", area: "me", assignedTo: "kirsten",
      timeOfDay: "morning", repeat: "weekly", repeatDay: 6, steps: [],
    });
    db.appliedSeeds.ironWeekly = true;
  }

  // Refill the meds pot every 3 weeks on the Saturday — or the day before
  // (Friday, then Thursday, Wednesday) if that's a day off instead, since
  // it's more convenient to sit down and load it up on a day off. Fixed
  // cadence, NOT rollOnTick — the pot's 3-week rhythm doesn't shift just
  // because refilling happened a bit early or late. Lists each individual
  // medication that goes in as a checklist below the reminder (added July
  // 2026; first refill Sat 25 Jul, the Saturday before the current pot
  // runs out).
  if (!db.appliedSeeds.potRefillRoutine) {
    db.routines.push({
      id: uid(),
      title: "Refill meds pot (3 weeks)",
      area: "me",
      assignedTo: "kirsten",
      timeOfDay: "anytime",
      repeat: "periodic",
      intervalDays: 21,
      nearestDayOff: true,
      dayOffSearch: "before",
      anchorDate: "2026-07-25",
      steps: [
        "Anxiety medication — daily",
        "Biotin — every other day",
        "Magnesium — every other day",
        "Iron — Saturdays only",
      ],
    });
    db.appliedSeeds.potRefillRoutine = true;
  }

  // Photograph one cookbook a month, starting August — source material for
  // the meal planner app she's building (added July 2026).
  if (!db.appliedSeeds.cookbookMonthly) {
    db.routines.push({
      id: uid(),
      title: "Photograph a cookbook",
      area: "me",
      assignedTo: "kirsten",
      timeOfDay: "anytime",
      repeat: "monthly",
      anchorDate: "2026-08-01",
      steps: ["For the meal planner app — cover + all the recipe pages"],
    });
    db.appliedSeeds.cookbookMonthly = true;
  }
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

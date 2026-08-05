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
      { id: "kirsten", name: "Kirsten", colour: "#46d6f5", baseLevel: 0, birthdate: "1995-05-13" }, // arc-reactor cyan (has a calendar)
      // Jack has no calendar — JARVIS builds one from this regular work pattern.
      { id: "jack", name: "Jack", colour: "#e7b54a", baseLevel: 0, birthdate: "1997-08-20", // Iron Man gold
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

    // Weight — fortnightly-minimum check-in, entirely manual (no scale
    // she owns talks to a website — see the workout section below for why).
    weight: {
      entries: [], // { date: "YYYY-MM-DD", kg }
    },

    // 7-minute home workout — replaced the old gym-membership tracker
    // (membership cancelled). Gentle, guilt-free: a suggested intensity
    // for today, logged with one tap.
    workout: {
      sessions: [], // "YYYY-MM-DD" dates a workout was done
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

    // Cleaning — an interactive house blueprint for Kirsten. Click a room,
    // see its jobs. Priority (green/amber/red) is set by HER, never
    // auto-escalated from days-since-clean — that would be a guilt
    // mechanic, which cuts against the no-guilt design.
    cleaningGame: {
      rooms: [], // { id, name, floor, icon, lastFullClean, priority, notes }
    },

    // Laundry — a live stage queue rather than a flat task. Each load moves
    // dirty -> waiting -> washing -> drying -> folded -> away; reaching
    // "away" removes it (no lingering "done" pile — immediate reward, not
    // a hoarded list). dailyWear tallies daily-worn clothes per person and
    // only becomes an actual load once there's realistically enough for a
    // wash (see DAILY_WEAR_LOAD_THRESHOLD) — a load-per-day would just spam
    // the queue, which is the opposite of what a laundry tracker is for.
    laundry: {
      loads: [], // { id, type, stage, createdDate }
      lastDailyWearDate: null,
      dailyWear: { kirsten: 0, jack: 0 },
    },

    // Waste — how full the "waiting for a tip run" pile is. Only rubbish
    // she can't do anything about tonight (the outside bin already has its
    // own fortnightly "Bins out" routine + a one-off "missed it" task,
    // kept separate). carCapacity is roughly how many bags fit in the car.
    waste: {
      outsideBagsWaiting: 0,
      carCapacity: 10,
      lastTipRun: null,
    },

    // XP — one pool per person, additive only (never goes down). Started as
    // self-care-only on the Health page; now also earned from ticking
    // cleaning/household chores, for BOTH of you — the level number starts
    // at each person's baseLevel (see people[]) rather than 1, and climbs
    // from there. Reintroducing chore-XP was a deliberate, confirmed call
    // (it had been dropped twice before as a chores-only companion) — this
    // time it's unified with the self-care system, not a standalone one.
    xp: { kirsten: 0, jack: 0 },

    // Language practice (Learn Punjabi) — its own slow-climbing level,
    // separate from the household XP pool. Awarded in small amounts (see
    // punjabi.js) from actually using the flashcards, deliberately slow
    // since real fluency takes many, many reps.
    languageXp: 0,

    // The dogs — their own profile each (portrait, level), separate from
    // both humans'. Care actions also build a per-person companionship
    // score with each dog (shown as a bar on that person's own hero) and
    // give the person a small XP boost of their own — so it counts three
    // ways: the dog's bond grows, that relationship-with-that-dog grows,
    // and the person's own level ticks up a little too.
    pets: [
      { id: "effie", name: "Effie", nickname: "Eff", birthdate: "2015-04-04",
        traits: [{ icon: "🥰", label: "Cuddle Bug" }, { icon: "🍗", label: "Snack Inspector" }, { icon: "👑", label: "Tiny Queen" }],
        snack: "Literally all food", mood: "Judging Everyone" },
      { id: "oddie", name: "Oddie", nickname: "Oddball", birthdate: "2022-08-26",
        traits: [{ icon: "🎾", label: "Ball Obsessed" }, { icon: "🤪", label: "Chaos Gremlin" }, { icon: "❤️", label: "Velcro Dog" }],
        snack: "Dad's chicken nuggets", mood: "Ready for Adventure" },
    ],
    petCare: {
      xp: { effie: 0, oddie: 0 },                                                  // each dog's own profile XP
      companionship: { "kirsten|effie": 0, "kirsten|oddie": 0, "jack|effie": 0, "jack|oddie": 0 }, // per person+dog
      doneToday: {},     // "petId|action|YYYY-MM-DD" -> true (feed/water/bed — once each, resets daily)
      minutesToday: {},  // "petId|action|YYYY-MM-DD" -> minutes (walk/play — stacks in 15-min steps through the day)

      // Flea & worm treatment — every 3 months. She doesn't know when it
      // was last done for either dog, so this starts fresh from nothing
      // rather than guessing a date (no guilt for an unknown history).
      fleaWorm: { effie: { lastDone: null }, oddie: { lastDone: null } },

      // Claw clipping — every 2 weeks, but logged one claw at a time since
      // neither dog will sit through a full set in one go. 18 claws per
      // dog (5 on each front paw incl. dewclaw, 4 on each back paw).
      // Completing all 18 resets the set and counts as one cycle; two
      // completed cycles unlocks a suggestion to book jabs + insurance.
      claws: {
        effie: { done: {}, cyclesCompleted: 0 },
        oddie: { done: {}, cyclesCompleted: 0 },
      },
    },

    // Toilet training — one shared schedule for both dogs together (not
    // per-dog), regenerated fresh each day from TOILET_TRAINING_SCHEDULE.
    // A failed walk auto-adds a retry 20 minutes later rather than just
    // marking it failed and moving on. startDate anchors an auto-advancing
    // day counter (see toiletTrainingDayNumber) so "today's tips" always
    // matches the actual day of the plan without needing manual correction
    // each time she pastes the next day's guidance.
    // log[] records EVERY toileting outcome chronologically (scheduled walks
    // AND ad-hoc trips/accidents logged any time of day) — separate from
    // items[] (today's schedule display) so a full history survives each
    // day's regeneration, for spotting real habits day to day.
    toiletTraining: { lastGeneratedDate: null, items: [], notes: "", startDate: null, log: [] },

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
  delete db.gym; // membership cancelled — replaced by db.workout (7-minute home workout)
  if (!db.weight || typeof db.weight !== "object") db.weight = d.weight;
  if (!Array.isArray(db.weight.entries)) db.weight.entries = [];
  if (!db.workout || typeof db.workout !== "object") db.workout = d.workout;
  if (!Array.isArray(db.workout.sessions)) db.workout.sessions = [];
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
  if (!db.cleaningGame || typeof db.cleaningGame !== "object") db.cleaningGame = d.cleaningGame;
  if (!Array.isArray(db.cleaningGame.rooms)) db.cleaningGame.rooms = [];
  if (!db.laundry || typeof db.laundry !== "object") db.laundry = d.laundry;
  if (!Array.isArray(db.laundry.loads)) db.laundry.loads = [];
  if (!db.laundry.dailyWear || typeof db.laundry.dailyWear !== "object") db.laundry.dailyWear = { kirsten: 0, jack: 0 };
  if (!db.waste || typeof db.waste !== "object") db.waste = d.waste;
  if (typeof db.waste.outsideBagsWaiting !== "number") db.waste.outsideBagsWaiting = 0;
  if (typeof db.waste.carCapacity !== "number") db.waste.carCapacity = 10;
  if (!db.xp || typeof db.xp !== "object") db.xp = { kirsten: 0, jack: 0 };
  if (typeof db.selfCareXp === "number") { db.xp.kirsten = (db.xp.kirsten || 0) + db.selfCareXp; delete db.selfCareXp; }
  if (typeof db.xp.kirsten !== "number") db.xp.kirsten = 0;
  if (typeof db.xp.jack !== "number") db.xp.jack = 0;
  if (typeof db.languageXp !== "number") db.languageXp = 0;
  if (!Array.isArray(db.pets) || !db.pets.length) db.pets = d.pets;
  if (!db.petCare || typeof db.petCare !== "object") db.petCare = d.petCare;
  db.pets.forEach((p) => { if (typeof db.petCare.xp[p.id] !== "number") db.petCare.xp[p.id] = 0; });
  if (!db.petCare.companionship || typeof db.petCare.companionship !== "object") db.petCare.companionship = {};
  if (!db.petCare.doneToday) db.petCare.doneToday = {};
  if (!db.petCare.minutesToday) db.petCare.minutesToday = {};
  if (!db.petCare.fleaWorm) db.petCare.fleaWorm = {};
  if (!db.petCare.claws) db.petCare.claws = {};
  db.pets.forEach((p) => {
    if (!db.petCare.fleaWorm[p.id]) db.petCare.fleaWorm[p.id] = { lastDone: null };
    if (!db.petCare.claws[p.id]) db.petCare.claws[p.id] = { done: {}, cyclesCompleted: 0 };
  });
  if (!db.toiletTraining) db.toiletTraining = { lastGeneratedDate: null, items: [] };
  if (typeof db.toiletTraining.notes !== "string") db.toiletTraining.notes = "";
  if (!db.toiletTraining.startDate) db.toiletTraining.startDate = todayKey();
  if (!Array.isArray(db.toiletTraining.log)) db.toiletTraining.log = [];
  db.people.forEach((p) => { if (typeof p.baseLevel !== "number") p.baseLevel = 0; });
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

  // Cleaning game — seed her real house layout (a 4-level back-to-back
  // terrace, roadside only). Two floors known so far; more to come as she
  // describes them. Credits the two full cleans she's already done this
  // week as if logged through the game, so the companion doesn't start
  // from zero despite the work already being done (added August 2026).
  if (!db.appliedSeeds.cleaningGameRooms) {
    const kitchenId = uid();
    const livingRoomId = uid();
    db.cleaningGame.rooms.push(
      { id: kitchenId, name: "Kitchen", floor: "Lower floor", icon: "🍳", lastFullClean: "2026-08-03" },
      { id: livingRoomId, name: "Living room & entry hall", floor: "Main floor", icon: "🛋️", lastFullClean: "2026-08-04" },
    );
    // Dryer filter/condenser clean — UK manufacturer guidance is roughly
    // monthly for normal use; first one due now since it hasn't been done
    // on any known schedule yet.
    db.routines.push({
      id: uid(),
      title: "Clean dryer filter/condenser",
      area: "cleaning",
      room: livingRoomId,
      assignedTo: "either",
      timeOfDay: "anytime",
      repeat: "monthly",
      anchorDate: "2026-08-04",
      steps: [],
    });

    db.appliedSeeds.cleaningGameRooms = true;
  }

  // Complete the house layout with the floors she described (added August
  // 2026) — shells only, no lastFullClean and no attached maintenance tasks
  // yet. Deliberately NOT seeding the dog cage/coats/toilet
  // seat/limescale/carpet/dusting tasks she mentioned in the same message —
  // that's a lot to land on the Cleaning page at once, and she explicitly
  // asked to be helped prioritise rather than shown everything simultaneously.
  // These get added once she's confirmed what to tackle first.
  if (!db.appliedSeeds.cleaningGameFloors) {
    db.cleaningGame.rooms.push(
      { id: uid(), name: "Bedroom", floor: "Third floor", icon: "🛏️", lastFullClean: null },
      { id: uid(), name: "Bathroom", floor: "Third floor", icon: "🛁", lastFullClean: null },
      { id: uid(), name: "Landing", floor: "Third floor", icon: "🪜", lastFullClean: null },
      { id: uid(), name: "Loft", floor: "Top floor", icon: "📦", lastFullClean: null },
    );
    db.appliedSeeds.cleaningGameFloors = true;
  }

  // Storage bits for the bedroom/bathroom sort-out — added to her existing
  // "Bits for the house" shopping note rather than a new list (added August
  // 2026).
  if (!db.appliedSeeds.storageShoppingItems) {
    const list = db.shopping.lists.find((l) => l.title === "Bits for the house") || db.shopping.lists[0];
    if (list) {
      list.items.push(
        { id: uid(), text: "Large shoe tub — Kirsten's", done: false },
        { id: uid(), text: "Large shoe tub — Jack's", done: false },
        { id: uid(), text: "Under-bed storage sets — bedding", done: false },
        { id: uid(), text: "Under-bed storage sets — towels", done: false },
      );
    }
    db.appliedSeeds.storageShoppingItems = true;
  }

  // ============================================================
  // Full house blueprint (added August 2026) — corrects the earlier
  // guessed floor names/layout now she's given the real one, splits the
  // combined "Living room & entry hall" into two rooms, and seeds her
  // complete task lists. Runs as a correction pass since the two seeds
  // above are already applied on her device (editing their literals alone
  // wouldn't reach her).
  // ============================================================
  if (!db.appliedSeeds.blueprintRebuild) {
    // ---- Fix floor names ----
    db.cleaningGame.rooms.forEach((r) => {
      if (r.floor === "Main floor") r.floor = "Ground Floor";
      if (r.floor === "Lower floor") r.floor = "Lower Ground Floor";
      if (r.floor === "Third floor") r.floor = "First Floor";
      if (r.floor === "Top floor") r.floor = "Loft Floor";
    });

    // ---- Split the combined room. Keeping its existing id as "Living
    // Room" means the dryer routine (already tagged to that id) doesn't
    // need repointing — it lands in Living Room. Say so, in case that's
    // actually the Entryway. ----
    const combined = db.cleaningGame.rooms.find((r) => r.name === "Living room & entry hall");
    if (combined) {
      combined.name = "Living Room";
      combined.icon = "🛋️";
      db.cleaningGame.rooms.push({
        id: uid(), name: "Entryway", floor: "Ground Floor", icon: "🚪",
        lastFullClean: combined.lastFullClean,
      });
    }

    // ---- Manual priority (Green/Amber/Red) + notes on every room. Never
    // auto-escalated from days-since-clean — that would be a guilt
    // mechanic; she sets/changes this herself from the room view. ----
    const PRIORITY_DEFAULTS = {
      "Kitchen": "green", "Living Room": "green", "Entryway": "amber",
      "Bedroom": "amber", "Bathroom": "red", "Landing": "green", "Loft": "red",
    };
    db.cleaningGame.rooms.forEach((r) => {
      if (!r.priority) r.priority = PRIORITY_DEFAULTS[r.name] || "green";
      if (r.notes == null) r.notes = "";
    });

    // ---- New rooms that didn't exist at all yet ----
    const dogAreaId = uid(), stairsId = uid();
    db.cleaningGame.rooms.push(
      { id: dogAreaId, name: "Dog Area", floor: "Ground Floor", icon: "🐾", lastFullClean: null, priority: "amber", notes: "" },
      { id: stairsId, name: "Stairs", floor: "Ground Floor", icon: "🪜", lastFullClean: null, priority: "green", notes: "" },
    );

    const roomId = (name) => (db.cleaningGame.rooms.find((r) => r.name === name) || {}).id;
    const entrywayId = roomId("Entryway");
    const livingRoomId = roomId("Living Room");
    const kitchenId = roomId("Kitchen");
    const bedroomId = roomId("Bedroom");
    const bathroomId = roomId("Bathroom");
    const landingId = roomId("Landing");

    // ---- Task builders. "once" = shows until ticked, then gone (used for
    // declutter/organise/deep-clean jobs). Weekly tasks default to Sunday —
    // edit any of them individually if a different day suits better. ----
    const T = (title, room, repeat, extra) => Object.assign(
      { id: uid(), title, area: "cleaning", assignedTo: "either", timeOfDay: "anytime", room, repeat, steps: [] },
      extra || {}
    );
    const daily = (title, room) => T(title, room, "daily");
    const weekly = (title, room) => T(title, room, "weekly", { repeatDay: 0 });
    const once = (title, room, steps) => T(title, room, "once", steps ? { steps } : undefined);
    const monthly = (title, room, anchor) => T(title, room, "monthly", { anchorDate: anchor || "2026-08-04" });

    const newTasks = [
      // Entryway
      once("Sort coats", entrywayId), once("Donate unwanted coats", entrywayId), once("Organise shoes", entrywayId),
      weekly("Hoover", entrywayId), weekly("Mop floor", entrywayId), weekly("Dust skirting boards", entrywayId),
      // Living Room
      weekly("Hoover", livingRoomId), weekly("Dust", livingRoomId),
      weekly("General tidy", livingRoomId), weekly("Remove dog hair", livingRoomId),
      // Dog Area
      weekly("Empty dog crate", dogAreaId), weekly("Wash dog bedding", dogAreaId),
      monthly("Clean and disinfect crate", dogAreaId), monthly("Replace bedding", dogAreaId),
      // Stairs (all three flights — whole house)
      weekly("Hoover all stairs", stairsId), once("Carpet clean all stairs", stairsId), weekly("Dust stairs", stairsId),
      // Kitchen — daily
      daily("Empty dishwasher", kitchenId), daily("Load dishwasher", kitchenId), daily("Wipe surfaces", kitchenId),
      daily("Clean hob", kitchenId), daily("Empty bin", kitchenId), daily("Sweep floor", kitchenId),
      // Kitchen — weekly
      weekly("Mop floor", kitchenId), weekly("Clean microwave", kitchenId), weekly("Wipe cupboard fronts", kitchenId),
      weekly("Clean sink", kitchenId), weekly("Clean fridge shelves", kitchenId),
      // Kitchen — deep clean / organisation
      once("Clean inside cupboards", kitchenId), once("Organise under sink", kitchenId), once("Clean fridge", kitchenId),
      once("Clean freezer", kitchenId), once("Clean oven", kitchenId), once("Clean behind appliances", kitchenId),
      once("Declutter food cupboards", kitchenId), once("Organise spices", kitchenId),
      // Bedroom — cleaning
      weekly("Change bedding", bedroomId), weekly("Hoover", bedroomId), once("Carpet clean", bedroomId),
      weekly("Dust", bedroomId), monthly("Clean windows", bedroomId),
      // Bedroom — organisation
      once("Sort clothes", bedroomId), once("Donate unwanted clothes", bedroomId), once("Organise wardrobe", bedroomId),
      // Bedroom — makeup
      once("Dispose of expired makeup products", bedroomId), once("Organise makeup", bedroomId),
      monthly("Clean makeup brushes", bedroomId),
      // Bedroom — storage projects (shopping items already on her list)
      once("Sort bedding into sets for under-bed storage", bedroomId), once("Sort towels into sets", bedroomId),
      once("Organise shoes into storage tubs", bedroomId),
      // Bathroom
      once("Full declutter", bathroomId), once("Clean cupboards", bathroomId),
      weekly("Clean toilet", bathroomId), weekly("Clean sink", bathroomId), weekly("Clean bath/shower", bathroomId),
      weekly("Mop floor", bathroomId), weekly("Remove limescale from shower screen", bathroomId),
      once("Replace toilet seat", bathroomId, ["Fixings are stuck — try penetrating oil + 10 min wait, then a hairdryer on the bolt (metal expands); hacksaw through the bolt as a last resort"]),
      // Landing
      weekly("Hoover", landingId), once("Carpet clean", landingId),
      weekly("Dust", landingId), weekly("Clean skirting boards", landingId),
    ];
    newTasks.forEach((t) => db.routines.push(t));

    // Whole-house dust — not tied to one room, shows in "Other jobs".
    db.routines.push(weekly("Dust throughout house", null));

    // Superseded by the itemised kitchen daily list above (same jobs, more
    // specific — keeping both would just duplicate).
    db.routines = db.routines.filter((r) => r.title !== "Kitchen reset");

    // ---- Two projects (only two — Coats/storage/shoe-sorting etc. stay as
    // plain room tasks above; turning every list into a project would put
    // 5+ "Next:" cards on Mini missions at once). ----
    db.projects.push(
      {
        id: uid(), emoji: "🗄️", title: "Kirsten's corner",
        steps: [
          { title: "Empty everything out", done: false },
          { title: "Categorise items", done: false },
          { title: "Throw away rubbish", done: false },
          { title: "Donate unwanted items", done: false },
          { title: "Create a storage solution", done: false },
          { title: "Decorate", done: false },
          { title: "Maintain it", done: false },
        ],
      },
      {
        id: uid(), emoji: "📦", title: "Loft reorganisation",
        steps: [
          { title: "Hoover the loft", done: false },
          { title: "Dust the loft", done: false },
          { title: "Carpet clean the loft", done: false },
          { title: "Sort everything: keep / donate / sell / bin / belongs elsewhere", done: false },
          { title: "Reorganise into a proper hangout space", done: false },
        ],
      },
    );

    // ---- Shopping — the items not already on her list ----
    const bits = db.shopping.lists.find((l) => l.title === "Bits for the house") || db.shopping.lists[0];
    if (bits) {
      bits.items.push(
        { id: uid(), text: "Limescale remover", done: false },
        { id: uid(), text: "Carpet shampoo", done: false },
        { id: uid(), text: "Replacement toilet seat", done: false },
        { id: uid(), text: "Penetrating oil (WD-40)", done: false },
        { id: uid(), text: "Cleaning cloths", done: false },
        { id: uid(), text: "Dog bedding detergent", done: false },
      );
    }

    db.appliedSeeds.blueprintRebuild = true;
  }

  // ============================================================
  // Household Operations expansion (added August 2026) — the laundry
  // stage tracker + bin/waste tracking. Seeds her actual stated backlog
  // (~8 loads waiting to wash, ~4 clean loads waiting to be put away) so
  // the queue starts matching reality instead of empty, and adds the one
  // bathroom task doc 2 names as a laundry trigger that wasn't in the
  // original room list (towels).
  // ============================================================
  if (!db.appliedSeeds.householdOps) {
    const bathroomId = (db.cleaningGame.rooms.find((r) => r.name === "Bathroom") || {}).id;
    if (bathroomId) {
      db.routines.push({
        id: uid(), title: "Change towels", area: "cleaning", room: bathroomId,
        assignedTo: "either", timeOfDay: "anytime", repeat: "weekly", repeatDay: 0, steps: [],
      });
    }

    for (let i = 0; i < 8; i++) db.laundry.loads.push({ id: uid(), type: "Mixed wash", stage: "waiting", createdDate: todayKey() });
    for (let i = 0; i < 4; i++) db.laundry.loads.push({ id: uid(), type: "Mixed wash", stage: "folded", createdDate: todayKey() });

    db.appliedSeeds.householdOps = true;
  }

  // ============================================================
  // Self-care character panel (added August 2026) — the two personal-care
  // routines the Health page's icon ring needs that didn't already exist.
  // Deliberately no fixed day/cadence: shown as "days since last done"
  // rather than a due-date, so there's nothing to be "behind" on.
  // ============================================================
  if (!db.appliedSeeds.selfCareRoutines) {
    db.routines.push(
      { id: uid(), title: "Wash hair", area: "me", assignedTo: "kirsten", timeOfDay: "anytime", repeat: "weekly", repeatDay: 0, steps: [] },
      { id: uid(), title: "Bath/shower", area: "me", assignedTo: "kirsten", timeOfDay: "anytime", repeat: "weekly", repeatDay: 3, steps: [] },
    );
    db.appliedSeeds.selfCareRoutines = true;
  }

  // ============================================================
  // Appearance category (added August 2026) — the Home character panel
  // grew a third stat group (Health / Hygiene / Appearance) and needed
  // four routines that didn't exist yet. Hair dye is "every six months
  // minimum" — modelled as periodic + rollOnTick, same as lash/brow, so
  // doing it early just restarts the 6-month clock from that date rather
  // than sticking to a rigid calendar.
  // ============================================================
  if (!db.appliedSeeds.appearanceRoutines) {
    db.routines.push(
      { id: uid(), title: "Apply skin oil", area: "me", assignedTo: "kirsten", timeOfDay: "morning", repeat: "daily", steps: [] },
      { id: uid(), title: "Brush hair", area: "me", assignedTo: "kirsten", timeOfDay: "morning", repeat: "daily", steps: [] },
      { id: uid(), title: "Shave", area: "me", assignedTo: "kirsten", timeOfDay: "anytime", repeat: "weekly", repeatDay: 0, steps: [] },
      { id: uid(), title: "Dye hair", area: "me", assignedTo: "kirsten", timeOfDay: "anytime", repeat: "periodic", intervalDays: 183, rollOnTick: true, anchorDate: todayKey(), steps: [] },
    );
    db.appliedSeeds.appearanceRoutines = true;
  }

  // Bathroom scales — needed for the new fortnightly weigh-in, doesn't
  // exist in the house yet (added August 2026).
  if (!db.appliedSeeds.scalesShoppingItem) {
    const bits = db.shopping.lists.find((l) => l.title === "Bits for the house") || db.shopping.lists[0];
    if (bits) bits.items.push({ id: uid(), text: "Bathroom scales", done: false });
    db.appliedSeeds.scalesShoppingItem = true;
  }

  // Correction: levels were briefly seeded starting at age (31) — she
  // decided against that and wants a plain 0-start instead. This forces
  // it once on installs that already have the old baseLevel stamped in
  // (the normal "fill if missing" migration above won't touch a value
  // that's already set to 31).
  if (!db.appliedSeeds.baseLevelZero) {
    db.people.forEach((p) => { p.baseLevel = 0; });
    db.appliedSeeds.baseLevelZero = true;
  }

  // Effie & Oddie's character-card flavour (added August 2026) — her
  // pets array already exists on-device with just {id, name}, so the new
  // fields in defaultData() won't reach her without an explicit patch
  // here. Age is stored as a birthdate and computed live (see
  // petAge()) rather than a static number, so it doesn't go stale.
  if (!db.appliedSeeds.petFlavour) {
    const effie = db.pets.find((p) => p.id === "effie");
    if (effie) {
      Object.assign(effie, {
        nickname: "Eff", birthdate: "2015-04-04",
        traits: [{ icon: "🥰", label: "Cuddle Bug" }, { icon: "🍗", label: "Snack Inspector" }, { icon: "👑", label: "Tiny Queen" }],
        snack: "Literally all food", mood: "Judging Everyone",
      });
    }
    const oddie = db.pets.find((p) => p.id === "oddie");
    if (oddie) {
      Object.assign(oddie, {
        nickname: "Oddball", birthdate: "2022-08-26",
        traits: [{ icon: "🎾", label: "Ball Obsessed" }, { icon: "🤪", label: "Chaos Gremlin" }, { icon: "❤️", label: "Velcro Dog" }],
        snack: "Dad's chicken nuggets", mood: "Ready for Adventure",
      });
    }
    db.appliedSeeds.petFlavour = true;
  }

  // Correction (added August 2026): the day-specific plan tips were
  // originally written straight into the freeform notes field, one
  // overwrite per message — but training actually starts today, not on
  // whatever message count we were at. Replaced with an auto-advancing
  // day counter (see toiletTrainingDayNumber/TOILET_TRAINING_DAY_TIPS in
  // routines.js) so this can't drift out of sync again. Clears whichever
  // day's guessed text ended up in notes and anchors day 1 to today.
  if (!db.appliedSeeds.toiletTrainingDayCounterFix) {
    db.toiletTraining.notes = "";
    db.toiletTraining.startDate = todayKey();
    db.appliedSeeds.toiletTrainingDayCounterFix = true;
  }

  // New bedding order (added August 2026) — old mattress needs disposing
  // of, plain pillowcases and sheets needed to go with the new bedding
  // sets. "Sort bedding into sets for under-bed storage" already exists
  // as a Bedroom task, so not duplicated here.
  if (!db.appliedSeeds.newBeddingOrder) {
    const bits = db.shopping.lists.find((l) => l.title === "Bits for the house") || db.shopping.lists[0];
    if (bits) {
      bits.items.push(
        { id: uid(), text: "Pillow cases (plain) — ~5 pairs", done: false },
        { id: uid(), text: "Bed sheets — at least 4", done: false },
      );
    }
    const bedroomId = (db.cleaningGame.rooms.find((r) => r.name === "Bedroom") || {}).id;
    if (bedroomId) {
      db.routines.push({
        id: uid(), title: "Dispose of old mattress", area: "cleaning", room: bedroomId,
        assignedTo: "either", timeOfDay: "anytime", repeat: "once", steps: [],
      });
    }
    db.appliedSeeds.newBeddingOrder = true;
  }

  // Toilet training pushed back a day (added August 2026) — missed the
  // planned start due to an allergy flare-up, so Day 1 anchors to
  // tomorrow instead. Self-service equivalent: the "Push start back a
  // day" button on the Pets page (postponeToiletTrainingStart in
  // routines.js) for next time this happens.
  if (!db.appliedSeeds.toiletTrainingPostponeAug5) {
    db.toiletTraining.startDate = tomorrowKey();
    db.toiletTraining.items = [];
    db.toiletTraining.lastGeneratedDate = null;
    db.appliedSeeds.toiletTrainingPostponeAug5 = true;
  }

  // Added a 12:15 walk to the warm-up day (added August 2026) — that's
  // her actual water-bowl-down moment, so the later Afternoon/Early
  // Evening walk steps shift down a slot (water up, then just a plain
  // business trip) to match. Patches today's already-generated items
  // directly rather than regenerating, so anything already ticked off
  // stays ticked.
  if (!db.appliedSeeds.toiletTrainingWarmup1215) {
    const items = db.toiletTraining.items || [];
    if (!items.find((i) => i.time === "12:15" && i.label === "Midday Walk")) {
      items.push({
        id: "warmup-1215", time: "12:15", label: "Midday Walk", type: "walk",
        duration: "5–7 min", status: null,
        steps: ["Straight outside — no lounging, no phones", "Stand still at the grass, be boring", "Reward the instant they go — sausage + praise", "Water bowl down the moment you're back inside"],
      });
    }
    const afternoon = items.find((i) => i.label === "Afternoon Walk");
    if (afternoon) afternoon.steps = ["Boring, business-only trip", "Reward on the grass", "Water bowl lifted up the moment you're back inside"];
    const earlyEvening = items.find((i) => i.label === "Early Evening Walk");
    if (earlyEvening) earlyEvening.steps = ["Boring, business-only trip", "Reward on the grass"];
    db.appliedSeeds.toiletTrainingWarmup1215 = true;
  }

  // Bedroom organising jobs (added August 2026) — recurring cleaning/
  // organise jobs for specific bedroom spots, each with its own XP
  // intensity. "Clean under bed" is marked done today since she'd already
  // just done it and asked for it to be checked monthly from here —
  // everything else starts due now and she ticks it off as she gets to it.
  if (!db.appliedSeeds.bedroomOrganisingJobs) {
    const bedroomId = (db.cleaningGame.rooms.find((r) => r.name === "Bedroom") || {}).id;
    if (bedroomId) {
      const anchor = todayKey();
      const J = (title, repeat, intensity, extra) => Object.assign({
        id: uid(), title, area: "cleaning", room: bedroomId, assignedTo: "either",
        timeOfDay: "anytime", repeat, intensity, steps: [],
      }, extra || {});

      const underBed = J("Clean under bed", "monthly", "medium", { anchorDate: anchor });
      db.routines.push(underBed);
      db.completions[`${underBed.id}|${anchor}`] = true;
      awardXp(db, "kirsten", choreXpForRoutine(underBed));

      const jobs = [
        J("Clean dressing table", "weekly", "light", { repeatDay: 0 }),
        J("Clean bedside drawer", "weekly", "light", { repeatDay: 0 }),
        J("Organise bedside drawer", "monthly", "light", { anchorDate: anchor }),
        J("Organise underwear drawer", "monthly", "light", { anchorDate: anchor }),
        J("Organise dressing table drawer 1", "monthly", "light", { anchorDate: anchor }),
        J("Organise dressing table drawer 2", "monthly", "light", { anchorDate: anchor }),
        J("Organise dressing table drawer 3", "monthly", "light", { anchorDate: anchor }),
        J("Organise dressing table large drawer", "monthly", "medium", { anchorDate: anchor }),
        J("Organise dressing table mirror cabinet", "monthly", "light", { anchorDate: anchor }),
        J("Organise dressing table shelves", "monthly", "medium", { anchorDate: anchor }),
        ...Array.from({ length: 8 }, (_, i) => J(`Organise bookshelf ${i + 1}`, "monthly", "light", { anchorDate: anchor })),
      ];
      jobs.forEach((r) => db.routines.push(r));

      db.appliedSeeds.bedroomOrganisingJobs = true;
    }
  }

  // Kirsten's corner redesign plan (added August 2026) — replaces the
  // generic 7-step decluttering plan with her actual zone-by-zone design,
  // and tags the project to the Bedroom so it shows under that room's new
  // Projects tab. Loft reorganisation gets the same room-tagging (just
  // needed a room id, no rewrite).
  if (!db.appliedSeeds.kirstensCornerRedesign) {
    const bedroomId = (db.cleaningGame.rooms.find((r) => r.name === "Bedroom") || {}).id;
    const loftId = (db.cleaningGame.rooms.find((r) => r.name === "Loft") || {}).id;

    const corner = db.projects.find((p) => p.title === "Kirsten's corner");
    if (corner) {
      corner.room = bedroomId || null;
      corner.steps = [
        { title: "Measure available space for each unit — mini wardrobe with rail, centre unit, under-table unit", done: false },
        { title: "Tidy the shelf — books stay, tidy sprays/decor/Fire Stick around them", done: false },
        { title: "Fit the mini wardrobe with rail (left side) — cloth drop-down door on tension rod/track hides the hanging jackets", done: false },
        { title: "Build the centre unit — compartments for makeup, brushes and jewelry, replacing the small stand", done: false },
        { title: "Build the under-table unit (right side) — for hats, bags and paper, using the dead space under the table", done: false },
        { title: "Move shoes to the under-bed box — flat clear box for everyday/work shoes, floor rack comes out", done: false },
      ];
    }
    const loft = db.projects.find((p) => p.title === "Loft reorganisation");
    if (loft && loftId) loft.room = loftId;

    const items = [
      "Flat under-bed box, clear plastic — for shoes",
      "1 lidded bin for jewelry & trinkets — top shelf",
      "Tape measure — measure up all three units before buying materials",
      "Lumber/plywood — mini wardrobe frame (left side)",
      "Wardrobe rail/rod + end brackets — mini wardrobe, left side",
      "Tension rod or track + fabric panel — cloth drop-down door, left side",
      "Lumber/plywood + compartment inserts — centre built-in unit (makeup, brushes, jewelry)",
      "Lumber/plywood + dividers — under-table unit (hats, bags, paper)",
      "Labels for all bins",
    ];
    db.shopping.lists.push({
      id: uid(),
      title: "Kirsten's corner redesign",
      colour: NOTE_COLOURS[db.shopping.lists.length % NOTE_COLOURS.length],
      items: items.map((text) => ({ id: uid(), text, done: false })),
    });

    db.appliedSeeds.kirstensCornerRedesign = true;
  }

  // Real birthdates for both of you (added August 2026) — ages computed
  // live from these rather than the placeholder "31" the reference art
  // guessed for both of you (only actually correct for Kirsten).
  if (!db.appliedSeeds.humanBirthdates) {
    const kirsten = db.people.find((p) => p.id === "kirsten");
    if (kirsten) kirsten.birthdate = "1995-05-13";
    const jack = db.people.find((p) => p.id === "jack");
    if (jack) jack.birthdate = "1997-08-20";
    db.appliedSeeds.humanBirthdates = true;
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

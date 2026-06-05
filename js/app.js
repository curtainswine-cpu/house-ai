/* ============================================================
   app.js — wires everything together
   - loads the database
   - handles navigation between views
   - handles the "who am I" toggle
   - opens modals for adding routines / expenses
   - re-renders after every change
   This is the orchestrator; feature logic lives in the other files.
   ============================================================ */

let DB = loadDB();

/* ---------- Shared little helpers ---------- */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function emptyState(emoji, title, sub) {
  return `<div class="empty"><span class="empty__emoji">${emoji}</span>
    <strong>${title}</strong><div>${sub}</div></div>`;
}

function formatNiceDate(dateKey) {
  const t = todayKey();
  if (dateKey === t) return "Today";
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------- Navigation ---------- */
// Sub-pages reached from "More" keep the More tab highlighted.
const TAB_FOR_VIEW = { learn: "more", money: "more" };
function goto(view) {
  document.querySelectorAll(".view").forEach((v) => {
    v.hidden = v.dataset.view !== view;
  });
  const activeTab = TAB_FOR_VIEW[view] || view;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.goto === activeTab);
  });
  window.scrollTo({ top: 0 });
  render();
}

/* JARVIS greeting — calm, by name, aware of the time of day. */
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* What the personal-tasks page is called (Kirsten chose this). */
const TASKS_NAME = "Mini missions";

/* ---------- Home hub: navigation tiles with a calm count ---------- */
function renderHomeNav(db) {
  const wrap = document.getElementById("homeNav");
  if (!wrap) return;
  const date = new Date(), dateKey = todayKey(date);
  const prog = todayProgress(db);
  const chores = sharedChoresToday(db, date);
  const choresDone = chores.filter((r) => isDone(db, r.id, dateKey)).length;
  const soon = foodUseSoon(db).length;

  const tiles = [
    { view: "tasks", icon: "📋", label: TASKS_NAME, sub: prog.total ? `${prog.done}/${prog.total} today` : "all clear" },
    { view: "cleaning", icon: "🧹", label: "Cleaning", sub: chores.length ? `${choresDone}/${chores.length} today` : "nothing today" },
    { view: "food", icon: "❄️", label: "Food", sub: soon ? `${soon} to use soon` : `${db.food.items.length} items` },
    { view: "health", icon: "💗", label: "Health", sub: "water · steps · gym" },
    { view: "learn", icon: "📚", label: "Learn", sub: "Punjabi" },
    { view: "manage", icon: "🔁", label: "Routines", sub: "manage" },
  ];
  if (db.finance.csvUrl || db.finance.sheetUrl) {
    tiles.push({ view: "money", icon: "💷", label: "Money", sub: "safe-to-spend" });
  }
  wrap.innerHTML = tiles.map((t) => `
    <button class="nav-tile" data-goto="${t.view}">
      <span class="nav-tile__icon">${t.icon}</span>
      <span class="nav-tile__label">${t.label}</span>
      <span class="nav-tile__sub">${t.sub}</span>
    </button>`).join("");
}

/* ---------- Render everything (cheap; data is small) ---------- */
function render() {
  const now = new Date();
  const me = DB.people.find((p) => p.id === DB.activePerson);

  // JARVIS greeting + date in the top bar
  document.getElementById("greeting").textContent =
    `${timeGreeting()}, ${me ? me.name : "there"}.`;
  document.getElementById("todayDate").textContent =
    now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  renderPersonToggle();

  // Rest day reframes the whole Today screen — no pressure, no guilt
  const rest = isRestDay(DB, todayKey());
  const restBtn = document.getElementById("restToggle");
  restBtn.setAttribute("aria-pressed", rest);
  restBtn.textContent = rest ? "🌙 Rest day: on" : "🌙 Rest day";
  document.getElementById("view-today").classList.toggle("is-rest", rest);
  document.getElementById("restBanner").innerHTML = rest
    ? `<div class="rest-banner">🌙 <strong>Rest day.</strong> Nothing's expected of you today.
       Tick things only if you genuinely want to.</div>`
    : "";

  // Mini missions page — calm status line for your personal tasks
  const prog = todayProgress(DB);
  document.getElementById("tasksTitle").textContent = TASKS_NAME;
  document.getElementById("todaySummary").textContent =
    rest ? "A day for you. Be kind to yourself. 💙"
    : prog.total === 0 ? "Nothing personal on today. Enjoy the quiet."
    : prog.done === prog.total ? `All ${prog.total} done. Nicely done.`
    : `${prog.done} of ${prog.total} done — one thing at a time.`;

  // Home (calm hub)
  renderShiftBanner(DB);
  renderTodayCalendar(DB);
  renderHomeNav(DB);

  // The other pages
  renderTodayRoutines(DB);   // Mini missions: my personal tasks
  renderTodayProjects(DB);   // Mini missions: project next-steps
  renderCleaning(DB);        // Cleaning
  renderFood(DB);            // Food
  renderTodayHealth(DB);     // Health
  renderRoutinesView(DB);    // Manage → routines
  renderProjectsManager(DB); // Manage → projects
  renderMoneyView(DB);       // More → Money
  renderLearn(DB);           // More → Learn
}

function renderPersonToggle() {
  const wrap = document.getElementById("personToggle");
  wrap.innerHTML = DB.people.map((p) => `
    <button data-person="${p.id}" aria-pressed="${DB.activePerson === p.id}"
      style="--person-colour:${p.colour}">${escapeHTML(p.name)}</button>
  `).join("");
}

/* ---------- Modal helpers ---------- */
function openModal(title, bodyHTML) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modalRoot").hidden = false;
}
function closeModal() {
  document.getElementById("modalRoot").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

/* ---------- Add / edit routine ----------
   Pass an existing routine to edit it; pass nothing to add a new one. */
function openRoutineModal(existing, presetArea) {
  const r = existing || {
    timeOfDay: "morning", repeat: "daily", steps: [],
    assignedTo: (presetArea && presetArea !== "me") ? "either" : DB.activePerson,
    area: presetArea || "me",
  };
  const isEdit = !!existing;

  const peopleOpts = [
    `<option value="either"${r.assignedTo === "either" ? " selected" : ""}>Either of us</option>`,
    `<option value="both"${r.assignedTo === "both" ? " selected" : ""}>Both of us</option>`,
    ...DB.people.map((p) => `<option value="${p.id}"${r.assignedTo === p.id ? " selected" : ""}>${escapeHTML(p.name)}</option>`),
  ].join("");

  const areaChips = [["me","Mine"],["cleaning","Cleaning"],["household","Household"]]
    .map(([val,label]) => `<button class="chip" data-area="${val}" aria-pressed="${(r.area || "me") === val}">${label}</button>`).join("");

  const timeChips = ["morning","afternoon","evening","anytime"].map((t) =>
    `<button class="chip" data-time="${t}" aria-pressed="${r.timeOfDay === t}">${TIME_LABEL[t]}</button>`).join("");

  const repeatChips = [["daily","Every day"],["weekly","Weekly"],["fortnightly","Fortnightly"],["once","One-off"]]
    .map(([val,label]) => `<button class="chip" data-repeat="${val}" aria-pressed="${r.repeat === val}">${label}</button>`).join("");

  openModal(isEdit ? "Edit routine" : "New routine", `
    <div class="field">
      <label for="rTitle">What is it?</label>
      <input id="rTitle" placeholder="e.g. Evening kitchen reset" value="${escapeAttr(r.title || "")}" />
    </div>
    <div class="field">
      <label>What kind?</label>
      <div class="chip-row" id="rArea">${areaChips}</div>
      <small style="color:var(--muted)">Mine = personal (shows on Home). Cleaning / Household = shared (in the Cleaning tab).</small>
    </div>
    <div class="field">
      <label for="rWho">Who does it?</label>
      <select id="rWho">${peopleOpts}</select>
    </div>
    <div class="field">
      <label>When in the day?</label>
      <div class="chip-row" id="rTime">${timeChips}</div>
    </div>
    <div class="field">
      <label>How often?</label>
      <div class="chip-row" id="rRepeat">${repeatChips}</div>
    </div>
    <div class="field" id="rDayWrap" ${r.repeat === "weekly" ? "" : "hidden"}>
      <label for="rDay">Which day?</label>
      <select id="rDay">${WEEKDAYS.map((d,i)=>`<option value="${i}"${r.repeatDay === i ? " selected" : ""}>${d}</option>`).join("")}</select>
    </div>
    <div class="field" id="rAnchorWrap" ${r.repeat === "fortnightly" ? "" : "hidden"}>
      <label for="rAnchor">The next one falls on</label>
      <input id="rAnchor" type="date" value="${escapeAttr(r.anchorDate || todayKey())}" />
      <small style="color:var(--muted)">e.g. your next bin day — then it repeats every 2 weeks.</small>
    </div>
    <div class="field">
      <label for="rSteps">Steps (optional, one per line — helps break it down)</label>
      <textarea id="rSteps" rows="3" placeholder="Dishes away&#10;Wipe surfaces&#10;Start dishwasher">${escapeHTML((r.steps || []).join("\n"))}</textarea>
    </div>
    <button class="btn btn--primary btn--block" id="rSave">${isEdit ? "Save changes" : "Save routine"}</button>
    ${isEdit ? `<button class="btn btn--danger btn--block" id="rDelete">Delete this routine</button>` : ""}
  `);

  let time = r.timeOfDay, repeat = r.repeat, area = r.area || "me";

  document.getElementById("rArea").onclick = (e) => {
    const b = e.target.closest("[data-area]"); if (!b) return;
    area = b.dataset.area; pressOne("rArea", b);
  };
  document.getElementById("rTime").onclick = (e) => {
    const b = e.target.closest("[data-time]"); if (!b) return;
    time = b.dataset.time; pressOne("rTime", b);
  };
  document.getElementById("rRepeat").onclick = (e) => {
    const b = e.target.closest("[data-repeat]"); if (!b) return;
    repeat = b.dataset.repeat; pressOne("rRepeat", b);
    document.getElementById("rDayWrap").hidden = repeat !== "weekly";
    document.getElementById("rAnchorWrap").hidden = repeat !== "fortnightly";
  };

  document.getElementById("rSave").onclick = () => {
    const title = document.getElementById("rTitle").value.trim();
    if (!title) { document.getElementById("rTitle").focus(); return; }
    const steps = document.getElementById("rSteps").value
      .split("\n").map((s) => s.trim()).filter(Boolean);
    const patch = {
      title,
      area,
      assignedTo: document.getElementById("rWho").value,
      timeOfDay: time,
      repeat,
      repeatDay: repeat === "weekly" ? Number(document.getElementById("rDay").value) : undefined,
      anchorDate: repeat === "fortnightly" ? document.getElementById("rAnchor").value : undefined,
      steps,
    };
    if (isEdit) Object.assign(r, patch);
    else DB.routines.push(Object.assign({ id: uid() }, patch));
    saveDB(DB);
    closeModal();
    render();
  };

  if (isEdit) {
    document.getElementById("rDelete").onclick = () => {
      deleteRoutine(DB, r.id);
      closeModal();
      render();
    };
  }
}

/* ---------- Create / edit a project ---------- */
function openProjectModal(existing) {
  const p = existing || { emoji: "", title: "", steps: [] };
  const isEdit = !!existing;
  openModal(isEdit ? "Edit project" : "New project", `
    <div class="field">
      <label for="pEmoji">Icon (optional)</label>
      <input id="pEmoji" maxlength="2" placeholder="🧺" value="${escapeAttr(p.emoji || "")}" style="max-width:90px" />
    </div>
    <div class="field">
      <label for="pTitle">Project name</label>
      <input id="pTitle" placeholder="e.g. Sort the spare room" value="${escapeAttr(p.title || "")}" />
    </div>
    <div class="field">
      <label for="pSteps">Steps in order (one per line) — JARVIS shows only the next one</label>
      <textarea id="pSteps" rows="5" placeholder="Buy storage boxes&#10;Clear the floor&#10;Sort keep / donate&#10;Put it all away">${escapeHTML((p.steps || []).map((s) => s.title).join("\n"))}</textarea>
    </div>
    <button class="btn btn--primary btn--block" id="pSave">${isEdit ? "Save changes" : "Create project"}</button>
    ${isEdit ? `<button class="btn btn--danger btn--block" id="pDelete">Delete project</button>` : ""}
  `);
  document.getElementById("pSave").onclick = () => {
    const title = document.getElementById("pTitle").value.trim();
    if (!title) { document.getElementById("pTitle").focus(); return; }
    const data = {
      emoji: document.getElementById("pEmoji").value.trim(),
      title,
      stepTitles: document.getElementById("pSteps").value.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (isEdit) updateProject(DB, p.id, data);
    else createProject(DB, data);
    closeModal();
    render();
  };
  if (isEdit) {
    document.getElementById("pDelete").onclick = () => { deleteProject(DB, p.id); closeModal(); render(); };
  }
}

/* ---------- Suggested routines picker ---------- */
function openSuggestionsModal() {
  const have = new Set(DB.routines.map((r) => r.title));
  const rows = SUGGESTED_ROUTINES.map((s, i) => {
    const added = have.has(s.title);
    return `
      <div class="suggest-row">
        <div>
          <div class="suggest-title">${escapeHTML(s.title)}</div>
          <div class="suggest-meta">${TIME_LABEL[s.timeOfDay]} · ${REPEAT_LABEL[s.repeat]}</div>
        </div>
        <button class="btn btn--mini ${added ? "btn--quiet" : ""}" data-add-suggestion="${i}" ${added ? "disabled" : ""}>${added ? "Added ✓" : "Add"}</button>
      </div>`;
  }).join("");
  openModal("Suggested routines",
    `<p style="margin:0 0 4px;color:var(--muted)">Tap to add any that fit — you can edit them after.</p>${rows}`);
}

/* ---------- Add water (quick 250 ml steps + a specific amount) ---------- */
function openWaterModal() {
  openModal("Add water", `
    <p style="margin:0;color:var(--muted)">Tap a quick fill, or type a specific amount.</p>
    <div class="chip-row" id="wQuick">
      ${[250, 500, 750, 1000].map((v) => `<button class="chip" data-add-water="${v}">+ ${v} ml</button>`).join("")}
    </div>
    <div class="field">
      <label for="wCustom">Specific amount (ml)</label>
      <input id="wCustom" type="number" inputmode="numeric" min="0" step="50" placeholder="e.g. 330 (a can / bottle)" autofocus />
    </div>
    <button class="btn btn--primary btn--block" id="wAdd">Add</button>
  `);
  // Quick chips add instantly
  document.getElementById("wQuick").onclick = (e) => {
    const b = e.target.closest("[data-add-water]"); if (!b) return;
    addWater(DB, Number(b.dataset.addWater));
    closeModal();
    render();
  };
  // Custom amount
  document.getElementById("wAdd").onclick = () => {
    const v = Number(document.getElementById("wCustom").value);
    if (v > 0) addWater(DB, v);
    closeModal();
    render();
  };
}

/* ---------- Update today's step count (from your watch) ---------- */
function openStepsModal() {
  const t = trackerFor(DB, todayKey());
  openModal("Update steps", `
    <div class="field">
      <label for="sCount">Steps so far today (check your watch)</label>
      <input id="sCount" type="number" inputmode="numeric" min="0" step="100" value="${t.steps || ""}" placeholder="e.g. 5200" autofocus />
    </div>
    <button class="btn btn--primary btn--block" id="sSave">Save</button>
  `);
  document.getElementById("sSave").onclick = () => {
    setSteps(DB, document.getElementById("sCount").value);
    closeModal();
    render();
  };
}

/* Toggle a single pressed chip within a group. */
function pressOne(groupId, btn) {
  document.getElementById(groupId).querySelectorAll(".chip,[aria-pressed]")
    .forEach((c) => c.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
}

/* ---------- Global event wiring ---------- */
function wireEvents() {
  // Bottom tabs + any element with data-goto
  document.body.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-goto]");
    if (nav) { goto(nav.dataset.goto); return; }

    // Person toggle
    const person = e.target.closest("[data-person]");
    if (person) { DB.activePerson = person.dataset.person; saveDB(DB); render(); return; }

    // Routine check toggle
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      toggleDone(DB, toggle.dataset.toggle, todayKey());
      render();
      return;
    }

    // Expand/collapse a routine's steps on Today
    const stepsToggle = e.target.closest("[data-steps-toggle]");
    if (stepsToggle) {
      const id = stepsToggle.dataset.stepsToggle;
      if (_expandedRoutines.has(id)) _expandedRoutines.delete(id);
      else _expandedRoutines.add(id);
      render();
      return;
    }

    // Edit a routine (pencil on the Routines view)
    const edit = e.target.closest("[data-edit-routine]");
    if (edit) {
      const routine = DB.routines.find((r) => r.id === edit.dataset.editRoutine);
      if (routine) openRoutineModal(routine);
      return;
    }

    // Edit a project
    const editP = e.target.closest("[data-edit-project]");
    if (editP) {
      const project = DB.projects.find((p) => p.id === editP.dataset.editProject);
      if (project) openProjectModal(project);
      return;
    }

    // Add a suggested routine (keeps the picker open)
    const sug = e.target.closest("[data-add-suggestion]");
    if (sug && !sug.disabled) {
      const s = SUGGESTED_ROUTINES[+sug.dataset.addSuggestion];
      DB.routines.push(Object.assign({ id: uid() }, JSON.parse(JSON.stringify(s))));
      saveDB(DB);
      sug.textContent = "Added ✓"; sug.classList.add("btn--quiet"); sug.disabled = true;
      render();
      return;
    }

    // Water: open the "add a specific amount" picker
    if (e.target.closest("[data-water-add]")) { openWaterModal(); return; }

    // Water: quick add / remove
    const water = e.target.closest("[data-water]");
    if (water) { addWater(DB, Number(water.dataset.water)); render(); return; }

    // Steps: open the quick update
    if (e.target.closest("[data-steps-edit]")) { openStepsModal(); return; }

    // Project: tick the next step (advances the chain)
    const pstep = e.target.closest("[data-project-step]");
    if (pstep) { completeNextStep(DB, pstep.dataset.projectStep); render(); return; }

    // Project: show/hide the whole plan (DOM-only toggle)
    const ptoggle = e.target.closest("[data-project-toggle]");
    if (ptoggle) {
      const plan = document.getElementById("plan-" + ptoggle.dataset.projectToggle);
      if (plan) plan.hidden = !plan.hidden;
      return;
    }

    // Gym: log / undo a session
    if (e.target.closest("[data-gym]")) { logGym(DB); render(); return; }
    if (e.target.closest("[data-gym-undo]")) { undoGymToday(DB); render(); return; }

    // Rest day toggle
    if (e.target.closest("#restToggle")) { toggleRestDay(DB, todayKey()); render(); return; }

    // ---- Learn Punjabi ----
    const learnTab = e.target.closest("[data-learn]");
    if (learnTab) { _learnTab = learnTab.dataset.learn; renderLearn(DB); return; }

    const speak = e.target.closest("[data-speak]");
    if (speak) { const w = wordById(DB, speak.dataset.speak); if (w) speakPunjabi(w.pa || w.rom); return; }

    const editWord = e.target.closest("[data-edit-word]");
    if (editWord) { openWordModal(DB, editWord.dataset.editWord); return; }

    if (e.target.closest("[data-flip]")) { _cardFlipped = !_cardFlipped; renderLearn(DB); return; }
    if (e.target.closest("[data-next-card]")) {
      _cardFlipped = false; _cardIdx = (_cardIdx + 1) % Math.max(1, DB.punjabi.words.length); renderLearn(DB); return;
    }
    if (e.target.closest("[data-shuffle]")) {
      _cardFlipped = false; _cardIdx = Math.floor((performance.now() * 7) % Math.max(1, DB.punjabi.words.length)); renderLearn(DB); return;
    }
    if (e.target.closest("[data-learn-add]")) {
      const en = document.getElementById("wEn").value.trim();
      const pa = document.getElementById("wPa").value.trim();
      const rom = document.getElementById("wRom").value.trim();
      if (!en && !pa) { document.getElementById("wEn").focus(); return; }
      addWord(DB, { en, pa, rom });
      _learnTab = "words"; render();
      return;
    }
    if (e.target.closest("[data-learn-import]")) {
      const n = importWords(DB, document.getElementById("wImport").value);
      const status = document.getElementById("importStatus");
      if (status) status.textContent = n ? `Added ${n} word${n > 1 ? "s" : ""}. ✓` : "Nothing to import — check the format.";
      if (n) { _learnTab = "words"; render(); }
      return;
    }

    // ---- Food: fridge & freezer ----
    const fdWhere = e.target.closest("[data-fd-where]");
    if (fdWhere) { pressOne("fdWhere", fdWhere); return; }
    if (e.target.closest("[data-fd-add]")) {
      const name = document.getElementById("fdName").value.trim();
      if (!name) { document.getElementById("fdName").focus(); return; }
      const where = document.querySelector('#fdWhere [aria-pressed="true"]').dataset.fdWhere;
      const useBy = document.getElementById("fdUseBy").value || null;
      addFood(DB, { name, where, useBy });
      render();
      return;
    }
    const delFood = e.target.closest("[data-del-food]");
    if (delFood) { deleteFood(DB, delFood.dataset.delFood); render(); return; }

    // Food: pull in dishes collected from Mum (meal app)
    if (e.target.closest("[data-fd-sync]")) {
      const status = document.getElementById("fdSyncStatus");
      if (status) status.textContent = "Checking…";
      syncCollectedMeals(DB).then((r) => {
        if (r.ok) { render();
          const s = document.getElementById("fdSyncStatus");
          if (s) s.textContent = r.added ? `Added ${r.added} 🎉` : "Up to date";
        } else if (status) {
          status.textContent = r.status === 404 ? "Not connected yet — run the database step." : "Couldn't reach the meal app.";
        }
      });
      return;
    }

    // Jack's schedule: work-from-home + lift request
    if (e.target.closest("[data-wfh-toggle]")) { toggleWfh(DB, DB.activePerson, todayKey()); render(); return; }
    if (e.target.closest("[data-lift-request]")) { requestLift(DB, todayKey()); render(); return; }
    if (e.target.closest("[data-lift-cancel]")) { cancelLift(DB, todayKey()); render(); return; }

    // Calendar: setup / connect / show week
    if (e.target.closest("[data-cal-setup]")) { openCalendarSetup(); return; }
    if (e.target.closest("[data-cal-refresh]")) { connectCalendar(DB); return; }
    if (e.target.closest("[data-cal-week]")) {
      const w = document.getElementById("calWeek");
      if (w) w.hidden = !w.hidden;
      return;
    }

    // Close modal
    if (e.target.closest("[data-close-modal]")) { closeModal(); return; }
  });

  document.getElementById("addRoutineBtn").onclick = () => openRoutineModal();
  document.getElementById("addProjectBtn").onclick = () => openProjectModal();
  document.getElementById("suggestRoutinesBtn").onclick = openSuggestionsModal;
  document.getElementById("addCleaningBtn").onclick = () => openRoutineModal(null, "cleaning");

  // Esc closes modal
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ---------- Go! ---------- */
wireEvents();
render();

/* Pull a fresh Safe-to-Spend in the background, then re-render.
   The UI already shows the cached value instantly, so this never blocks. */
if (DB.finance.csvUrl) {
  refreshFinance(DB).then((r) => { if (r.ok) render(); });
}

/* Quietly refresh the calendar on load (cached events already show). */
calendarBootstrap(DB);

/* Quietly pull in any newly-collected meals from the meal app, then re-render. */
syncCollectedMeals(DB).then((r) => { if (r.ok && r.added) render(); });

/* Register the service worker so JARVIS installs to the home screen and
   works offline. Fails silently on file:// (which is fine). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

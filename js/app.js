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
function goto(view) {
  document.querySelectorAll(".view").forEach((v) => {
    v.hidden = v.dataset.view !== view;
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.goto === view);
  });
  window.scrollTo({ top: 0 });
  render();
}

/* ---------- Render everything (cheap; data is small) ---------- */
function render() {
  // Date in the top bar
  const now = new Date();
  document.getElementById("todayDate").textContent =
    now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  renderPersonToggle();

  // Today
  const prog = todayProgress(DB);
  document.getElementById("todaySummary").textContent =
    prog.total === 0 ? "Nothing due — breathe easy."
    : prog.done === prog.total ? `All ${prog.total} done — amazing 🎉`
    : `${prog.done} of ${prog.total} done`;
  renderTodayRoutines(DB);
  document.getElementById("todaySpendTotal").textContent = money(spentOn(DB, todayKey()));

  // Other views
  renderRoutinesView(DB);
  renderSpendingView(DB);
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

/* ---------- Add / edit routine ---------- */
function openRoutineModal() {
  const peopleOpts = [
    `<option value="either">Either of us</option>`,
    `<option value="both">Both of us</option>`,
    ...DB.people.map((p) => `<option value="${p.id}">${escapeHTML(p.name)}</option>`),
  ].join("");

  openModal("New routine", `
    <div class="field">
      <label for="rTitle">What is it?</label>
      <input id="rTitle" placeholder="e.g. Evening kitchen reset" autofocus />
    </div>
    <div class="field">
      <label for="rWho">Who does it?</label>
      <select id="rWho">${peopleOpts}</select>
    </div>
    <div class="field">
      <label>When in the day?</label>
      <div class="chip-row" id="rTime">
        ${["morning","afternoon","evening","anytime"].map((t,i) =>
          `<button class="chip" data-time="${t}" aria-pressed="${i===0}">${TIME_LABEL[t]}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label>How often?</label>
      <div class="chip-row" id="rRepeat">
        <button class="chip" data-repeat="daily" aria-pressed="true">Every day</button>
        <button class="chip" data-repeat="weekly">Weekly</button>
        <button class="chip" data-repeat="once">One-off</button>
      </div>
    </div>
    <div class="field" id="rDayWrap" hidden>
      <label for="rDay">Which day?</label>
      <select id="rDay">${WEEKDAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join("")}</select>
    </div>
    <div class="field">
      <label for="rSteps">Steps (optional, one per line — helps break it down)</label>
      <textarea id="rSteps" rows="3" placeholder="Dishes away&#10;Wipe surfaces&#10;Start dishwasher"></textarea>
    </div>
    <button class="btn btn--primary btn--block" id="rSave">Save routine</button>
  `);

  let time = "morning", repeat = "daily";

  document.getElementById("rTime").onclick = (e) => {
    const b = e.target.closest("[data-time]"); if (!b) return;
    time = b.dataset.time; pressOne("rTime", b);
  };
  document.getElementById("rRepeat").onclick = (e) => {
    const b = e.target.closest("[data-repeat]"); if (!b) return;
    repeat = b.dataset.repeat; pressOne("rRepeat", b);
    document.getElementById("rDayWrap").hidden = repeat !== "weekly";
  };

  document.getElementById("rSave").onclick = () => {
    const title = document.getElementById("rTitle").value.trim();
    if (!title) { document.getElementById("rTitle").focus(); return; }
    const steps = document.getElementById("rSteps").value
      .split("\n").map((s) => s.trim()).filter(Boolean);
    DB.routines.push({
      id: uid(),
      title,
      assignedTo: document.getElementById("rWho").value,
      timeOfDay: time,
      repeat,
      repeatDay: repeat === "weekly" ? Number(document.getElementById("rDay").value) : undefined,
      steps,
    });
    saveDB(DB);
    closeModal();
    render();
  };
}

/* ---------- Add expense ---------- */
function openExpenseModal() {
  openModal("Add expense", `
    <div class="field">
      <label for="eAmt">Amount (£)</label>
      <input id="eAmt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" autofocus />
    </div>
    <div class="field">
      <label>Category</label>
      <div class="chip-row" id="eCat">
        ${CATEGORIES.map((c,i)=>`<button class="chip" data-cat="${c.id}" aria-pressed="${i===0}">${c.emoji} ${c.label}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label for="eNote">Note (optional)</label>
      <input id="eNote" placeholder="e.g. Tesco" />
    </div>
    <button class="btn btn--primary btn--block" id="eSave">Save expense</button>
  `);

  let cat = CATEGORIES[0].id;
  document.getElementById("eCat").onclick = (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    cat = b.dataset.cat; pressOne("eCat", b);
  };
  document.getElementById("eSave").onclick = () => {
    const amount = parseFloat(document.getElementById("eAmt").value);
    if (!(amount > 0)) { document.getElementById("eAmt").focus(); return; }
    addExpense(DB, {
      amount,
      category: cat,
      who: DB.activePerson,
      note: document.getElementById("eNote").value.trim(),
    });
    closeModal();
    goto("spending");
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

    // Delete expense
    const del = e.target.closest("[data-del-expense]");
    if (del) { deleteExpense(DB, del.dataset.delExpense); render(); return; }

    // Close modal
    if (e.target.closest("[data-close-modal]")) { closeModal(); return; }
  });

  document.getElementById("addRoutineBtn").onclick = openRoutineModal;
  document.getElementById("addExpenseBtn").onclick = openExpenseModal;

  // Esc closes modal
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ---------- Go! ---------- */
wireEvents();
render();

/* ============================================================
   projects.js — blocked chains, one step at a time
   A project is an ordered list of steps. Only the FIRST unfinished
   step is ever surfaced as "next", so a daunting chain (baskets →
   drawers → put away → wash) never lands all at once.
   ============================================================ */

/* Index of the next unfinished step, or -1 if the project is done. */
function nextStepIndex(project) {
  return project.steps.findIndex((s) => !s.done);
}

function isProjectComplete(project) {
  return nextStepIndex(project) === -1;
}

function projectProgress(project) {
  const done = project.steps.filter((s) => s.done).length;
  return { done, total: project.steps.length };
}

/* Tick off the current next step (advances the chain). */
function completeNextStep(db, projectId) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return;
  const i = nextStepIndex(p);
  if (i !== -1) p.steps[i].done = true;
  saveDB(db);
}

/* Create / update / delete whole projects. */
function createProject(db, { emoji, title, stepTitles }) {
  db.projects.push({
    id: uid(),
    emoji: emoji || "📋",
    title,
    steps: stepTitles.map((t) => ({ title: t, done: false })),
  });
  saveDB(db);
}
function updateProject(db, id, { emoji, title, stepTitles }) {
  const p = db.projects.find((x) => x.id === id);
  if (!p) return;
  p.emoji = emoji || "📋";
  p.title = title;
  // Preserve "done" for any step whose wording is unchanged.
  p.steps = stepTitles.map((t) => {
    const old = p.steps.find((s) => s.title === t);
    return { title: t, done: old ? old.done : false };
  });
  saveDB(db);
}
function deleteProject(db, id) {
  db.projects = db.projects.filter((p) => p.id !== id);
  saveDB(db);
}

/* ---- Render the projects manager (in the Routines tab) ---- */
function renderProjectsManager(db) {
  const wrap = document.getElementById("projectsList");
  if (!wrap) return;
  if (!db.projects.length) {
    wrap.innerHTML = emptyState("📋", "No projects yet",
      "Break a big, stuck task into steps — JARVIS only ever shows you the next one.");
    return;
  }
  wrap.innerHTML = db.projects.map((p) => {
    const prog = projectProgress(p);
    const done = isProjectComplete(p);
    return `
      <article class="card">
        <div class="card__main">
          <div class="card__title">${p.emoji || "📋"} ${escapeHTML(p.title)}</div>
          <div class="card__meta">
            <span class="tag ${done ? "tag--time" : ""}">${prog.done}/${prog.total}${done ? " · done 🎉" : ""}</span>
          </div>
        </div>
        <button class="icon-btn" data-edit-project="${p.id}" aria-label="Edit project">✎</button>
      </article>`;
  }).join("");
}

/* Undo the most recently completed step. */
function undoLastStep(db, projectId) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return;
  for (let i = p.steps.length - 1; i >= 0; i--) {
    if (p.steps[i].done) { p.steps[i].done = false; break; }
  }
  saveDB(db);
}

/* ---- Render the "Next step" cards on Today ---- */
function renderTodayProjects(db) {
  const wrap = document.getElementById("todayProjects");
  const active = db.projects.filter((p) => !isProjectComplete(p));
  if (!active.length) { wrap.innerHTML = ""; return; }

  wrap.innerHTML = active.map((p) => {
    const i = nextStepIndex(p);
    const prog = projectProgress(p);
    const allSteps = p.steps.map((s, idx) => `
      <li class="${s.done ? "is-done" : ""} ${idx === i ? "is-next" : ""}">
        ${s.done ? "✓" : (idx === i ? "→" : "○")} ${escapeHTML(s.title)}
      </li>`).join("");
    return `
      <div class="project">
        <div class="project__head">
          <span>${p.emoji || "📋"} ${escapeHTML(p.title)}</span>
          <span class="project__count">${prog.done}/${prog.total}</span>
        </div>
        <div class="project__next">
          <button class="check" data-project-step="${p.id}" aria-label="Mark this step done">✓</button>
          <div class="project__nextbody">
            <div class="project__label">Next: ${escapeHTML(p.steps[i].title)}</div>
            <button class="link-btn" data-project-toggle="${p.id}">see the whole plan</button>
          </div>
        </div>
        <ol class="project__steps" id="plan-${p.id}" hidden>${allSteps}</ol>
      </div>`;
  }).join("");
}

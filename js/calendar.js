/* ============================================================
   calendar.js — live, read-only Google Calendar on the Today screen
   Uses Google Identity Services (GIS) to get a short-lived access
   token, then reads the primary calendar. Events are cached so
   today's plan shows instantly and offline. Read-only scope.
   ============================================================ */

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

let _calToken = null;
let _calTokenExp = 0;
let _calClient = null;
let _calStatus = "";

function calendarConfigured(db) {
  return !!(db.calendar && db.calendar.clientId);
}
function calendarConnected() {
  return !!_calToken && Date.now() < _calTokenExp;
}
function gisReady() {
  return !!(window.google && google.accounts && google.accounts.oauth2);
}

/* Build the GIS token client once (after the GIS script has loaded). */
function ensureTokenClient(db) {
  if (_calClient || !gisReady()) return _calClient;
  _calClient = google.accounts.oauth2.initTokenClient({
    client_id: db.calendar.clientId,
    scope: CAL_SCOPE,
    callback: (resp) => {
      if (resp && resp.access_token) {
        _calToken = resp.access_token;
        _calTokenExp = Date.now() + (Number(resp.expires_in || 3600) * 1000) - 60000;
        _calStatus = "";
        DB.calendar.connectedOnce = true; // from now on, refresh quietly on load
        saveDB(DB);
        fetchWeekEvents().then(() => render());
      } else if (resp && resp.error && resp.error !== "interaction_required") {
        _calStatus = "Couldn't sign in to Google.";
        render();
      }
    },
  });
  return _calClient;
}

/* Interactive connect (first time asks consent, later is silent). */
function connectCalendar(db) {
  const c = ensureTokenClient(db);
  if (!c) { _calStatus = "Google sign-in is still loading — try again in a second."; render(); return; }
  _calStatus = "Opening Google…";
  render();
  c.requestAccessToken({ prompt: _calToken ? "" : "consent" });
}

/* Quiet refresh on load — no popup; only works if already consented. */
function calendarBootstrap(db, attempt) {
  // Only auto-reach Google once she's connected at least once — no nag before.
  if (!calendarConfigured(db) || !db.calendar.connectedOnce) return;
  attempt = attempt || 0;
  if (gisReady()) {
    ensureTokenClient(db);
    try { _calClient.requestAccessToken({ prompt: "" }); } catch (e) { /* stay on cache */ }
  } else if (attempt < 12) {
    setTimeout(() => calendarBootstrap(db, attempt + 1), 500);
  }
}

function calAuth() { return { Authorization: "Bearer " + _calToken }; }

/* Pull this week's events (today → +7 days) from ALL your calendars —
   so Loop shifts, the Family calendar, etc. all show, not just primary. */
async function fetchWeekEvents() {
  if (!calendarConnected()) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start); end.setDate(start.getDate() + 7);
  const tMin = encodeURIComponent(start.toISOString());
  const tMax = encodeURIComponent(end.toISOString());
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: calAuth() });
    if (!listRes.ok) { _calStatus = "Couldn't list your calendars (" + listRes.status + ")."; return; }
    const cals = (await listRes.json()).items || [];
    let all = [];
    for (const cal of cals) {
      if (cal.selected === false) continue; // respect hidden calendars
      const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(cal.id)
        + "/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=" + tMin + "&timeMax=" + tMax;
      const r = await fetch(url, { headers: calAuth() });
      if (!r.ok) continue;
      const items = (await r.json()).items || [];
      all = all.concat(items.map((ev) => ({
        summary: ev.summary || "(no title)",
        start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
        allDay: !(ev.start && ev.start.dateTime),
        cal: cal.summaryOverride || cal.summary || "",
      })).filter((e) => e.start));
    }
    DB.calendar.lastEvents = all;
    DB.calendar.lastFetched = Date.now();
    saveDB(DB);
    _calStatus = "";
  } catch (e) {
    _calStatus = "Couldn't reach Google Calendar.";
  }
}

/* ---- helpers ---- */
function eventsForDay(events, dateKey) {
  return events
    .filter((e) => (e.allDay ? e.start : todayKey(new Date(e.start))) === dateKey)
    .sort((a, b) => (a.start > b.start ? 1 : -1));
}
function eventTime(e) {
  if (e.allDay) return "All day";
  return new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function eventRow(e) {
  // Show the source calendar name (e.g. "Loop", "Family") but never your email.
  const src = (e.cal && !e.cal.includes("@")) ? ` <span class="cal__src">${escapeHTML(e.cal)}</span>` : "";
  return `<li><span class="cal__time">${eventTime(e)}</span><span>${escapeHTML(e.summary)}${src}</span></li>`;
}

/* ---- Render the Today calendar card ---- */
function renderTodayCalendar(db) {
  const wrap = document.getElementById("todayCalendar");

  if (!calendarConfigured(db)) {
    wrap.innerHTML = `
      <div class="cal">
        <div class="cal__head">📅 Google Calendar</div>
        <p class="goal__hint">See today's plan right here. Needs a quick one-time Google setup.</p>
        <div class="goal__actions"><button class="btn btn--mini" data-cal-setup>Connect it</button></div>
      </div>`;
    return;
  }

  const events = db.calendar.lastEvents || [];
  const today = eventsForDay(events, todayKey());
  const todayHTML = today.length
    ? `<ul class="cal__list">${today.map(eventRow).join("")}</ul>`
    : `<p class="goal__hint">Nothing in your calendar today.</p>`;

  let weekHTML = "";
  for (let i = 1; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const evs = eventsForDay(events, todayKey(d));
    if (!evs.length) continue;
    weekHTML += `<div class="cal__day">
      <div class="cal__dayname">${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</div>
      <ul class="cal__list">${evs.map(eventRow).join("")}</ul></div>`;
  }
  if (!weekHTML) weekHTML = `<p class="goal__hint">Nothing else in the next few days.</p>`;

  wrap.innerHTML = `
    <div class="cal">
      <div class="cal__head">📅 Today's schedule
        ${db.calendar.lastFetched ? `<span class="cal__sync">updated ${formatAgo(db.calendar.lastFetched)}</span>` : ""}
      </div>
      ${todayHTML}
      <div class="goal__actions">
        <button class="btn btn--mini" data-cal-refresh>${calendarConnected() ? "↻ Refresh" : "Connect Google"}</button>
        <button class="link-btn" data-cal-week>see this week</button>
      </div>
      <div id="calWeek" hidden>${weekHTML}</div>
      ${_calStatus ? `<div class="sts__status">${escapeHTML(_calStatus)}</div>` : ""}
    </div>`;
}

/* ---- Setup modal: paste the OAuth Client ID ---- */
function openCalendarSetup() {
  openModal("Connect Google Calendar", `
    <p style="margin:0">A one-time setup so JARVIS can <strong>read</strong> your calendar
    (it can never change it). Full step-by-step is in the project's
    <em>Google Calendar setup</em> guide — the short version:</p>
    <ol class="setup-steps">
      <li>In Google Cloud Console, make a project &amp; enable the <b>Google Calendar API</b>.</li>
      <li>Create an <b>OAuth Client ID</b> → type <b>Web application</b>.</li>
      <li>Add this <b>Authorised JavaScript origin</b>:<br>
        <code>https://curtainswine-cpu.github.io</code></li>
      <li>Copy the <b>Client ID</b> and paste it below.</li>
    </ol>
    <div class="field">
      <label for="calId">Your OAuth Client ID</label>
      <input id="calId" placeholder="…apps.googleusercontent.com" value="${escapeAttr(DB.calendar.clientId || "")}" />
    </div>
    <button class="btn btn--primary btn--block" id="calSave">Save &amp; connect</button>
  `);
  document.getElementById("calSave").onclick = () => {
    DB.calendar.clientId = document.getElementById("calId").value.trim();
    saveDB(DB);
    _calClient = null; // rebuild with the new id
    closeModal();
    render();
    if (DB.calendar.clientId) connectCalendar(DB);
  };
}

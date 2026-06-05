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
        DB.calendar.token = _calToken;    // remember it so a refresh won't re-login
        DB.calendar.tokenExp = _calTokenExp;
        if (!DB.calendar.owner) DB.calendar.owner = DB.activePerson; // calendar belongs to whoever signed in
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

/* Reuse a still-valid remembered token so a page refresh doesn't re-login. */
function restoreCalToken(db) {
  if (db.calendar.token && db.calendar.tokenExp && Date.now() < db.calendar.tokenExp) {
    _calToken = db.calendar.token;
    _calTokenExp = db.calendar.tokenExp;
    return true;
  }
  return false;
}

const CAL_REFRESH_MS = 6 * 60 * 60 * 1000; // only re-check Google every ~6 hours

/* On load: show the saved calendar. Only contact Google if the saved copy is
   more than ~6 hours old — so logins are needed at most every 6 hours (and
   usually not even then, as the refresh is silent). */
function calendarBootstrap(db, attempt) {
  // Only auto-reach Google once she's connected at least once — no nag before.
  if (!calendarConfigured(db) || !db.calendar.connectedOnce) return;
  // Saved copy still recent enough? Then don't touch Google at all.
  if (db.calendar.lastFetched && (Date.now() - db.calendar.lastFetched) < CAL_REFRESH_MS) return;
  // Stale → refresh, reusing a valid token if we still have one.
  if (restoreCalToken(db)) { fetchWeekEvents().then(() => render()); return; }
  attempt = attempt || 0;
  if (gisReady()) {
    ensureTokenClient(db);
    // 'none' = fully silent: never pops the account chooser. If it can't refresh
    // quietly, we just keep the saved copy (she can hit Refresh to sign in).
    try { _calClient.requestAccessToken({ prompt: "none" }); } catch (e) { /* stay on cache */ }
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
  // From yesterday → +7 days (yesterday lets us spot "post-night" mornings).
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()); end.setDate(end.getDate() + 7);
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

/* Is the connected calendar the active person's? (It belongs to whoever signed in.) */
function calendarOwnedByActive(db) {
  return !db.calendar.owner || db.calendar.owner === db.activePerson;
}

/* Build the today + this-week HTML from an events array (shared layout). */
function scheduleHTML(events, emptyText) {
  const today = eventsForDay(events, todayKey());
  const todayHTML = today.length
    ? `<ul class="cal__list">${today.map(eventRow).join("")}</ul>`
    : `<p class="goal__hint">${emptyText}</p>`;
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
  return { todayHTML, weekHTML };
}

/* ---- Render the Today calendar card ---- */
function renderTodayCalendar(db) {
  const wrap = document.getElementById("todayCalendar");

  // A work-pattern person (Jack) gets a calendar-type view built from their hours.
  const person = db.people.find((p) => p.id === db.activePerson);
  if (person && person.work) {
    const { todayHTML, weekHTML } = scheduleHTML(generateWorkEvents(db, person, 7), "Not a work day today.");
    const tk = todayKey();
    const workToday = isWorkDayToday(person);
    const wfhToday = isWfh(db, person.id, tk);

    let controls = "";
    if (workToday) {
      controls += `<button class="btn btn--mini ${wfhToday ? "" : "btn--quiet"}" data-wfh-toggle aria-pressed="${wfhToday}">🏠 ${wfhToday ? "Working from home ✓" : "Work from home today"}</button>`;
      // Lift only on the calendar person's day off, and only if not WFH.
      if (ownerOffToday(db) && !wfhToday) {
        const requested = (db.liftRequests || {})[tk];
        controls += requested
          ? `<button class="btn btn--mini btn--quiet" data-lift-cancel>🚗 Lift requested ✓</button>`
          : `<button class="btn btn--mini" data-lift-request>🚗 Request a lift</button>`;
      }
    }

    wrap.innerHTML = `
      <div class="cal">
        <div class="cal__head">📅 Today's schedule</div>
        ${todayHTML}
        ${person.work.note ? `<p class="goal__hint">${escapeHTML(person.work.note)}</p>` : ""}
        ${controls ? `<div class="goal__actions">${controls}</div>` : ""}
        <div class="goal__actions"><button class="link-btn" data-cal-week>see this week</button></div>
        <div id="calWeek" hidden>${weekHTML}</div>
      </div>`;
    return;
  }

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

/* ============================================================
   Shift-aware Today — work out what KIND of day it is from the
   calendar, so JARVIS can set the tone (light on long days, rest
   after nights, gym/projects on days off).
   ============================================================ */
function classifyShift(summary) {
  const s = (summary || "").toLowerCase();
  if (/annual leave|a\/l\b|holiday/.test(s)) return "annualleave";
  if (/night/.test(s)) return "night";
  if (/long day|long-day|longday/.test(s)) return "longday";
  if (/early/.test(s)) return "early";
  if (/\blate\b/.test(s)) return "late";
  if (/ward|shift|on call|day shift/.test(s)) return "work";
  return null;
}
function eventsOn(db, dateKey) {
  return (db.calendar.lastEvents || [])
    .filter((e) => (e.allDay ? e.start : todayKey(new Date(e.start))) === dateKey);
}
/* Returns {type, start?, allDay?} or null if we shouldn't guess. */
function todayShift(db) {
  if (!db.calendar.connectedOnce) return null; // don't claim "day off" before we have data
  const tk = todayKey();
  for (const e of eventsOn(db, tk)) {
    const t = classifyShift(e.summary);
    if (t) return { type: t, start: e.start, allDay: e.allDay };
  }
  const yk = todayKey(new Date(Date.now() - 86400000));
  for (const e of eventsOn(db, yk)) {
    if (classifyShift(e.summary) === "night") return { type: "postnight" };
  }
  return { type: "off" };
}

/* WFH marks + lift requests (kept per date). */
function isWfh(db, personId, dateKey) {
  return (db.workOverrides || {})[personId + "|" + dateKey] === "wfh";
}
function toggleWfh(db, personId, dateKey) {
  const k = personId + "|" + dateKey;
  if (!db.workOverrides) db.workOverrides = {};
  if (db.workOverrides[k] === "wfh") delete db.workOverrides[k];
  else db.workOverrides[k] = "wfh";
  saveDB(db);
}
function requestLift(db, dateKey) { (db.liftRequests = db.liftRequests || {})[dateKey] = true; saveDB(db); }
function cancelLift(db, dateKey) { if (db.liftRequests) delete db.liftRequests[dateKey]; saveDB(db); }
/* Is the calendar person (Kirsten) off today? (so she could give a lift) */
function ownerOffToday(db) {
  const s = todayShift(db);
  return !!(s && (s.type === "off" || s.type === "annualleave"));
}

/* Build pseudo-events for a work-pattern person (e.g. Jack) so their regular
   hours render like a calendar. Reflects any "work from home" mark. */
function generateWorkEvents(db, person, days) {
  const w = person.work || {};
  const out = [];
  for (let i = 0; i < (days || 7); i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    if ((w.days || []).includes(d.getDay())) {
      const dk = todayKey(d);
      const wfh = isWfh(db, person.id, dk);
      out.push({
        summary: `${wfh ? "🏠 Working from home" : "Work"} · ${w.start}–${w.end}`,
        start: dk + "T" + (w.start || "09:00") + ":00", allDay: false,
      });
    }
  }
  return out;
}
function isWorkDayToday(person) {
  return (person.work && person.work.days || []).includes(new Date().getDay());
}
/* Short one-liner for a calendar person's shift today (for the partner banner). */
function shiftShort(s) {
  if (!s) return "";
  const t = (s.start && !s.allDay) ? new Date(s.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
  switch (s.type) {
    case "longday": return `Long day${t ? ` from ${t}` : ""}`;
    case "night": return `Night shift${t ? ` from ${t}` : ""}`;
    case "postnight": return "Recovering after a night";
    case "early": return `Early shift${t ? ` from ${t}` : ""}`;
    case "late": return `Late shift${t ? ` from ${t}` : ""}`;
    case "work": return `Working${t ? ` from ${t}` : ""}`;
    case "annualleave": return "Annual leave";
    case "off": return "Day off";
    default: return "";
  }
}

function renderShiftBanner(db) {
  const wrap = document.getElementById("shiftBanner");
  if (!wrap) return;

  const person = db.people.find((p) => p.id === db.activePerson);

  // On a work-pattern person's page (Jack), the yellow banner shows the
  // PARTNER's schedule (e.g. Kirsten's shift) for coordination.
  if (person && person.work) {
    const partner = db.people.find((p) => p.id !== db.activePerson);
    let msg = "";
    if (partner && partner.work) {
      msg = `${partner.name}: ${isWorkDayToday(partner) ? "at work today" : "not working today"}`;
    } else if (partner) {
      const short = shiftShort(todayShift(db)); // the calendar person's shift today
      if (short) msg = `${partner.name}: ${short}`;
    }
    wrap.innerHTML = msg ? `<div class="shift-banner shift--work">💛 ${escapeHTML(msg)}</div>` : "";
    return;
  }

  // Otherwise (the calendar person) — set the tone from today's shift.
  const s = todayShift(db);
  if (!s) { wrap.innerHTML = ""; return; }
  const t = (s.start && !s.allDay)
    ? " from " + new Date(s.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  const C = {
    longday:     ["shift--work", "💪", `Long day today${t}. A big one — I've kept things light. Just the essentials; the rest can wait.`],
    early:       ["shift--work", "🌅", `Early shift today${t}. Keep this morning simple.`],
    late:        ["shift--work", "🌆", `Late shift today${t}.`],
    work:        ["shift--work", "🏥", `Working today${t}. Be gentle with yourself around your shift.`],
    night:       ["shift--night", "🌙", `Night shift tonight${t}. Take it easy today and rest up before you go in.`],
    postnight:   ["shift--night", "😴", `Post-night — rest and recover. Nothing's expected of you this morning. 💙`],
    annualleave: ["shift--off", "🏖️", `Annual leave — enjoy it. 💙`],
    off:         ["shift--off", "🎉", `Day off — a good one for the gym, a laundry step, or simply resting.`],
  };
  const [cls, emoji, msg] = C[s.type] || ["", "", ""];
  let html = msg ? `<div class="shift-banner ${cls}">${emoji} ${msg}</div>` : "";
  // If your partner has asked for a lift today, surface it here.
  if ((db.liftRequests || {})[todayKey()]) {
    const partner = db.people.find((p) => p.id !== db.activePerson);
    html += `<div class="shift-banner shift--work">🚗 ${escapeHTML(partner ? partner.name : "They")}'s asked for a lift today.</div>`;
  }
  wrap.innerHTML = html;
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

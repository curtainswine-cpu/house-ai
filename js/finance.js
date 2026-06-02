/* ============================================================
   finance.js — connects to the existing Google-Sheets finance
   tracker instead of duplicating it.
   We read ONE number live — "Safe to Spend" — from a published
   CSV of the Dashboard tab, cache it, and link out to the Sheet
   for everything else. No accounts, no double-counting.
   ============================================================ */

function money(n) {
  if (n == null || isNaN(n)) return "—";
  return "£" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- Reading the number from the published CSV ---------- */

/* Minimal CSV parser — handles quoted fields and commas. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Turn "£1,234.50" / "1234.5" into a number, or null if it isn't one. */
function parseMoney(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[£$,\s]/g, "").trim();
  if (cleaned === "" || isNaN(cleaned)) return null;
  return Number(cleaned);
}

/* Find "Safe to Spend" by its label, then grab the nearest number
   (to the right on the same row, else the cell directly below).
   Label-based so it survives the value moving cells. */
function extractSafeToSpend(rows) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (/safe\s*to\s*spend/i.test(rows[r][c] || "")) {
        for (let cc = c + 1; cc < rows[r].length; cc++) {
          const v = parseMoney(rows[r][cc]);
          if (v != null) return v;
        }
        if (rows[r + 1]) {
          const v = parseMoney(rows[r + 1][c]);
          if (v != null) return v;
        }
      }
    }
  }
  return null;
}

/* Fetch + cache. Returns { ok, value, error }. */
async function refreshFinance(db) {
  if (!db.finance.csvUrl) return { ok: false, error: "not-configured" };
  try {
    const res = await fetch(db.finance.csvUrl, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: "http-" + res.status };
    const text = await res.text();
    const value = extractSafeToSpend(parseCSV(text));
    if (value == null) return { ok: false, error: "not-found" };
    db.finance.lastValue = value;
    db.finance.lastFetched = Date.now();
    saveDB(db);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: "network" };
  }
}

/* "2 minutes ago" style label. */
function formatAgo(ts) {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/* ---------- The compact card on the Today screen ---------- */
function renderTodayMoney(db) {
  const wrap = document.getElementById("todayMoney");
  if (!db.finance.csvUrl && !db.finance.sheetUrl) {
    wrap.innerHTML = `
      <div class="money-card money-card--prompt">
        <div>
          <div class="money-card__label">Money</div>
          <div class="money-card__hint">Connect your Finances Tracker to see Safe-to-Spend here.</div>
        </div>
        <button class="btn btn--ghost" data-goto="money">Connect</button>
      </div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="money-card">
      <div>
        <div class="money-card__label">Safe to spend · until payday</div>
        <div class="money-card__value">${money(db.finance.lastValue)}</div>
        <div class="money-card__hint">Updated ${formatAgo(db.finance.lastFetched)}</div>
      </div>
      ${openFinancesBtn(db, "Open")}
    </div>`;
}

function openFinancesBtn(db, label) {
  if (!db.finance.sheetUrl) return "";
  return `<a class="btn" href="${escapeAttr(db.finance.sheetUrl)}" target="_blank" rel="noopener">${label} ↗</a>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

/* ---------- The full Money view ---------- */
function renderMoneyView(db) {
  const wrap = document.getElementById("moneyView");
  const connected = db.finance.csvUrl || db.finance.sheetUrl;

  if (!connected) {
    wrap.innerHTML = financeSetupHTML(db);
    wireFinanceSetup(db);
    return;
  }

  wrap.innerHTML = `
    <div class="sts">
      <div class="sts__label">Safe to spend until payday</div>
      <div class="sts__value">${money(db.finance.lastValue)}</div>
      <div class="sts__hint">Updated ${formatAgo(db.finance.lastFetched)}</div>
      <div class="sts__actions">
        <button class="btn" id="financeRefresh">↻ Refresh</button>
        ${openFinancesBtn(db, "Open Finances")}
      </div>
      <div class="sts__status" id="financeStatus"></div>
    </div>

    <div class="empty" style="text-align:left">
      <strong>Everything else lives in your Sheet</strong>
      <div>Savings pots, upcoming events, house-deposit progress and your bank
      import all stay in the Finances Tracker — this just surfaces the headline.</div>
      <button class="link-btn" id="financeEdit" style="padding:8px 0 0">Edit links</button>
    </div>`;

  document.getElementById("financeRefresh").onclick = async () => {
    const status = document.getElementById("financeStatus");
    status.textContent = "Checking…";
    const r = await refreshFinance(db);
    if (r.ok) render();
    else { status.textContent = financeError(r.error); }
  };
  document.getElementById("financeEdit").onclick = () => {
    db.finance.__editing = true;
    renderMoneyView(db);
  };
  if (db.finance.__editing) {
    wrap.insertAdjacentHTML("beforeend", financeSetupHTML(db));
    wireFinanceSetup(db);
  }
}

function financeError(code) {
  if (code === "not-found") return "Couldn't find “Safe to Spend” in that sheet — check the CSV link points at the Dashboard tab.";
  if (code === "network") return "Couldn't reach the sheet. Is the CSV link published to web?";
  if (code === "not-configured") return "Add your published CSV link to pull the number in.";
  return "Something went wrong fetching the number.";
}

function financeSetupHTML(db) {
  return `
    <div class="card" style="flex-direction:column;align-items:stretch;gap:14px">
      <div class="field">
        <label for="fSheet">Your Finances Sheet link</label>
        <input id="fSheet" placeholder="https://docs.google.com/spreadsheets/..." value="${escapeAttr(db.finance.sheetUrl || "")}" />
        <small style="color:var(--muted)">Open your Sheet, copy the address bar URL.</small>
      </div>
      <div class="field">
        <label for="fCsv">Published CSV link (for Safe-to-Spend)</label>
        <input id="fCsv" placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?...output=csv" value="${escapeAttr(db.finance.csvUrl || "")}" />
        <small style="color:var(--muted)">In the Sheet: File → Share → <b>Publish to web</b> → pick the <b>Dashboard</b> tab → <b>CSV</b> → Publish, then paste the link here. Leave blank to just use the Open button.</small>
      </div>
      <button class="btn btn--primary btn--block" id="fSave">Save</button>
      <div class="sts__status" id="fSetupStatus"></div>
    </div>`;
}

function wireFinanceSetup(db) {
  document.getElementById("fSave").onclick = async () => {
    db.finance.sheetUrl = document.getElementById("fSheet").value.trim();
    db.finance.csvUrl = document.getElementById("fCsv").value.trim();
    db.finance.__editing = false;
    saveDB(db);
    const status = document.getElementById("fSetupStatus");
    if (db.finance.csvUrl) {
      status.textContent = "Saved. Fetching your number…";
      await refreshFinance(db);
    }
    render();
  };
}

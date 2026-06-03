/* ============================================================
   punjabi.js — Learn Punjabi
   Word list (English ↔ Gurmukhi + romanised), editable so you can
   correct translations, spoken aloud via the browser's voice, plus
   flashcards, add-your-own, and bulk import. Saves in localStorage.
   ============================================================ */

let _learnTab = "words";   // words | cards | add | import
let _cardIdx = 0;
let _cardFlipped = false;

/* ---- Speak a word aloud (uses a Punjabi voice if the phone has one) ---- */
function speakPunjabi(text) {
  if (!("speechSynthesis" in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pa-IN";
  const pa = (speechSynthesis.getVoices() || []).find((v) => /^pa(-|_|$)/i.test(v.lang));
  if (pa) u.voice = pa;
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function wordById(db, id) { return db.punjabi.words.find((w) => w.id === id); }

function addWord(db, { en, pa, rom }) {
  db.punjabi.words.push({ id: uid(), en: en || "", pa: pa || "", rom: rom || "" });
  saveDB(db);
}
function updateWord(db, id, patch) {
  const w = wordById(db, id);
  if (w) Object.assign(w, patch);
  saveDB(db);
}
function deleteWord(db, id) {
  db.punjabi.words = db.punjabi.words.filter((w) => w.id !== id);
  saveDB(db);
}

/* Bulk import: "English, Punjabi, Romanised" per line. */
function importWords(db, text) {
  let added = 0;
  text.split("\n").forEach((line) => {
    const parts = line.split(",").map((p) => p.trim());
    if (!parts[0]) return;
    db.punjabi.words.push({ id: uid(), en: parts[0] || "", pa: parts[1] || "", rom: parts[2] || "" });
    added++;
  });
  saveDB(db);
  return added;
}

/* ---- Render the Learn view (switches on the sub-tab) ---- */
function renderLearn(db) {
  // sub-tab active state
  document.querySelectorAll("#learnTabs .seg__btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.learn === _learnTab));

  const body = document.getElementById("learnBody");
  const words = db.punjabi.words;

  if (_learnTab === "words") {
    body.innerHTML = words.length
      ? words.map(wordCardHTML).join("")
      : emptyState("📚", "No words yet", "Add some, or paste your colleague's list in Import.");
    return;
  }

  if (_learnTab === "cards") {
    if (!words.length) { body.innerHTML = emptyState("🃏", "No cards yet", "Add some words first."); return; }
    if (_cardIdx >= words.length) _cardIdx = 0;
    const w = words[_cardIdx];
    body.innerHTML = `
      <div class="flash ${_cardFlipped ? "is-flipped" : ""}" data-flip>
        <div class="flash__hint">${_cardFlipped ? "Punjabi" : "English"} · tap to flip</div>
        <div class="flash__face">${_cardFlipped
          ? `<div class="flash__pa">${escapeHTML(w.pa || "—")}</div><div class="flash__rom">${escapeHTML(w.rom || "")}</div>`
          : `<div class="flash__en">${escapeHTML(w.en)}</div>`}</div>
      </div>
      <div class="flash__controls">
        <button class="btn btn--mini" data-speak="${w.id}">🔊 Hear it</button>
        <button class="btn btn--mini" data-next-card>Next →</button>
        <button class="btn btn--mini btn--quiet" data-shuffle>🔀 Shuffle</button>
      </div>
      <div class="flash__count">${_cardIdx + 1} / ${words.length}</div>`;
    return;
  }

  if (_learnTab === "add") {
    body.innerHTML = `
      <div class="card" style="flex-direction:column;align-items:stretch;gap:14px">
        <div class="field"><label for="wEn">English</label>
          <input id="wEn" placeholder="e.g. Good morning" /></div>
        <div class="field"><label for="wPa">Punjabi (ਗੁਰਮੁਖੀ)</label>
          <input id="wPa" placeholder="ਸ਼ੁਭ ਸਵੇਰ" lang="pa" /></div>
        <div class="field"><label for="wRom">How it sounds (romanised)</label>
          <input id="wRom" placeholder="Shubh saver" /></div>
        <small style="color:var(--muted)">No Punjabi keyboard? Fill in English + the sound — you can paste the Gurmukhi later, or correct it anytime.</small>
        <button class="btn btn--primary btn--block" data-learn-add>Add word</button>
      </div>`;
    return;
  }

  if (_learnTab === "import") {
    body.innerHTML = `
      <div class="card" style="flex-direction:column;align-items:stretch;gap:14px">
        <div class="field">
          <label for="wImport">Paste your list — one per line, as <b>English, Punjabi, Romanised</b></label>
          <textarea id="wImport" rows="7" placeholder="Good morning, ਸ਼ੁਭ ਸਵੇਰ, Shubh saver&#10;Where is the pain?, ਦਰਦ ਕਿੱਥੇ ਹੈ?, Dard kithe hai?"></textarea>
        </div>
        <button class="btn btn--primary btn--block" data-learn-import>Import words</button>
        <div class="sts__status" id="importStatus"></div>
      </div>`;
    return;
  }
}

function wordCardHTML(w) {
  return `
    <article class="card word">
      <button class="check word__speak" data-speak="${w.id}" aria-label="Hear it">🔊</button>
      <div class="card__main">
        <div class="card__title">${escapeHTML(w.en)}</div>
        <div class="word__pa">${escapeHTML(w.pa || "—")}</div>
        <div class="word__rom">${escapeHTML(w.rom || "")}</div>
      </div>
      <button class="icon-btn" data-edit-word="${w.id}" aria-label="Correct this word">✎</button>
    </article>`;
}

/* ---- Edit / correct a word (modal) ---- */
function openWordModal(db, id) {
  const w = wordById(db, id);
  if (!w) return;
  openModal("Correct word", `
    <div class="field"><label for="ewEn">English</label>
      <input id="ewEn" value="${escapeAttr(w.en)}" /></div>
    <div class="field"><label for="ewPa">Punjabi (ਗੁਰਮੁਖੀ)</label>
      <input id="ewPa" value="${escapeAttr(w.pa)}" lang="pa" /></div>
    <div class="field"><label for="ewRom">How it sounds</label>
      <input id="ewRom" value="${escapeAttr(w.rom)}" /></div>
    <button class="btn btn--primary btn--block" id="ewSave">Save</button>
    <button class="btn btn--danger btn--block" id="ewDelete">Delete word</button>
  `);
  document.getElementById("ewSave").onclick = () => {
    updateWord(db, id, {
      en: document.getElementById("ewEn").value.trim(),
      pa: document.getElementById("ewPa").value.trim(),
      rom: document.getElementById("ewRom").value.trim(),
    });
    closeModal(); render();
  };
  document.getElementById("ewDelete").onclick = () => { deleteWord(db, id); closeModal(); render(); };
}

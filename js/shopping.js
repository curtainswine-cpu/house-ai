/* ============================================================
   shopping.js — sticky-note style shopping lists
   Make as many lists as you like (Tesco, Toiletries, Bits for
   the house…), each a little note with a heading + tickable items.
   ============================================================ */

const NOTE_COLOURS = ["y", "m", "p", "b", "o"]; // yellow, mint, pink, blue, orange

function addList(db, title) {
  db.shopping.lists.push({
    id: uid(),
    title: title || "List",
    colour: NOTE_COLOURS[db.shopping.lists.length % NOTE_COLOURS.length],
    items: [],
  });
  saveDB(db);
}
function deleteList(db, id) {
  db.shopping.lists = db.shopping.lists.filter((l) => l.id !== id);
  saveDB(db);
}
function renameList(db, id, title) {
  const l = db.shopping.lists.find((x) => x.id === id);
  if (l && title) l.title = title;
  saveDB(db);
}
function addShopItem(db, listId, text) {
  const l = db.shopping.lists.find((x) => x.id === listId);
  if (l && text) l.items.push({ id: uid(), text, done: false });
  saveDB(db);
}
function toggleShopItem(db, listId, itemId) {
  const l = db.shopping.lists.find((x) => x.id === listId);
  const it = l && l.items.find((i) => i.id === itemId);
  if (it) it.done = !it.done;
  saveDB(db);
}
function deleteShopItem(db, listId, itemId) {
  const l = db.shopping.lists.find((x) => x.id === listId);
  if (l) l.items = l.items.filter((i) => i.id !== itemId);
  saveDB(db);
}

/* ---- Render the sticky-note board ---- */
function renderShopping(db) {
  const wrap = document.getElementById("shoppingNotes");
  if (!wrap) return;
  if (!db.shopping.lists.length) {
    wrap.innerHTML = emptyState("🗒️", "No lists yet", "Tap + New list to start one — like a sticky note.");
    return;
  }
  wrap.innerHTML = db.shopping.lists.map(noteHTML).join("");
}

function noteHTML(list) {
  const items = (list.items || []).map((it) => `
    <li class="${it.done ? "is-done" : ""}">
      <button class="note__check" data-toggle-item="${list.id}|${it.id}" aria-label="Tick">${it.done ? "✓" : ""}</button>
      <span class="note__itemtext" data-toggle-item="${list.id}|${it.id}">${escapeHTML(it.text)}</span>
      <button class="note__x" data-del-item="${list.id}|${it.id}" aria-label="Remove">✕</button>
    </li>`).join("");
  return `
    <div class="note note--${list.colour || "y"}">
      <div class="note__head">
        <span class="note__title">${escapeHTML(list.title)}</span>
        <button class="note__edit" data-edit-list="${list.id}" aria-label="Edit list">✎</button>
      </div>
      <ul class="note__items">${items}</ul>
      <div class="note__add">
        <input id="add-${list.id}" data-additem-input="${list.id}" placeholder="add item…" />
        <button class="note__addbtn" data-additem="${list.id}" aria-label="Add">+</button>
      </div>
    </div>`;
}

/* ---- New / edit list modals ---- */
function openNewListModal() {
  openModal("New list", `
    <div class="field">
      <label for="nlTitle">List name</label>
      <input id="nlTitle" placeholder="e.g. Tesco · Toiletries · Bits for the house" autofocus />
    </div>
    <button class="btn btn--primary btn--block" id="nlSave">Create list</button>
  `);
  document.getElementById("nlSave").onclick = () => {
    const t = document.getElementById("nlTitle").value.trim();
    if (!t) { document.getElementById("nlTitle").focus(); return; }
    addList(DB, t);
    closeModal();
    render();
  };
}
function openEditListModal(id) {
  const l = DB.shopping.lists.find((x) => x.id === id);
  if (!l) return;
  openModal("Edit list", `
    <div class="field">
      <label for="elTitle">List name</label>
      <input id="elTitle" value="${escapeAttr(l.title)}" />
    </div>
    <button class="btn btn--primary btn--block" id="elSave">Save</button>
    <button class="btn btn--danger btn--block" id="elDelete">Delete this list</button>
  `);
  document.getElementById("elSave").onclick = () => {
    renameList(DB, id, document.getElementById("elTitle").value.trim());
    closeModal(); render();
  };
  document.getElementById("elDelete").onclick = () => { deleteList(DB, id); closeModal(); render(); };
}

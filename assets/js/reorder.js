import { fetchJSON, resolveUrl, qs } from "./util.js";

const DATA_URL = "../data/portfolio.json";

const DEFAULT_GROUP_NAME = "Wolne wzory";
const DEFAULT_GROUP_KEY = DEFAULT_GROUP_NAME.trim().toLowerCase();
const DEFAULT_GROUP_ID = "wolne-wzory";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function nowISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid(prefix = "g") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDragAfterElement(container, y, selector) {
  const els = Array.from(container.querySelectorAll(selector));
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function normalizeGroups(data, items) {
  const idsAll = items.map((x) => x.id).filter(Boolean);
  const idSet = new Set(idsAll);

  let groups = [];
  if (Array.isArray(data.groups) && data.groups.length) {
    groups = data.groups.map((g, idx) => ({
      id: String(g?.id || `g${idx}`),
      name: String(g?.name || ""),
      items: Array.isArray(g?.items)
        ? g.items
        : Array.isArray(g?.ids)
          ? g.ids
          : [],
    }));
  } else {
    groups = [
      { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME, items: idsAll.slice() },
    ];
  }

  // ensure default group exists + pinned on top
  let def = groups.find(
    (g) => String(g.name).trim().toLowerCase() === DEFAULT_GROUP_KEY,
  );
  if (!def) {
    def = { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME, items: [] };
    groups.unshift(def);
  } else {
    def.id = def.id || DEFAULT_GROUP_ID;
    def.name = DEFAULT_GROUP_NAME;
    groups = [def, ...groups.filter((g) => g !== def)];
  }

  // de-dup assignments and drop unknown ids
  const assigned = new Set();
  for (const g of groups) {
    const cleaned = [];
    for (const id of g.items || []) {
      if (!idSet.has(id)) continue;
      if (assigned.has(id)) continue;
      assigned.add(id);
      cleaned.push(id);
    }
    g.items = cleaned;
  }

  // add unassigned items to default group
  for (const id of idsAll) {
    if (!assigned.has(id)) {
      assigned.add(id);
      def.items.push(id);
    }
  }

  return groups;
}

function normalizeFeaturedOrder(data, items) {
  const byId = new Map(items.map((x) => [x.id, x]));
  const out = [];
  const seen = new Set();

  const pushIfOk = (id) => {
    if (!id || seen.has(id)) return;
    const it = byId.get(id);
    if (!it || !it.featured) return;
    seen.add(id);
    out.push(id);
  };

  const order = Array.isArray(data.featuredOrder) ? data.featuredOrder : [];
  order.forEach(pushIfOk);

  // add missing featured items (fallback: current items order)
  items.forEach((it) => {
    if (it && it.featured) pushIfOk(it.id);
  });

  return out;
}

function buildFeaturedRow(item, getGroupNameById) {
  const row = document.createElement("div");
  row.className = "row row--featured";
  row.draggable = true;
  row.dataset.id = item.id;

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.textContent = "⋮⋮";

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = item._resolvedSrc;
  thumb.alt = item.alt || item.id;

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.id;

  const subtitle = document.createElement("div");
  subtitle.className = "subtitle";
  subtitle.dataset.role = "group";
  subtitle.textContent = getGroupNameById(item.id);

  meta.append(title, subtitle);

  row.append(handle, thumb, meta);

  return row;
}

function buildItemRow(item, { onFeaturedChange, statusEl }) {
  const row = document.createElement("div");
  row.className = "row row--item";
  row.draggable = true;
  row.dataset.id = item.id;

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.textContent = "⋮⋮";

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = item._resolvedSrc;
  thumb.alt = item.alt || item.id;

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.id;

  const alt = document.createElement("input");
  alt.className = "alt";
  alt.type = "text";
  alt.value = item.alt || "";
  alt.placeholder = "Opis PRISM Warszawa Mokotów (alt)";

  alt.addEventListener("input", () => {
    item.alt = alt.value;
  });

  meta.append(title, alt);

  const right = document.createElement("div");
  right.className = "right";

  const label = document.createElement("label");
  label.className = "check";

  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = !!item.featured;

  chk.addEventListener("change", () => {
    item.featured = chk.checked;
    onFeaturedChange(item);
    if (statusEl)
      statusEl.textContent =
        "Zmieniono ustawienia karuzeli (pamiętaj pobrać JSON).";
  });

  label.append(chk, document.createTextNode(" str. główna"));
  right.append(label);

  row.append(handle, thumb, meta, right);

  // keyboard: Alt+ArrowUp/Down moves within current group
  row.addEventListener("keydown", (e) => {
    if (!e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();

    const list = row.parentElement;
    if (!list) return;

    const rows = Array.from(list.querySelectorAll(".row--item"));
    const idx = rows.indexOf(row);
    if (idx < 0) return;

    const dir = e.key === "ArrowUp" ? -1 : 1;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= rows.length) return;

    const target = rows[targetIdx];
    if (dir < 0) list.insertBefore(row, target);
    else list.insertBefore(target, row); // swap

    if (statusEl)
      statusEl.textContent = "Zmieniono kolejność (pamiętaj pobrać JSON).";
  });

  row.tabIndex = 0;
  return row;
}

async function init() {
  const status = qs("#status");
  const btnDownload = qs("#btnDownload");
  const btnCopy = qs("#btnCopy");

  const btnAddGroup = qs("#btnAddGroup");
  const groupsRoot = qs("#groupsList");
  const featuredRoot = qs("#featuredList");

  if (!status || !groupsRoot || !featuredRoot) return;

  status.textContent = "Wczytuję…";

  let data, url;
  try {
    ({ data, url } = await fetchJSON(DATA_URL));
  } catch (err) {
    console.error(err);
    status.textContent =
      "Nie udało się wczytać JSON (sprawdź ścieżkę ../data/portfolio.json).";
    return;
  }

  const items = (data.items || []).map((x) => ({
    ...x,
    _resolvedSrc: resolveUrl(x.src, url),
  }));

  const byId = new Map(items.map((x) => [x.id, x]));

  const groups = normalizeGroups(data, items);
  const featuredOrder = normalizeFeaturedOrder(data, items);

  // ====== DOM maps ======
  const itemRowById = new Map();
  const featuredRowById = new Map();

  // ====== Drag state ======
  let draggingItemRow = null;
  let draggingFeaturedRow = null;
  let draggingGroupEl = null;

  const refreshGroupCounts = () => {
    const groupEls = Array.from(groupsRoot.querySelectorAll(".group"));
    for (const gEl of groupEls) {
      const countEl = gEl.querySelector("[data-role='count']");
      const listEl = gEl.querySelector("[data-role='list']");
      if (!countEl || !listEl) continue;
      const n = listEl.querySelectorAll(".row--item").length;
      countEl.textContent = `${n} szt.`;
    }
  };

  const getGroupNameByItemId = (id) => {
    const groupEls = Array.from(groupsRoot.querySelectorAll(".group"));
    for (const gEl of groupEls) {
      const listEl = gEl.querySelector("[data-role='list']");
      if (!listEl) continue;

      const has = Array.from(
        listEl.querySelectorAll(".row--item[data-id]"),
      ).some((el) => el.dataset.id === id);
      if (!has) continue;

      const nameEl = gEl.querySelector("[data-role='name']");
      const v = (nameEl?.value ?? nameEl?.textContent ?? "").trim();
      return v || "";
    }
    return "";
  };

  const refreshFeaturedSubtitles = () => {
    for (const [id, row] of featuredRowById.entries()) {
      const sub = row.querySelector("[data-role='group']");
      if (sub) sub.textContent = getGroupNameByItemId(id);
    }
  };

  const ensureFeaturedRow = (item, { appendToEnd = true } = {}) => {
    if (featuredRowById.has(item.id)) return;

    const row = buildFeaturedRow(item, getGroupNameByItemId);
    featuredRowById.set(item.id, row);

    // featured row drag handlers
    row.addEventListener("dragstart", (e) => {
      draggingFeaturedRow = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `featured:${item.id}`);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggingFeaturedRow = null;
      status.textContent =
        "Zmieniono kolejność karuzeli (pamiętaj pobrać JSON).";
    });

    if (appendToEnd) featuredRoot.append(row);
  };

  const removeFeaturedRow = (id) => {
    const row = featuredRowById.get(id);
    if (!row) return;
    row.remove();
    featuredRowById.delete(id);
  };

  const onFeaturedChange = (item) => {
    if (item.featured) {
      // jeśli była informacja „Brak prac…”, usuń ją przy pierwszym dodaniu
      if (!featuredRoot.querySelector(".row--featured")) {
        featuredRoot.innerHTML = "";
      }

      ensureFeaturedRow(item, { appendToEnd: true });
      refreshFeaturedSubtitles();
    } else {
      removeFeaturedRow(item.id);
    }

    // Komunikat w UI gdy nic nie ma
    const any = featuredRoot.querySelectorAll(".row--featured").length;
    if (!any) {
      featuredRoot.innerHTML = "";
      featuredRoot.append(
        "Brak prac w karuzeli — zaznacz „str. główna” w portfolio.",
      );
    }
  };

  // ====== Render featured list (carousel order) ======
  featuredRoot.innerHTML = "";
  if (featuredOrder.length === 0) {
    featuredRoot.append(
      "Brak prac w karuzeli — zaznacz „str. główna” w portfolio.",
    );
  } else {
    for (const id of featuredOrder) {
      const item = byId.get(id);
      if (!item) continue;
      ensureFeaturedRow(item, { appendToEnd: true });
    }
  }

  // DnD sort inside featuredRoot
  featuredRoot.addEventListener("dragover", (e) => {
    if (!draggingFeaturedRow) return;
    e.preventDefault();
    const afterEl = getDragAfterElement(
      featuredRoot,
      e.clientY,
      ".row--featured:not(.dragging)",
    );
    if (afterEl == null) featuredRoot.append(draggingFeaturedRow);
    else featuredRoot.insertBefore(draggingFeaturedRow, afterEl);
  });

  // ====== Create item rows once ======
  for (const item of items) {
    const row = buildItemRow(item, { onFeaturedChange, statusEl: status });

    // item row drag handlers
    row.addEventListener("dragstart", (e) => {
      draggingItemRow = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `item:${item.id}`);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggingItemRow = null;
      refreshGroupCounts();
      refreshFeaturedSubtitles();
      status.textContent = "Zmieniono układ w grupach (pamiętaj pobrać JSON).";
    });

    itemRowById.set(item.id, row);
  }

  // ====== Render groups ======
  const renderGroup = (group) => {
    const isPinned =
      String(group.name).trim().toLowerCase() === DEFAULT_GROUP_KEY;

    const groupEl = document.createElement("div");
    groupEl.className = "group" + (isPinned ? " group--pinned" : "");
    groupEl.dataset.groupId = group.id || uid("g");

    const head = document.createElement("div");
    head.className = "group__head";
    // Uwaga: przeciąganie grupy jest przypięte do uchwytu (żeby nie kolidowało z edycją nazwy)
    head.draggable = false;

    const handle = document.createElement("div");
    handle.className = "group__handle";
    handle.textContent = "⋮⋮";
    handle.draggable = !isPinned;

    const name = document.createElement("input");
    name.className = "group__name";
    name.dataset.role = "name";

    if (isPinned) {
      name.value = DEFAULT_GROUP_NAME;
      name.readOnly = true;
    } else {
      name.value = group.name || "";
      name.placeholder = "Nazwa grupy (np. fine line)";
    }

    name.addEventListener("input", () => {
      status.textContent = "Zmieniono nazwy grup (pamiętaj pobrać JSON).";
      refreshFeaturedSubtitles();
    });

    const count = document.createElement("div");
    count.className = "group__count";
    count.dataset.role = "count";
    count.textContent = "0 szt.";

    head.append(handle, name, count);

    const list = document.createElement("div");
    list.className = "group__list";
    list.dataset.role = "list";

    // Drop handler for item rows (allow drop on whole group box)
    const onDragOverItems = (e) => {
      if (!draggingItemRow) return;
      e.preventDefault();
      const afterEl = getDragAfterElement(
        list,
        e.clientY,
        ".row--item:not(.dragging)",
      );
      if (afterEl == null) list.append(draggingItemRow);
      else list.insertBefore(draggingItemRow, afterEl);
    };

    groupEl.addEventListener("dragover", onDragOverItems);
    list.addEventListener("dragover", onDragOverItems);

    // Group reordering (drag header)
    handle.addEventListener("dragstart", (e) => {
      if (isPinned) return;
      draggingGroupEl = groupEl;
      groupEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `group:${groupEl.dataset.groupId}`);
    });

    handle.addEventListener("dragend", () => {
      if (!draggingGroupEl) return;
      groupEl.classList.remove("dragging");
      draggingGroupEl = null;
      status.textContent = "Zmieniono kolejność grup (pamiętaj pobrać JSON).";
    });

    groupEl.append(head, list);

    // append initial items
    for (const id of group.items || []) {
      const row = itemRowById.get(id);
      if (row) list.append(row);
    }

    return groupEl;
  };

  groupsRoot.innerHTML = "";
  for (const group of groups) {
    groupsRoot.append(renderGroup(group));
  }
  refreshGroupCounts();
  refreshFeaturedSubtitles();

  // DnD reorder groups within groupsRoot
  groupsRoot.addEventListener("dragover", (e) => {
    if (!draggingGroupEl) return;
    e.preventDefault();

    const afterEl = getDragAfterElement(
      groupsRoot,
      e.clientY,
      ".group:not(.dragging)",
    );

    // pinned group must stay first
    const pinned = groupsRoot.querySelector(".group--pinned");
    if (afterEl === pinned) {
      // drop would insert before pinned -> force after pinned
      const next = pinned?.nextElementSibling;
      if (next) groupsRoot.insertBefore(draggingGroupEl, next);
      else groupsRoot.append(draggingGroupEl);
      return;
    }

    if (afterEl == null) groupsRoot.append(draggingGroupEl);
    else groupsRoot.insertBefore(draggingGroupEl, afterEl);

    // keep pinned group at top no matter what
    if (pinned && pinned !== groupsRoot.firstElementChild) {
      groupsRoot.prepend(pinned);
    }
  });

  // ====== Add group button ======
  btnAddGroup?.addEventListener("click", () => {
    const g = {
      id: uid("g"),
      name: "",
      items: [],
    };

    const groupEl = renderGroup(g);

    // insert after pinned group (always at top)
    const pinned = groupsRoot.querySelector(".group--pinned");
    if (pinned && pinned.nextElementSibling) {
      groupsRoot.insertBefore(groupEl, pinned.nextElementSibling);
    } else {
      groupsRoot.append(groupEl);
    }

    // focus input
    const nameInput = groupEl.querySelector(".group__name:not([readonly])");
    nameInput?.focus();

    status.textContent = "Dodano grupę (pamiętaj pobrać JSON).";
    refreshGroupCounts();
    refreshFeaturedSubtitles();
  });

  // ====== Build output JSON ======
  const buildOutput = () => {
    const groupEls = Array.from(groupsRoot.querySelectorAll(".group"));
    const groupsOut = groupEls.map((gEl) => {
      const id = gEl.dataset.groupId || uid("g");
      const nameEl = gEl.querySelector("[data-role='name']");
      const listEl = gEl.querySelector("[data-role='list']");
      const name = (nameEl?.value ?? nameEl?.textContent ?? "").trim();

      const itemIds = listEl
        ? Array.from(listEl.querySelectorAll(".row--item[data-id]")).map(
            (el) => el.dataset.id,
          )
        : [];

      return {
        id,
        name:
          String(name).trim().toLowerCase() === DEFAULT_GROUP_KEY
            ? DEFAULT_GROUP_NAME
            : name,
        items: itemIds,
      };
    });

    // featured order from DOM
    let featuredOut = Array.from(
      featuredRoot.querySelectorAll(".row--featured[data-id]"),
    )
      .map((el) => el.dataset.id)
      .filter((id) => {
        const it = byId.get(id);
        return !!(it && it.featured);
      });

    // ensure all featured are included (append missing)
    const seen = new Set(featuredOut);
    for (const it of items) {
      if (it && it.featured && !seen.has(it.id)) {
        seen.add(it.id);
        featuredOut.push(it.id);
      }
    }

    // items array: flatten group order for nicer diffs
    const flattenedIds = groupsOut.flatMap((g) => g.items || []);
    const seenItems = new Set();
    const orderedItems = [];

    for (const id of flattenedIds) {
      const it = byId.get(id);
      if (!it) continue;
      if (seenItems.has(id)) continue;
      seenItems.add(id);
      orderedItems.push(it);
    }
    for (const it of items) {
      if (!it || !it.id) continue;
      if (!seenItems.has(it.id)) {
        seenItems.add(it.id);
        orderedItems.push(it);
      }
    }

    return {
      version: Math.max(Number(data.version || 1), 2),
      updated: nowISODate(),
      featuredOrder: featuredOut,
      groups: groupsOut,
      items: orderedItems.map(({ _resolvedSrc, ...rest }) => rest),
    };
  };

  btnDownload?.addEventListener("click", () => {
    const out = buildOutput();
    downloadText("portfolio.json", JSON.stringify(out, null, 2));
    status.textContent =
      "Pobrano portfolio.json — podmień plik w /data i zacommituj.";
  });

  btnCopy?.addEventListener("click", async () => {
    const out = buildOutput();
    const text = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Skopiowano JSON do schowka.";
    } catch (err) {
      console.error(err);
      status.textContent = "Nie udało się skopiować. Użyj pobierania pliku.";
    }
  });

  status.textContent =
    "Gotowe. Ustaw grupy i kolejność w karuzeli, a potem pobierz JSON.";
}

window.addEventListener("DOMContentLoaded", init);

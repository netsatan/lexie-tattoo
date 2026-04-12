import { fetchJSON, resolveUrl, qs } from "./util.js";
import { initSite, openFreePatternModal } from "./site.js";

const DATA_URL = "../data/portfolio.json";
const DEFAULT_GROUP_NAME = "Wolne wzory";
const DEFAULT_GROUP_KEY = DEFAULT_GROUP_NAME.trim().toLowerCase();

function setupLightbox(items) {
  const lb = qs("#lightbox");
  const lbImg = qs("#lightboxImg");
  const lbCap = qs("#lightboxCaption");
  const btnInquiry = qs("#lightboxInquiry");
  const btnClose = qs("#lightboxClose");
  const btnPrev = qs("#lightboxPrev");
  const btnNext = qs("#lightboxNext");

  if (!lb || !lbImg) return;

  let index = 0;

  const open = (i) => {
    index = i;
    const item = items[index];
    if (!item) return;

    lbImg.src = item._resolvedSrc;
    lbImg.alt = item.alt || "Tatuaż – praca Lexie";

    if (lbCap) {
      lbCap.textContent = item._showCaption ? item.alt || "" : "";
    }

    if (btnInquiry) {
      if (item._showInquiry) {
        btnInquiry.hidden = false;
        btnInquiry.onclick = () => {
          openFreePatternModal(item._resolvedSrc, item.alt || "Wolny wzór");
        };
      } else {
        btnInquiry.hidden = true;
        btnInquiry.onclick = null;
      }
    }

    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  const prev = () => {
    if (!items.length) return;
    open((index - 1 + items.length) % items.length);
  };

  const next = () => {
    if (!items.length) return;
    open((index + 1) % items.length);
  };

  btnClose?.addEventListener("click", close);
  btnPrev?.addEventListener("click", prev);
  btnNext?.addEventListener("click", next);

  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });

  window.addEventListener("keydown", (e) => {
    const isOpen = lb.getAttribute("aria-hidden") === "false";
    if (!isOpen) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  return { open, close };
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
      { id: "wolne-wzory", name: DEFAULT_GROUP_NAME, items: idsAll.slice() },
    ];
  }

  let def = groups.find(
    (g) => String(g.name).trim().toLowerCase() === DEFAULT_GROUP_KEY,
  );
  if (!def) {
    def = { id: "wolne-wzory", name: DEFAULT_GROUP_NAME, items: [] };
    groups.unshift(def);
  } else {
    def.name = DEFAULT_GROUP_NAME;
    groups = [def, ...groups.filter((g) => g !== def)];
  }

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

  for (const id of idsAll) {
    if (!assigned.has(id)) {
      assigned.add(id);
      def.items.push(id);
    }
  }

  return groups;
}

async function renderPortfolio() {
  const root = qs("#portfolioGrid");
  const view = (
    document.body?.dataset?.portfolioView || "portfolio"
  ).toLowerCase();
  if (!root) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = (data.items || []).map((x) => ({
      ...x,
      _resolvedSrc: resolveUrl(x.src, url),
    }));

    const byId = new Map(items.map((x) => [x.id, x]));

    const updated = qs("[data-updated]");
    if (updated && data.updated) updated.textContent = data.updated;

    root.classList.remove("grid");
    root.innerHTML = "";

    const lightboxEnabled = true;
    const orderedForLightbox = [];
    const lb = lightboxEnabled ? setupLightbox(orderedForLightbox) : null;

    const groupsAll = normalizeGroups(data, items);

    const freeGroup = groupsAll.find(
      (g) =>
        String(g?.name || "")
          .trim()
          .toLowerCase() === DEFAULT_GROUP_KEY ||
        String(g?.id || "")
          .toLowerCase()
          .includes("wolne"),
    );

    const freeIds = Array.isArray(data.freePatternIds)
      ? data.freePatternIds
      : null;
    const freeSet = new Set(
      freeIds && freeIds.length ? freeIds : freeGroup?.items || [],
    );

    let renderedAny = false;

    const isFreeGroup = (g) => {
      const name = String(g?.name || "")
        .trim()
        .toLowerCase();
      const id = String(g?.id || "")
        .trim()
        .toLowerCase();
      return name === DEFAULT_GROUP_KEY || id.includes("wolne");
    };

    const groups =
      view === "available"
        ? freeGroup
          ? [freeGroup]
          : []
        : groupsAll.filter((g) => !isFreeGroup(g));

    for (const group of groups) {
      const ids = (group.items || []).filter((id) => byId.has(id));
      if (ids.length === 0) continue;

      renderedAny = true;

      const section = document.createElement("section");
      section.className = "portfolio-group";

      const grid = document.createElement("div");
      grid.className = "grid";
      grid.setAttribute("aria-label", `Portfolio — ${group.name || ""}`);

      for (const id of ids) {
        const item = byId.get(id);
        if (!item) continue;

        const isFreePattern = freeSet.has(item.id);

        const idx = orderedForLightbox.length;
        orderedForLightbox.push({
          ...item,
          _showCaption: false,
          _showInquiry: view === "available" && isFreePattern,
        });

        const img = document.createElement("img");
        img.src = item._resolvedSrc;
        img.alt = item.alt || "Tatuaż – praca Lexie";
        img.loading = "lazy";
        img.fetchPriority = "low";
        img.decoding = "async";
        if (item.width) img.width = item.width;
        if (item.height) img.height = item.height;

        const tile = document.createElement("div");
        tile.className = "tile";
        tile.tabIndex = lightboxEnabled ? 0 : -1;
        tile.append(img);

        if (isFreePattern) {
          tile.dataset.freePattern = "1";

          if (view !== "available") {
            const badge = document.createElement("div");
            badge.className = "slide__badge";
            badge.textContent = "Wolny wzór!";

            const ctaWrap = document.createElement("div");
            ctaWrap.className = "slide__ctaWrap";

            const ctaBtn = document.createElement("button");
            ctaBtn.type = "button";
            ctaBtn.className = "slide__ctaBtn btn btn--primary";
            ctaBtn.textContent = "Chcę ten wzór!";
            ctaBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              openFreePatternModal(item._resolvedSrc, item.alt || "Wolny wzór");
            });
            ctaBtn.addEventListener("keydown", (e) => e.stopPropagation());

            ctaWrap.appendChild(ctaBtn);
            tile.append(badge);
            tile.append(ctaWrap);
          }
        }

        if (lightboxEnabled && lb) {
          tile.addEventListener("click", () => lb.open(idx));
          tile.addEventListener("keydown", (e) => {
            if (e.target !== tile) return;
            if (e.key === "Enter" || e.key === " ") lb.open(idx);
          });
        }
        grid.append(tile);
      }

      section.append(grid);
      root.append(section);
    }

    if (!renderedAny) {
      root.append("Brak prac do wyświetlenia — uzupełnij portfolio.json.");
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = "";
    root.append("Nie udało się wczytać portfolio (sprawdź JSON / ścieżki).");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initSite();
  renderPortfolio();
});

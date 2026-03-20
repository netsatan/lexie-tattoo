import { fetchJSON, qs, qsa } from "./util.js";
import { initSite, openFreePatternModal, setupContactForm } from "./site.js";

const DATA_URL = "./data/portfolio.json";
const REVIEWS_URL = "./data/reviews.json";

function normalizeReviewText(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStars(rating = 5) {
  const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
  return Array.from({ length: 5 }, (_, index) => {
    const filled = index < safeRating;
    return `
      <svg
        class="review-card__star${filled ? " is-filled" : ""}"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 1.2l2.46 4.98 5.5.8-3.98 3.88.94 5.48L10 13.76l-4.92 2.58.94-5.48L2.04 6.98l5.5-.8L10 1.2z"></path>
      </svg>`;
  }).join("");
}

/* ============================================================
   Carousel
   - loop clones
   - click slide (desktop) to center
   - prev/next hit-areas (desktop via CSS)
   - CTA "Chcę ten wzór!" arms after 1s when a FREE slide is centered
   ============================================================ */
function setupCarousel(root) {
  const track = qs("[data-track]", root);
  if (!track) return;

  if (track.dataset.carouselInit === "1") return;
  track.dataset.carouselInit = "1";

  // Anti-save (carousel only)
  track.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });
  track.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") e.preventDefault();
  });

  const slidesAll = () => Array.from(track.querySelectorAll("[data-slide]"));

  const getStep = () => {
    const slides = slidesAll();
    if (slides.length >= 2) return slides[1].offsetLeft - slides[0].offsetLeft;
    const first = slides[0];
    return first ? first.getBoundingClientRect().width : 320;
  };

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ========== Center-snap helpers ==========
  const getTrackCenterX = () => {
    const rT = track.getBoundingClientRect();
    return rT.left + rT.width / 2;
  };

  const getSlideCenterX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  const getCenteredIndex = () => {
    const slides = slidesAll();
    if (!slides.length) return 0;

    const cx = getTrackCenterX();
    let best = 0;
    let bestDist = Infinity;

    slides.forEach((el, i) => {
      const d = Math.abs(getSlideCenterX(el) - cx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });

    return best;
  };

  let programmaticUntil = 0;
  const markProgrammatic = (ms = 250) => {
    programmaticUntil = performance.now() + ms;
  };
  const isProgrammatic = () => performance.now() < programmaticUntil;

  const centerToIndex = (idx, behavior = "smooth") => {
    const slides = slidesAll();
    if (!slides.length) return;

    idx = Math.max(0, Math.min(slides.length - 1, idx));
    const el = slides[idx];

    const delta = getSlideCenterX(el) - getTrackCenterX();
    markProgrammatic(300);
    track.scrollBy({ left: delta, behavior });
  };

  const next = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() + 1, behavior);
  };

  const prev = () => {
    const behavior = prefersReduced ? "auto" : "smooth";
    centerToIndex(getCenteredIndex() - 1, behavior);
  };

  const isDesktopPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  if (isDesktopPointer) {
    track.addEventListener("click", (e) => {
      if (e.target.closest(".slide__ctaBtn")) return;
      const slide = e.target.closest("[data-slide]");
      if (!slide) return;
      const slides = slidesAll();
      const idx = slides.indexOf(slide);
      if (idx < 0) return;

      const behavior = prefersReduced ? "auto" : "smooth";
      centerToIndex(idx, behavior);
    });
  }

  track.addEventListener("click", (e) => {
    const button = e.target.closest(".slide__ctaBtn");
    if (!button) return;

    const slide = button.closest("[data-free-pattern='1']");
    if (!slide) return;

    const src = slide.dataset.imageSrc;
    const alt = slide.dataset.imageAlt || "Wolny wzór Lexie";
    if (!src) return;

    e.preventDefault();
    e.stopPropagation();
    openFreePatternModal(src, alt);
  });

  if (isDesktopPointer && !root.querySelector(".carousel__nav--prev")) {
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "carousel__nav carousel__nav--prev";
    btnPrev.setAttribute("aria-label", "Poprzedni slajd");
    btnPrev.addEventListener("click", () => prev());

    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "carousel__nav carousel__nav--next";
    btnNext.setAttribute("aria-label", "Następny slajd");
    btnNext.addEventListener("click", () => next());

    root.append(btnPrev, btnNext);
  }

  const initLoop = () => {
    if (track.dataset.loopInit === "1") return;

    const slides = slidesAll();
    if (slides.length < 2) return;

    const originalsCount = slides.length;
    const cloneCount = Math.min(3, originalsCount);

    const headClones = slides
      .slice(0, cloneCount)
      .map((el) => el.cloneNode(true));
    const tailClones = slides
      .slice(-cloneCount)
      .map((el) => el.cloneNode(true));

    headClones.forEach((c) => c.setAttribute("data-clone", "1"));
    tailClones.forEach((c) => c.setAttribute("data-clone", "1"));

    tailClones.reverse().forEach((c) => track.prepend(c));
    headClones.forEach((c) => track.append(c));

    track.dataset.loopInit = "1";

    requestAnimationFrame(() => {
      const step = getStep();
      track.scrollLeft = cloneCount * step;
      requestAnimationFrame(() => centerToIndex(getCenteredIndex(), "auto"));
    });

    let lock = false;
    let scrollEndT = null;

    const normalizeLoop = () => {
      if (lock) return;

      if (isProgrammatic()) {
        scrollEndT = setTimeout(normalizeLoop, 120);
        return;
      }

      const step = getStep();
      const start = cloneCount * step;
      const end = start + originalsCount * step;

      if (track.scrollLeft < start - step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft + originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      } else if (track.scrollLeft > end + step * 0.25) {
        lock = true;
        markProgrammatic(350);
        track.scrollLeft = track.scrollLeft - originalsCount * step;
        requestAnimationFrame(() => (lock = false));
      }
    };

    track.addEventListener(
      "scroll",
      () => {
        if (scrollEndT) clearTimeout(scrollEndT);
        scrollEndT = setTimeout(normalizeLoop, 140);
      },
      { passive: true },
    );
  };

  const autoplayMs = Number(root.getAttribute("data-autoplay") || "5000");
  const enabledAutoplay = Number.isFinite(autoplayMs) && autoplayMs > 0;

  let timer = null;
  let paused = false;

  const start = () => {
    if (!enabledAutoplay) return;
    stop();
    timer = window.setInterval(() => {
      if (!paused) next();
    }, autoplayMs);
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };

  root.addEventListener("mouseenter", () => (paused = true));
  root.addEventListener("mouseleave", () => (paused = false));
  root.addEventListener("focusin", () => (paused = true));
  root.addEventListener("focusout", () => (paused = false));

  let userHold = null;
  const pauseOnUser = () => {
    paused = true;
    if (userHold) window.clearTimeout(userHold);
    userHold = window.setTimeout(() => (paused = false), 2000);
  };
  track.addEventListener("pointerdown", pauseOnUser, { passive: true });
  track.addEventListener("touchstart", pauseOnUser, { passive: true });
  track.addEventListener("wheel", pauseOnUser, { passive: true });

  let armT = null;
  let armDebounceT = null;

  const clearArmed = () => {
    slidesAll().forEach((el) => el.classList.remove("is-armed"));
  };

  const armCenteredCta = () => {
    window.clearTimeout(armT);
    clearArmed();

    const slides = slidesAll();
    if (!slides.length) return;

    const centered = slides[getCenteredIndex()];
    if (!centered || centered.dataset.freePattern !== "1") return;

    armT = window.setTimeout(() => {
      const nowSlides = slidesAll();
      const now = nowSlides[getCenteredIndex()];
      if (now === centered && centered.dataset.freePattern === "1") {
        centered.classList.add("is-armed");
      }
    }, 1000);
  };

  const scheduleArmCenteredCta = () => {
    window.clearTimeout(armDebounceT);
    window.clearTimeout(armT);
    clearArmed();
    armDebounceT = window.setTimeout(armCenteredCta, 160);
  };

  track.addEventListener("scroll", scheduleArmCenteredCta, { passive: true });

  initLoop();
  start();
  window.setTimeout(armCenteredCta, 900);
}

/* ============================================================
   Featured carousel render + "Wolny wzór!" badge + CTA button
   ============================================================ */
async function renderFeatured() {
  const carouselTrack = qs("#featuredTrack");
  if (!carouselTrack) return;

  try {
    const { data, url } = await fetchJSON(DATA_URL);

    const items = Array.isArray(data.items) ? data.items : [];
    const byId = new Map(items.map((x) => [x.id, x]));

    const groups = Array.isArray(data.groups) ? data.groups : [];
    const freeGroup = groups.find(
      (g) =>
        String(g?.name || "")
          .trim()
          .toLowerCase() === "wolne wzory",
    );
    const freeIdsRaw = freeGroup && (freeGroup.items || freeGroup.ids);
    const freeIds = Array.isArray(freeIdsRaw) ? freeIdsRaw : [];
    const freeSet = new Set(freeIds);

    const seen = new Set();
    const featuredIds = [];

    const pushIfFeatured = (id) => {
      if (!id || seen.has(id)) return;
      const it = byId.get(id);
      if (!it || !it.featured) return;
      seen.add(id);
      featuredIds.push(id);
    };

    const order = Array.isArray(data.featuredOrder) ? data.featuredOrder : [];
    order.forEach(pushIfFeatured);
    items.forEach((it) => {
      if (it && it.featured) pushIfFeatured(it.id);
    });

    const featured = featuredIds
      .slice(0, 12)
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (featured.length === 0) {
      carouselTrack.innerHTML = "";
      carouselTrack.append(
        "Brak prac do wyświetlenia — dodaj je w data/portfolio.json.",
      );
      return;
    }

    carouselTrack.innerHTML = "";

    for (const item of featured) {
      const src = new URL(item.src, url).toString();

      const img = document.createElement("img");
      img.src = src;
      img.alt = item.alt || "Tatuaż – praca Lexie";
      img.loading = "eager";
      img.decoding = "async";
      img.draggable = false;

      const fig = document.createElement("figure");
      fig.className = "slide";
      fig.dataset.slide = "1";

      if (freeSet.has(item.id)) {
        fig.dataset.freePattern = "1";
        fig.dataset.imageSrc = src;
        fig.dataset.imageAlt = img.alt;

        const badge = document.createElement("div");
        badge.className = "slide__badge";
        badge.textContent = "Wolny wzór!";
        fig.append(badge);

        const ctaWrap = document.createElement("div");
        ctaWrap.className = "slide__ctaWrap";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slide__ctaBtn btn btn--primary";
        btn.textContent = "Chcę ten wzór!";

        ctaWrap.append(btn);
        fig.append(ctaWrap);
      }

      fig.append(img);
      carouselTrack.append(fig);
    }
  } catch (err) {
    console.error(err);
    carouselTrack.innerHTML = "";
    carouselTrack.append(
      "Nie udało się wczytać galerii (sprawdź ścieżki i JSON).",
    );
  }
}

/* ============================================================
   Reviews carousel
   ============================================================ */
async function renderReviews() {
  const track = qs("#reviewsTrack");
  if (!track) return;

  try {
    const { data } = await fetchJSON(REVIEWS_URL);
    const items = Array.isArray(data.items) ? data.items : [];
    const featured = items.filter((item) => item && item.featured !== false);

    if (!featured.length) {
      track.innerHTML =
        '<p class="reviews__empty">Opinie pojawią się wkrótce.</p>';
      return;
    }

    track.innerHTML = featured
      .map((item) => {
        const name = escapeHTML(item.name || "Anonimowa opinia");
        const year = item.year
          ? `<span class="review-card__year">${escapeHTML(item.year)}</span>`
          : "";
        const content = escapeHTML(normalizeReviewText(item.content)).replace(
          /\n/g,
          "<br>",
        );
        const rating = Number(item.star) || 5;

        return `
          <article class="slide review-card" data-slide="1" aria-label="Opinia klientki lub klienta od ${name}">
            <div class="review-card__top">
              <div class="review-card__identity">
                <h3 class="review-card__name">${name}</h3>
              </div>
              <div class="review-card__stars" aria-label="Ocena ${rating} na 5">
                ${renderStars(rating)}
              </div>
            </div>
            <p class="review-card__text">${content}</p>
          </article>`;
      })
      .join("");
  } catch (error) {
    console.error(error);
    track.innerHTML =
      '<p class="reviews__empty">Nie udało się wczytać opinii.</p>';
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  initSite();

  await Promise.all([renderFeatured(), renderReviews()]);
  qsa("[data-carousel]").forEach(setupCarousel);

  await setupContactForm();
});

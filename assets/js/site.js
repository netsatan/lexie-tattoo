import { qs, qsa } from "./util.js";
import { GFORM_ACTION } from "./config.js";

// -----------------------------
// Navbar (mobile hamburger)
// -----------------------------

function syncHeaderHeightVar() {
  const header = qs(".site-header");
  if (!header) return;

  // Round up to avoid 1px cut-offs due to subpixel rounding.
  const h = Math.ceil(header.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--header-h", `${h}px`);
}

export function setupNavbar() {
  const nav = qs(".nav[data-nav]");
  if (!nav) return;

  const toggle = qs(".nav__toggle", nav);
  const links = qs(".nav__links", nav);

  // If a page has the old nav without a toggle, do nothing.
  if (!toggle || !links) {
    syncHeaderHeightVar();
    return;
  }

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  const toggleMenu = (e) => {
    e?.preventDefault?.();
    const isOpen = nav.classList.contains("is-open");
    if (isOpen) close();
    else open();
  };

  toggle.addEventListener("click", toggleMenu);

  // Close when clicking outside.
  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(e.target)) return;
    close();
  });

  // Close on ESC.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!nav.classList.contains("is-open")) return;
    close();
  });

  // Close after choosing a link.
  qsa("a", links).forEach((a) => a.addEventListener("click", close));

  // Keep CSS var in sync (used for scroll padding + hero height).
  syncHeaderHeightVar();
  window.addEventListener("resize", syncHeaderHeightVar);
}

// -----------------------------
// Small utilities
// -----------------------------

export function setYear() {
  qsa("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

export function preventWidows(root = document) {
  const nodes = root.querySelectorAll(
    "p, h1, h2, h3, h4, li, .hero__kicker, .muted",
  );
  nodes.forEach((el) => {
    const txt = el.textContent || "";
    // Replace the last regular space with a non‑breaking space.
    el.textContent = txt.replace(/\s+(\S+)\s*$/, "\u00A0$1");
  });
}

export function setupScrollReveal() {
  const els = qsa(".reveal");
  if (!els.length) return;

  const check = () => {
    const vh = window.innerHeight || 0;
    els.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh - 80) el.classList.add("is-visible");
    });
  };

  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check);
  check();
}

export function initSite() {
  setupNavbar();
  setYear();
  preventWidows();
  setupScrollReveal();
}

// -----------------------------
// Form validation (shared)
// -----------------------------

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿĄąĆćĘęŁłŃńÓóŚśŹźŻż'\-\s]{2,60}$/;
const PHONE_RE = /^\+?[0-9\s\-]{7,20}$/;

function normalizeSpaces(v) {
  return String(v || "")
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

function safeReportValidity(el) {
  try {
    el.reportValidity();
  } catch {
    // ignore
  }
}

function setFieldError(el, msg) {
  el.setCustomValidity(msg);
  safeReportValidity(el);
}

function clearFieldError(el) {
  el.setCustomValidity("");
}

function validateName(el) {
  const v = normalizeSpaces(el.value);
  if (!v) return (setFieldError(el, "Podaj imię i nazwisko."), false);
  if (!NAME_RE.test(v))
    return (
      setFieldError(el, "Podaj poprawne imię i nazwisko (2–60 znaków)."),
      false
    );
  clearFieldError(el);
  return true;
}

function validatePhone(el) {
  const v = normalizeSpaces(el.value);
  if (!v) return (setFieldError(el, "Podaj numer telefonu."), false);
  if (!PHONE_RE.test(v))
    return (setFieldError(el, "Podaj poprawny numer telefonu."), false);
  clearFieldError(el);
  return true;
}

function validateMessage(el) {
  const v = String(el.value || "").trim();
  if (!v) return (setFieldError(el, "Napisz kilka słów o tatuażu."), false);
  if (v.length < 10)
    return (
      setFieldError(el, "Wiadomość jest zbyt krótka (min. 10 znaków)."),
      false
    );
  clearFieldError(el);
  return true;
}

function bindLiveValidation({ nameEl, phoneEl, msgEl }) {
  nameEl?.addEventListener("input", () => clearFieldError(nameEl));
  phoneEl?.addEventListener("input", () => clearFieldError(phoneEl));
  msgEl?.addEventListener("input", () => clearFieldError(msgEl));
}

function validateAll({ nameEl, phoneEl, msgEl }) {
  const okName = validateName(nameEl);
  const okPhone = validatePhone(phoneEl);
  const okMsg = validateMessage(msgEl);
  return okName && okPhone && okMsg;
}

// -----------------------------
// Uploadcare collector (optional)
// -----------------------------

let uploadcareInitPromise = null;

async function ensureUploadcareComponents() {
  if (uploadcareInitPromise) return uploadcareInitPromise;

  uploadcareInitPromise = (async () => {
    // Only load if there is at least one Uploadcare custom element on the page.
    const hasUc =
      !!qs("uc-upload-ctx-provider") || !!qs("uc-file-uploader-minimal");
    if (!hasUc) return;

    const UC =
      await import("https://cdn.jsdelivr.net/npm/@uploadcare/file-uploader@v1/web/file-uploader.min.js");
    UC.defineComponents(UC);

    // Wait until main element is registered.
    await customElements.whenDefined("uc-upload-ctx-provider");
  })().catch((err) => {
    console.warn("Uploadcare failed to load:", err);
  });

  return uploadcareInitPromise;
}

function createUploadcareCollector(ctxEl) {
  const urlById = new Map();
  let urls = [];

  const toUrl = (entry) => {
    if (!entry || typeof entry !== "object") return "";

    // Newer payloads.
    if (entry.cdnUrl) return String(entry.cdnUrl);
    if (entry.url) return String(entry.url);
    if (entry.fileUrl) return String(entry.fileUrl);

    // Uploadcare often provides a UUID.
    if (entry.uuid) return `https://ucarecdn.com/${entry.uuid}/`;

    // Some events provide a group UUID.
    if (entry.cdnUrlModifiers) return String(entry.cdnUrlModifiers);

    return "";
  };

  const snapshot = () => {
    urls = Array.from(urlById.values()).filter(Boolean);
  };

  ctxEl.addEventListener("file-upload-success", (e) => {
    const d = e?.detail || {};
    const id = d.uuid || d.fileId || d.id || Math.random().toString(36);
    urlById.set(id, toUrl(d));
    snapshot();
  });

  ctxEl.addEventListener("file-upload-remove", (e) => {
    const d = e?.detail || {};
    const id = d.uuid || d.fileId || d.id;
    if (id) urlById.delete(id);
    snapshot();
  });

  // Some versions emit a consolidated change event.
  ctxEl.addEventListener("change", (e) => {
    const d = e?.detail || {};

    // If we get a full list, rebuild the map.
    const files = d.files || d.allEntries || d.entries;
    if (Array.isArray(files)) {
      urlById.clear();
      files.forEach((f) => {
        const id = f?.uuid || f?.fileId || f?.id || Math.random().toString(36);
        const url = toUrl(f);
        if (url) urlById.set(id, url);
      });
      snapshot();
    }
  });

  snapshot();

  return {
    sync: snapshot,
    getUrls: () => urls.slice(),
  };
}

// -----------------------------
// Hidden message field helper
// -----------------------------

function setHiddenMessageField(form, visibleTextarea, hiddenMessage) {
  // Create a hidden textarea that carries the original Google Forms field name.
  const hidden = document.createElement("textarea");
  hidden.style.display = "none";

  const originalName = visibleTextarea.getAttribute("name");
  if (originalName) {
    hidden.name = originalName;
    // Remove name from visible field so it won't be submitted.
    visibleTextarea.removeAttribute("name");
  }

  hidden.value = hiddenMessage;
  form.appendChild(hidden);

  // Return cleanup function.
  return () => {
    hidden.remove();
    if (originalName) visibleTextarea.setAttribute("name", originalName);
  };
}

// -----------------------------
// Main contact form (home)
// -----------------------------

export async function setupContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  form.setAttribute("action", GFORM_ACTION);

  const nameEl = qs("#name", form);
  const phoneEl = qs("#mobile", form);
  const msgEl = qs("#msg", form);
  const statusEl = qs(".form__status", form);
  const iframe = qs("#gformIframe");
  const uploadUrlsEl = qs("#uploadUrls", form);

  if (!nameEl || !phoneEl || !msgEl) return;

  // Ensure Uploadcare components are defined (only if present).
  const ctxEl = qs("#lexieUploadCtx");
  if (ctxEl) await ensureUploadcareComponents();

  const collector = ctxEl ? createUploadcareCollector(ctxEl) : null;

  bindLiveValidation({ nameEl, phoneEl, msgEl });

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text;
  };

  // Iframe-based success detection (Google Forms redirects into iframe).
  if (iframe && statusEl) {
    iframe.addEventListener("load", () => {
      if (!/Wysyłanie/i.test(statusEl.textContent || "")) return;
      setStatus("Dziękuję! Odezwę się wkrótce 💌");
      form.reset();
      collector?.sync();
    });
  }

  form.addEventListener("submit", (e) => {
    setStatus("");

    const ok = validateAll({ nameEl, phoneEl, msgEl });
    if (!ok) {
      e.preventDefault();
      return;
    }

    setStatus("Wysyłanie…");

    collector?.sync();
    const urls = collector?.getUrls() || [];
    if (uploadUrlsEl) uploadUrlsEl.value = urls.join("\n");

    const trimmed = String(msgEl.value || "").trim();
    const hiddenMessage =
      urls.length > 0
        ? `${trimmed}\n\n---\nZdjęcia:${urls.map((u) => `\n${u}`).join("")}`
        : trimmed;

    const restore = setHiddenMessageField(form, msgEl, hiddenMessage);

    // Restore input name shortly after the submission is dispatched.
    window.setTimeout(restore, 1500);

    // Fallback success message in case iframe load doesn't fire.
    window.setTimeout(() => {
      if (/Wysyłanie/i.test(statusEl?.textContent || "")) {
        setStatus("Dziękuję! Odezwę się wkrótce 💌");
        form.reset();
        collector?.sync();
      }
    }, 1800);
  });
}

// -----------------------------
// Free pattern modal (shared)
// -----------------------------

let freePatternModalEl = null;
let freePatternCloseT = null;

function ensureFreePatternModal() {
  if (freePatternModalEl) return freePatternModalEl;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "freePatternModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-label="Chcę ten wzór">
      <button class="modal__close btn" type="button" aria-label="Zamknij" data-close>✕</button>

      <div class="modal__grid">
        <div class="modal__left">
          <form id="freePatternForm" class="form" novalidate>
            <div class="field">
              <label for="fp_name">Imię i nazwisko</label>
              <input id="fp_name" name="entry.2005620554" autocomplete="name" required />
            </div>

            <div class="field">
              <label for="fp_mobile">Telefon</label>
              <input id="fp_mobile" name="entry.1166974658" type="tel" inputmode="tel" autocomplete="tel" required />
            </div>

            <div class="field">
              <label for="fp_msg">Wiadomość</label>
              <textarea id="fp_msg" name="entry.839337160" rows="3" required></textarea>
            </div>

            <button class="btn btn--primary" type="submit">Wyślij</button>
            <p class="form__status" id="fp_status" role="status" aria-live="polite"></p>
          </form>
        </div>

        <div class="modal__right">
          <div class="modal__imgWrap">
            <img id="fp_img" class="modal__img" alt="" />
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  freePatternModalEl = modal;

  const close = () => closeFreePatternModal();

  qsa("[data-close]", modal).forEach((el) =>
    el.addEventListener("click", close),
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.getAttribute("aria-hidden") === "true") return;
    close();
  });

  setupFreePatternForm(modal);

  return modal;
}

function buildFreePatternPrefillVisible() {
  return `✧ Miejsce na ciele: \n✧ Rozmiar (cm): `;
}

function buildFreePatternMessageForSubmit(visibleText, imgUrl) {
  const raw = String(visibleText || "").trimEnd();
  const cleaned = raw
    .split(/\r?\n/)
    .filter((line) => !/^•\s*Wybrany\s+wzór\s*:/i.test(line))
    .join("\n")
    .trimEnd();

  const header = imgUrl ? `• Wybrany wzór: ${imgUrl}\n` : "";
  return (header + cleaned).trimEnd() + "\n";
}

function setupFreePatternForm(modal) {
  const form = qs("#freePatternForm", modal);
  if (!form) return;

  form.setAttribute("action", GFORM_ACTION);

  const nameEl = qs("#fp_name", form);
  const phoneEl = qs("#fp_mobile", form);
  const msgEl = qs("#fp_msg", form);
  const statusEl = qs("#fp_status", form);

  bindLiveValidation({ nameEl, phoneEl, msgEl });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (statusEl) statusEl.textContent = "";

    const ok = validateAll({ nameEl, phoneEl, msgEl });
    if (!ok) return;

    if (statusEl) statusEl.textContent = "Wysyłanie…";

    const imgUrl = String(
      modal.dataset.fpImgUrl || qs("#fp_img", modal)?.getAttribute("src") || "",
    );

    const hiddenMessage = buildFreePatternMessageForSubmit(
      msgEl?.value || "",
      imgUrl,
    );
    const restore = setHiddenMessageField(form, msgEl, hiddenMessage);

    try {
      await fetch(GFORM_ACTION, {
        method: "POST",
        mode: "no-cors",
        body: new FormData(form),
      });

      if (statusEl) statusEl.textContent = "Dziękuję! Odezwę się wkrótce 💌";
      form.reset();

      window.setTimeout(() => {
        closeFreePatternModal();
        if (statusEl) statusEl.textContent = "";
      }, 800);
    } catch (err) {
      console.warn("Free pattern submit failed:", err);
      if (statusEl)
        statusEl.textContent =
          "Ups — nie udało się wysłać. Spróbuj ponownie albo napisz na IG.";
    } finally {
      window.setTimeout(restore, 1500);
    }
  });
}

export function openFreePatternModal(imgUrl, altText = "") {
  const modal = ensureFreePatternModal();

  const img = qs("#fp_img", modal);
  const form = qs("#freePatternForm", modal);
  const msgEl = qs("#fp_msg", modal);
  const statusEl = qs("#fp_status", modal);
  const nameEl = qs("#fp_name", modal);

  if (img) {
    img.src = imgUrl;
    img.alt = altText || "Wolny wzór";
  }

  modal.dataset.fpImgUrl = imgUrl;

  if (statusEl) statusEl.textContent = "";
  form?.reset();

  if (msgEl) msgEl.value = buildFreePatternPrefillVisible();

  // Open
  if (freePatternCloseT) window.clearTimeout(freePatternCloseT);
  document.body.style.overflow = "hidden";
  modal.setAttribute("aria-hidden", "false");

  // Focus first input
  window.setTimeout(() => nameEl?.focus(), 0);
}

export function closeFreePatternModal() {
  const modal = freePatternModalEl;
  if (!modal) return;

  modal.setAttribute("aria-hidden", "true");

  // Wait for fade-out to finish before restoring scroll
  if (freePatternCloseT) window.clearTimeout(freePatternCloseT);
  freePatternCloseT = window.setTimeout(() => {
    if (modal.getAttribute("aria-hidden") === "true") {
      document.body.style.overflow = "";
    }
  }, 320);
}

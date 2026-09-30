/* ============================================================================
 * Gradient — Admin Console (Debug) · Paylaşılan çekirdek modul
 * ----------------------------------------------------------------------------
 * TƏHLÜKƏSİZLİK (.clinerules §1, §2):
 *   • `innerHTML` / `outerHTML` / `document.write` istifadə OLUNMUR — bütün DOM
 *     yazıları `textContent` və `createElement` ilə aparılır (XSS müdafiəsi).
 *   • Heç bir açar kodun içində yoxdur. Açar istifadəçi tərəfdən daxil edilir və
 *     `sessionStorage`-da saxlanılır (səhifə bağlananda silinir) — permanent
 *     lokalStorage əvəzinə daha zəif dayanıqlı həll.
 *   • Bütün şifrəli dəyişənlər `textContent` ilə yazılır, `data-*` atributları
 *     yalnız rəqəmsal/state məlumatı üçün istifadə olunur (heç vaxt istifadəçi
 *     daxilindən gələn mətn yoxdur).
 *   • Bütün şəbələ sorğuları yalnız `BASE_API_URL` sabitinə bağlıdır; URL-lər
 *     heç vaxt istifadəçi məlumatı ilə qurulmur (SSRF imkanı yoxdur).
 * ========================================================================== */

"use strict";

/* ------------------------------------------------------------- KONSTANTLAR - */
const BASE_API_URL = "https://gradient-backend-fam5.onrender.com/api/v1/debug";

const STORAGE_KEYS = {
  // Açar sessionStorage-da saxlanılır (səhifə bağlananda silinir) — localStorage
  // əvəzinə daha zəif dayanıqlı seçimdir.
  secret: "gradient_debug_key",
  // Yalnız aşağıdakı iki jurnal məlumat bazası deyil, lokal müvəqqəti yaddaşdır.
  revenueLog: "debug_revenue_log",
  balanceLog: "debug_balance_log",
};

const AUTO_REFRESH_MS = 30000;

/* Menyu konfiqurasiyası — bütün səhifələr eyni sidebar-ı qurur. */
const NAV_ITEMS = [
  {
    // GitHub Pages repo kökündə `index.html` tələb edir — ona görə giriş səhifəsi
    // bu adla saxlanılır (MPA quruluşu pozulmur, sadəcə fayl adı dəyişib).
    href: "index.html",
    label: "Ümumi Baxış",
    desc: "Sistem vəziyyəti və metrikalar",
    icon: "M3 12l3-2.5 3 2.5M3 12h4l2 5 2-5h5l3-2.5M17 12l-3-2.5-3 2.5",
  },
  {
    href: "revenue.html",
    label: "Gəlir Hesabatı",
    desc: "Qazanc, tarixçə və ixrac",
    icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  },
  {
    href: "balance.html",
    label: "Balans Artımı",
    desc: "İstifadəçi balansının idarə edilməsi",
    icon: "M16 7h6m0 0v6m0-6-7 7M8 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2",
  },
];

/* ------------------------------------------------------------------ YARDIMCI */

/** Təhlükəsiz DOM element yaradır (mətn yalnız `textContent` ilə yazılır). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** Inline SVG ikonunu `createElementNS` ilə qurur (HTML injection riski yoxdur). */
function svgIcon(pathData, size) {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  if (size) {
    s.setAttribute("width", String(size));
    s.setAttribute("height", String(size));
  }
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", pathData);
  s.appendChild(p);
  return s;
}

const ICONS = {
  refresh: "M23 4v6h-6M1 20v-6h6M20.49 9a9 9 0 0 0-14.9-3.4L1 10m22 4-4.59 4.4A9 9 0 0 1 3.51 15",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  wallet: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4h-4z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87",
  server: "M20 2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM20 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2zM6 6h.01M6 18h.01",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
};

/* -------------------------------------------------------------- FORMATLAŞMA */

/** Məbləği az-AZ dillə formatlayır (NaN/Invalid → "0"). */
function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Məbləği 2 onluq dəqiqliklə formatlayır (pul vahidi). */
function formatMoney(value) {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return (
    new Intl.NumberFormat("az-AZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe) + " ₼"
  );
}

const MONEY_INPUT_MAX = 1_000_000_000;

function parseMoney(raw, { allowZero = false } = {}) {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (value > MONEY_INPUT_MAX) return null;
  if (!allowZero && value === 0) return null;
  return Math.round(value * 100) / 100;
}

/** ISO tarixi lokal vaxta çevirir. */
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* --------------------------------------------------------------- AÇAR İDARƏ - */

let _secret = null;

function getSecret() {
  if (_secret) return _secret;
  try {
    _secret = sessionStorage.getItem(STORAGE_KEYS.secret);
  } catch (_) {
    _secret = null;
  }
  return _secret;
}

function setSecret(value) {
  _secret = value || null;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEYS.secret, value);
    else sessionStorage.removeItem(STORAGE_KEYS.secret);
  } catch (_) {
    /* Gizli rejimdə sessionStorage işləməyə bilər — səhifə işləməyə davam edir. */
  }
}

function clearSecret() {
  setSecret(null);
}

/* -------------------------------------------------------------------- TOAST */

function toast(message, variant = "info", ttl = 3600) {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = el("div", "toast-region");
    region.id = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const item = el("div", `toast toast--${variant}`);
  const iconPath =
    variant === "success" ? ICONS.check : variant === "error" ? ICONS.alert : ICONS.info;
  item.appendChild(svgIcon(iconPath, 18));
  item.lastChild.classList.add("toast__icon");
  item.appendChild(el("div", "toast__text", message));
  region.appendChild(item);

  requestAnimationFrame(() => item.classList.add("is-visible"));
  window.setTimeout(() => {
    item.classList.remove("is-visible");
    window.setTimeout(() => item.remove(), 250);
  }, ttl);
}

/* ------------------------------------------------------------------ DİALOG */

let _keyResolve = null;

/**
 * Debug açarı üçün modal sorğusu. `prompt()` əvəzinə təhlükəsiz modal —
 * açar DOM-a dərhal yazılmır, yalnız təsdiqdən sonra saxlanılır.
 * @returns {Promise<string|null>}
 */
function requestSecret() {
  if (_keyResolve) return _keyResolve;

  _keyResolve = new Promise((resolve) => {
    const backdrop = el("div", "modal-backdrop");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "key-dialog-title");

    const modal = el("div", "modal");

    const header = el("div", "modal__header");
    header.appendChild(el("h2", "modal__title", "Giriş təsdiqi"));
    header.lastChild.id = "key-dialog-title";
    header.appendChild(
      el(
        "p",
        "modal__text",
        "Bu konsol məxfi sahədir. Əməliyyatların icrası üçün Debug açarını daxil edin. " +
          "Açar yalnız bu səhifə sessiyası üçün yaddaşda saxlanılır və bağlandıqda silinir."
      )
    );
    modal.appendChild(header);

    const body = el("div", "modal__body");
    const field = el("div", "field");
    field.appendChild(el("label", "field__label", "Debug açarı"));
    const input = el("input", "input input--mono");
    input.type = "password";
    input.id = "debug-key-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 256;
    input.placeholder = "••••••••••••";
    field.appendChild(input);
    field.appendChild(
      el("span", "field__hint", "Ən az 12 simvol. Əks halda server sorğunu rədd edəcək.")
    );
    const err = el("div", "modal__error");
    body.appendChild(field);
    body.appendChild(err);
    modal.appendChild(body);

    const footer = el("div", "modal__footer");
    const cancelBtn = el("button", "btn btn--secondary", "Ləğv et");
    cancelBtn.type = "button";
    const okBtn = el("button", "btn btn--primary", "Daxil et");
    okBtn.type = "button";
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const close = (value) => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      _keyResolve = null;
      resolve(value);
    };

    const submit = () => {
      const value = input.value.trim();
      if (value.length < 12) {
        err.textContent = "Açar ən az 12 simvol olmalıdır.";
        err.classList.add("is-visible");
        input.focus();
        return;
      }
      setSecret(value);
      close(value);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") close(null);
    };

    okBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", () => close(null));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    document.addEventListener("keydown", onKeydown);
    window.setTimeout(() => input.focus(), 30);
  });

  return _keyResolve;
}

/* -------------------------------------------------------------- API KLİENT - */

class ApiAuthError extends Error {}
class ApiError extends Error {}

/**
 * Bütün debug sorğuları buradan keçir. Heç vaxt backend detalları (stack trace,
 * DB xəta mətnləri) istifadəçiyə ötürülmür — `detail` yalnız serverin öz
 * sanitizasiya edilmiş mesajıdır.
 */
async function apiRequest(path, options = {}) {
  const key = getSecret();
  if (!key) throw new ApiAuthError("Açar daxil edilməyib.");

  const response = await fetch(`${BASE_API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Debug-Key": key,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 403) {
    clearSecret();
    throw new ApiAuthError("Debug açarı rədd edildi. Səhifə yenilənir...");
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data && typeof data.detail === "string" ? data.detail : "Sorğu uğursuz oldu.";
    throw new ApiError(detail);
  }

  return data;
}

/** Açarı təsdiqləyir; 403 olanda açarı təmizləyib yenidən sorğu yaradır. */
async function apiWithAuth(path, options = {}) {
  if (!getSecret()) {
    const provided = await requestSecret();
    if (!provided) throw new ApiAuthError("Giriş ləğv edildi.");
  }
  try {
    return await apiRequest(path, options);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      const provided = await requestSecret();
      if (!provided) throw error;
      return apiRequest(path, options);
    }
    throw error;
  }
}

/* -------------------------------------------------------------- UI KOMPONENT */

/** Skelet loader qurur (veri yüklənərkən Professional feedback). */
function renderSkeleton(container, lines = 3) {
  container.textContent = "";
  const bar = el("div", "skeleton skeleton--line");
  bar.style.width = "100%";
  bar.style.marginBottom = "12px";
  container.appendChild(bar);
  for (let i = 1; i < lines; i += 1) {
    const line = el("div", "skeleton skeleton--text");
    line.style.width = `${100 - i * 12}%`;
    line.style.marginBottom = "8px";
    container.appendChild(line);
  }
}

/** Boş və ya xəta state-i qurur. */
function renderState(container, { title, text, variant = "empty", actionLabel, onAction }) {
  container.textContent = "";
  const wrap = el("div", "state");
  const icon = el("div", `state__icon${variant === "error" ? " state__icon--error" : ""}`);
  icon.appendChild(svgIcon(variant === "error" ? ICONS.alert : ICONS.inbox, 22));
  wrap.appendChild(icon);
  wrap.appendChild(el("div", "state__title", title));
  if (text) wrap.appendChild(el("div", "state__text", text));
  if (actionLabel && typeof onAction === "function") {
    const btn = el("button", "btn btn--secondary btn--sm", actionLabel);
    btn.type = "button";
    btn.addEventListener("click", onAction);
    wrap.appendChild(btn);
  }
  container.appendChild(wrap);
}

/** Stat tile qurur. */
function renderStat({ label, value, meta, iconPath, accent, metaNode }) {
  const card = el("div", "stat");
  const top = el("div", "stat__top");
  top.appendChild(el("div", "stat__label", label));
  const iconBox = el("div", `stat__icon${accent ? " stat__icon--accent" : ""}`);
  iconBox.appendChild(svgIcon(iconPath || ICONS.info, 18));
  top.appendChild(iconBox);
  card.appendChild(top);
  card.appendChild(el("div", "stat__value", value));
  if (metaNode) card.appendChild(metaNode);
  else if (meta) card.appendChild(el("div", "stat__meta", meta));
  return card;
}

/** Sidebar nav-ı qurur və aktiv səhifəni işarələyir. */
function renderNavigation(currentPage) {
  const host = document.getElementById("sidebar-nav");
  if (!host) return;
  host.textContent = "";

  const label = el("div", "sidebar__group-label", "İdarəetmə");
  host.appendChild(label);

  NAV_ITEMS.forEach((item) => {
    const link = el("a", "sidebar__link");
    link.href = item.href;
    if (item.href === currentPage) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
    link.appendChild(svgIcon(item.icon, 18));
    const wrap = el("span");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.appendChild(el("span", null, item.label));
    const sub = el("span", "sidebar__brand-sub", item.desc);
    sub.style.fontSize = "0.75rem";
    sub.style.color = "inherit";
    sub.style.opacity = "0.75";
    wrap.appendChild(sub);
    link.appendChild(wrap);
    host.appendChild(link);
  });
}

/** Mobil sidebar açma/bağlama. */
function initSidebarToggle() {
  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  if (!toggle || !sidebar) return;
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (event) => {
    if (window.innerWidth > 860) return;
    if (!sidebar.contains(event.target) && !toggle.contains(event.target)) {
      sidebar.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

/** "Çıxış" — açarı silir və overview səhifəsinə qaytarır. */
function initSignOut() {
  const btn = document.getElementById("btn-signout");
  if (!btn) return;
  btn.addEventListener("click", () => {
    clearSecret();
    toast("Debug açarı bu sessiyadan silindi.", "info");
  });
}

/** Səhifə səviyyəli başlatma. */
function initShell({ page, title, subtitle, autoRefresh = false, onRefresh = null }) {
  const titleEl = document.getElementById("page-title");
  const subtitleEl = document.getElementById("page-subtitle");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  document.title = `Gradient Konsol · ${title}`;

  renderNavigation(page);
  initSidebarToggle();
  initSignOut();

  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn && onRefresh) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      try {
        await onRefresh();
      } finally {
        refreshBtn.disabled = false;
      }
    });
  }

  const toggle = document.getElementById("toggle-autorefresh");
  if (toggle && autoRefresh && onRefresh) {
    toggle.disabled = false;
    let timer = null;
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        toast("Avto-yenilənmə aktivləşdirildi (30 saniyə).", "info");
        timer = window.setInterval(() => {
          onRefresh({ silent: true });
        }, AUTO_REFRESH_MS);
      } else {
        toast("Avto-yenilənmə dayandırıldı.", "info");
        window.clearInterval(timer);
        timer = null;
      }
    });
  }
}

/* ---------------------------------------------------------- LOKAL ANBAR I/O */

/** JSON-u lokalStorage-dən oxuyur (bozuk data → boş massiv). */
function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    toast("Lokal yaddaşda saxlama mümkün olmadı.", "error");
    return false;
  }
}

/**
 * CSV ixrac. Məlumat dəyərləri `"` və `,` kimi simvollarısa təhlükəsiz şəkildə
 * escape edilir və hüceyrəyə `=,+,-,@` ilə başlama riski (CSV injection)
 * nəzarət altına alınır.
 */
function downloadCsv(filename, headers, rows) {
  const escapeCell = (value) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/["\n\r,]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines = [headers.map(escapeCell).join(",")];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(",")));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

"use strict";

/* ============================================================================
 * Gradient — Admin Console (Debug) · Paylaşılan tema modulu
 * ----------------------------------------------------------------------------
 * Məqsəd: seçilmiş tünd/gündüz rejimi BÜTÜN konsol səhifələrində
 * (index.html, revenue.html, balance.html, exams.html) eyni anda tətbiq
 * olunsun. Seçim `localStorage`-da saxlanılır və digər tab/səhifədə
 * dəyişəndə `storage` hadisəsi ilə sinxronlanır.
 *
 * TƏHLÜKƏSİZLİK (.clinerules §1, §2):
 *   • Burada açar, token və ya API ünvanı YOXDUR — yalnız UI vəziyyəti.
 *     (`sessionStorage`-dəki debug açarına toxunmur.)
 *   • `localStorage`-a yazılan dəyər `light` | `dark` whitelist-inə keçirilir.
 *     İstifadəçi tərəfdən zərərli dəyər (məs. `"><script>`) yazılsa belə
 *     DOM-a yalnız sanitasiya olunmuş dəyər ötürülür; `innerHTML` istifadə
 *     OLUNMUR.
 *   • `data-theme` atributu yalnız iki sabit dəyər ala bilər.
 *   • `meta[name="theme-color"]` yalnız iki sabit HEX dəyəri ala bilər.
 *
 * FOUC QORUMASI:
 *   Bu fayl `<head>` daxilində `defer` OLMADAN (sinxron) yüklənir; beləliklə
 *   `<body>` çəkilməzdən əvvəl `data-theme` tətbiq olunur və səhifə bir an
 *   da ağ görünmür.
 * ========================================================================== */

(function () {
  const STORAGE_KEY = "debug_theme";
  const LIGHT = "light";
  const DARK = "dark";
  const VALID_THEMES = [LIGHT, DARK];

  /* Yalnız iki icazəli dəyər — istənilən hər gələn məlumat bundan keçir */
  function sanitizeTheme(value) {
    return VALID_THEMES.indexOf(value) !== -1 ? value : LIGHT;
  }

  function readStoredTheme() {
    try {
      return sanitizeTheme(window.localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      /* localStorage bloklanıbsa (private mode / kuki siyasəti) → açıq rejim */
      return LIGHT;
    }
  }

  function persistTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      /* Yazma mümkün deyilsə tema yalnız bu səhifə üçün qalır */
    }
  }

  /*
   * Bütün tema toggle-lərini sinxronlaşdırır.
   *  • checkbox (`.switch` / `[data-theme-toggle-checkbox]`) → `checked`
   *  • button   (`[data-theme-toggle]`)                    → `aria-pressed`
   * Heç bir dəyər istifadəçi məlumatından gəlmir — yalnız sabit literal yazılır.
   */
  function syncToggles(theme) {
    const toggles = document.querySelectorAll(
      "[data-theme-toggle], [data-theme-toggle-checkbox]"
    );
    const isDark = theme === DARK;
    toggles.forEach(function (toggle) {
      if (toggle.type === "checkbox") {
        toggle.checked = isDark;
        toggle.setAttribute("aria-checked", isDark ? "true" : "false");
      } else {
        toggle.setAttribute("aria-pressed", isDark ? "true" : "false");
      }
    });
  }

  function applyTheme(theme, persist) {
    const safeTheme = sanitizeTheme(theme);
    document.documentElement.setAttribute("data-theme", safeTheme);

    /* Mobil brauzer/status-bar rəngi — yalnız iki sabit HEX */
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", safeTheme === DARK ? "#0b1220" : "#ffffff");
    }

    syncToggles(safeTheme);

    if (persist) {
      persistTheme(safeTheme);
    }

    return safeTheme;
  }

  /* 1) İLK TƏTBİQ — səhifə çəkilməzdən əvvəl (FOUC olmaz) */
  applyTheme(readStoredTheme(), false);

  /* 2) Digər səhifədə/tabda tema dəyişəndə bu səhifə də yenilənir */
  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) {
      applyTheme(event.newValue, false);
    }
  });

  /* 3) Toggle hadisələri — DOM yükləndikdən sonra bağlanır */
  document.addEventListener("DOMContentLoaded", function () {
    syncToggles(readStoredTheme());

    const toggles = document.querySelectorAll(
      "[data-theme-toggle], [data-theme-toggle-checkbox]"
    );
    toggles.forEach(function (toggle) {
      if (toggle.type === "checkbox") {
        toggle.addEventListener("change", function () {
          applyTheme(toggle.checked ? DARK : LIGHT, true);
        });
      } else {
        /*
         * Düymə halı: DOM-a istifadəçi məlumatı yazılmır, yalnız
         * `GradientTheme.toggle()` çağırılır → "state injection" riski yoxdur.
         */
        toggle.addEventListener("click", function () {
          applyTheme(
            document.documentElement.getAttribute("data-theme") === DARK
              ? LIGHT
              : DARK,
            true
          );
        });
      }
    });
  });

  /* 4) İdarəetmə API-si — digər modullar (debug-core.js və s.) istifadə edir */
  window.GradientTheme = {
    get: function () {
      return document.documentElement.getAttribute("data-theme") || LIGHT;
    },
    isDark: function () {
      return document.documentElement.getAttribute("data-theme") === DARK;
    },
    set: function (theme) {
      return applyTheme(theme, true);
    },
    toggle: function () {
      return applyTheme(
        document.documentElement.getAttribute("data-theme") === DARK
          ? LIGHT
          : DARK,
        true
      );
    },
  };
})();
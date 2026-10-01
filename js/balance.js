/* ============================================================================
 * Gradient — Admin Console · Balans Artımı səhifəsi
 * ----------------------------------------------------------------------------
 * TƏHLÜKƏSİZLİK:
 *   • Balans dəyişikliği YALNIZ backend API vasitəsilə edilir — frontend heç vaxt
 *     məlumat bazasına birbaşa yazmır (.clinerules §1 Supabase izolasiyası).
 *   • Bütün DOM yazıları `textContent`/`createElement` ilə (XSS müdafiəsi).
 *   • İstifadəçi adı/e-poçt serverdən gəlir və yalnız mətn kimi göstərilir.
 *   • Dəyişiklikdən əvvəl delta hesablanıb istifadəçiyə göstərilir (nəzarət).
 *   • Eyni sorğunun təkrar göndərilməsinin qarşısı `isBusy` bayrağı ilə alınır.
 * ========================================================================== */

"use strict";

const IDENTIFIER_MAX = 120;
const MAX_JOURNAL = 50;

document.addEventListener("DOMContentLoaded", () => {
  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  const badge1 = document.getElementById("step-badge-1");
  const badge2 = document.getElementById("step-badge-2");

  const lookupForm = document.getElementById("lookup-form");
  const identifierInput = document.getElementById("user-identifier");
  const fieldIdentifier = document.getElementById("field-identifier");
  const btnLookup = document.getElementById("btn-lookup");

  const foundName = document.getElementById("found-name");
  const foundBalance = document.getElementById("found-balance");
  const foundIdentifier = document.getElementById("found-identifier");
  const foundRole = document.getElementById("found-role");
  const foundGrade = document.getElementById("found-grade");
  const foundSubject = document.getElementById("found-subject");
  const foundCreated = document.getElementById("found-created");
  const foundAvatar = document.getElementById("user-avatar");
  const foundTutorBox = document.getElementById("found-tutor-box");
  const foundTutor = document.getElementById("found-tutor");
  const foundStatsBox = document.getElementById("found-stats-box");
  const foundStats = document.getElementById("found-stats");

  const balanceForm = document.getElementById("balance-form");
  const balanceInput = document.getElementById("new-balance");
  const fieldBalance = document.getElementById("field-balance");
  const balanceDelta = document.getElementById("balance-delta");
  const btnUpdate = document.getElementById("btn-update-balance");
  const btnCancel = document.getElementById("btn-cancel-balance");
  const btnResetLookup = document.getElementById("btn-reset-lookup");

  const journalTable = document.getElementById("journal-table");
  const btnExport = document.getElementById("btn-export-balance");

  /** Cari axtarış nəticəsi — yalnız serverdən təsdiqlənmiş məlumat. */
  let currentUser = null;
  let isBusy = false;

  /* ------------------------------------------------------ VALIDATION ---- */

  /**
   * İstifadəçi identifikatorunu yoxlayır. Sərt allowlist regex — hərf/rəqəm,
   * `@`, `.`, `+`, `-`, `_`, boşluq. Maksimum uzunluq backendə göndərilməmişdən
   * əvvəl kəsilir (DoS/istismar məqsədli uzun sətirlərin qarşısı alınır).
   */
  function normalizeIdentifier(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;
    if (value.length > IDENTIFIER_MAX) return null;
    if (!/^[A-Za-z0-9@._+\-\s]+$/.test(value)) return null;
    return value;
  }

  function setFieldError(field, message) {
    const err = field.querySelector(".field__error");
    if (err && message) err.textContent = message;
    field.classList.add("has-error");
  }

  function clearFieldError(field) {
    field.classList.remove("has-error");
  }

  /* ---------------------------------------------------------- STEP UI --- */

  function setBadge(badge, state, label) {
    badge.className = `status status--${state}`;
    badge.textContent = "";
    badge.appendChild(el("span", "status__dot"));
    badge.appendChild(el("span", null, label));
  }

  function showStep(step) {
    step1.classList.toggle("hidden", step !== 1);
    step2.classList.toggle("hidden", step !== 2);
    if (step === 1) {
      setBadge(badge1, "ok", "1. İstifadəçi");
      setBadge(badge2, "idle", "2. Balans");
    } else {
      setBadge(badge1, "ok", "1. İstifadəçi");
      setBadge(badge2, "ok", "2. Balans");
    }
  }

  function resetFlow({ keepJournal = true } = {}) {
    currentUser = null;
    identifierInput.value = "";
    balanceInput.value = "";
    clearFieldError(fieldIdentifier);
    clearFieldError(fieldBalance);
    balanceDelta.textContent = "—";
    balanceDelta.className = "amount-preview__delta";
    foundName.textContent = "—";
    foundBalance.textContent = "—";
    foundIdentifier.textContent = "—";
    foundAvatar.textContent = "?";
    foundRole.textContent = "Rol yoxdur";
    foundGrade.textContent = "—";
    foundSubject.textContent = "—";
    foundCreated.textContent = "—";
    foundTutorBox.classList.add("hidden");
    foundStatsBox.classList.add("hidden");
    showStep(1);
    if (!keepJournal) renderJournal();
  }

  /* ---------------------------------------------------- PROFILE RENDERER -- */

  const ROLE_LABELS = {
    student: "Şagird",
    tutor: "Repetitor",
    admin: "Admin",
  };

  /** Ad Soyaddan avatar təxmini (serverdən gələn mətn, heç vaxt HTML yoxdur). */
  function initialsOf(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (parts.length === 0) return "?";
    return parts.map((p) => p.charAt(0)).join("");
  }

  function renderProfile(data) {
    const name = `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Adsız istifadəçi";
    const balance = Number(data.balance);
    const safeBalance = Number.isFinite(balance) ? balance : 0;

    currentUser = {
      identifier: String(data.identifier || "").slice(0, 120),
      name,
      balance: Math.round(safeBalance * 100) / 100,
    };

    foundName.textContent = name;
    foundAvatar.textContent = initialsOf(name);
    foundBalance.textContent = formatMoney(safeBalance);
    foundIdentifier.textContent = currentUser.identifier;
    foundRole.textContent = ROLE_LABELS[data.role] || String(data.role || "Rol yoxdur");
    foundGrade.textContent = data.grade ? String(data.grade) : "Təyin edilməyib";
    foundSubject.textContent = data.subject ? String(data.subject) : "Təyin edilməyib";
    foundCreated.textContent = formatDate(data.created_at);

    // Bağlı repetitor
    if (data.tutor && typeof data.tutor === "object") {
      const tutorName = `${data.tutor.first_name || ""} ${data.tutor.last_name || ""}`.trim();
      foundTutor.textContent = "";
      if (tutorName) {
        foundTutor.appendChild(el("span", "table__strong", tutorName));
      } else {
        foundTutor.appendChild(el("span", "text-muted", "Repetitor məlumatı yoxdur"));
      }
      if (data.tutor.identifier) {
        foundTutor.appendChild(
          el("span", "text-mono text-muted", String(data.tutor.identifier).slice(0, 120))
        );
      }
      if (data.tutor.tutor_code) {
        foundTutor.appendChild(el("span", "tag", `Kod: ${String(data.tutor.tutor_code)}`));
      }
      foundTutorBox.classList.remove("hidden");
    } else {
      foundTutorBox.classList.add("hidden");
    }

    // KÖHNÜ BACKEND FALLBACK: server hələ yeni `check_user` formasını
    // qaytarmırsa yalnız ad/balans mövcuddur — panel heç vaxt "bozuk" görünmür,
    // sadəcə olmayan sahələr "məlumat yoxdur" olaraq göstərilir.
    if (!data || typeof data.first_name === "undefined") {
      return;
    }

    // Son nəticələr
    const results = Array.isArray(data.recent_results) ? data.recent_results : [];
    if (results.length > 0) {
      const list = el("div", "stack stack--sm");
      results.forEach((r) => {
        const total = Number(r.total_questions) || 0;
        const score = Number(r.score) || 0;
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        const item = el("div", "user-info-box");

        const left = el("div");
        left.appendChild(el("span", "table__strong", `${score} / ${total}`));
        left.appendChild(
          el("span", "text-muted", `  ·  ${formatDate(r.created_at)}`)
        );
        item.appendChild(left);

        item.appendChild(
          el("span", `tag ${pct >= 60 ? "tag--credit" : "tag--debit"}`, `${pct}%`)
        );
        list.appendChild(item);
      });

      const stats = data.stats || {};
      if (Number(stats.recent_attempts) > 0) {
        list.appendChild(
          el(
            "div",
            "text-muted",
            `Orta xal (${stats.recent_attempts} cəhd): ${formatNumber(stats.average_score)}`
          )
        );
      }

      foundStats.textContent = "";
      foundStats.appendChild(list);
      foundStatsBox.classList.remove("hidden");
    } else {
      foundStatsBox.classList.add("hidden");
    }

    balanceInput.value = "";
    balanceDelta.textContent = "—";
    balanceDelta.className = "amount-preview__delta";
  }

  /* ------------------------------------------------------ LIVE PREVIEW -- */

  balanceInput.addEventListener("input", () => {
    clearFieldError(fieldBalance);
    if (!currentUser) return;

    const parsed = parseMoney(balanceInput.value, { allowZero: true });
    if (parsed === null) {
      balanceDelta.textContent = "—";
      balanceDelta.className = "amount-preview__delta";
      return;
    }

    const diff = Math.round((parsed - currentUser.balance) * 100) / 100;
    balanceDelta.className = "amount-preview__delta";
    if (diff > 0) {
      balanceDelta.classList.add("is-up");
      balanceDelta.textContent = `+${formatMoney(diff)}`;
    } else if (diff < 0) {
      balanceDelta.classList.add("is-down");
      balanceDelta.textContent = `−${formatMoney(Math.abs(diff))}`;
    } else {
      balanceDelta.textContent = "dəyişiklik yoxdur";
    }
  });

  /* ---------------------------------------------------------- JOURNAL --- */

  function loadJournal() {
    const raw = readStore(STORAGE_KEYS.balanceLog, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        id: String(e.id || ""),
        identifier: String(e.identifier || "").slice(0, IDENTIFIER_MAX),
        name: String(e.name || "").slice(0, 160),
        oldBalance: Number(e.oldBalance) || 0,
        newBalance: Number(e.newBalance) || 0,
        createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
      }))
      .filter((e) => e.id)
      .slice(0, MAX_JOURNAL);
  }

  function pushJournal(entry) {
    const current = loadJournal();
    current.unshift(entry);
    writeStore(STORAGE_KEYS.balanceLog, current.slice(0, MAX_JOURNAL));
  }

  function renderJournal() {
    const entries = loadJournal();
    journalTable.textContent = "";

    if (entries.length === 0) {
      renderState(journalTable, {
        title: "Jurnal boşdur",
        text: "Bu brauzer hələ heç bir balans əməliyyatı icra etməyib. Yuxarıdakı addımlarla başlayın.",
      });
      return;
    }

    const table = el("table", "table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Tarix", "İstifadəçi", "Əvvəl", "Yeni", "Fərq"].forEach((label) => {
      headRow.appendChild(el("th", null, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    entries.forEach((entry) => {
      const row = el("tr");

      const dateCell = el("td", "table__muted");
      dateCell.appendChild(document.createTextNode(formatDate(entry.createdAt)));
      row.appendChild(dateCell);

      const userCell = el("td");
      const name = el("div", "table__strong", entry.name || "—");
      const ident = el("div", "table__muted text-mono", entry.identifier);
      userCell.appendChild(name);
      userCell.appendChild(ident);
      row.appendChild(userCell);

      const oldCell = el("td", "table__num", formatMoney(entry.oldBalance));
      row.appendChild(oldCell);

      const newCell = el("td", "table__num");
      newCell.appendChild(el("span", "table__strong", formatMoney(entry.newBalance)));
      row.appendChild(newCell);

      const diff = Math.round((entry.newBalance - entry.oldBalance) * 100) / 100;
      const diffCell = el("td", "table__num");
      const tag = el("span", `tag ${diff < 0 ? "tag--debit" : "tag--credit"}`);
      tag.textContent = `${diff >= 0 ? "+" : "−"}${formatMoney(Math.abs(diff))}`;
      diffCell.appendChild(tag);
      row.appendChild(diffCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    journalTable.appendChild(table);
  }

  btnExport.addEventListener("click", () => {
    const entries = loadJournal();
    if (entries.length === 0) {
      toast("İxrac etmək üçün əməliyyat yoxdur.", "warning");
      return;
    }
    downloadCsv(
      `gradient-balans-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Tarix", "Ad Soyad", "Identifikator", "Əvvəlki balans", "Yeni balans", "Fərq"],
      entries.map((e) => [
        formatDate(e.createdAt),
        e.name,
        e.identifier,
        e.oldBalance.toFixed(2),
        e.newBalance.toFixed(2),
        (e.newBalance - e.oldBalance).toFixed(2),
      ])
    );
    toast(`${entries.length} əməliyyat CSV faylına ixrac edildi.`, "success");
  });

  /* ------------------------------------------------------ MƏRHƏLƏ 1 --- */

  let lookupBusy = false;

  lookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (lookupBusy) return;
    clearFieldError(fieldIdentifier);

    const identifier = normalizeIdentifier(identifierInput.value);
    if (!identifier) {
      setFieldError(
        fieldIdentifier,
        identifierInput.value.trim() === ""
          ? "E-poçt və ya telefon nömrəsi daxil edin."
          : "E-poçt və ya telefon nömrəsi formatını yoxlayın."
      );
      identifierInput.focus();
      return;
    }

    lookupBusy = true;
    btnLookup.disabled = true;
    const originalLabel = btnLookup.lastChild;
    if (originalLabel) originalLabel.textContent = " Yoxlanılır…";

    try {
      const data = await apiWithAuth("/check-user", {
        method: "POST",
        body: { identifier },
      });

      // Bütun profil məlumatları (rol, sinf, repetitor, nəticələr) təhlükəsiz
      // şəkildə `textContent` ilə çəkilir.
      renderProfile(data);

      showStep(2);
      window.setTimeout(() => balanceInput.focus(), 40);
      toast("İstifadəçi tapıldı və doğrulandı.", "success");
    } catch (error) {
      if (error instanceof ApiAuthError) {
        resetFlow();
        return;
      }
      // Server 404/500 cavabları: yalnız sanitizasiya edilmiş `detail` göstərilir,
      // stack trace və DB detalları istifadəçiyə ötürülmür.
      toast(error.message || "İstifadəçi yoxlanıla bilmədi.", "error");
      fieldIdentifier.classList.remove("has-error");
    } finally {
      lookupBusy = false;
      btnLookup.disabled = false;
      if (originalLabel) originalLabel.textContent = " İstifadəçini yoxla";
    }
  });

  identifierInput.addEventListener("input", () => clearFieldError(fieldIdentifier));

  /* ------------------------------------------------------ MƏRHƏLƏ 2 --- */

  balanceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isBusy) return;
    clearFieldError(fieldBalance);

    if (!currentUser) {
      toast("Əvvəlcə istifadəçini yoxlayın.", "warning");
      showStep(1);
      return;
    }

    const newBalance = parseMoney(balanceInput.value, { allowZero: true });
    if (newBalance === null) {
      setFieldError(
        fieldBalance,
        "0.00 ilə 999999999.99 arasında düzgün məbləğ daxil edin."
      );
      balanceInput.focus();
      return;
    }

    const diff = Math.round((newBalance - currentUser.balance) * 100) / 100;
    if (diff === 0) {
      setFieldError(fieldBalance, "Dəyər dəyişmədi — yeni balans cari balansa bərabərdir.");
      return;
    }

    const isIncrease = diff > 0;
    const confirmed = window.confirm(
      `${currentUser.name} (${currentUser.identifier})\n\n` +
        `Cari balans: ${formatMoney(currentUser.balance)}\n` +
        `Yeni balans:  ${formatMoney(newBalance)}\n` +
        `Dəyişiklik:  ${isIncrease ? "+" : "−"}${formatMoney(Math.abs(diff))}\n\n` +
        "Dəyişiklik dərhal tətbiq olunacaq. Təsdiqləyirsiniz?"
    );
    if (!confirmed) return;

    isBusy = true;
    btnUpdate.disabled = true;
    const originalLabel = btnUpdate.lastChild;
    if (originalLabel) originalLabel.textContent = " Tətbiq olunur…";

    try {
      const result = await apiWithAuth("/update-balance", {
        method: "POST",
        body: { identifier: currentUser.identifier, new_balance: newBalance },
      });

      pushJournal({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        identifier: currentUser.identifier,
        name: currentUser.name,
        oldBalance: currentUser.balance,
        newBalance,
        createdAt: new Date().toISOString(),
      });

      toast(result.message || "Balans uğurla yeniləndi.", "success");
      resetFlow();
      renderJournal();
    } catch (error) {
      if (error instanceof ApiAuthError) {
        resetFlow();
        return;
      }
      toast(error.message || "Balans yenilənmədi.", "error");
    } finally {
      isBusy = false;
      btnUpdate.disabled = false;
      if (originalLabel) originalLabel.textContent = " Təsdiqlə və yenilə";
    }
  });

  btnCancel.addEventListener("click", () => {
    resetFlow();
    identifierInput.focus();
  });

  btnResetLookup.addEventListener("click", () => {
    resetFlow();
    identifierInput.focus();
  });

  /* --------------------------------------------------------- BOOTSTRAP -- */

  initShell({
    page: "balance.html",
    title: "Balans Artımı",
    subtitle: "İstifadəçi balansının idarə edilməsi",
  });

  showStep(1);
  renderJournal();
});

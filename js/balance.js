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
    showStep(1);
    if (!keepJournal) renderJournal();
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

      const firstName = String(data.first_name || "").slice(0, 80);
      const lastName = String(data.last_name || "").slice(0, 80);
      const balance = Number(data.balance);

      currentUser = {
        identifier,
        name: `${firstName} ${lastName}`.trim() || "Adsız istifadəçi",
        balance: Number.isFinite(balance) ? Math.round(balance * 100) / 100 : 0,
      };

      foundName.textContent = currentUser.name;
      foundBalance.textContent = formatMoney(currentUser.balance);
      foundIdentifier.textContent = currentUser.identifier;

      balanceInput.value = "";
      balanceDelta.textContent = "—";
      balanceDelta.className = "amount-preview__delta";

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

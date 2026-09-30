/* ============================================================================
 * Gradient — Admin Console · Gəlir Hesabatı səhifəsi
 * ----------------------------------------------------------------------------
 * TƏHLÜKƏSİZLİK:
 *   • Bütün DOM yazıları `textContent` / `createElement` ilə — innerHTML yoxdur.
 *   • Məbləğ və mənbə sətirləri yalnız `allowlist` (sabit siyahı) üzrə
 *     təsdiqlənir; istifadəçi mətni heç vaxt struktur yarada bilmir.
 *   • CSV ixracında formula injection-a qarşı hüceyrə sanitizasiyası
 *     `downloadCsv()` daxilindədir.
 *   • Məlumat yalnız localStorage-də saxlanılır (backend endpoint-i yoxdur —
 *     qəsdən, məlumat bazasına yazma bu konsoldan çıxarılmır).
 * ========================================================================== */

"use strict";

const REVENUE_SOURCES = [
  "Abunəyə",
  "Kurs ödənişi",
  "Repetitor ödənişi",
  "Əlavə xidmət",
  "Digər",
];

document.addEventListener("DOMContentLoaded", () => {
  const kpiRow = document.getElementById("kpi-row");
  const kpiUpdated = document.getElementById("kpi-updated");
  const form = document.getElementById("revenue-form");
  const amountInput = document.getElementById("revenue-amount");
  const categorySelect = document.getElementById("revenue-category");
  const fieldAmount = document.getElementById("field-amount");
  const btnAdd = document.getElementById("btn-add-revenue");
  const btnReset = document.getElementById("btn-reset-revenue");
  const historyTable = document.getElementById("history-table");
  const filterSource = document.getElementById("filter-source");
  const btnClear = document.getElementById("btn-clear-history");
  const btnExport = document.getElementById("btn-export");

  const MAX_ENTRIES = 500;

  /* ------------------------------------------------------ DATA LAYER --- */

  function loadLog() {
    const raw = readStore(STORAGE_KEYS.revenueLog, []);
    if (!Array.isArray(raw)) return [];
    // Yalnız rəqəmsal dəyərləri olan, təsdiqlənmiş qeydləri qəbul et.
    return raw
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        id: String(e.id || ""),
        amount: Number(e.amount) || 0,
        source: REVENUE_SOURCES.includes(e.source) ? e.source : "Digər",
        createdAt: typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString(),
      }))
      .filter((e) => e.amount > 0 && e.id)
      .slice(0, MAX_ENTRIES);
  }

  function saveLog(entries) {
    return writeStore(STORAGE_KEYS.revenueLog, entries.slice(0, MAX_ENTRIES));
  }

  /** Ümumi gəlir = qeydlərin cəmi (heç vaxt `debug_revenue` ilə iki mənbə yoxdur). */
  function totalRevenue(entries) {
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  function thisMonthTotal(entries) {
    const now = new Date();
    return entries
      .filter((e) => {
        const d = new Date(e.createdAt);
        return (
          !Number.isNaN(d.getTime()) &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }

  /* --------------------------------------------------------- KPI LAYER -- */

  function renderKpis(entries) {
    const total = totalRevenue(entries);
    const month = thisMonthTotal(entries);
    const average = entries.length > 0 ? total / entries.length : 0;

    kpiRow.textContent = "";

    const totalStat = el("div", "stat");
    const top = el("div", "stat__top");
    top.appendChild(el("div", "stat__label", "Ümumi gəlir"));
    const icon = el("div", "stat__icon stat__icon--accent");
    icon.appendChild(svgIcon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", 18));
    top.appendChild(icon);
    totalStat.appendChild(top);
    const totalValue = el("div", "stat__value stat__value--currency", formatMoney(total));
    totalStat.appendChild(totalValue);
    totalStat.appendChild(
      el("div", "stat__meta", `${formatNumber(entries.length)} qeyd əlavə olunub`)
    );
    kpiRow.appendChild(totalStat);

    const monthStat = el("div", "stat");
    const monthTop = el("div", "stat__top");
    monthTop.appendChild(el("div", "stat__label", "Bu ay"));
    const icon2 = el("div", "stat__icon");
    icon2.appendChild(svgIcon("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", 18));
    monthTop.appendChild(icon2);
    monthStat.appendChild(monthTop);
    monthStat.appendChild(el("div", "stat__value", formatMoney(month)));
    const share = total > 0 ? Math.round((month / total) * 100) : 0;
    monthStat.appendChild(el("div", "stat__meta", `Ümumi gəlirin ${share}%`));
    kpiRow.appendChild(monthStat);

    const avgStat = el("div", "stat");
    const avgTop = el("div", "stat__top");
    avgTop.appendChild(el("div", "stat__label", "Orta qeyd"));
    const icon3 = el("div", "stat__icon");
    icon3.appendChild(svgIcon("M4 19V5M4 19h16M8 15l3-4 3 2 4-6", 18));
    avgTop.appendChild(icon3);
    avgStat.appendChild(avgTop);
    avgStat.appendChild(el("div", "stat__value", formatMoney(average)));
    avgStat.appendChild(el("div", "stat__meta", "Hər bir giriş üzrə orta məbləğ"));
    kpiRow.appendChild(avgStat);

    kpiUpdated.textContent = `Son yeniləmə: ${formatDate(new Date().toISOString())}`;
  }

  /* ------------------------------------------------------- FILTER MENU -- */

  function renderFilterOptions(entries) {
    const present = new Set(entries.map((e) => e.source));
    const current = filterSource.value;

    filterSource.textContent = "";
    const all = el("option", null, "Bütün mənbələr");
    all.value = "";
    filterSource.appendChild(all);

    REVENUE_SOURCES.filter((s) => present.has(s)).forEach((source) => {
      const opt = el("option", null, source);
      opt.value = source;
      filterSource.appendChild(opt);
    });

    filterSource.value = present.has(current) ? current : "";
  }

  /* -------------------------------------------------------- TABLE LAYER - */

  function renderTable(entries) {
    const filtered = filterSource.value
      ? entries.filter((e) => e.source === filterSource.value)
      : entries;

    historyTable.textContent = "";

    if (filtered.length === 0) {
      const isFiltered = Boolean(filterSource.value);
      renderState(historyTable, {
        title: isFiltered ? "Bu mənbə üzrə qeyd yoxdur" : "Hələ qeyd yoxdur",
        text: isFiltered
          ? "Süzü dəyişib bütün tarixçəni görmək üçün filtrə baxın."
          : "Yuxarıdakı formadan ilk gəlir qeydini əlavə edin — tarixçə avtomatik yaradılacaq.",
      });
      return;
    }

    const table = el("table", "table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Tarix", "Mənbə", "Məbləğ", ""].forEach((label) => {
      headRow.appendChild(el("th", null, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");

    filtered.forEach((entry) => {
      const row = el("tr");

      const dateCell = el("td");
      dateCell.appendChild(el("span", "table__strong", formatDate(entry.createdAt)));
      row.appendChild(dateCell);

      const sourceCell = el("td");
      sourceCell.appendChild(el("span", "tag", entry.source));
      row.appendChild(sourceCell);

      const amountCell = el("td", "table__num");
      amountCell.appendChild(el("span", "table__strong", formatMoney(entry.amount)));
      row.appendChild(amountCell);

      const actionCell = el("td", "table__num");
      const delBtn = el("button", "btn btn--ghost btn--sm", "Sil");
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "Qeydi sil");
      delBtn.addEventListener("click", () => {
        const current = loadLog();
        const next = current.filter((e) => e.id !== entry.id);
        if (saveLog(next)) {
          toast("Qeyd silindi.", "success");
          renderAll();
        }
      });
      actionCell.appendChild(delBtn);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    historyTable.appendChild(table);
  }

  /* ---------------------------------------------------------- FORM LOGIC - */

  function clearFieldError() {
    fieldAmount.classList.remove("has-error");
  }

  function showFieldError(message) {
    const err = fieldAmount.querySelector(".field__error");
    if (err) err.textContent = message;
    fieldAmount.classList.add("has-error");
  }

  amountInput.addEventListener("input", clearFieldError);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFieldError();

    const amount = parseMoney(amountInput.value);
    if (amount === null) {
      showFieldError(
        amountInput.value.trim() === ""
          ? "Məbləğ daxil edin (məs. 1250.50)."
          : "Yalnız rəqəm və 2 onluq dəqiqlik qəbul olunur."
      );
      amountInput.focus();
      return;
    }

    const source = REVENUE_SOURCES.includes(categorySelect.value)
      ? categorySelect.value
      : "Digər";

    const entries = loadLog();
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      source,
      createdAt: new Date().toISOString(),
    };
    entries.unshift(entry);

    if (!saveLog(entries)) return;

    // Qeyd yazıldıqdan sonra düymə qısa müddətlik kilidlənir — eyni qeydin
    // təkrar-təkrar əlavə olunmasının qarşısını alır (double-submit).
    btnAdd.disabled = true;
    window.setTimeout(() => {
      btnAdd.disabled = false;
    }, 400);

    amountInput.value = "";
    amountInput.focus();
    toast(`${formatMoney(amount)} · ${source} qeydə əlavə olundu.`, "success");
    renderAll();
  });

  btnReset.addEventListener("click", () => {
    form.reset();
    clearFieldError();
    amountInput.focus();
  });

  filterSource.addEventListener("change", () => {
    renderTable(loadLog());
  });

  btnClear.addEventListener("click", () => {
    const entries = loadLog();
    if (entries.length === 0) {
      toast("Təmizləmək üçün qeyd yoxdur.", "info");
      return;
    }
    if (!window.confirm("Bütün gəlir tarixçəsi silinsin? Bu əməliyyat geri qaytarıla bilməz.")) {
      return;
    }
    if (saveLog([])) {
      toast("Tarixçə təmizləndi.", "success");
      renderAll();
    }
  });

  btnExport.addEventListener("click", () => {
    const entries = loadLog();
    if (entries.length === 0) {
      toast("İxrac etmək üçün qeyd yoxdur.", "warning");
      return;
    }
    downloadCsv(
      `gradient-gelir-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Tarix", "Mənbə", "Məbləğ (AZN)"],
      entries.map((e) => [formatDate(e.createdAt), e.source, e.amount.toFixed(2)])
    );
    toast(`${entries.length} qeyd CSV faylına ixrac edildi.`, "success");
  });

  /* ------------------------------------------------------------- RENDER -- */
  function renderAll() {
    const entries = loadLog();
    renderKpis(entries);
    renderFilterOptions(entries);
    renderTable(entries);
  }

  initShell({
    page: "revenue.html",
    title: "Gəlir Hesabatı",
    subtitle: "Qazancların qeydi, statistika və ixrac",
  });

  renderAll();
});

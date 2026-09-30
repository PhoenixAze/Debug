/* ============================================================================
 * Gradient — Admin Console · Ümumi Baxış səhifəsi
 * ----------------------------------------------------------------------------
 * TƏHLÜKƏSİZLİK: Bütün DOM yazıları `textContent`/`createElement` ilə aparılır.
 * Serverdən gələn heç bir dəyər HTML kimi şərh olunmur.
 * ========================================================================== */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const healthBody = document.getElementById("health-body");
  const healthUpdated = document.getElementById("health-updated");
  const userMetrics = document.getElementById("user-metrics");
  const examMetrics = document.getElementById("exam-metrics");
  const quickLinks = document.getElementById("quick-links");

  /* ------------------------------------------------------ QUICK LINKS --- */
  const QUICK = [
    {
      href: "revenue.html",
      title: "Gəlir Hesabatı",
      text: "Ümumi qazancı daxil edin, tarixçəyə baxın və CSV ixrac edin.",
      icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    },
    {
      href: "balance.html",
      title: "Balans Artımı",
      text: "İstifadəçini e-poçt və ya nömrə ilə tapın və balansını idarə edin.",
      icon: "M16 7h6m0 0v6m0-6-7 7M8 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2",
    },
    {
      href: "overview.html",
      title: "Bu səhifə",
      text: "Canlı metrikalar və servis vəziyyəti burada göstərilir.",
      icon: "M3 12l3-2.5 3 2.5M3 12h4l2 5 2-5h5l3-2.5M17 12l-3-2.5-3 2.5",
    },
  ];

  QUICK.forEach((item) => {
    const card = el("a", "card");
    card.href = item.href;
    card.style.display = "block";
    card.style.color = "inherit";
    card.style.textDecoration = "none";

    const body = el("div", "card__body");
    body.classList.add("stack", "stack--sm");

    const iconBox = el("div", "stat__icon stat__icon--accent");
    iconBox.appendChild(svgIcon(item.icon, 18));
    body.appendChild(iconBox);
    body.appendChild(el("div", "card__title", item.title));
    body.appendChild(el("div", "card__desc", item.text));
    card.appendChild(body);
    quickLinks.appendChild(card);
  });

  /* ------------------------------------------------------ RENDER BLOKLARI */

  function renderService({ name, meta, state, label, error }) {
    const row = el("div", "service");
    const left = el("div");
    left.appendChild(el("div", "service__name", name));
    if (meta) left.appendChild(el("div", "service__meta", meta));
    if (error) {
      const errBox = el("div", "service__error", error);
      left.appendChild(errBox);
    }
    const pill = el("span", `status status--${state}`);
    pill.appendChild(el("span", "status__dot"));
    pill.appendChild(el("span", null, label));
    row.appendChild(left);
    row.appendChild(pill);
    return row;
  }

  function setHealthPlaceholder() {
    healthBody.textContent = "";
    healthBody.appendChild(
      renderService({
        name: "FastAPI Backend",
        meta: "gradient-backend-fam5.onrender.com",
        state: "idle",
        label: "Yüklənir…",
      })
    );
    healthBody.appendChild(
      renderService({
        name: "Supabase Database",
        meta: "service_role bağlantısı",
        state: "idle",
        label: "Yüklənir…",
      })
    );
  }

  function renderMetrics() {
    const u = (lastStats && lastStats.metrics && lastStats.metrics.users) || {};
    const e = (lastStats && lastStats.metrics && lastStats.metrics.exams) || {};

    userMetrics.textContent = "";
    userMetrics.appendChild(
      renderStat({
        label: "Ümumi istifadəçi",
        value: formatNumber(u.total),
        iconPath: ICONS.users,
        accent: true,
        meta: "Bütün rollar daxil olmaqla",
      })
    );
    userMetrics.appendChild(
      renderStat({
        label: "Şagirdlər",
        value: formatNumber(u.students),
        iconPath: ICONS.users,
        meta: "Platformanın əsas auditoriyası",
      })
    );
    userMetrics.appendChild(
      renderStat({
        label: "Repetitorlar",
        value: formatNumber(u.tutors),
        iconPath: ICONS.users,
        meta: "Qrup idarə edən istifadəçilər",
      })
    );
    userMetrics.appendChild(
      renderStat({
        label: "Adminlər",
        value: formatNumber(u.admins),
        iconPath: ICONS.server,
        meta: "Sistemə tam girişi olanlar",
      })
    );

    examMetrics.textContent = "";
    examMetrics.appendChild(
      renderStat({
        label: "Ümumi sınaq",
        value: formatNumber(e.total),
        iconPath: ICONS.inbox,
        accent: true,
        meta: "Bazada qeydə alınmış sınaqlar",
      })
    );
    const perExam = e.total > 0 ? Math.round((e.total_questions || 0) / e.total) : 0;
    examMetrics.appendChild(
      renderStat({
        label: "Ümumi sual",
        value: formatNumber(e.total_questions),
        iconPath: ICONS.inbox,
        meta: perExam > 0 ? `Sınaq başına orta: ${formatNumber(perExam)}` : "Hələ sual yoxdur",
      })
    );
  }

  /* --------------------------------------------------------- DATA FETCH -- */
  let lastStats = null;

  async function loadStats({ silent = false } = {}) {
    try {
      const data = await apiWithAuth("/stats");

      lastStats = data;
      healthBody.textContent = "";

      const online = data && data.status === "online";
      const dbConnected = data && data.database === "connected";

      healthBody.appendChild(
        renderService({
          name: "FastAPI Backend",
          meta: "gradient-backend-fam5.onrender.com",
          state: online ? "ok" : "err",
          label: online ? "Online" : "Xəta",
          error: online ? null : "Servis cavab vermədi.",
        })
      );
      healthBody.appendChild(
        renderService({
          name: "Supabase Database",
          meta: "service_role bağlantısı",
          state: dbConnected ? "ok" : "err",
          label: dbConnected ? "Qoşulub" : "Bağlantı yoxdur",
          error: dbConnected ? null : "Verilənlər bazasına çıxış mümkün deyil.",
        })
      );

      renderMetrics();
      healthUpdated.textContent = `Son yeniləmə: ${formatDate(new Date().toISOString())}`;
    } catch (error) {
      if (error instanceof ApiAuthError) {
        if (!silent) {
          renderState(healthBody, {
            variant: "error",
            title: "Giriş təsdiqi tələb olunur",
            text: "Sistem vəziyyətini görmək üçün debug açarını daxil edin.",
            actionLabel: "Yenidən cəhd et",
            onAction: () => loadStats(),
          });
          healthUpdated.textContent = "Bağlı";
        }
        return;
      }
      healthBody.textContent = "";
      renderState(healthBody, {
        variant: "error",
        title: "Məlumat yüklənmədi",
        text: error.message || "Serverə çıxış mümkün olmadı.",
        actionLabel: "Yenidən cəhd et",
        onAction: () => loadStats(),
      });
      healthUpdated.textContent = "Xəta";
      if (!silent) toast(error.message || "Məlumat yüklənmədi.", "error");
    }
  }

  /* --------------------------------------------------------- BOOTSTRAP --- */
  initShell({
    page: "overview.html",
    title: "Ümumi Baxış",
    subtitle: "Platformanın canlı vəziyyəti və əsas metrikaları",
    autoRefresh: true,
    onRefresh: loadStats,
  });

  setHealthPlaceholder();
  loadStats();
});

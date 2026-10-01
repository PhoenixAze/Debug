/* ============================================================================
 * Gradient — Admin Console · Sınaq İdarəetməsi səhifəsi
 * ----------------------------------------------------------------------------
 * TƏHLÜKƏSİZLİK:
 *   • Bütün DOM yazıları `textContent`/`createElement` ilə — innerHTML YOXDUR.
 *   • JSON import `JSON.parse` + sərt allowlist (A–H) ilə təhlükəsiz parse
 *     edilir; prototip zəhərlənməsinin qarşısı `__proto__`/`constructor`/
 *     `prototype` açarlarının rədd edilməsi ilə alınır.
 *   • Bütün məzmun yenidən serverdə (Pydantic) təsdiqlənir — frontend
 *     təsdiqi yalnız istifadəçi rahatlığıdır, müdafiə səviyyəsi DEYİL.
 *   • Sınaq məzmunu yalnız backend API vasitəsilə DB-yə yazılır.
 * ========================================================================== */

"use strict";

/* Backend ilə TAM uyğunlaşan variant diapazonu: A..H (8 variant).
   Əvvəlki A–D məhdudiyyəti istifadəçini "E variantını yazmışam" xətasıyla
   dayandırırdı — indi hər 8 variant dəstəklənir. */
const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const MIN_OPTIONS = 2;
const MAX_QUESTIONS = 200;
const MAX_TEXT = 2000;
const MAX_OPTION_TEXT = 500;
const MAX_TAG_LENGTH = 80;
const UNSAFE_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Mövzu teqindən silinən təhlükəli simvollar (HTML/XML sətirləri).
 * `RegExp` obyekti ilə yaradılır — literal regex daxilində tək dətliqdə
 * müəyyən edilən hərflər sintaksis yoxlayıcı alətlərini (və bəzi
 * linters-ı) çağırır.
 */
const UNSAFE_TAG_CHARS = new RegExp("[<>&\"" + "'`\\\\]", "g");

/* Fənn siyahısı — analitika (`analytics.py`) və repetitor paneli ilə uyğun.
   "Digər" seçiləndə əl ilə yazmaq açılır. */
const SUBJECTS = [
  "Riyaziyyat",
  "Fizika",
  "Kimya",
  "Biologiya",
  "Tarix",
  "Coğrafiya",
  "Ədəbiyyat",
  "Dil və ədəbiyyat",
  "İngilis dili",
  "Rus dili",
  "Alman dili",
  "İnformatika",
  "İqtisadiyyat",
  "Hüquq",
  "Fəlsəfə",
  "Psixologiya",
  "Cələbəkərbazlıq",
  "İslam Hədisəsi",
  "Digər",
];

document.addEventListener("DOMContentLoaded", () => {
  const examTable = document.getElementById("exam-table");
  const examSearch = document.getElementById("exam-search");
  const editor = document.getElementById("editor");
  const examForm = document.getElementById("exam-form");
  const questionsHost = document.getElementById("questions-host");
  const questionCount = document.getElementById("question-count");
  const editorMode = document.getElementById("editor-mode");

  const titleInput = document.getElementById("exam-title");
  const subjectInput = document.getElementById("exam-subject");
  const subjectCustom = document.getElementById("exam-subject-custom");
  const fieldSubjectCustom = document.getElementById("field-subject-custom");
  const priceInput = document.getElementById("exam-price");
  const durationInput = document.getElementById("exam-duration");

  const fieldTitle = document.getElementById("field-title");
  const fieldSubject = document.getElementById("field-subject");
  const fieldPrice = document.getElementById("field-price");
  const fieldDuration = document.getElementById("field-duration");

  const importModal = document.getElementById("import-modal");
  const jsonInput = document.getElementById("json-input");
  const fieldJson = document.getElementById("field-json");

  /** Redaktə olunan sınaq (`null` = yeni sınaq yaradılır). */
  let editingId = null;
  /** Redaktorun vəziyyəti: [{ text, options: {A,B,C,D}, correct_answer }] */
  let draftQuestions = [];
  let saveBusy = false;

  /* ------------------------------------------------------ YARDIMCI ---- */

  /** Boş variant xəritəsi (A..H). */
  function emptyOptions() {
    const opts = {};
    OPTION_KEYS.forEach((k) => {
      opts[k] = "";
    });
    return opts;
  }

  /** JSON-dan gələn variantları A..H diapazonuna normalize edir. */
  function normalizeOptions(source) {
    const opts = emptyOptions();
    if (!source || typeof source !== "object" || Array.isArray(source)) return opts;
    Object.keys(source).forEach((rawKey) => {
      const key = String(rawKey).trim().toUpperCase();
      if (OPTION_KEYS.includes(key)) {
        opts[key] = String(source[rawKey] ?? "").trim();
      }
    });
    return opts;
  }

  function setError(field, message) {
    const err = field.querySelector(".field__error");
    if (err && message) err.textContent = message;
    field.classList.add("has-error");
  }

  function clearError(field) {
    field.classList.remove("has-error");
  }

  [titleInput, subjectCustom, priceInput, durationInput].forEach((input) => {
    input.addEventListener("input", () => {
      const map = {
        "exam-title": fieldTitle,
        "exam-subject-custom": fieldSubject,
        "exam-price": fieldPrice,
        "exam-duration": fieldDuration,
      };
      const field = map[input.id];
      if (field) clearError(field);
    });
  });

  /* ---------------------------------------------------- FƏNN SEÇİMİ ---- */

  function populateSubjects() {
    subjectInput.textContent = "";
    SUBJECTS.forEach((name) => {
      const opt = el("option", null, name);
      opt.value = name;
      subjectInput.appendChild(opt);
    });
    subjectInput.value = "Riyaziyyat";
  }

  // "Digər" seçiləndə əl ilə yazma sahəsi açılır.
  subjectInput.addEventListener("change", () => {
    const isCustom = subjectInput.value === "Digər";
    fieldSubjectCustom.classList.toggle("hidden", !isCustom);
    if (isCustom) {
      subjectCustom.focus();
    } else {
      clearError(fieldSubject);
      subjectCustom.value = "";
    }
  });

  /** Seçilmiş fənn — "Digər" halında əl ilə yazılan dəyəri qaytarır. */
  function selectedSubject() {
    if (subjectInput.value === "Digər") {
      return subjectCustom.value.trim();
    }
    return subjectInput.value;
  }

  /* --------------------------------------------------- SUAL REDAKTORU -- */

  function updateQuestionCount() {
    const n = draftQuestions.length;
    questionCount.textContent =
      `${n} sual${n > MAX_QUESTIONS ? " (hədd aşıldı!)" : ""} · JSON formatında saxlanılır`;
    questionCount.style.color = n > MAX_QUESTIONS ? "var(--danger)" : "";
  }

  function addEmptyQuestion() {
    if (draftQuestions.length >= MAX_QUESTIONS) {
      toast(`Maksimum ${MAX_QUESTIONS} sual əlavə oluna bilər.`, "warning");
      return;
    }
    draftQuestions.push({
      text: "",
      q_tag: "",
      options: emptyOptions(),
      correct_answer: "A",
    });
    renderQuestions();
  }

  function removeQuestion(index) {
    draftQuestions.splice(index, 1);
    renderQuestions();
  }

  function renderQuestions() {
    questionsHost.textContent = "";
    updateQuestionCount();

    if (draftQuestions.length === 0) {
      renderState(questionsHost, {
        title: "Hələ sual əlavə olunmayıb",
        text: "Düymə ilə tək-tək sual əlavə edin və ya hazır JSON strukturu yapışdırın.",
        actionLabel: "İlk sualı əlavə et",
        onAction: addEmptyQuestion,
      });
      return;
    }

    draftQuestions.forEach((question, index) => {
      const card = el("div", "question-card");

      /* --- header --- */
      const head = el("div", "question-card__head");
      const idx = el("div", "question-card__index");
      idx.appendChild(document.createTextNode(`Sual ${index + 1}`));
      const answerTag = el("span", "tag tag--credit", `Cavab: ${question.correct_answer}`);
      idx.appendChild(answerTag);
      // Mövzu teqi (analitikanın əsas açarı). Boş olduqda gizlidir.
      const topicTag = el("span", "tag");
      topicTag.textContent = question.q_tag || "";
      topicTag.classList.add("question-card__topic");
      if (!question.q_tag) topicTag.classList.add("hidden");
      idx.appendChild(topicTag);
      head.appendChild(idx);

      const actions = el("div", "row");
      const upBtn = el("button", "btn btn--ghost btn--sm", "Yuxarı");
      upBtn.type = "button";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        if (index === 0) return;
        const tmp = draftQuestions[index - 1];
        draftQuestions[index - 1] = draftQuestions[index];
        draftQuestions[index] = tmp;
        renderQuestions();
      });

      const downBtn = el("button", "btn btn--ghost btn--sm", "Aşağı");
      downBtn.type = "button";
      downBtn.disabled = index === draftQuestions.length - 1;
      downBtn.addEventListener("click", () => {
        if (index >= draftQuestions.length - 1) return;
        const tmp = draftQuestions[index + 1];
        draftQuestions[index + 1] = draftQuestions[index];
        draftQuestions[index] = tmp;
        renderQuestions();
      });

      const delBtn = el("button", "btn btn--ghost btn--sm", "Sil");
      delBtn.type = "button";
      delBtn.addEventListener("click", () => removeQuestion(index));

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(delBtn);
      head.appendChild(actions);
      card.appendChild(head);

      /* --- body --- */
      const body = el("div", "question-card__body");

      // Sual mətni
      const textArea = el("textarea", "input");
      textArea.rows = 2;
      textArea.maxLength = String(MAX_TEXT);
      textArea.value = question.text;
      textArea.placeholder = "Sual mətnini yazın...";
      textArea.addEventListener("input", () => {
        draftQuestions[index].text = textArea.value;
      });
      body.appendChild(textArea);

      // Mövzu teqi (q_tag) — analitika üçün vacibdir: şagird bu teqdəki
      // sualları səhv cavablayanda mövzu "zəif" siyahısına düşür.
      const tagField = el("div", "field");
      const tagLabel = el("label", "field__label");
      tagLabel.textContent = "Mövzu teqi (q_tag)";
      const tagId = `q-tag-${index}`;
      tagLabel.setAttribute("for", tagId);
      tagField.appendChild(tagLabel);

      const tagInput = el("input", "input");
      tagInput.id = tagId;
      tagInput.type = "text";
      tagInput.maxLength = String(MAX_TAG_LENGTH);
      tagInput.value = question.q_tag || "";
      tagInput.placeholder = "məs. Triqonometriya";
      tagInput.autocomplete = "off";
      tagInput.addEventListener("input", () => {
        const value = tagInput.value.trim();
        draftQuestions[index].q_tag = value;
        // Başlıq etiketini canlı yenilə (re-render olmadan — input fokusu qorunur).
        topicTag.textContent = value;
        topicTag.classList.toggle("hidden", value === "");
      });
      tagField.appendChild(tagInput);
      tagField.appendChild(
        el("span", "field__hint", "Boş buraxılsa — analitikada mövzu göstərilməyəcək.")
      );
      body.appendChild(tagField);

      // Variantlar — A..H arası dinamik say (boş olanlar gizlidir).
      const optionsHost = el("div", "stack stack--sm");

      const renderOptionRows = () => {
        optionsHost.textContent = "";
        const state = draftQuestions[index];

        // İstifadəçi nə qədər doldurubsa, o qədər sətir göstərilir
        // (minimum 4, maksimum 8) — boş sətirlər ekranı zibilləmir.
        const filledCount = OPTION_KEYS.filter((k) => (state.options[k] || "").trim()).length;
        const visibleCount = Math.max(4, Math.min(OPTION_KEYS.length, filledCount + 1));

        OPTION_KEYS.slice(0, visibleCount).forEach((key) => {
          const row = el("div", "option-row");

          const keyBtn = el(
            "button",
            `option-row__key${state.correct_answer === key ? " is-correct" : ""}`,
            key
          );
          keyBtn.type = "button";
          keyBtn.setAttribute("aria-label", `${key} variantını düzgün cavab seç`);
          keyBtn.title = "Düzgün cavabı bu variantda işarələmək üçün klikləyin";
          keyBtn.addEventListener("click", () => {
            if (!(state.options[key] || "").trim()) {
              toast(`${key} variantı boşdur — əvvəlcə mətn yazın.`, "warning");
              return;
            }
            state.correct_answer = key;
            renderOptionRows();
            // Başlıq badge-i də yenilənir.
            const badge = card.querySelector(".question-card__index .tag");
            if (badge) badge.textContent = `Cavab: ${key}`;
          });

          const input = el("input", "input");
          input.type = "text";
          input.maxLength = String(MAX_OPTION_TEXT);
          input.value = state.options[key] || "";
          input.placeholder = `Variant ${key}`;
          input.addEventListener("input", () => {
            state.options[key] = input.value;
            // Yeni variant doldurulduqda sətir sayı arta bilər.
            const nextCount = Math.max(4, Math.min(OPTION_KEYS.length, filledCount + 1));
            if (nextCount !== visibleCount) renderOptionRows();
          });

          row.appendChild(keyBtn);
          row.appendChild(input);
          optionsHost.appendChild(row);
        });
      };

      renderOptionRows();
      body.appendChild(optionsHost);

      const hint = el("div", "answer-preview");
      hint.appendChild(
        document.createTextNode(
          "Düzgün cavabı seçmək üçün variant hərfinin solundakı düyməyə klikləyin. " +
            "8 variantadək (A–H) dəstəklənir."
        )
      );
      body.appendChild(hint);

      card.appendChild(body);
      questionsHost.appendChild(card);
    });
  }

  /* ------------------------------------------------------ JSON IMPORT -- */

  /**
   * JSON mətnini təhlükəsiz parse edir.
   * @returns {{ok: true, questions: Array}|{ok: false, error: string}}
   */
  function parseQuestionsJson(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { ok: false, error: "JSON parse olunmadı — formatı yoxlayın." };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false, error: "JSON massiv (array) olmalıdır." };
    }
    if (parsed.length === 0) {
      return { ok: false, error: "Massiv boşdur." };
    }
    if (parsed.length > MAX_QUESTIONS) {
      return { ok: false, error: `Maksimum ${MAX_QUESTIONS} sual dəstəklənir.` };
    }

    const result = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i];

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `${i + 1}-ci element obyekt olmalıdır.` };
      }
      // Prototip zəhərlənməsi müdafiəsi
      for (const key of Object.keys(item)) {
        if (UNSAFE_JSON_KEYS.has(key)) {
          return { ok: false, error: `${i + 1}-ci elementdə təhlükəli açar: ${key}` };
        }
      }

      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text || text.length > MAX_TEXT) {
        return { ok: false, error: `${i + 1}-ci sualın mətni düzgün deyil (1–${MAX_TEXT}).` };
      }

      const options = item.options;
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        return { ok: false, error: `${i + 1}-ci sualın "options" obyekti yoxdur.` };
      }

      const cleaned = {};
      for (const rawKey of Object.keys(options)) {
        if (UNSAFE_JSON_KEYS.has(rawKey)) {
          return { ok: false, error: `${i + 1}-ci variantda təhlükəli açar: ${rawKey}` };
        }
        const key = String(rawKey).trim().toUpperCase();
        // A–H arası 8 variant dəstəklənir (əvvəl yalnız A–D idi).
        if (!OPTION_KEYS.includes(key)) {
          return {
            ok: false,
            error:
              `${i + 1}-ci sualda variant açarı "${rawKey}" dəstəklənmir. ` +
              `Dəstəklənən: ${OPTION_KEYS.join(", ")} (8 varianta qədər).`,
          };
        }
        const value = String(options[rawKey] ?? "").trim();
        if (!value || value.length > MAX_OPTION_TEXT) {
          return { ok: false, error: `${i + 1}-ci sualın ${key} variantı boş və ya çox uzundur.` };
        }
        cleaned[key] = value;
      }

      if (Object.keys(cleaned).length < MIN_OPTIONS) {
        return {
          ok: false,
          error: `${i + 1}-ci sualda ən azı ${MIN_OPTIONS} variant olmalıdır (verilən: ${Object.keys(cleaned).length}).`,
        };
      }

      const answer = String(item.correct_answer ?? "").trim().toUpperCase();
      if (!OPTION_KEYS.includes(answer)) {
        return {
          ok: false,
          error:
            `${i + 1}-ci sualın "correct_answer" "${answer}" dəstəklənmir. ` +
            `Dəstəklənən: ${OPTION_KEYS.join(", ")}.`,
        };
      }
      if (!cleaned[answer]) {
        return {
          ok: false,
          error: `${i + 1}-ci sualda "correct_answer": "${answer}" var lakin options içində yoxdur.`,
        };
      }

      // q_tag iştəyə bağlıdır (boş ola bilər) — format yoxlaması backenddə
      // təkrarlanır, burada yalnız tip/uzunluq yoxlanılır.
      const rawTag = item.q_tag === undefined || item.q_tag === null ? "" : String(item.q_tag);
      const tag = rawTag.trim();
      if (tag.length > MAX_TAG_LENGTH) {
        return { ok: false, error: `${i + 1}-ci sualın q_tag teqi 80 simvoldan uzundur.` };
      }

      result.push({ text, options: cleaned, correct_answer: answer, q_tag: tag });
    }

    return { ok: true, questions: result };
  }

  function openImportModal() {
    jsonInput.value = "";
    clearError(fieldJson);
    importModal.classList.remove("hidden");
    window.setTimeout(() => jsonInput.focus(), 30);
  }

  function closeImportModal() {
    importModal.classList.add("hidden");
  }

  document.getElementById("btn-import-json").addEventListener("click", openImportModal);
  document.getElementById("btn-import-cancel").addEventListener("click", closeImportModal);

  document.getElementById("btn-import-confirm").addEventListener("click", () => {
    const raw = jsonInput.value.trim();
    if (!raw) {
      setError(fieldJson, "JSON mətni boşdur.");
      return;
    }
    const parsed = parseQuestionsJson(raw);
    if (!parsed.ok) {
      setError(fieldJson, parsed.error);
      return;
    }
    draftQuestions = parsed.questions;
    renderQuestions();
    closeImportModal();
    toast(`${draftQuestions.length} sual içəri alındı.`, "success");
  });

  document.getElementById("btn-add-question").addEventListener("click", addEmptyQuestion);

  /* --------------------------------------------------------- SIYAHILAMA - */

  let searchTimer = null;
  examSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    // Debounce: hər kefes hərfinə sorğu göndərməmək üçün.
    searchTimer = window.setTimeout(loadExams, 350);
  });

  async function loadExams({ silent = false } = {}) {
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (examSearch.value.trim()) params.set("search", examSearch.value.trim());

      const data = await apiWithAuth(`/exams?${params.toString()}`);
      renderExamList(data.exams || []);
    } catch (error) {
      if (error instanceof ApiNotFoundError) {
        renderState(examTable, {
          variant: "error",
          title: "Backend hələ yenilənməyib",
          text:
            "Serverdə /api/v1/debug/exams endpoint-i yoxdur. Bu, backend kodunun " +
            "GitHub-a push edilmədiyi və Render-də yenidən deploy olunmadığı " +
            "deməkdir. Sınaq idarəetməsi işləmək üçün Gradient-backend reposunu " +
            "push edin və deploy tamamlanana qədər gözləyin.",
          actionLabel: "Yenidən yoxla",
          onAction: () => loadExams(),
        });
        return;
      }
      if (error instanceof ApiAuthError) {
        renderState(examTable, {
          variant: "error",
          title: "Giriş təsdiqi tələb olunur",
          text: "Sınaq siyahısını görmək üçün debug açarını daxil edin.",
          actionLabel: "Yenidən cəhd et",
          onAction: loadExams,
        });
        return;
      }
      renderState(examTable, {
        variant: "error",
        title: "Sınaqlar yüklənmədi",
        text: error.message || "Serverə çıxış mümkün olmadı.",
        actionLabel: "Yenidən cəhd et",
        onAction: loadExams,
      });
      if (!silent) toast(error.message || "Sınaqlar yüklənmədi.", "error");
    }
  }

  function renderExamList(exams) {
    examTable.textContent = "";

    if (exams.length === 0) {
      renderState(examTable, {
        title: examSearch.value.trim() ? "Axtarışa uyğun sınaq yoxdur" : "Hələ sınaq yoxdur",
        text: examSearch.value.trim()
          ? "Başlıqda fərqli söz yoxlayın."
          : "Yuxarıdakı «Yeni sınaq» düyməsi ilə ilk sınağı yaradın.",
        actionLabel: examSearch.value.trim() ? null : "Yeni sınaq yarat",
        onAction: examSearch.value.trim() ? null : () => openEditor(null),
      });
      return;
    }

    const table = el("table", "table");
    const thead = el("thead");
    const headRow = el("tr");
    ["Başlıq", "Fənn", "Sual", "Qiymət", "Müddət", "Status", ""].forEach((label) => {
      headRow.appendChild(el("th", null, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");

    exams.forEach((exam) => {
      const row = el("tr");

      const titleCell = el("td");
      titleCell.appendChild(el("div", "table__strong", String(exam.title || "—")));
      titleCell.appendChild(
        el("div", "table__muted", formatDate(exam.created_at))
      );
      row.appendChild(titleCell);

      row.appendChild(el("td", null, String(exam.subject || "—")));
      row.appendChild(el("td", "table__num", formatNumber(exam.question_count)));
      row.appendChild(el("td", "table__num", formatMoney(exam.price)));

      const durCell = el("td", "table__num");
      durCell.appendChild(document.createTextNode(`${exam.duration_minutes || 0} dəq`));
      row.appendChild(durCell);

      const statusCell = el("td");
      const isActive = exam.is_active !== false;
      statusCell.appendChild(
        el(
          "span",
          `status status--${isActive ? "ok" : "warn"}`,
          isActive ? "Aktiv" : "Deaktiv"
        )
      );
      row.appendChild(statusCell);

      /* --- əməliyyatlar --- */
      const actionCell = el("td", "table__num");
      const actionRow = el("div", "row");
      actionRow.style.justifyContent = "flex-end";
      actionRow.style.flexWrap = "nowrap";

      const editBtn = el("button", "btn btn--ghost btn--sm", "Redaktə");
      editBtn.type = "button";
      editBtn.addEventListener("click", () => openEditor(exam.id));

      const toggleBtn = el("button", "btn btn--ghost btn--sm", isActive ? "Deaktiv" : "Aktiv");
      toggleBtn.type = "button";
      toggleBtn.addEventListener("click", () => toggleActive(exam, toggleBtn));

      const delBtn = el("button", "btn btn--ghost btn--sm", "Sil");
      delBtn.type = "button";
      delBtn.style.color = "var(--danger)";
      delBtn.addEventListener("click", () => deleteExam(exam));

      actionRow.appendChild(editBtn);
      actionRow.appendChild(toggleBtn);
      actionRow.appendChild(delBtn);
      actionCell.appendChild(actionRow);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    examTable.appendChild(table);
  }

  /* ------------------------------------------------------------ ƏMƏLİYYAT - */

  async function toggleActive(exam, button) {
    const nextState = !(exam.is_active !== false);
    button.disabled = true;
    try {
      // Aktiv/aktiv status `is_active` sütununda saxlanılır. Sınağı redaktə
      // etmədən aktivlik dəyişmək üçün mövcud məzmun yenidən göndərilir.
      const full = await apiWithAuth(`/exams/${exam.id}`);
      const payload = buildPayloadFromExam(full, nextState);
      await apiWithAuth(`/exams/${exam.id}`, { method: "PUT", body: payload });
      exam.is_active = nextState;
      toast(`Sınaq ${nextState ? "aktivləşdirildi" : "deaktiv edildi"}.`, "success");
      loadExams({ silent: true });
    } catch (error) {
      toast(error.message || "Status dəyişmədi.", "error");
      button.disabled = false;
    }
  }

  async function deleteExam(exam) {
    const confirmed = window.confirm(
      `«${exam.title}» sınağı silinsin?\n\n` +
        "Bu əməliyyat geri qaytarıla bilməz. Həll olunmuş sınaqlar " +
        "server tərəfdən qorunur və silinməyəcək."
    );
    if (!confirmed) return;

    try {
      const result = await apiWithAuth(`/exams/${exam.id}`, { method: "DELETE" });
      toast(result.message || "Sınaq silindi.", "success");
      loadExams({ silent: true });
    } catch (error) {
      toast(error.message || "Sınaq silinə bilmədi.", "error");
    }
  }

  /* ------------------------------------------------------------ REDAKTOR - */

  function buildPayloadFromExam(exam, isActiveOverride) {
    const questions = Array.isArray(exam.questions) ? exam.questions : [];
    return {
      title: exam.title,
      subject: exam.subject,
      price: exam.price,
      duration_minutes: exam.duration_minutes,
      is_active:
        typeof isActiveOverride === "boolean" ? isActiveOverride : exam.is_active !== false,
      questions: questions.map((q) => ({
        text: String(q.text || ""),
        options: q.options || {},
        correct_answer: String(q.correct_answer || "A"),
        q_tag: String(q.q_tag || "")
          .slice(0, MAX_TAG_LENGTH)
          // HTML/XML sətirləri mənbədə kəsilir (XSS + log injection).
          .replace(UNSAFE_TAG_CHARS, "")
          .trim(),
        ...(q.explanation ? { explanation: String(q.explanation) } : {}),
      })),
    };
  }

  function openEditor(examId) {
    clearEditorErrors();
    if (!examId) {
      editingId = null;
      titleInput.value = "";
      populateSubjects();
      fieldSubjectCustom.classList.add("hidden");
      subjectCustom.value = "";
      priceInput.value = "0.00";
      durationInput.value = "30";
      draftQuestions = [];
      editorMode.textContent = "Yeni sınaq yaradılır";
      renderQuestions();
      editor.classList.remove("hidden");
      titleInput.focus();
      return;
    }

    editorMode.textContent = "Yüklənir...";
    editor.classList.remove("hidden");
    try {
      apiWithAuth(`/exams/${examId}`).then((exam) => {
        editingId = examId;
        titleInput.value = String(exam.title || "");

        // Mövcud fənn siyahıdadırsa seç, deyilsə "Digər" + əl ilə doldur.
        const existingSubject = String(exam.subject || "");
        if (SUBJECTS.includes(existingSubject)) {
          subjectInput.value = existingSubject;
          fieldSubjectCustom.classList.add("hidden");
          subjectCustom.value = "";
        } else {
          subjectInput.value = "Digər";
          fieldSubjectCustom.classList.remove("hidden");
          subjectCustom.value = existingSubject;
        }

        priceInput.value = Number(exam.price || 0).toFixed(2);
        durationInput.value = String(exam.duration_minutes || 30);

        const questions = Array.isArray(exam.questions) ? exam.questions : [];
        draftQuestions = questions.map((q) => {
          const options = normalizeOptions(q.options);
          return {
            text: String(q.text || ""),
            options,
            correct_answer: String(q.correct_answer || "A").toUpperCase(),
          };
        });

        renderQuestions();
        editorMode.textContent = `Redaktə: ${String(exam.title || "").slice(0, 60)}`;
        titleInput.focus();
      }).catch((error) => {
        toast(error.message || "Sınaq yüklənmədi.", "error");
        editor.classList.add("hidden");
      });
    } catch (_) {
      editor.classList.add("hidden");
    }
  }

  function closeEditor() {
    editingId = null;
    draftQuestions = [];
    editor.classList.add("hidden");
    clearEditorErrors();
  }

  function clearEditorErrors() {
    [fieldTitle, fieldSubject, fieldPrice, fieldDuration].forEach(clearError);
  }

  function validateEditor() {
    clearEditorErrors();
    let ok = true;

    const title = titleInput.value.trim();
    if (title.length < 3 || title.length > 200) {
      setError(fieldTitle);
      ok = false;
    }

    const subject = selectedSubject();
    if (subject.length < 2 || subject.length > 80) {
      setError(
        fieldSubject,
        subjectInput.value === "Digər"
          ? "«Digər» seçilib — fənn adını əl ilə yazın."
          : "Fənn seçin."
      );
      ok = false;
    }

    const priceRaw = priceInput.value.trim() || "0";
    const price = parseMoney(priceRaw, { allowZero: true });
    if (price === null || price > 100000) {
      setError(fieldPrice, "Qiymət 0–100000 arasında düzgün rəqəm olmalıdır.");
      ok = false;
    }

    const duration = Number.parseInt(durationInput.value, 10);
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      setError(fieldDuration);
      ok = false;
    }

    if (draftQuestions.length === 0) {
      toast("Ən azı 1 sual əlavə edin.", "warning");
      return null;
    }
    if (draftQuestions.length > MAX_QUESTIONS) {
      toast(`Maksimum ${MAX_QUESTIONS} sual dəstəklənir.`, "warning");
      return null;
    }

    for (let i = 0; i < draftQuestions.length; i += 1) {
      const q = draftQuestions[i];
      if (!q.text.trim()) {
        toast(`${i + 1}-ci sualın mətni boşdur.`, "warning");
        return null;
      }
      const filled = OPTION_KEYS.filter((k) => (q.options[k] || "").trim());
      if (filled.length < MIN_OPTIONS) {
        toast(
          `${i + 1}-ci sualda ən azı ${MIN_OPTIONS} variant doldurulmalıdır ` +
            `(doldurulan: ${filled.length}).`,
          "warning"
        );
        return null;
      }
      if (!q.options[q.correct_answer]) {
        toast(`${i + 1}-ci sual üçün seçilmiş cavab variantı boşdur.`, "warning");
        return null;
      }
    }

    if (!ok) return null;

    return {
      title,
      subject,
      price,
      duration_minutes: duration,
      is_active: true,
      questions: draftQuestions.map((q) => ({
        text: q.text.trim(),
        // Boş variantlar GÖNDƏRİLMİR — əks halda backend "ən azı 2 variant"
        // yoxlamasını keçmir və istifadəçi səhv xəta alır.
        options: OPTION_KEYS.reduce((acc, key) => {
          const value = (q.options[key] || "").trim();
          if (value) acc[key] = value;
          return acc;
        }, {}),
        correct_answer: q.correct_answer,
        q_tag: (q.q_tag || "").replace(UNSAFE_TAG_CHARS, "").trim().slice(0, MAX_TAG_LENGTH),
      })),
    };
  }

  examForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveBusy) return;

    const payload = validateEditor();
    if (!payload) return;

    saveBusy = true;
    const saveBtn = document.getElementById("btn-save-exam");
    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = "Saxlanılır...";

    try {
      const result = editingId
        ? await apiWithAuth(`/exams/${editingId}`, { method: "PUT", body: payload })
        : await apiWithAuth("/exams", { method: "POST", body: payload });

      toast(result.message || "Sınaq saxlanıldı.", "success");
      closeEditor();
      loadExams({ silent: true });
    } catch (error) {
      if (error instanceof ApiAuthError) {
        closeEditor();
        return;
      }
      toast(error.message || "Sınaq saxlanıla bilmədi.", "error");
    } finally {
      saveBusy = false;
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  });

  document.getElementById("btn-cancel-exam").addEventListener("click", closeEditor);
  document.getElementById("btn-close-editor").addEventListener("click", closeEditor);
  document.getElementById("btn-new-exam").addEventListener("click", () => openEditor(null));

  /* ------------------------------------------------------------ BOOTSTRAP */

  initShell({
    page: "exams.html",
    title: "Sınaq İdarəetməsi",
    subtitle: "Sınaq əlavə etmək, redaktə etmək və silmək",
    onRefresh: loadExams,
  });

  populateSubjects();
  renderQuestions();
  loadExams();
});

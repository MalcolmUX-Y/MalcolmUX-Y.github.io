const SUPABASE_FUNCTION_URL =
  "https://flecimbpfuzlflyvgjrk.supabase.co/functions/v1/analyze-course";

// Hvis din Edge Function kræver apikey, indsæt din publishable/anon key her.
// Hvis den virker uden, kan du lade den stå tom.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsZWNpbWJwZnV6bGZseXZnanJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Mjg4MTksImV4cCI6MjA4ODQwNDgxOX0.Wcifm_Wjjm1olJefkzOhP2_ZBuDVkqMIB2gGIGpYpZQ";
const SUPABASE_ANON_KEY_TRIMMED = SUPABASE_ANON_KEY.trim();

const state = {
  currentStep: 1,
  documentFile: null,
  pdfPreviewUrl: "",
  extractedData: null,
  confirmedPlan: null,
  analysisStatus: "idle", // idle | running | success | error
  analysisError: "",
  rawItems: [],
  segmentCount: 0,
};

const TOTAL_STEPS = 5;

const app = document.getElementById("app");
const stepIndicator = document.getElementById("stepIndicator");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetFlowState() {
  if (state.pdfPreviewUrl) {
    URL.revokeObjectURL(state.pdfPreviewUrl);
  }

  state.currentStep = 1;
  state.documentFile = null;
  state.pdfPreviewUrl = "";
  state.extractedData = null;
  state.confirmedPlan = null;
  state.analysisStatus = "idle";
  state.analysisError = "";
  state.rawItems = [];
  state.segmentCount = 0;
}

function setStep(step) {
  state.currentStep = step;
  renderApp();
}

function nextStep() {
  if (state.currentStep < TOTAL_STEPS) {
    state.currentStep += 1;
    renderApp();
  }
}

function previousStep() {
  if (state.currentStep > 1) {
    state.currentStep -= 1;
    renderApp();
  }
}

function renderStepIndicator() {
  const labels = ["Upload", "Analyze", "Review", "Confirm", "Dashboard"];

  stepIndicator.innerHTML = labels
    .map((label, index) => {
      const stepNumber = index + 1;
      const status =
        stepNumber === state.currentStep
          ? "active"
          : stepNumber < state.currentStep
          ? "done"
          : "";

      return `
        <div class="step-pill ${status}">
          <span>${stepNumber}</span>
          <span>${label}</span>
        </div>
      `;
    })
    .join("");
}

function ensurePdfJsReady() {
  if (!window.pdfjsLib) {
    throw new Error(
      "PDF.js mangler. Tilføj PDF.js script-tag i din HTML, ellers kan PDF-teksten ikke læses."
    );
  }

  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}

async function extractPdfText(file) {
  ensurePdfJsReady();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText) {
      pageTexts.push(pageText);
    }
  }

  const fullText = pageTexts.join("\n\n").trim();

  if (!fullText) {
    throw new Error("PDF'en blev læst, men der blev ikke fundet nogen tekst.");
  }

  return fullText;
}

async function analyzeCourseText(text) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (SUPABASE_ANON_KEY_TRIMMED) {
    headers.apikey = SUPABASE_ANON_KEY_TRIMMED;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY_TRIMMED}`;
  }

  const response = await fetch(SUPABASE_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Analysis request failed.");
  }

  return data;
}

function normalizeDateString(raw) {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  const value = raw.trim();

  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const dotMatch = value.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (dotMatch) {
    const day = dotMatch[1].padStart(2, "0");
    const month = dotMatch[2].padStart(2, "0");
    const year = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
    return `${year}-${month}-${day}`;
  }

  return "";
}

function toDisplayDate(isoDate) {
  if (!isoDate) {
    return "";
  }

  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }

  return `${day}-${month}-${year}`;
}

function getDateRange(items) {
  return items.reduce(
    (range, item) => {
      const normalizedDate = normalizeDateString(item.date);

      if (!normalizedDate) {
        return range;
      }

      if (!range.start || normalizedDate < range.start) {
        range.start = normalizedDate;
      }

      if (!range.end || normalizedDate > range.end) {
        range.end = normalizedDate;
      }

      return range;
    },
    { start: "", end: "" }
  );
}

function buildLectureSchedule(courseInfo) {
  if (!courseInfo) {
    return "";
  }

  if (Array.isArray(courseInfo.schedule) && courseInfo.schedule.length > 0) {
    return courseInfo.schedule.join(" | ");
  }

  return "";
}

function mapItemsToUiModel(items) {
  const safeItems = Array.isArray(items) ? items : [];

  const courseInfo =
    safeItems.find((item) => item && item.type === "course_info") || null;

  const sessions = safeItems.filter((item) => item && item.type === "session");
  const events = safeItems.filter((item) => item && item.type === "event");

  const orderedEntries = [...sessions, ...events].sort((a, b) => {
    const dateA = normalizeDateString(a.date) || "9999-99-99";
    const dateB = normalizeDateString(b.date) || "9999-99-99";
    return dateA.localeCompare(dateB);
  });

  const weeks = orderedEntries.map((entry, index) => {
    const isoDate = normalizeDateString(entry.date);
    const parsedFromText = parseStructuredSessionText(entry);

    const sourceText =
      typeof entry.text === "string"
        ? entry.text
        : typeof entry.sourceText === "string"
        ? entry.sourceText
        : typeof entry.content === "string"
        ? entry.content
        : "";

    if (entry.type === "session") {
      return {
        week: index + 1,
        kind: "session",
        date: isoDate || parsedFromText.date,
        rawDate: entry.date || parsedFromText.rawDate || "",
        topic: entry.topic || parsedFromText.topic || "Untitled session",
        readings:
          Array.isArray(entry.readings) && entry.readings.length
            ? entry.readings
            : parsedFromText.readings,
        assignment: entry.assignment || "",
        notes: entry.notes || parsedFromText.notes,
        sourceText,
      };
    }

    return {
      week: index + 1,
      kind: "event",
      date: isoDate || parsedFromText.date,
      rawDate: entry.date || parsedFromText.rawDate || "",
      topic: entry.title || parsedFromText.topic || "Untitled event",
      readings: parsedFromText.readings,
      assignment: "",
      notes: entry.notes || parsedFromText.notes,
      sourceText,
    };
  });

  const dateRange = getDateRange(orderedEntries);

  return {
    title: courseInfo?.title || (state.documentFile ? state.documentFile.name.replace(/\.pdf$/i, "") : ""),
    semesterStart: dateRange.start,
    semesterEnd: dateRange.end,
    lectureSchedule: buildLectureSchedule(courseInfo),
    teachers: Array.isArray(courseInfo?.teachers) ? courseInfo.teachers : [],
    courseNotes: courseInfo?.notes || "",
    weeks,
  };
}

function parseStructuredSessionText(entry) {
  const sourceCandidates = [entry?.text, entry?.sourceText, entry?.content].filter(
    (value) => typeof value === "string" && value.trim()
  );

  const source = sourceCandidates[0] || "";
  if (!source) {
    return { date: "", rawDate: "", topic: "", readings: [], notes: "" };
  }

  const lines = source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let rawDate = "";
  let topic = "";
  let notes = "";
  let readings = [];

  for (const line of lines) {
    if (!rawDate) {
      const dateLabelMatch = line.match(/^(date|dato)\s*[:\-]\s*(.+)$/i);
      if (dateLabelMatch) {
        rawDate = dateLabelMatch[2].trim();
        continue;
      }

      const directDateMatch = line.match(/(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      if (directDateMatch) {
        rawDate = directDateMatch[1].trim();
      }
    }

    if (!topic) {
      const topicMatch = line.match(/^(topic|emne|title|titel)\s*[:\-]\s*(.+)$/i);
      if (topicMatch) {
        topic = topicMatch[2].trim();
        continue;
      }
    }

    if (!notes) {
      const notesMatch = line.match(/^(notes?|noter?)\s*[:\-]\s*(.+)$/i);
      if (notesMatch) {
        notes = notesMatch[2].trim();
      }
    }

    if (!readings.length) {
      const readingsMatch = line.match(/^(readings?|pensum|litteratur)\s*[:\-]\s*(.+)$/i);
      if (readingsMatch) {
        readings = readingsMatch[2]
          .split(/[;,|]/)
          .map((part) => part.trim())
          .filter(Boolean);
      }
    }
  }

  if (!topic) {
    topic = lines[0] || "";
  }

  return {
    date: normalizeDateString(rawDate),
    rawDate,
    topic,
    readings,
    notes,
  };
}

function renderWeeksList(items, emptyText) {
  if (!items?.length) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return items
    .map(
      (item) => `
        <div class="week-row">
          <div class="week-row-header">
            <strong>${escapeHtml(item.kind === "event" ? "Event" : "Session")} ${item.week}</strong>
            <span class="muted">${escapeHtml(item.date ? toDisplayDate(item.date) : item.rawDate || "")}</span>
          </div>
          <div><strong>${escapeHtml(item.topic || "-")}</strong></div>
          ${
            item.readings?.length
              ? `<div class="muted week-row-meta">Readings: ${escapeHtml(item.readings.join(" | "))}</div>`
              : ""
          }
          ${
            item.assignment
              ? `<div class="muted week-row-meta">Assignment: ${escapeHtml(item.assignment)}</div>`
              : ""
          }
          ${
            item.notes
              ? `<div class="muted week-row-meta">Preparation / Tasks: ${escapeHtml(item.notes)}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");
}

function getAnalysisStatusMarkup() {
  if (state.analysisStatus === "running") {
    return `
      <div class="analysis-indicator">
        <div class="spinner"></div>
        <span class="muted">AI analyzing document...</span>
      </div>
    `;
  }

  if (state.analysisStatus === "success") {
    return `
      <div class="analysis-indicator">
        <span aria-hidden="true">✔</span>
        <span class="muted">Analysis completed</span>
      </div>
    `;
  }

  if (state.analysisStatus === "error") {
    return `
      <div class="analysis-indicator">
        <span aria-hidden="true">✖</span>
        <span class="muted">Analysis failed</span>
      </div>
      <p class="muted" style="margin-top: 8px;">${escapeHtml(state.analysisError)}</p>
    `;
  }

  return `
    <div class="analysis-indicator">
      <span aria-hidden="true">•</span>
      <span class="muted">Waiting for analysis</span>
    </div>
  `;
}

function renderUploadStep() {
  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 1</p>
        <h2>Upload course document</h2>
        <p class="screen-text">
          Upload a PDF that should frame the AI analysis and the later study structure.
        </p>

        <div class="upload-box">
          <input id="pdfInput" type="file" accept="application/pdf" />

          ${
            state.documentFile
              ? `
                <div class="file-preview">
                  <div class="file-preview-main">
                    <strong>${escapeHtml(state.documentFile.name)}</strong>
                    <p class="muted">PDF selected and ready for analysis</p>
                  </div>
                  ${
                    state.pdfPreviewUrl
                      ? `
                        <div class="pdf-preview">
                          <p class="muted">Preview</p>
                          <iframe
                            title="PDF preview"
                            src="${escapeHtml(state.pdfPreviewUrl)}"
                            loading="lazy"
                          ></iframe>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
              : `<p class="muted">Ingen fil valgt endnu</p>`
          }
        </div>

        <div class="actions">
          <button class="btn btn-primary" id="uploadContinueBtn" ${
            state.documentFile ? "" : "disabled"
          }>
            Continue
          </button>
        </div>
      </div>
    </section>
  `;

  const pdfInput = document.getElementById("pdfInput");
  const uploadContinueBtn = document.getElementById("uploadContinueBtn");

  pdfInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;

    if (state.pdfPreviewUrl) {
      URL.revokeObjectURL(state.pdfPreviewUrl);
    }

    state.documentFile = file;
    state.pdfPreviewUrl = file ? URL.createObjectURL(file) : "";
    state.extractedData = null;
    state.confirmedPlan = null;
    state.analysisStatus = "idle";
    state.analysisError = "";
    state.rawItems = [];
    state.segmentCount = 0;

    renderApp();
  });

  uploadContinueBtn.addEventListener("click", () => {
    nextStep();
  });
}

async function runDocumentAnalysis() {
  if (!state.documentFile) {
    state.analysisStatus = "error";
    state.analysisError = "Ingen PDF valgt.";
    renderApp();
    return;
  }

  try {
    state.analysisStatus = "running";
    state.analysisError = "";
    renderApp();

    const extractedText = await extractPdfText(state.documentFile);
    const analysisResult = await analyzeCourseText(extractedText);

    const items = Array.isArray(analysisResult?.items) ? analysisResult.items : [];
    const uiModel = mapItemsToUiModel(items);

    state.segmentCount =
      typeof analysisResult?.segmentCount === "number"
        ? analysisResult.segmentCount
        : 0;

    state.rawItems = items;
    state.extractedData = uiModel;
    state.analysisStatus = "success";
    state.analysisError = "";

    renderApp();
    nextStep();
  } catch (error) {
    state.analysisStatus = "error";
    state.analysisError =
      error instanceof Error ? error.message : "Ukendt fejl under analyse.";
    renderApp();
  }
}

function renderAnalyzeStep() {
  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 2</p>
        <h2>Analyze document</h2>
        <p class="screen-text">
          PDF'en læses, tekst udtrækkes og sendes til AI-analyse.
        </p>

        <div class="status-box">
          <p><strong>Fil:</strong> ${state.documentFile ? escapeHtml(state.documentFile.name) : "Ingen fil valgt"}</p>
          <p><strong>Status:</strong> ${
            state.analysisStatus === "idle"
              ? "Waiting"
              : state.analysisStatus === "running"
              ? "Running"
              : state.analysisStatus === "success"
              ? "Completed"
              : "Failed"
          }</p>
          ${state.segmentCount ? `<p><strong>Segments:</strong> ${state.segmentCount}</p>` : ""}
          ${getAnalysisStatusMarkup()}
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="backToUploadBtn" ${
            state.analysisStatus === "running" ? "disabled" : ""
          }>Back</button>
          <button class="btn btn-primary" id="runAnalysisBtn" ${
            !state.documentFile || state.analysisStatus === "running" ? "disabled" : ""
          }>
            ${state.analysisStatus === "running" ? "Running..." : "Run analysis"}
          </button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("backToUploadBtn").addEventListener("click", () => {
    previousStep();
  });

  document.getElementById("runAnalysisBtn").addEventListener("click", () => {
    runDocumentAnalysis();
  });
}

function renderReviewStep() {
  const data = state.extractedData;

  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 3</p>
        <h2>Review extracted course info</h2>
        <p class="screen-text">
          Gennemse og ret det AI'en har fundet, før planen bekræftes.
        </p>

        <div class="review-grid review-grid-single">
          <label>
            <span>Course title</span>
            <input id="reviewTitle" type="text" value="${escapeHtml(data?.title || "")}" />
          </label>
        </div>

        <div class="weeks-preview">
          <h3>Extracted sessions and events</h3>
          ${renderSessionReviewCards(data?.weeks)}
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="backToAnalyzeBtn">Back</button>
          <button class="btn btn-primary" id="saveReviewBtn">Continue</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("backToAnalyzeBtn").addEventListener("click", () => {
    previousStep();
  });

  document.getElementById("saveReviewBtn").addEventListener("click", () => {
    const reviewedWeeks = (state.extractedData?.weeks || []).map((week, index) => {
      const prefix = `session-${index}`;
      const readingsValue = document.getElementById(`${prefix}-readings`).value;

      return {
        ...week,
        date: document.getElementById(`${prefix}-date`).value,
        topic: document.getElementById(`${prefix}-topic`).value.trim(),
        readings: readingsValue
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        notes: document.getElementById(`${prefix}-notes`).value.trim(),
      };
    });

    state.extractedData = {
      ...state.extractedData,
      title: document.getElementById("reviewTitle").value.trim(),
      weeks: reviewedWeeks,
    };

    nextStep();
  });
}

function renderSessionReviewCards(items) {
  if (!items?.length) {
    return `<p class="muted">Ingen sessions eller events fundet endnu</p>`;
  }

  return `<div class="session-card-list">${items
    .map((item, index) => {
      const prefix = `session-${index}`;
      const kindLabel = item.kind === "event" ? "Event" : "Session";
      const dateLabel = item.date ? toDisplayDate(item.date) : item.rawDate || "No date";
      const topicLabel = item.topic || "Untitled topic";

      return `
        <article class="session-card">
          <div class="session-card-title-row">
            <p class="session-kind-chip">${escapeHtml(kindLabel)}</p>
            <h4>${escapeHtml(`${dateLabel} — ${topicLabel}`)}</h4>
          </div>

          <div class="review-grid review-grid-session">
            <label>
              <span>Date</span>
              <input id="${prefix}-date" type="date" value="${escapeHtml(item.date || "")}" />
            </label>

            <label>
              <span>Topic</span>
              <input id="${prefix}-topic" type="text" value="${escapeHtml(item.topic || "")}" />
            </label>

            <label>
              <span>Readings (one per line)</span>
              <textarea id="${prefix}-readings">${escapeHtml((item.readings || []).join("\n"))}</textarea>
            </label>

            <label>
              <span>Preparation / Tasks</span>
              <textarea id="${prefix}-notes">${escapeHtml(item.notes || "")}</textarea>
            </label>
          </div>

          <details class="source-text-toggle">
            <summary>Source text</summary>
            <pre>${escapeHtml(item.sourceText || "No source text available")}</pre>
          </details>
        </article>
      `;
    })
    .join("")}</div>`;
}

function renderConfirmStep() {
  const data = state.extractedData;

  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 4</p>
        <h2>Confirm and generate plan</h2>
        <p class="screen-text">
          Bekræft den udtrukne struktur før dashboardet genereres.
        </p>

        <div class="summary-box">
          <p><strong>Course:</strong> ${escapeHtml(data?.title || "-")}</p>
          <p><strong>Items:</strong> ${data?.weeks?.length || 0}</p>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="backToReviewBtn">Back</button>
          <button class="btn btn-primary" id="confirmPlanBtn">Generate dashboard</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("backToReviewBtn").addEventListener("click", () => {
    previousStep();
  });

  document.getElementById("confirmPlanBtn").addEventListener("click", () => {
    state.confirmedPlan = {
      createdAt: new Date().toISOString(),
      ...state.extractedData,
    };

    nextStep();
  });
}

function renderDashboardStep() {
  const plan = state.confirmedPlan;

  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 5</p>
        <h2>Dashboard</h2>
        <p class="screen-text">
          Dette dashboard er nu genereret på baggrund af rigtig dokumentanalyse.
        </p>

        <div class="dashboard-card">
          <h3>${escapeHtml(plan?.title || "Untitled course")}</h3>
          <p><strong>Planned sessions/events:</strong> ${plan?.weeks?.length || 0}</p>
        </div>

        <div class="weeks-preview">
          <h3>Sessions and events</h3>
          ${renderWeeksList(plan?.weeks, "Ingen items endnu")}
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="restartFlowBtn">Start over</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("restartFlowBtn").addEventListener("click", () => {
    resetFlowState();
    renderApp();
  });
}

function renderApp() {
  renderStepIndicator();

  switch (state.currentStep) {
    case 1:
      renderUploadStep();
      break;
    case 2:
      renderAnalyzeStep();
      break;
    case 3:
      renderReviewStep();
      break;
    case 4:
      renderConfirmStep();
      break;
    case 5:
      renderDashboardStep();
      break;
    default:
      renderUploadStep();
  }
}

renderApp();

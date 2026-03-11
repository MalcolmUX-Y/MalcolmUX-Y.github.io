const SUPABASE_FUNCTION_URL =
  "https://flecimbpfuzlflyvgjrk.supabase.co/functions/v1/analyze-course";

// Hvis din Edge Function kræver apikey, indsæt din publishable/anon key her.
// Hvis den virker uden, kan du lade den stå tom.
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
  inferredYear: "",
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
  const labels = ["Upload", "Parse", "Review", "Confirm", "Workflow"];

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

  let inferredYear = "";
  let metaYear = "";
  try {
    const meta = await pdf.getMetadata();
    const metaDate = meta?.info?.CreationDate || meta?.info?.ModDate || "";
    const metaYearMatch = metaDate.match(/\b(20\d{2})\b/);
    if (metaYearMatch) metaYear = metaYearMatch[1];
  } catch (_) {}

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

  const textYearMatch =
    fullText.match(/(?:mandag|tirsdag|onsdag|torsdag|fredag)[^.]{0,30}(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)[^\d]*(20\d{2})\b/i) ||
    fullText.match(/(?:mandag|tirsdag|onsdag|torsdag|fredag)[^.]{0,10}den\s+\d{1,2}\.\d{1,2}[^.]{0,10}(20\d{2})\b/i) ||
    fullText.match(/[Ss]emesterplan\s+\S*(20\d{2})\b/i) ||
    fullText.match(/(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(20\d{2})\b/i);
  inferredYear = textYearMatch ? textYearMatch[1] : metaYear;

  state.inferredYear = inferredYear;

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

// Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Format: "den 5.2." / "torsdag den 27.2."
  const shortDkMatch = value.match(
    /\b(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:d\.|den)\s*(\d{1,2})\.(\d{1,2})\.?/i
  );
  if (shortDkMatch) {
    const dayNum = Number(shortDkMatch[1]);
    const monthNum = Number(shortDkMatch[2]);
    if (!(dayNum >= 1 && dayNum <= 31) || !(monthNum >= 1 && monthNum <= 12)) {
      return "";
    }
    if (!state.inferredYear) return "";
    return `${state.inferredYear}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  }

  // Remove time ranges like "13.00-15.00"
  const timeRangeRegex = /\b\d{1,2}\.\d{2}\s*-\s*\d{1,2}\.\d{2}\b/g;
  const singleTimeRegex = /\b\d{1,2}\.\d{2}\b/g;

  let cleaned = value
    .replace(timeRangeRegex, " ")
    .replace(/\bkl\.?\s*/gi, "")
    .replace(singleTimeRegex, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const danishMonths = {
    januar: "01",
    februar: "02",
    marts: "03",
    april: "04",
    maj: "05",
    juni: "06",
    juli: "07",
    august: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",
  };

  const dkMatch = cleaned.match(
    /^(?:[A-Za-zÆØÅæøå]+(?:dag)?\s+)?(?:d\.\s*)?(\d{1,2})\.?\s+(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\b(?:\s+(\d{4}))?/i
  );

  if (dkMatch) {
    const dayNum = Number(dkMatch[1]);
    const month = danishMonths[dkMatch[2].toLowerCase()];
    const year = dkMatch[3];

    if (!year && !state.inferredYear) {
      return "";
    }
    const resolvedYear = year || state.inferredYear;

    if (!month || !(dayNum >= 1 && dayNum <= 31)) {
      return "";
    }

    return `${resolvedYear}-${month}-${String(dayNum).padStart(2, "0")}`;
  }

  const numMatch = cleaned.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
  if (numMatch) {
    const dayNum = Number(numMatch[1]);
    const monthNum = Number(numMatch[2]);
    const yearRaw = numMatch[3];

    if (!(dayNum >= 1 && dayNum <= 31) || !(monthNum >= 1 && monthNum <= 12)) {
      return "";
    }

    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

    return `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
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

  const danishTextDateMatch = line.match(
    /\b(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b\s+)?(?:(?:d\.|den)\s*)?\d{1,2}\.?\s+(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\b/i
  );
  if (danishTextDateMatch) {
    rawDate = danishTextDateMatch[0].trim();
    continue;
  }

  const directDateMatch = line.match(/\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2})\b/);
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
            <strong>${escapeHtml(item.kind === "event" ? "Event" : "Item")} ${item.week}</strong>
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
        <span class="muted">Parsing document...</span>
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
      <span class="muted">Ready to parse</span>
    </div>
  `;
}

function renderUploadStep() {
  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 1</p>
        <h2>Upload document</h2>
        <p class="screen-text">
          Upload a document to extract its structure into a reviewable workflow.
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

    console.log("ANALYSIS RESULT:", analysisResult);
    console.log("RAW ITEMS:", items);
    console.log("UI MODEL:", uiModel);
    window.debugItems = items;
window.debugUI = uiModel;

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
        <h2>Parse document</h2>
        <p class="screen-text">
          The document is read, segmented and parsed into structured items.
        </p>

        <div class="status-box">
          <p><strong>Fil:</strong> ${state.documentFile ? escapeHtml(state.documentFile.name) : "Ingen fil valgt"}</p>
          <p><strong>Status:</strong> ${
            state.analysisStatus === "idle"
              ? "Ready"
              : state.analysisStatus === "running"
              ? "Parsing"
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
            ${state.analysisStatus === "running" ? "Parsing..." : "Run parser"}
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
        <h2>Review extracted structure</h2>
        <p class="screen-text">
          Review what was extracted from your document.
        </p>

        <div class="weeks-preview">
          <h3>Extracted items</h3>
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
    nextStep();
  });
}

function renderSessionReviewCards(items) {
  if (!items?.length) {
    return `<p class="muted">No items extracted yet</p>`;
  }

  return `<div class="session-card-list">${items
    .map((item) => {
      const kindLabel = item.kind === "event" ? "Event" : "Session";
      const dateLabel = item.date ? toDisplayDate(item.date) : item.rawDate || "No date";
      const topicLabel = item.topic || "Untitled topic";

      return `
        <article class="session-card">
          <div class="session-card-title-row">
            <p class="session-kind-chip">${escapeHtml(kindLabel)}</p>
            <h4>${escapeHtml(`${dateLabel} — ${topicLabel}`)}</h4>
          </div>

          ${item.readings?.length ? `
            <p class="muted" style="font-size:13px; margin:0;">
              ${escapeHtml(item.readings.join(" · "))}
            </p>
          ` : ""}

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
        <h2>Confirm and generate workflow</h2>
        <p class="screen-text">
          Confirm the extracted structure before the workflow is generated.
        </p>

        <div class="summary-box">
          <p><strong>Document:</strong> ${escapeHtml(data?.title || "-")}</p>
          <p><strong>Extracted items:</strong> ${data?.weeks?.length || 0}</p>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="backToReviewBtn">Back</button>
          <button class="btn btn-primary" id="confirmPlanBtn">Generate workflow</button>
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
        <h2>Workflow</h2>
        <p class="screen-text">
          Generated from your document. Review the structured output below.
        </p>

        <div class="dashboard-card">
          <h3>${escapeHtml(plan?.title || "Untitled document")}</h3>
          <p><strong>Extracted items:</strong> ${plan?.weeks?.length || 0}</p>
        </div>

        <div class="weeks-preview">
          <h3>Extracted items</h3>
          ${renderWeeksList(plan?.weeks, "Ingen items endnu")}
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="exportTxtBtn">Eksporter TXT</button>
          <button class="btn btn-secondary" id="exportPdfBtn">Eksporter PDF</button>
          <button class="btn btn-secondary" id="restartFlowBtn">Start over</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("restartFlowBtn").addEventListener("click", () => {
    resetFlowState();
    renderApp();
  });
  document.getElementById("exportTxtBtn").addEventListener("click", () => exportAsTxt(state.confirmedPlan));
  document.getElementById("exportPdfBtn").addEventListener("click", () => exportAsPdf(state.confirmedPlan));
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

(async () => {
  const user = await requireAuth();
  if (!user) return;
  renderApp();
})();

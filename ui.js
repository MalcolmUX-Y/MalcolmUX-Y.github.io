const app = document.getElementById("app");
const stepIndicator = document.getElementById("stepIndicator");

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

function renderUploadStep() {
  const fileType = getFileType(state.documentFile);

  let previewMarkup = "";
  if (state.documentFile) {
    const fileLabel =
      fileType === "docx"
        ? "DOCX selected and ready for analysis"
        : "PDF selected and ready for analysis";

    let contentPreview = "";
    if (fileType === "pdf" && state.pdfPreviewUrl) {
      contentPreview = `
        <div class="pdf-preview">
          <p class="muted">Preview</p>
          <iframe
            title="PDF preview"
            src="${state.pdfPreviewUrl}"
            loading="lazy"
          ></iframe>
        </div>
      `;
    } else if (fileType === "docx") {
      if (state.docxPreviewStatus === "loading") {
        contentPreview = `
          <div class="pdf-preview">
            <p class="muted">Preview</p>
            <div style="display:flex;align-items:center;gap:10px;min-height:120px;padding:24px;border:1px solid var(--border);border-radius:var(--radius-lg);">
              <div class="spinner"></div>
              <span class="muted">Genererer preview…</span>
            </div>
          </div>
        `;
      } else if (state.docxPreviewStatus === "ready" && state.docxPreviewHtml) {
        contentPreview = `
          <div class="pdf-preview">
            <p class="muted">Preview</p>
            <div style="width:100%;min-height:540px;max-height:540px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-lg);background:#fff;color:#111;padding:24px 28px;font-size:13px;line-height:1.6;box-sizing:border-box;">
              ${state.docxPreviewHtml}
            </div>
          </div>
        `;
      } else if (state.docxPreviewStatus === "error") {
        contentPreview = `<p class="muted" style="margin-top:4px;">Preview kunne ikke genereres, men filen kan stadig analyseres.</p>`;
      }
    }

    previewMarkup = `
      <div class="file-preview">
        <div class="file-preview-main">
          <strong>${escapeHtml(state.documentFile.name)}</strong>
          <p class="muted">${fileLabel}</p>
        </div>
        ${contentPreview}
      </div>
    `;
  } else {
    previewMarkup = `<p class="muted">Ingen fil valgt endnu</p>`;
  }

  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 1</p>
        <h2>Upload document</h2>
        <p class="screen-text">
          Upload a document to extract its structure into a reviewable workflow.
        </p>

        <div class="upload-box">
          <input id="pdfInput" type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          ${previewMarkup}
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

  pdfInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0] || null;

    if (state.pdfPreviewUrl) {
      URL.revokeObjectURL(state.pdfPreviewUrl);
    }

    state.documentFile = file;
    state.pdfPreviewUrl = "";
    state.docxPreviewHtml = "";
    state.docxPreviewStatus = "idle";
    state.extractedData = null;
    state.confirmedPlan = null;
    state.analysisStatus = "idle";
    state.analysisError = "";
    state.rawItems = [];
    state.segmentCount = 0;

    if (!file) {
      renderApp();
      return;
    }

    const type = getFileType(file);

    if (type === "pdf") {
      state.pdfPreviewUrl = URL.createObjectURL(file);
      renderApp();
    } else if (type === "docx") {
      state.docxPreviewStatus = "loading";
      renderApp();

      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer });
        state.docxPreviewHtml = result?.value || "";
        state.docxPreviewStatus = "ready";
      } catch (_) {
        state.docxPreviewStatus = "error";
      }

      renderApp();
    } else {
      renderApp();
    }
  });

  uploadContinueBtn.addEventListener("click", () => {
    nextStep();
  });
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

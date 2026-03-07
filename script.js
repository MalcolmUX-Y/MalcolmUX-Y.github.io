const state = {
  currentStep: 1,
  documentFile: null,
  extractedData: null,
  confirmedPlan: null,
};

const TOTAL_STEPS = 5;

const app = document.getElementById("app");
const stepIndicator = document.getElementById("stepIndicator");

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
  const labels = [
    "Upload",
    "Analyze",
    "Review",
    "Confirm",
    "Dashboard",
  ];

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
          <div>
            <strong>${state.documentFile.name}</strong>
            <p class="muted">PDF selected and ready for analysis</p>
          </div>
        </div>
      `
      : `<p class="muted">Ingen fil valgt endnu</p>`
  }

</div>

        <div class="actions">
          <button class="btn btn-primary" id="uploadContinueBtn" disabled>
            Continue
          </button>
        </div>
      </div>
    </section>
  `;

  const pdfInput = document.getElementById("pdfInput");
  const uploadContinueBtn = document.getElementById("uploadContinueBtn");
  const fileStatus = document.getElementById("fileStatus");

  if (state.documentFile) {
    uploadContinueBtn.disabled = false;
  }

  pdfInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;
    state.documentFile = file;

    if (file) {
      fileStatus.textContent = `Valgt fil: ${file.name}`;
      uploadContinueBtn.disabled = false;
    } else {
      fileStatus.textContent = "Ingen fil valgt endnu";
      uploadContinueBtn.disabled = true;
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
        <h2>Analyze document</h2>
        <p class="screen-text">
          Her kobler vi senere din PDF-upload og Edge Function på.
        </p>

        <div class="status-box">
          <p><strong>Fil:</strong> ${state.documentFile ? state.documentFile.name : "Ingen fil valgt"}</p>
          <p><strong>Status:</strong> Klar til analyse</p>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="backToUploadBtn">Back</button>
          <button class="btn btn-primary" id="runAnalysisBtn">Run analysis</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("backToUploadBtn").addEventListener("click", () => {
    previousStep();
  });

  document.getElementById("runAnalysisBtn").addEventListener("click", () => {
    // Midlertidig mockdata indtil vi kobler rigtig analyse på
    state.extractedData = {
      title: "Retorik",
      semesterStart: "2026-02-01",
      semesterEnd: "2026-06-30",
      lectureSchedule: "Tirsdag 10:00–12:00",
      weeks: [
        { week: 1, topic: "Introduktion" },
        { week: 2, topic: "Genreteori" },
        { week: 3, topic: "Argumentation" },
      ],
    };

    nextStep();
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
          Brugeren skal kunne gennemse og godkende det AI'en har fundet.
        </p>

        <div class="review-grid">
          <label>
            <span>Course title</span>
            <input id="reviewTitle" type="text" value="${data?.title || ""}" />
          </label>

          <label>
            <span>Semester start</span>
            <input id="reviewStart" type="date" value="${data?.semesterStart || ""}" />
          </label>

          <label>
            <span>Semester end</span>
            <input id="reviewEnd" type="date" value="${data?.semesterEnd || ""}" />
          </label>

          <label>
            <span>Lecture schedule</span>
            <input id="reviewSchedule" type="text" value="${data?.lectureSchedule || ""}" />
          </label>
        </div>

        <div class="weeks-preview">
          <h3>Extracted weeks</h3>
          ${
            data?.weeks?.length
              ? data.weeks
                  .map(
                    (item) => `
                      <div class="week-row">
                        <span>Week ${item.week}</span>
                        <span>${item.topic}</span>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="muted">Ingen uger fundet endnu</p>`
          }
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
    state.extractedData = {
      ...state.extractedData,
      title: document.getElementById("reviewTitle").value.trim(),
      semesterStart: document.getElementById("reviewStart").value,
      semesterEnd: document.getElementById("reviewEnd").value,
      lectureSchedule: document.getElementById("reviewSchedule").value.trim(),
    };

    nextStep();
  });
}

function renderConfirmStep() {
  const data = state.extractedData;

  app.innerHTML = `
    <section class="screen">
      <div class="screen-card">
        <p class="screen-label">Step 4</p>
        <h2>Confirm and generate plan</h2>
        <p class="screen-text">
          Nu bekræftes den struktur, der senere skal skabe dashboardet.
        </p>

        <div class="summary-box">
          <p><strong>Course:</strong> ${data?.title || "-"}</p>
          <p><strong>Semester:</strong> ${data?.semesterStart || "-"} → ${data?.semesterEnd || "-"}</p>
          <p><strong>Schedule:</strong> ${data?.lectureSchedule || "-"}</p>
          <p><strong>Weeks:</strong> ${data?.weeks?.length || 0}</p>
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
          Dette er slutmålet: et dashboard genereret på baggrund af dokument + review + bekræftelse.
        </p>

        <div class="dashboard-card">
          <h3>${plan?.title || "Untitled course"}</h3>
          <p><strong>Schedule:</strong> ${plan?.lectureSchedule || "-"}</p>
          <p><strong>Semester:</strong> ${plan?.semesterStart || "-"} → ${plan?.semesterEnd || "-"}</p>
        </div>

        <div class="weeks-preview">
          <h3>Weeks</h3>
          ${
            plan?.weeks?.length
              ? plan.weeks
                  .map(
                    (item) => `
                      <div class="week-row">
                        <span>Week ${item.week}</span>
                        <span>${item.topic}</span>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="muted">Ingen uger endnu</p>`
          }
        </div>

        <div class="actions">
          <button class="btn btn-secondary" id="restartFlowBtn">Start over</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("restartFlowBtn").addEventListener("click", () => {
    state.currentStep = 1;
    state.documentFile = null;
    state.extractedData = null;
    state.confirmedPlan = null;
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

const SUPABASE_FUNCTION_URL =
  "https://flecimbpfuzlflyvgjrk.supabase.co/functions/v1/analyze-course";

const SUPABASE_ANON_KEY_TRIMMED = SUPABASE_ANON_KEY.trim();

const TOTAL_STEPS = 5;

const state = {
  currentStep: 1,
  documentFile: null,
  pdfPreviewUrl: "",
  docxPreviewHtml: "",
  docxPreviewStatus: "idle", // idle | loading | ready | error
  extractedData: null,
  confirmedPlan: null,
  analysisStatus: "idle", // idle | running | success | error
  analysisError: "",
  rawItems: [],
  segmentCount: 0,
  inferredYear: "",
};

function resetFlowState() {
  if (state.pdfPreviewUrl) {
    URL.revokeObjectURL(state.pdfPreviewUrl);
  }

  state.currentStep = 1;
  state.documentFile = null;
  state.pdfPreviewUrl = "";
  state.docxPreviewHtml = "";
  state.docxPreviewStatus = "idle";
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

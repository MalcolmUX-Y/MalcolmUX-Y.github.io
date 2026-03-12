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

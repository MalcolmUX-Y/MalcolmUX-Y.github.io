async function runDocumentAnalysis() {
  if (!state.documentFile) {
    state.analysisStatus = "error";
    state.analysisError = "Ingen fil valgt.";
    renderApp();
    return;
  }

  try {
    state.analysisStatus = "running";
    state.analysisError = "";
    renderApp();

    const extractedText = await extractDocumentText(state.documentFile);
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

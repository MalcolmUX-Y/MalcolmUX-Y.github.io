function getFileType(file) {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return null;
}

async function extractDocxText(file) {
  if (!window.mammoth) {
    throw new Error("Mammoth.js mangler — DOCX kan ikke læses.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });

  const text = result?.value?.trim();
  if (!text) {
    throw new Error("DOCX-filen blev læst, men der blev ikke fundet nogen tekst.");
  }

  const filenameYearMatch = file.name.match(/\b(20\d{2})\b/);
  const filenameSeasonMatch = file.name.match(/\bF(\d{2})\b|\bE(\d{2})\b/i);
  const filenameYear =
    filenameYearMatch?.[1] ||
    (filenameSeasonMatch ? `20${filenameSeasonMatch[1] ?? filenameSeasonMatch[2]}` : null);

  const textYearMatch =
    text.match(
      /(?:mandag|tirsdag|onsdag|torsdag|fredag)[^.]{0,30}(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)[^\d]*(20\d{2})\b/i
    ) ||
    text.match(
      /(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(20\d{2})\b/i
    );

  state.inferredYear = textYearMatch?.[1] || filenameYear || "";

  return text;
}

async function extractDocumentText(file) {
  const type = getFileType(file);
  if (type === "pdf") return extractPdfText(file);
  if (type === "docx") return extractDocxText(file);
  throw new Error("Filformatet understøttes ikke. Upload en PDF eller DOCX.");
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

    const items = textContent.items.filter((item) => "str" in item && item.str.trim());
    if (!items.length) continue;

    const lines = [];
    let currentLine = [];
    let lastY = null;

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (lastY === null || Math.abs(y - lastY) > 3) {
        if (currentLine.length) lines.push(currentLine.join(" ").trim());
        currentLine = [item.str];
        lastY = y;
      } else {
        currentLine.push(item.str);
      }
    }
    if (currentLine.length) lines.push(currentLine.join(" ").trim());

    const splitLines = [];
    for (const line of lines) {
      const parts = line.split(/(?=\bKl\.)/);
      splitLines.push(...parts.map((p) => p.trim()).filter(Boolean));
    }

    pageTexts.push(splitLines.filter(Boolean).join("\n"));
  }

  const fullText = pageTexts
    .join("\n\n")
    .trim()
    .replace(/(?<!\n)(Kl\.)\s*(\d{1,2}[.:]\d{2})/g, "\n$1 $2");

  if (!fullText) {
    throw new Error("PDF'en blev læst, men der blev ikke fundet nogen tekst.");
  }

  const textYearMatch =
    fullText.match(/(?:mandag|tirsdag|onsdag|torsdag|fredag)[^.]{0,30}(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)[^\d]*(20\d{2})\b/i) ||
    fullText.match(/(?:mandag|tirsdag|onsdag|torsdag|fredag)[^.]{0,10}den\s+\d{1,2}\.\d{1,2}[^.]{0,10}(20\d{2})\b/i) ||
    fullText.match(/[Ss]emesterplan\s+\S*(20\d{2})\b/i) ||
    fullText.match(/(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(20\d{2})\b/i);
  const filenameYearMatch = state.documentFile?.name?.match(/\b(20\d{2})\b/);
  const filenameSeasonMatch = state.documentFile?.name?.match(/\bF(\d{2})\b|\bE(\d{2})\b/i);
  const filenameYear = filenameYearMatch?.[1] ||
    (filenameSeasonMatch ? `20${filenameSeasonMatch[1] ?? filenameSeasonMatch[2]}` : null);

  inferredYear = textYearMatch?.[1] || metaYear || filenameYear || "";

  state.inferredYear = inferredYear;

  return fullText;
}

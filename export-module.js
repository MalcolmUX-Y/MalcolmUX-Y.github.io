// ============================================================
// EXPORT MODULE — indsæt i script.js lige før renderApp()
// ============================================================

function exportAsTxt(plan) {
  const lines = [];
  lines.push(plan.title || "Untitled");
  lines.push("=".repeat(40));
  lines.push("");

  (plan.weeks || []).forEach((week) => {
    lines.push(`[${week.rawDate || week.date || "Ingen dato"}]`);
    lines.push(week.topic || "");
    if (week.readings?.length) {
      lines.push("Litteratur:");
      week.readings.forEach((r) => lines.push("  - " + r));
    }
    if (week.assignment) lines.push("Opgave: " + week.assignment);
    lines.push("");
  });

  triggerDownload(lines.join("\n"), (plan.title || "export") + ".txt", "text/plain");
}

function exportAsPdf(plan) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const marginLeft = 15;
  const marginRight = 195;
  const lineHeight = 6;
  let y = 20;

  const checkNewPage = () => {
    if (y > 270) { doc.addPage(); y = 20; }
  };

  // Titel
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(plan.title || "Untitled", marginLeft, y);
  y += 10;

  (plan.weeks || []).forEach((week) => {
    checkNewPage();

    // Dato
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(week.rawDate || week.date || "Ingen dato", marginLeft, y);
    y += lineHeight;

    // Emne
    doc.setFont("helvetica", "normal");
    const topicLines = doc.splitTextToSize(week.topic || "", marginRight - marginLeft);
    topicLines.forEach((line) => { checkNewPage(); doc.text(line, marginLeft, y); y += lineHeight; });

    // Litteratur
    if (week.readings?.length) {
      doc.setFont("helvetica", "italic");
      week.readings.forEach((r) => {
        checkNewPage();
        const rLines = doc.splitTextToSize("- " + r, marginRight - marginLeft - 4);
        rLines.forEach((line) => { checkNewPage(); doc.text(line, marginLeft + 4, y); y += lineHeight; });
      });
    }

    // Opgave
    if (week.assignment) {
      checkNewPage();
      doc.setFont("helvetica", "normal");
      const aLines = doc.splitTextToSize("Opgave: " + week.assignment, marginRight - marginLeft);
      aLines.forEach((line) => { checkNewPage(); doc.text(line, marginLeft, y); y += lineHeight; });
    }

    y += 3;
  });

  doc.save((plan.title || "export") + ".pdf");
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

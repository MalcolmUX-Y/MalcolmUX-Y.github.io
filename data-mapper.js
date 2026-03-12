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

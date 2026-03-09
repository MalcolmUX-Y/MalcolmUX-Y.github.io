import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CourseInfoItem = {
  type: "course_info";
  title: string;
  teachers: string[];
  schedule: string[];
  notes: string;
};

type SessionItem = {
  type: "session";
  date: string;
  topic: string;
  readings: string[];
  assignment: string;
  notes: string;
  sourceText: string;
};

type EventItem = {
  type: "event";
  date: string;
  title: string;
  notes: string;
};

type CourseItem = CourseInfoItem | SessionItem | EventItem;
type SegmentType = "course_info" | "session" | "event" | "ignore";

type PipelineTelemetry = {
  ignoredSegments: number;
  extractorPathCounts: {
    courseInfoHeuristic: number;
    eventHeuristic: number;
    sessionHeuristic: number;
    courseInfoClassifier: number;
    eventClassifier: number;
    sessionClassifier: number;
    fallbackLocal: number;
    classifierIgnored: number;
  };
  segmentItemYield: {
    totalSegments: number;
    nonEmptySegments: number;
    emptySegments: number;
    totalItems: number;
  };
};

function createPipelineTelemetry(): PipelineTelemetry {
  return {
    ignoredSegments: 0,
    extractorPathCounts: {
      courseInfoHeuristic: 0,
      eventHeuristic: 0,
      sessionHeuristic: 0,
      courseInfoClassifier: 0,
      eventClassifier: 0,
      sessionClassifier: 0,
      fallbackLocal: 0,
      classifierIgnored: 0,
    },
    segmentItemYield: {
      totalSegments: 0,
      nonEmptySegments: 0,
      emptySegments: 0,
      totalItems: 0,
    },
  };
}

function recordSegmentYield(
  telemetry: PipelineTelemetry,
  items: CourseItem[],
): CourseItem[] {
  telemetry.segmentItemYield.totalSegments += 1;
  telemetry.segmentItemYield.totalItems += items.length;

  if (items.length > 0) {
    telemetry.segmentItemYield.nonEmptySegments += 1;
  } else {
    telemetry.segmentItemYield.emptySegments += 1;
  }

  return items;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function preprocessText(text: string): string {
  // Insert newlines before Danish date patterns so they become separate lines
  // E.g., "...content Mandag d. 4. februar: next topic..." → "...content\nMandag d. 4. februar: next topic..."
  return text.replace(
    /([^\n])\s+((?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+(?:d\.|den)?\s*\d{1,2}\s*\.?\s*(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec))/gi,
    "$1\n$2"
  );
}

function normalizeLines(text: string): string[] {
  const preprocessed = preprocessText(text);
  return preprocessed
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function isWeekLine(line: string): boolean {
  return /^(?:uge|week)\s+\d+\b/i.test(line);
}

function isDateLine(line: string): boolean {
  // Matches: "Mandag d. 4. februar", "Onsdag d. 11. februar", "Torsdag d. 9. april", etc.
  const danishDatePattern = /^(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b\s+(?:d\.|den)?\s+\d{1,2}\s*\.?\s*(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)/i;
  
  if (danishDatePattern.test(line)) {
    return true;
  }

  // Fallback to original pattern for other formats
  const weekdayMonthPattern =
    /^(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b[\s,:-]*)?(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{1,2}\.?\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b)/i;

  return weekdayMonthPattern.test(line);
}

function isEventHeaderLine(line: string): boolean {
  return /^(obs\b|deadline\b|seminar\b|workshop\b|påskeferie\b|ferie\b|feedback\b|vejledning\b|afslutning\b|talefest\b|skriveøvelse\b)/i
    .test(line);
}

function isCourseMetaHeaderLine(line: string): boolean {
  return /^(underviser|undervisning|litteratur|litteraturforkortelser|forkortelser|kursusbeskrivelse|eksamen|brightspace|lokale|kursusmetadata|kontakt|materiale|læseplan|curriculum)\b/i
    .test(line);
}

function segmentText(text: string): string[] {
  const lines = normalizeLines(text);

  if (lines.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let currentSegment: string[] = [];
  let activeWeekLine = "";
  let hasSeenTimelineAnchor = false;

  const pushCurrentSegment = () => {
    const segment = currentSegment
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .join("\n");

    if (segment) {
      segments.push(segment);
    }

    currentSegment = [];
  };

  for (const line of lines) {
    if (isWeekLine(line)) {
      if (currentSegment.length > 0) {
        pushCurrentSegment();
      }

      activeWeekLine = line;
      hasSeenTimelineAnchor = true;
      continue;
    }

    const startsOwnSegment = isDateLine(line) || isEventHeaderLine(line) ||
      isCourseMetaHeaderLine(line);

    if (startsOwnSegment) {
      if (currentSegment.length > 0) {
        pushCurrentSegment();
      }

      if (activeWeekLine && !isCourseMetaHeaderLine(line)) {
        currentSegment.push(activeWeekLine);
      }

      currentSegment.push(line);

      if (isDateLine(line) || isEventHeaderLine(line)) {
        hasSeenTimelineAnchor = true;
      }

      continue;
    }

    if (currentSegment.length === 0 && activeWeekLine && hasSeenTimelineAnchor) {
      currentSegment.push(activeWeekLine);
    }

    currentSegment.push(line);
  }

  if (currentSegment.length > 0) {
    pushCurrentSegment();
  }

  return segments.filter(Boolean);
}

/* ---------------- LOCAL FALLBACK PARSER ---------------- */

function extractDateFromLine(line: string): string | null {
  // Try Danish format first: "Mandag d. 4. februar"
  const danishMatch = line.match(
    /(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)?\s*(?:d\.|den)?\s*(\d{1,2})\s*\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)/i,
  );

  if (danishMatch) {
    return danishMatch[0];
  }

  // Fallback to other formats
  const match = line.match(
    /(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)?\s*d?\.\s*\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)/i,
  );

  return match ? match[0] : null;
}

function looksLikeEventLine(line: string): boolean {
  return /deadline|seminar|ferie|feedback|vejledning|afslutning/i.test(line);
}

function localParseSegment(segment: string): CourseItem[] {
  // Keep blank lines for conservative section continuation logic
  const rawLines = segment.split("\n").map((l) => l.trim());
  const lines = rawLines.filter(Boolean);

  if (!lines.length) return [];

  // Keep existing week-line/header fix: ignore week lines like "Uge 12" for header/content
  const nonWeekLines = lines.filter((line) => !isWeekLine(line));
  if (!nonWeekLines.length) return [];

  const headerLine = nonWeekLines[0];
  const dateSourceLine = lines.find((line) => isDateLine(line)) ?? headerLine;
  const date = extractDateFromLine(dateSourceLine) ?? "";

  // Preserve prior classification behavior: do not change looksLikeEventLine(...) input
  if (looksLikeEventLine(segment)) {
    const content = nonWeekLines.slice(1).join(" ");
    return [
      {
        type: "event",
        date,
        title: headerLine,
        notes: content,
        sourceText: segment,
      } as any,
    ];
  }

  // v1.2.1: structure session content into readings/assignment/notes (conservative)
  const rawNonWeekLines = rawLines.filter((line) => !isWeekLine(line));
  const firstContentIdx = rawNonWeekLines.findIndex(
    (l) => l.length > 0 && l === headerLine,
  );
  const parsedContentLines =
    firstContentIdx >= 0 ? rawNonWeekLines.slice(firstContentIdx + 1) : [];

  const hasMeaningfulContentLines = parsedContentLines.some(
    (l) => l.trim().length > 0,
  );
  const parseHeaderAsContent = !hasMeaningfulContentLines;

  const stripBullet = (s: string) =>
    s.replace(/^(?:[-*•‣∙]\s+|\d+\.\s+)/, "").trim();

  const pushReadings = (target: string[], text: string) => {
    const cleaned = stripBullet(text).trim();
    if (!cleaned) return;
    for (const item of cleaned.split(/[•]/g)) {
      const v = item.trim();
      if (v) target.push(v);
    }
  };

  /* ---------------- AU COMPACT SINGLE-LINE PATH ---------------- */
  // Many AU session lines are a single line: "Mandag d. 9. februar: Topic • Reading • ... • Genstand: ... OBS"
  // Only apply when there are no separate content lines (so multi-line behavior stays unchanged).
  if (parseHeaderAsContent) {
    const hasAuBullets = /[•]/.test(headerLine);

    // Remove the *leading date* from the original header line (not via replacing the abbreviated extracted `date`)
    const leadingDateRe =
      /^\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:d\.|den)?\s*\d{1,2}\.?\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s*:?\s*/i;

    if (hasAuBullets && leadingDateRe.test(headerLine)) {
      const afterDate = headerLine.replace(leadingDateRe, "").trim();

      const parts = afterDate
        .split(/[•]/g)
        .map((p) => stripBullet(p).trim())
        .filter(Boolean);

      let topic = parts[0] ?? afterDate;
      topic = topic.replace(/^\s*[:\-–,]+\s*/, "").trim();

      const readings: string[] = [];
      const assignmentParts: string[] = [];
      const notesParts: string[] = [];

      const tailMarkerRe = /\b(?:genstande?|supplerende|obs)\b\s*(?::|,|[-–])?/i;

      // v1.2.2: improved tail-note classification for compact AU lines.
      const isTailNoteItem = (s: string) => {
        const t = s.trim();
        if (!t) return false;

        const startsWithTailMarker = new RegExp(
          `^(?:genstande?|supplerende|obs)\\b\\s*(?::|,|[-–])?`,
          "i",
        ).test(t);

        const startsWithOtherNoteish =
          /^(?:note\b|lokale\b|rum\b|sted\b|zoom\b|teams\b|link\b|kl\.|tid\b)\b/i.test(
            t,
          );

        const containsObsAnywhere = /\bobs\b/i.test(t);

        return startsWithTailMarker || startsWithOtherNoteish || containsObsAnywhere;
      };

      const assignmentMarkerRe =
        /^(?:opgave|assignment|forbered|prepare)\b\s*(?::|,|[-–])\s*(.*)$/i;

      const splitOnTailMarker = (value: string): {
        found: boolean;
        readingPart: string;
        notePart: string;
        markerIndex: number;
      } => {
        const m = tailMarkerRe.exec(value);
        if (!m || typeof m.index !== "number") {
          return { found: false, readingPart: "", notePart: "", markerIndex: -1 };
        }
        const idx = m.index;
        return {
          found: true,
          markerIndex: idx,
          readingPart: value.slice(0, idx).trim(),
          notePart: value.slice(idx).trim(),
        };
      };

      let inNotes = false;
      for (const p of parts.slice(1)) {
        const assignmentMatch = p.match(assignmentMarkerRe);
        if (assignmentMatch) {
          const remainder = (assignmentMatch[1] ?? "").trim();
          if (remainder) assignmentParts.push(stripBullet(remainder));
          continue;
        }

        if (inNotes) {
          notesParts.push(p);
          continue;
        }

        // NEW: mid-item split when a tail marker occurs inside the bullet item.
        const midSplit = splitOnTailMarker(p);
        if (midSplit.found) {
          // If marker is at the beginning, treat whole item as notes.
          if (!midSplit.readingPart || midSplit.markerIndex === 0 || isTailNoteItem(p)) {
            inNotes = true;
            notesParts.push(p);
            continue;
          }

          // Otherwise: reading part before marker, notes from marker onward.
          pushReadings(readings, midSplit.readingPart);
          inNotes = true;
          notesParts.push(midSplit.notePart);
          continue;
        }

        // Existing tail routing (start-of-item markers etc.)
        if (isTailNoteItem(p)) {
          inNotes = true;
          notesParts.push(p);
          continue;
        }

        pushReadings(readings, p);
      }

      return [
        {
          type: "session",
          date,
          topic,
          readings,
          assignment: assignmentParts.join(" ").trim(),
          notes: notesParts.join(" ").trim(),
          sourceText: segment,
        } as any,
      ];
    }
  }

  /* ---------------- EXISTING MULTI-LINE / LABEL-BASED PATH ---------------- */

  const contentLines = parseHeaderAsContent ? [headerLine] : parsedContentLines;

  const readingsLabelRe =
    /^(?:pensum|litteratur|reading|readings|tekst)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  // Conservative inline support (requires a delimiter after the keyword)
  const readingsInlineLabelRe =
    /^(.*?)(?:\b(?:pensum|litteratur|reading|readings|tekst)\b)\s*(?::|,|[-–])\s*(.*)$/i;

  const assignmentLabelRe =
    /^(?:opgave|assignment|forbered|prepare)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  const isBulletish = (s: string) => /^(?:[-*•‣∙]\s+|\d+\.\s+)/.test(s);

  const looksLikeOtherHeading = (s: string) =>
    /^[^:]{2,40}:\s*\S+/.test(s) &&
    !readingsLabelRe.test(s) &&
    !assignmentLabelRe.test(s);

  // Topic defaults to headerLine; for compact-fallback (no AU bullets matched), clean by removing leading date safely
  let topic = headerLine;
  if (parseHeaderAsContent) {
    const leadingDateReFallback =
      /^\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:d\.|den)?\s*\d{1,2}\.?\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s*:?\s*/i;
    const stripped = headerLine.replace(leadingDateReFallback, "").trim();
    if (stripped) topic = stripped;
  }

  type Section = "readings" | "assignment" | "notes";
  let section: Section = "notes";
  let justEnteredLabeledSection = false;

  const readings: string[] = [];
  const assignmentParts: string[] = [];
  const notesParts: string[] = [];

  for (const rawLine of contentLines) {
    const line = rawLine.trim();

    if (!line) {
      section = "notes";
      justEnteredLabeledSection = false;
      continue;
    }

    const readingsMatch = line.match(readingsLabelRe);
    if (readingsMatch) {
      section = "readings";
      justEnteredLabeledSection = true;
      pushReadings(readings, (readingsMatch[1] ?? "").trim());
      continue;
    }

    const readingsInlineMatch = line.match(readingsInlineLabelRe);
    if (readingsInlineMatch) {
      const prefix = stripBullet((readingsInlineMatch[1] ?? "").trim());
      const remainder = (readingsInlineMatch[2] ?? "").trim();

      if (prefix) {
        if (parseHeaderAsContent) {
          topic = prefix;
        } else {
          notesParts.push(prefix);
        }
      }

      section = "readings";
      justEnteredLabeledSection = true;
      pushReadings(readings, remainder);
      continue;
    }

    const assignmentMatch = line.match(assignmentLabelRe);
    if (assignmentMatch) {
      section = "assignment";
      justEnteredLabeledSection = true;
      const remainder = stripBullet((assignmentMatch[1] ?? "").trim());
      if (remainder) assignmentParts.push(remainder);
      continue;
    }

    const cleaned = stripBullet(line);
    if (!cleaned) continue;

    const canContinueInSection =
      isBulletish(line) ||
      (justEnteredLabeledSection && !looksLikeOtherHeading(cleaned));

    if (section === "readings" && canContinueInSection) {
      pushReadings(readings, cleaned);
      justEnteredLabeledSection = false;
      continue;
    }

    if (section === "assignment" && canContinueInSection) {
      assignmentParts.push(cleaned);
      justEnteredLabeledSection = false;
      continue;
    }

    if (parseHeaderAsContent) {
      topic = cleaned;
      section = "notes";
      justEnteredLabeledSection = false;
      continue;
    }

    section = "notes";
    justEnteredLabeledSection = false;
    notesParts.push(cleaned);
  }

  return [
    {
      type: "session",
      date,
      topic,
      readings,
      assignment: assignmentParts.join(" ").trim(),
      notes: notesParts.join(" ").trim(),
      sourceText: segment,
    } as any,
  ];
}

function extractTextOutput(data: any): string {
  // OpenAI ChatCompletion response format
  if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
    const firstChoice = data.choices[0];
    if (typeof firstChoice?.message?.content === "string") {
      return firstChoice.message.content.trim();
    }
  }

  return "";
}

function safeParseJson(text: string): { items: unknown[] } {
  try {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      return { items: [] };
    }

    return { items: parsed.items };
  } catch {
    return { items: [] };
  }
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    ];
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeItem(raw: unknown): CourseItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const type = toStringValue(item.type).toLowerCase();

  if (type === "course_info") {
    const normalized: CourseInfoItem = {
      type: "course_info",
      title: toStringValue(item.title),
      teachers: toStringArray(item.teachers),
      schedule: toStringArray(item.schedule),
      notes: toStringValue(item.notes),
    };

    const hasData =
      !!normalized.title ||
      normalized.teachers.length > 0 ||
      normalized.schedule.length > 0 ||
      !!normalized.notes;

    return hasData ? normalized : null;
  }

  if (type === "session") {
    const normalized: SessionItem = {
  type: "session",
  date: toStringValue(item.date),
  topic: toStringValue(item.topic),
  readings: toStringArray(item.readings),
  assignment: toStringValue(item.assignment),
  notes: toStringValue(item.notes),
  sourceText: toStringValue(item.sourceText),
};

    const hasData =
      !!normalized.date ||
      !!normalized.topic ||
      normalized.readings.length > 0 ||
      !!normalized.assignment ||
      !!normalized.notes;

    return hasData ? normalized : null;
  }

  if (type === "event") {
    const normalized: EventItem = {
      type: "event",
      date: toStringValue(item.date),
      title: toStringValue(item.title),
      notes: toStringValue(item.notes),
    };

    const hasData =
      !!normalized.date || !!normalized.title || !!normalized.notes;

    return hasData ? normalized : null;
  }

  return null;
}

function normalizeItems(rawItems: unknown[]): CourseItem[] {
  return rawItems
    .map(normalizeItem)
    .filter((item): item is CourseItem => item !== null);
}

function cleanAndMergeItems(items: CourseItem[]): CourseItem[] {
  const mergedCourseInfo: CourseInfoItem = {
    type: "course_info",
    title: "",
    teachers: [],
    schedule: [],
    notes: "",
  };

  const sessionMap = new Map<string, SessionItem>();
  const eventMap = new Map<string, EventItem>();

  for (const item of items) {
    if (item.type === "course_info") {
      if (!mergedCourseInfo.title && item.title) {
        mergedCourseInfo.title = item.title;
      }

      mergedCourseInfo.teachers.push(...item.teachers);
      mergedCourseInfo.schedule.push(...item.schedule);

      if (!mergedCourseInfo.notes && item.notes) {
        mergedCourseInfo.notes = item.notes;
      }

      continue;
    }

    if (item.type === "session") {
      const key = [
        item.date.toLowerCase(),
        item.topic.toLowerCase(),
        item.readings.join("|").toLowerCase(),
        item.assignment.toLowerCase(),
        item.notes.toLowerCase(),
      ].join("::");

      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
  type: "session",
  date: item.date,
  topic: item.topic,
  readings: [...new Set(item.readings.filter(Boolean))],
  assignment: item.assignment,
  notes: item.notes,
  sourceText: item.sourceText,
});
      }

      continue;
    }

    if (item.type === "event") {
      const key = [
        item.date.toLowerCase(),
        item.title.toLowerCase(),
        item.notes.toLowerCase(),
      ].join("::");

      if (!eventMap.has(key)) {
        eventMap.set(key, item);
      }
    }
  }

  mergedCourseInfo.teachers = [
    ...new Set(mergedCourseInfo.teachers.filter(Boolean)),
  ];
  mergedCourseInfo.schedule = [
    ...new Set(mergedCourseInfo.schedule.filter(Boolean)),
  ];

  const hasCourseInfo =
    !!mergedCourseInfo.title ||
    mergedCourseInfo.teachers.length > 0 ||
    mergedCourseInfo.schedule.length > 0 ||
    !!mergedCourseInfo.notes;

  const mergedItems: CourseItem[] = [];

  if (hasCourseInfo) {
    mergedItems.push(mergedCourseInfo);
  }

  mergedItems.push(...Array.from(sessionMap.values()));
  mergedItems.push(...Array.from(eventMap.values()));

  return mergedItems;
}

async function callOpenAI(input: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: input,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return extractTextOutput(data);
}

function looksLikeCourseInfo(segment: string): boolean {
  return /(?:undviser|undervisning|litteratur|forkortelser|kursusbeskrivelse|læseplan|materiale|kontakt|om kurset)/i
    .test(segment);
}

function looksLikeSession(segment: string): boolean {
  // Danish university course pattern: Mandag d. X, Onsdag d. Y with content about readings/assignments
  const hasDanishDate = /mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag.*(?:d\.|den)?\s*\d{1,2}/i.test(segment);
  const hasSessionContent =
    /læsestof|readings?:|genstand:|supplerende:|øvelser|session|tema|emne|diskussion|case-arbejde|vejledning/i
      .test(segment);

  return hasDanishDate || hasSessionContent;
}

function looksLikeEvent(segment: string): boolean {
  return /\b(?:obs|deadline|seminar|workshop|påskeferie|ferie|feedback|vejledning|afslutning|talefest|skriveøvelse|midtvejsevaluering|individuel vejledning|gruppearbejde)\b/i
    .test(segment);
}

function shouldIgnoreSegment(segment: string): boolean {
  const compact = normalizeWhitespace(segment);

  if (!compact) {
    return true;
  }

  if (compact.length < 12) {
    return true;
  }

  return false;
}

async function classifySegment(
  segment: string,
  apiKey: string,
): Promise<SegmentType> {
  const prompt = `
Return ONLY valid JSON.
{
"type": "course_info" | "session" | "event" | "ignore"
}
Segment:
${segment}
`.trim();

  const textOutput = await callOpenAI(prompt, apiKey);

  if (!textOutput) {
    return "ignore";
  }

  try {
    const parsed = JSON.parse(textOutput);
    const type = typeof parsed?.type === "string"
      ? parsed.type.trim().toLowerCase()
      : "";

    if (
      type === "course_info" ||
      type === "session" ||
      type === "event" ||
      type === "ignore"
    ) {
      return type;
    }

    return "ignore";
  } catch {
    return "ignore";
  }
}

async function extractCourseInfo(
  segment: string,
  apiKey: string,
): Promise<CourseItem[]> {
  const prompt = `Extract course metadata from a university syllabus. Look for:
- Course title/name
- Teachers/instructors (underviser, v/, led af, instruktør)
- Schedule/meeting times (Mandag kl., Onsdag kl., etc.)
- Reading materials/textbooks
- Course description
- Course code
- Meeting locations (lokale)
- Exam format

Return JSON with this structure:
{
  "type": "course_info",
  "title": "course name/title",
  "teachers": ["list of instructor names"],
  "schedule": ["list of meeting times (e.g., 'Mandag kl. 11-14', 'Onsdag kl. 10-13')"],
  "notes": "other course metadata (exam format, materials abbreviations, etc.)"
}

Return {"items": []} if no course info found.

Text:
${segment}`;

  try {
    const textOutput = await callOpenAI(prompt, apiKey);
    const parsed = safeParseJson(textOutput);
    const normalized = normalizeItems(parsed.items);
    return normalized.length > 0 ? normalized : localParseSegment(segment);
  } catch {
    return localParseSegment(segment);
  }
}

async function extractEvent(
  segment: string,
  apiKey: string,
): Promise<CourseItem[]> {
  const prompt = `Extract event information from this text. Look for special events like:
- OBS (observations/announcements)
- DEADLINE
- Seminar
- Workshop
- Ferie (holidays)
- Feedback
- Vejledning (guidance)
- Afslutning (conclusion)
- Talefest (speech competition)
- Skriveøvelse (writing exercise)
- Midtvejsevaluering (midterm evaluation)
- Gruppeworkshop

Return JSON array with this structure for EACH event:
{
  "type": "event",
  "date": "extracted date (e.g., 'Mandag d. 9. februar' or 'Onsdag 25. marts')",
  "title": "event name/title",
  "notes": "additional details"
}

Return {"items": []} if no events found.

Text:
${segment}`;

  try {
    const textOutput = await callOpenAI(prompt, apiKey);
    const parsed = safeParseJson(textOutput);
    const normalized = normalizeItems(parsed.items);
    return normalized.length > 0 ? normalized : localParseSegment(segment);
  } catch {
    return localParseSegment(segment);
  }
}

async function extractSession(
  segment: string,
  apiKey: string,
): Promise<CourseItem[]> {
  const prompt = `You are parsing a university course syllabus. Extract ALL individual sessions from this text.
Each session is marked by a Danish date like "Mandag d. 4. februar:" or "Onsdag d. 11. februar:".

For EACH session found, return as JSON array with this structure:
{
  "type": "session",
  "date": "extracted date only (e.g., 'Mandag d. 4. februar')",
  "topic": "first topic/title after the date",
  "readings": ["list of readings mentioned"],
  "assignment": "assignment if mentioned, else empty string",
  "notes": "rest of the content for that session"
}

Important:
- If there are MULTIPLE sessions, return MULTIPLE objects in the "items" array
- Extract dates AS-IS (don't convert to YYYY-MM-DD)
- Keep readings as a list
- Return {"items": []} if no sessions found

Text:
${segment}`;

  try {
    const textOutput = await callOpenAI(prompt, apiKey);
    const parsed = safeParseJson(textOutput);
    const normalized = normalizeItems(parsed.items);
    return normalized.length > 0 ? normalized : localParseSegment(segment);
  } catch {
    return localParseSegment(segment);
  }
}

async function analyzeSegmentWithPipeline(
  segment: string,
  apiKey: string,
  telemetry: PipelineTelemetry,
): Promise<CourseItem[]> {
  if (shouldIgnoreSegment(segment)) {
    telemetry.ignoredSegments += 1;
    return recordSegmentYield(telemetry, []);
  }

  if (looksLikeCourseInfo(segment)) {
    telemetry.extractorPathCounts.courseInfoHeuristic += 1;
    const items = await extractCourseInfo(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  if (looksLikeEvent(segment)) {
    telemetry.extractorPathCounts.eventHeuristic += 1;
    const items = await extractEvent(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  if (looksLikeSession(segment)) {
    telemetry.extractorPathCounts.sessionHeuristic += 1;
    const items = await extractSession(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  const type = await classifySegment(segment, apiKey);

  if (type === "course_info") {
    telemetry.extractorPathCounts.courseInfoClassifier += 1;
    const items = await extractCourseInfo(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  if (type === "event") {
    telemetry.extractorPathCounts.eventClassifier += 1;
    const items = await extractEvent(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  if (type === "session") {
    telemetry.extractorPathCounts.sessionClassifier += 1;
    const items = await extractSession(segment, apiKey);
    return recordSegmentYield(telemetry, items);
  }

  /* LOCAL FALLBACK */
  telemetry.extractorPathCounts.classifierIgnored += 1;
  telemetry.extractorPathCounts.fallbackLocal += 1;
  const localItems = localParseSegment(segment);
  if (localItems.length > 0) {
    return recordSegmentYield(telemetry, localItems);
  }

  return recordSegmentYield(telemetry, []);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text'" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY missing" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const segments = segmentText(text);
    const telemetry = createPipelineTelemetry();
    const allItems: CourseItem[] = [];

    for (const segment of segments) {
      const items = await analyzeSegmentWithPipeline(
        segment,
        OPENAI_API_KEY,
        telemetry,
      );
      allItems.push(...items);
    }

    const cleanedItems = cleanAndMergeItems(allItems);

    const fallbackRate = telemetry.segmentItemYield.totalSegments > 0
      ? telemetry.extractorPathCounts.fallbackLocal /
        telemetry.segmentItemYield.totalSegments
      : 0;

    const nonEmptyItemYield = telemetry.segmentItemYield.totalSegments > 0
      ? telemetry.segmentItemYield.nonEmptySegments /
        telemetry.segmentItemYield.totalSegments
      : 0;

    console.log(
      JSON.stringify({
        type: "analyze-course.telemetry",
        segmentCount: segments.length,
        fallbackRate,
        nonEmptyItemYield,
        extractorPathCounts: telemetry.extractorPathCounts,
        segmentItemYield: telemetry.segmentItemYield,
      }),
    );

    return new Response(
      JSON.stringify({
        segmentCount: segments.length,
        items: cleanedItems,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});

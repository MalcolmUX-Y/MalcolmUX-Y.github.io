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
  details: string;
  sourceText: string;
};

type CourseItem = CourseInfoItem | SessionItem | EventItem;

type SegmentTelemetry = {
  totalSegments: number;
  extractedSegments: number;
  localParsedSegments: number;
  yieldedItems: number;
};

type AnalyzeResponse = {
  segmentCount: number;
  items: CourseItem[];
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function isWeekLine(line: string): boolean {
  return /^uge\s*\d+/i.test(line.trim());
}

function isDateLine(line: string): boolean {
  return (
    /(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/i.test(line) &&
    /(?:d\.|den)?\s*\d{1,2}/i.test(line)
  );
}

function extractDateFromLine(line: string): string | null {
  const match = line.match(
    /(?:(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)?\s*d?\.\s*\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december))/i,
  );

  return match ? match[0] : null;
}

function looksLikeEventLine(line: string): boolean {
  return /deadline|seminar|ferie|feedback|vejledning|afslutning/i.test(line);
}

function looksLikeCourseInfo(segment: string): boolean {
  return /(?:undviser|undervisning|litteratur|forkortelser|kursusbeskrivelse|læseplan|materiale|kontakt|om kurset)/i
    .test(segment);
}

function isDateTimeOnlySegment(segment: string): boolean {
  const lines = segment
    .split("\n")
    .map((l) => normalizeWhitespace(l))
    .filter(Boolean)
    .filter((l) => !isWeekLine(l));

  if (!lines.length) return true;

  const timeRe =
    /\b(?:kl\.?\s*)?\d{1,2}(?:[:.]\d{2})\b(?:\s*[-–]\s*(?:kl\.?\s*)?\d{1,2}(?:[:.]\d{2})\b)?/i;

  return lines.every((l) => {
    const compact = normalizeWhitespace(l);
    if (isDateLine(compact)) {
  const afterDate = compact.replace(
    /^\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:(?:d\.|den)\s*)?\d{1,2}\.?(?:\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b)?\s*/i,
    "",
  );

  const rest = afterDate.replace(timeRe, "").trim();
  if (!rest || rest.length <= 2 || /^[\-–—:.,()\s]+$/.test(rest)) return true;
  return false;
}
    if (timeRe.test(compact) && compact.replace(timeRe, "").trim().length <= 2) {
      return true;
    }
    return /^[\-–—:.,()\s]+$/.test(compact);
  });
}

function hasMeaningfulSessionSignal(segment: string): boolean {
  const compact = normalizeWhitespace(segment);

  if (!compact) return false;
  if (isDateTimeOnlySegment(segment)) return false;

  const hasReadings =
    /\b(?:pensum|litteratur|læsestof|reading|readings|tekst)\b/i.test(compact);

  const hasAssignment =
    /\b(?:opgave|assignment|forbered|prepare|genstande?)\b/i.test(compact);

  const hasNotesLabel =
    /\b(?:obs|supplerende)\b\s*(?::|,|[-–])?/i.test(compact);

  const hasTeachingHeader =
    /\b(?:forelæsning|undervisning|øvelse|øvelser|hold(?:time)?|workshop|case(?:-arbejde)?|diskussion|tema|emne)\b/i
      .test(compact);

  const afterLeadingDate = compact.replace(
  /^\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:(?:d\.|den)\s*)?\d{1,2}\.?(?:\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b)?\s*:?-?\s*/i,
  "",
).trim();

  const hasTopicAfterDate =
    afterLeadingDate.length >= 6 && /[A-Za-zÆØÅæøå]/.test(afterLeadingDate);

  return (
    hasTopicAfterDate || hasReadings || hasAssignment || hasNotesLabel ||
    hasTeachingHeader
  );
}

function looksLikeSession(segment: string): boolean {
  const hasDanishDate =
    /mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag.*(?:d\.|den)?\s*\d{1,2}/i
      .test(segment);

  const hasLegacySessionContent =
    /læsestof|readings?:|genstand:|genstande:|supplerende:|øvelser|session|tema|emne|diskussion|case-arbejde|vejledning/i
      .test(segment);

  if (!hasDanishDate && looksLikeCourseInfo(segment)) return false;
  if (isDateTimeOnlySegment(segment)) return false;

  const hasMeaningfulSignal =
    hasLegacySessionContent || hasMeaningfulSessionSignal(segment);

  return (hasDanishDate && hasMeaningfulSignal) ||
    (!hasDanishDate && hasMeaningfulSessionSignal(segment));
}

function looksLikeEvent(segment: string): boolean {
  if (hasMeaningfulSessionSignal(segment) || looksLikeSession(segment)) return false;

  return /\b(?:obs|deadline|seminar|workshop|påskeferie|ferie|feedback|vejledning|afslutning|talefest|skriveøvelse|midtvejsevaluering|individuel vejledning|gruppearbejde)\b/i
    .test(segment);
}

function localParseSegment(segment: string): CourseItem[] {
  const stripBullet = (s: string) =>
    s.replace(/^(?:[-*•‣∙]\s+|\d+\.\s+)/, "").trim();

  const pushReadings = (arr: string[], s: string) => {
    const cleaned = stripBullet(s);
    if (!cleaned) return;
    arr.push(cleaned);
  };

  const rawLines = segment.split("\n").map((l) => l.trim());
  const lines = rawLines.filter(Boolean);

  if (!lines.length) return [];

  const nonWeekLines = lines.filter((line) => !isWeekLine(line));
  if (!nonWeekLines.length) return [];

  if (isDateTimeOnlySegment(segment)) return [];

  const hasAnyDate = lines.some((line) => isDateLine(line));
  if (!hasAnyDate && looksLikeCourseInfo(segment)) {
    return [
      {
        type: "course_info",
        title: "",
        teachers: [],
        schedule: [],
        notes: nonWeekLines.join(" ").trim(),
      } as any,
    ];
  }

  const headerLine = nonWeekLines[0];
  const dateSourceLine = lines.find((line) => isDateLine(line)) ?? headerLine;
  const date = extractDateFromLine(dateSourceLine) ?? "";

  const remainingLines = nonWeekLines.slice(1);
  const bodyJoined = remainingLines.join("\n").trim();

  const hasSessionMarkers =
    /pensum|litteratur|readings?:|opgave|assignment|forbered|tema|emne|øvelse|genstand|supplerende|obs/i
      .test(segment);

  if (
    !hasSessionMarkers && looksLikeEventLine(headerLine) &&
    !hasMeaningfulSessionSignal(segment)
  ) {
    return [
      {
        type: "event",
        date,
        title: normalizeWhitespace(headerLine),
        details: normalizeWhitespace(bodyJoined),
        sourceText: segment,
      } as any,
    ];
  }

  const parseHeaderAsContent = !/[:\-–]/.test(headerLine) &&
    !looksLikeEventLine(headerLine) &&
    remainingLines.length > 0;

  // ---------------- EXISTING "AU compact bullets" fallback ----------------
  const auCompactMatch = segment.match(
    /^(?<day>(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag))\s+(?<rest>[\s\S]*)$/i,
  );

  if (auCompactMatch?.groups?.rest && parseHeaderAsContent) {
    const extractedDate = extractDateFromLine(segment) ?? "";
    const afterDate = extractedDate
      ? normalizeWhitespace(segment.replace(extractedDate, "")).trim()
      : normalizeWhitespace(auCompactMatch.groups.rest.trim());

    const parts = afterDate
      .split(/,\s*/)
      .map((p) => p.trim())
      .filter(Boolean);

    let topic = parts[0] ?? afterDate;
    topic = topic.replace(/^\s*[:\-–,]+\s*/, "").trim();

    const readings: string[] = [];
    const assignmentParts: string[] = [];
    const notesParts: string[] = [];

    const genstandMarkerRe = /\b(?:genstande?)\b\s*(?::|,|[-–])?/i;
    const tailMarkerRe = /\b(?:genstande?|supplerende|obs)\b\s*(?::|,|[-–])?/i;

    const isTailNotesItem = (s: string) => {
      const t = s.trim();
      if (!t) return false;

      const startsWithNotesMarker = new RegExp(
        `^(?:supplerende|obs)\\b\\s*(?::|,|[-–])?`,
        "i",
      ).test(t);

      const startsWithOtherNoteish =
        /^(?:note\b|lokale\b|rum\b|sted\b|zoom\b|teams\b|link\b|kl\.|tid\b)\b/i
          .test(t);

      const containsObsAnywhere = /\bobs\b/i.test(t);

      return startsWithNotesMarker || startsWithOtherNoteish || containsObsAnywhere;
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

    const pushReadingsAu = (arr: string[], s: string) => {
      const cleaned = stripBullet(s);
      if (!cleaned) return;
      if (assignmentMarkerRe.test(cleaned)) return;
      if (looksLikeEventLine(cleaned)) return;
      arr.push(cleaned);
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

      const midSplit = splitOnTailMarker(p);
      if (midSplit.found) {
        const tail = midSplit.notePart;

        if (genstandMarkerRe.test(tail)) {
          if (midSplit.readingPart) {
            pushReadingsAu(readings, midSplit.readingPart);
          }
          const remainder = tail
            .replace(/^(?:genstande?)\b\s*(?::|,|[-–])?\s*/i, "")
            .trim();
          if (remainder) assignmentParts.push(stripBullet(remainder));
          continue;
        }

        if (
          !midSplit.readingPart ||
          midSplit.markerIndex === 0 ||
          isTailNotesItem(p)
        ) {
          inNotes = true;
          notesParts.push(p);
          continue;
        }

        pushReadingsAu(readings, midSplit.readingPart);
        inNotes = true;
        notesParts.push(tail);
        continue;
      }

      if (/^(?:genstande?)\b\s*(?::|,|[-–])?/i.test(p)) {
        const remainder = p
          .replace(/^(?:genstande?)\b\s*(?::|,|[-–])?\s*/i, "")
          .trim();
        if (remainder) assignmentParts.push(stripBullet(remainder));
        continue;
      }

      if (isTailNotesItem(p)) {
        inNotes = true;
        notesParts.push(p);
        continue;
      }

      pushReadingsAu(readings, p);
    }

    const assignmentText = assignmentParts.join(" ").trim();
    const notesText = notesParts.join(" ").trim();
    const hasTopicSignal =
      topic.trim().length >= 6 && /[A-Za-zÆØÅæøå]/.test(topic);

    if (!hasTopicSignal && readings.length === 0 && !assignmentText && !notesText) {
      return [];
    }

    return [
      {
        type: "session",
        date: extractedDate || date,
        topic,
        readings,
        assignment: assignmentText,
        notes: notesText,
        sourceText: segment,
      } as any,
    ];
  }

  /* ---------------- EXISTING MULTI-LINE FALLBACK PARSER ---------------- */

  const readingsLabelRe =
    /^(?:pensum|litteratur|reading|readings|tekst)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  const readingsInlineLabelRe =
    /^(.*?)(?:\b(?:pensum|litteratur|reading|readings|tekst)\b)\s*(?::|,|[-–])\s*(.*)$/i;

  const assignmentLabelRe =
    /^(?:opgave|assignment|forbered|prepare)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  const genstandLabelRe =
    /^(?:genstande?)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  const notesLabelRe =
    /^(?:obs|supplerende)\b\s*(?::|,|[-–])?\s*(.*)$/i;

  const isBulletish = (s: string) => /^(?:[-*•‣∙]\s+|\d+\.\s+)/.test(s);

  const looksLikeOtherHeading = (s: string) =>
    /^[^:]{2,40}:\s*\S+/.test(s) &&
    !readingsLabelRe.test(s) &&
    !assignmentLabelRe.test(s) &&
    !genstandLabelRe.test(s) &&
    !notesLabelRe.test(s);

  let topic = headerLine;
  if (parseHeaderAsContent) {
    const leadingDateReFallback =
      /^\s*(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+)?(?:d\.|den)?\s*\d{1,2}\.?\s*(?:jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s*:?-?\s*/i;
    topic = normalizeWhitespace(topic.replace(leadingDateReFallback, ""));
  }

  const readings: string[] = [];
  const assignmentParts: string[] = [];
  const notesParts: string[] = [];

  let section: "readings" | "assignment" | "notes" | "none" = "none";
  let justEnteredLabeledSection = false;

  const pushReadingInlineRemainder = (prefix: string, remainder: string) => {
    const cleanedPrefix = stripBullet(prefix).trim();
    const cleanedRemainder = stripBullet(remainder).trim();

    if (cleanedPrefix && !looksLikeOtherHeading(cleanedPrefix)) {
      if (cleanedPrefix.length > 2) {
        topic = normalizeWhitespace([topic, cleanedPrefix].join(" "));
      }
    }
    if (cleanedRemainder) {
      pushReadings(readings, cleanedRemainder);
    }
  };

  for (const line of remainingLines) {
    if (!line.trim()) continue;

    const readingLabelMatch = line.match(readingsLabelRe);
    if (readingLabelMatch) {
      section = "readings";
      justEnteredLabeledSection = true;
      const remainder = stripBullet((readingLabelMatch[1] ?? "").trim());
      if (remainder) pushReadings(readings, remainder);
      continue;
    }

    const inlineReadingsMatch = line.match(readingsInlineLabelRe);
    if (inlineReadingsMatch) {
      section = "readings";
      justEnteredLabeledSection = true;
      const prefix = inlineReadingsMatch[1] ?? "";
      const remainder = inlineReadingsMatch[2] ?? "";
      pushReadingInlineRemainder(prefix, remainder);
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

    const genstandMatch = line.match(genstandLabelRe);
    if (genstandMatch) {
      section = "assignment";
      justEnteredLabeledSection = true;
      const remainder = stripBullet((genstandMatch[1] ?? "").trim());
      if (remainder) assignmentParts.push(remainder);
      continue;
    }

    const notesMatch = line.match(notesLabelRe);
    if (notesMatch) {
      section = "notes";
      justEnteredLabeledSection = true;
      const remainder = stripBullet((notesMatch[1] ?? "").trim());
      if (remainder) notesParts.push(remainder);
      continue;
    }

    const cleaned = stripBullet(line);
    if (!cleaned) continue;

    if (looksLikeOtherHeading(cleaned)) {
      if (section === "readings") {
        pushReadings(readings, cleaned);
      } else if (section === "assignment") {
        assignmentParts.push(cleaned);
      } else {
        section = "notes";
        notesParts.push(cleaned);
      }
      justEnteredLabeledSection = false;
      continue;
    }

    if (section === "readings") {
      if (justEnteredLabeledSection && !isBulletish(line) && looksLikeEventLine(line)) {
        section = "notes";
        notesParts.push(cleaned);
      } else {
        pushReadings(readings, cleaned);
      }
      justEnteredLabeledSection = false;
      continue;
    }

    if (section === "assignment") {
      assignmentParts.push(cleaned);
      justEnteredLabeledSection = false;
      continue;
    }

    section = "notes";
    justEnteredLabeledSection = false;
    notesParts.push(cleaned);
  }

  const assignmentText = assignmentParts.join(" ").trim();
  const notesText = notesParts.join(" ").trim();
  const hasTopicSignal =
    topic.trim().length >= 6 && /[A-Za-zÆØÅæøå]/.test(topic);

  if (!hasTopicSignal && readings.length === 0 && !assignmentText && !notesText) {
    return [];
  }

  return [
    {
      type: "session",
      date,
      topic,
      readings,
      assignment: assignmentText,
      notes: notesText,
      sourceText: segment,
    } as any,
  ];
}

function extractTextOutput(data: any): string {
  const msg = data?.choices?.[0]?.message?.content;
  if (typeof msg === "string") return msg;
  const text = data?.choices?.[0]?.text;
  if (typeof text === "string") return text;
  return "";
}

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeItem(item: any): CourseItem | null {
  if (!item || typeof item !== "object") return null;

  const type = item.type;
  if (type === "course_info") {
    return {
      type: "course_info",
      title: typeof item.title === "string" ? item.title : "",
      teachers: Array.isArray(item.teachers)
        ? item.teachers.filter((t: any) => typeof t === "string")
        : [],
      schedule: Array.isArray(item.schedule)
        ? item.schedule.filter((t: any) => typeof t === "string")
        : [],
      notes: typeof item.notes === "string" ? item.notes : "",
    };
  }

  if (type === "session") {
    return {
      type: "session",
      date: typeof item.date === "string" ? item.date : "",
      topic: typeof item.topic === "string" ? item.topic : "",
      readings: Array.isArray(item.readings)
        ? item.readings.filter((t: any) => typeof t === "string")
        : [],
      assignment: typeof item.assignment === "string" ? item.assignment : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      sourceText: typeof item.sourceText === "string" ? item.sourceText : "",
    };
  }

  if (type === "event") {
    return {
      type: "event",
      date: typeof item.date === "string" ? item.date : "",
      title: typeof item.title === "string" ? item.title : "",
      details: typeof item.details === "string" ? item.details : "",
      sourceText: typeof item.sourceText === "string" ? item.sourceText : "",
    };
  }

  return null;
}

function cleanAndMergeItems(items: CourseItem[]): CourseItem[] {
  const cleaned: CourseItem[] = [];
  let last: CourseItem | null = null;

  for (const item of items) {
    if (item.type === "course_info") {
      if (last?.type === "course_info") {
        last.notes = normalizeWhitespace(
          [last.notes, item.notes].filter(Boolean).join(" "),
        );
        continue;
      }
      cleaned.push(item);
      last = item;
      continue;
    }

    if (item.type === "session" && last?.type === "session") {
      if (item.date && last.date && item.date === last.date) {
        last.topic = normalizeWhitespace(
          [last.topic, item.topic].filter(Boolean).join(" "),
        );
        last.readings = [...last.readings, ...item.readings].filter(Boolean);
        last.assignment = normalizeWhitespace(
          [last.assignment, item.assignment].filter(Boolean).join(" "),
        );
        last.notes = normalizeWhitespace(
          [last.notes, item.notes].filter(Boolean).join(" "),
        );
        last.sourceText = normalizeWhitespace(
          [last.sourceText, item.sourceText].filter(Boolean).join("\n"),
        );
        continue;
      }
    }

    cleaned.push(item);
    last = item;
  }

  return cleaned;
}

function splitOnDateAnchorLines(block: string): string[] {
  const lines = block.split("\n");
  const out: string[] = [];

  let current: string[] = [];

  const flush = () => {
    const seg = current.join("\n").trim();
    if (seg) out.push(seg);
    current = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current.push(raw);
      continue;
    }

    if (isDateLine(line)) {
      if (current.some((l) => l.trim().length > 0)) flush();
      current.push(raw);
      continue;
    }

    current.push(raw);
  }

  flush();
  return out;
}
function splitOnInlineWeekdayDateAnchors(text: string): string[] {
  const input = text.trim();
  if (!input) return [];

  const anchorRe =
    /(^|[^\p{L}])((?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s+(?:(?:d\.|den)\s*)?\d{1,2}\.)/giu;

  const anchors: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = anchorRe.exec(input)) !== null) {
    const prefixLen = m[1]?.length ?? 0;
    const weekdayStart = (m.index ?? 0) + prefixLen;
    anchors.push(weekdayStart);

    if (anchorRe.lastIndex === m.index) anchorRe.lastIndex += 1;
  }

  if (anchors.length <= 1) return [input];

  const uniq = Array.from(new Set(anchors)).sort((a, b) => a - b);

  const out: string[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const start = uniq[i];
    const end = i + 1 < uniq.length ? uniq[i + 1] : input.length;
    const seg = input.slice(start, end).trim();
    if (seg) out.push(seg);
  }

  return out;
}

function segmentText(fullText: string): string[] {
  const blocks = fullText
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const base = blocks.length ? blocks : [fullText.trim()].filter(Boolean);

  const refined: string[] = [];
  for (const block of base) {
    const dateLineParts = splitOnDateAnchorLines(block);
    for (const part of dateLineParts) {
      const inlineParts = splitOnInlineWeekdayDateAnchors(part);
      refined.push(...inlineParts);
    }
  }

  return refined;
}

async function openAiExtractItemsFromSegment(
  apiKey: string,
  segment: string,
): Promise<any[] | null> {
  const systemPrompt =
    `You are a parser. Extract course schedule items from a segment of Danish course text.
Return JSON ONLY, as an array of items.
Each item must include:
- type: "course_info" | "session" | "event"
- For course_info: title, teachers[], schedule[], notes
- For session: date, topic, readings[], assignment, notes, sourceText
- For event: date, title, details, sourceText
Always include sourceText as the exact source segment.

Rules:
- readings[] is only for literature/pensum.
- assignment is for exercises/tasks/prep objects.
- notes is for OBS, supplementary, logistics.`;

  const userPrompt = `SEGMENT:\n${segment}`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) return null;

  const data = await resp.json();
  const content = extractTextOutput(data);
  const parsed = safeJsonParse<any[]>(content);
  if (!parsed || !Array.isArray(parsed)) return null;

  return parsed;
}

function recordSegmentYield(
  telemetry: SegmentTelemetry,
  yielded: CourseItem[],
): CourseItem[] {
  telemetry.yieldedItems += yielded.length;
  return yielded;
}

async function analyzeSegmentWithPipeline(
  apiKey: string | null,
  segment: string,
  telemetry: SegmentTelemetry,
): Promise<CourseItem[]> {
  telemetry.extractedSegments += 1;

  if (looksLikeCourseInfo(segment)) {
    const local = localParseSegment(segment).filter((i) => i.type === "course_info");
    if (local.length) {
      telemetry.localParsedSegments += 1;
      return recordSegmentYield(telemetry, local);
    }
  }

  if (false && apiKey) {
    const extracted = await openAiExtractItemsFromSegment(apiKey, segment);
    if (extracted) {
      const normalized = extracted
        .map((item) => normalizeItem(item))
        .filter((x): x is CourseItem => !!x)
        .filter((item) => {
          const src = (item as any).sourceText || segment;
          if (isDateTimeOnlySegment(src)) return false;
          if (item.type === "event") return !hasMeaningfulSessionSignal(src);
          if (item.type === "session") return hasMeaningfulSessionSignal(src);
          return true;
        });

      if (normalized.length) {
        return recordSegmentYield(telemetry, normalized);
      }
    }
  }

  telemetry.localParsedSegments += 1;

  if (looksLikeEvent(segment)) {
    const lines = segment.split("\n").map((l) => l.trim()).filter(Boolean);
    const header = lines.find((l) => !isWeekLine(l)) ?? "";
    const dateLine = lines.find((l) => isDateLine(l)) ?? header;
    const date = extractDateFromLine(dateLine) ?? "";
    const details = normalizeWhitespace(lines.slice(1).join(" "));
    return recordSegmentYield(telemetry, [
      {
        type: "event",
        date,
        title: normalizeWhitespace(header),
        details,
        sourceText: segment,
      },
    ]);
  }

  if (looksLikeSession(segment)) {
    const local = localParseSegment(segment);
    if (local.length) return recordSegmentYield(telemetry, local);
  }

  return recordSegmentYield(telemetry, localParseSegment(segment));
}

async function analyzeCourseText(
  fullText: string,
  apiKey: string | null,
): Promise<AnalyzeResponse> {
 const segments = segmentText(fullText);

const debugSegments = segments.slice(0, 5);
const debugSignals = debugSegments.map((segment) => ({
  rawSegmentText: segment,
  hasMeaningfulSessionSignal: hasMeaningfulSessionSignal(segment),
  looksLikeSession: looksLikeSession(segment),
  looksLikeEvent: looksLikeEvent(segment),
}));

const telemetry: SegmentTelemetry = {
  totalSegments: segments.length,
  extractedSegments: 0,
  localParsedSegments: 0,
  yieldedItems: 0,
};

const items: CourseItem[] = [];

for (const segment of segments) {
  const yielded = await analyzeSegmentWithPipeline(apiKey, segment, telemetry);
  items.push(...yielded);
}

  const normalized = items
    .map((item) => normalizeItem(item))
    .filter((x): x is CourseItem => !!x);

  const cleaned = cleanAndMergeItems(normalized);

  return {
  segmentCount: segments.length,
  items: cleaned,
  debugSegments,
  debugSignals,
} as any;
}

function getEnv(name: string): string | null {
  try {
    return Deno.env.get(name) ?? null;
  } catch {
    return null;
  }
}

// --------------------
// v1.2.1 minimal self-tests (pure functions, table-driven)
// Run locally with: deno test --allow-env index.ts
// These are guarded so the Edge runtime won't try to register tests.
// --------------------
if (typeof Deno !== "undefined" && typeof (Deno as any).test === "function") {
  const assertEq = <T>(name: string, actual: T, expected: T) => {
    if (actual !== expected) {
      throw new Error(`${name}: expected ${String(expected)} got ${String(actual)}`);
    }
  };

  const cases = [
    {
      name: "1) date/time-only segment is detected and not a session",
      segment: "Mandag d. 3. februar\nkl. 10:15-12:00",
      expectDateTimeOnly: true,
      expectSession: false,
      expectEvent: false,
    },
    {
      name: "2) real teaching session with topic + readings becomes session",
      segment:
        "Mandag d. 3. februar\nTema: Introduktion til argumentation\nPensum: Kap. 1-2 (Bog X)",
      expectDateTimeOnly: false,
      expectSession: true,
      expectEvent: false,
    },
    {
      name: "3) real teaching entry should not become event",
      segment:
        "Onsdag d. 5. februar\nWorkshop: Case-arbejde\nLitteratur: Artikel Y\nOpgave: Kort refleksion",
      expectDateTimeOnly: false,
      expectSession: true,
      expectEvent: false,
    },
    {
      name: "4) course metadata block without date should not become session",
      segment:
        "Kursusbeskrivelse\nLitteratur: Bog A, Bog B\nForkortelser: AU\nKontakt: underviser",
      expectDateTimeOnly: false,
      expectSession: false,
      expectEvent: false,
    },
  ] as const;

  Deno.test("v1.2.1: isDateTimeOnlySegment()", () => {
    for (const c of cases) {
      assertEq(c.name, isDateTimeOnlySegment(c.segment), c.expectDateTimeOnly);
    }
  });

  Deno.test("v1.2.1: looksLikeSession()", () => {
    for (const c of cases) {
      assertEq(c.name, looksLikeSession(c.segment), c.expectSession);
    }
  });

  Deno.test("v1.2.1: real teaching entry not event (sanity)", () => {
    for (const c of cases) {
      assertEq(c.name, looksLikeEvent(c.segment), c.expectEvent);
    }
  });

  Deno.test("v1.2.1: localParseSegment() metadata block → course_info (regression)", () => {
    const segment =
      "Kursusbeskrivelse\nLitteratur: Bog A, Bog B\nForkortelser: AU\nKontakt: underviser";

    const items = localParseSegment(segment);
    assertEq("returns single item", items.length, 1);
    assertEq("item is course_info", (items[0] as any).type, "course_info");
    assertEq("not a session", (items[0] as any).type === "session", false);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = getEnv("OPENAI_API_KEY");

    const body = await req.json();
    const fullText = typeof body?.text === "string" ? body.text : "";

    const result = await analyzeCourseText(fullText, apiKey);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
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

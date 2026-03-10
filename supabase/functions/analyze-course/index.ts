import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================
// v2.2.0 — Config-driven Document Workflow Engine
// Architecture: DocumentTypeConfig makes the pipeline
// document-agnostic. Danish course-plan logic is the first
// concrete config. A minimal "meeting-notes" config proves
// the pattern is generalisable.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// SECTION 1 — Generic output types
// These are shared across all document types.
// ============================================================

/** A single structured item produced by the pipeline. */
type WorkflowItem = Record<string, unknown> & { type: string };

type SegmentTelemetry = {
  totalSegments: number;
  extractedSegments: number;
  localParsedSegments: number;
  yieldedItems: number;
};

type AnalyzeResponse = {
  segmentCount: number;
  items: WorkflowItem[];
};

// ============================================================
// SECTION 2 — DocumentTypeConfig
// Everything document-specific lives here. The pipeline only
// calls these hooks — it never hard-codes Danish logic.
// ============================================================

/**
 * A self-contained description of how to parse one class of
 * document. Swap the config object to handle a new doc type.
 */
type DocumentTypeConfig = {
  /** Human-readable label, used in telemetry / debugging. */
  id: string;

  // ── Segmentation ──────────────────────────────────────────
  /**
   * Split raw extracted text into logical chunks before
   * per-segment classification begins.
   */
  segmentText: (fullText: string) => string[];

  // ── Classification ────────────────────────────────────────
  /**
   * Return true when the segment carries only boilerplate
   * (e.g. a bare date/time line) and should be discarded.
   */
  isNoiseSegment: (segment: string) => boolean;

  /**
   * Return true when the segment looks like document-level
   * metadata (e.g. a course description header).
   */
  looksLikeMetadata: (segment: string) => boolean;

  /**
   * Return true when the segment looks like a primary
   * content item (session, agenda point, task, …).
   */
  looksLikeContentItem: (segment: string) => boolean;

  /**
   * Return true when the segment looks like a secondary /
   * event item (deadline, holiday, milestone, …).
   */
  looksLikeEventItem: (segment: string) => boolean;

  // ── Parsing ───────────────────────────────────────────────
  /**
   * Parse a segment that passed classification and return
   * zero or more typed WorkflowItems.
   */
  parseSegment: (segment: string) => WorkflowItem[];

  // ── Post-processing ───────────────────────────────────────
  /**
   * Normalise and validate a raw item object. Return null to
   * discard malformed items.
   */
  normalizeItem: (raw: unknown) => WorkflowItem | null;

  /**
   * Merge or deduplicate a list of normalised items.
   * Called once on the full output before returning.
   */
  cleanAndMergeItems: (items: WorkflowItem[]) => WorkflowItem[];
};

// ============================================================
// SECTION 3 — Shared utilities (language-agnostic)
// ============================================================

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

// ============================================================
// SECTION 4 — Danish course-plan config
// All Danish / AU-specific logic lives in this object and the
// private helpers below it (prefixed with `dk_`).
// ============================================================

// ── 4a. Private helpers (previously top-level functions) ────

function dk_isWeekLine(line: string): boolean {
  return /^uge\s*\d+/i.test(line.trim());
}

function dk_isDateLine(line: string): boolean {
  return (
    /(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/i.test(line) &&
    /(?:d\.|den)?\s*\d{1,2}/i.test(line)
  );
}

function dk_extractDateFromLine(line: string): string | null {
  const match = line.match(
    /\b(?:(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b\s+)?(?:(?:d\.|den)\s*)?\d{1,2}\.?\s*(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\b/i,
  );
  return match ? match[0] : null;
}

function dk_looksLikeEventLine(line: string): boolean {
  return /deadline|seminar|ferie|feedback|vejledning|afslutning/i.test(line);
}

function dk_looksLikeCourseInfo(segment: string): boolean {
  return /(?:undviser|undervisning|litteratur|forkortelser|kursusbeskrivelse|læseplan|materiale|kontakt|om kurset)/i
    .test(segment);
}

function dk_isDateTimeOnlySegment(segment: string): boolean {
  const lines = segment
    .split("\n")
    .map((l) => normalizeWhitespace(l))
    .filter(Boolean)
    .filter((l) => !dk_isWeekLine(l));

  if (!lines.length) return true;

  const timeRe =
    /\b(?:kl\.?\s*)?\d{1,2}(?:[:.]\d{2})\b(?:\s*[-–]\s*(?:kl\.?\s*)?\d{1,2}(?:[:.]\d{2})\b)?/i;

  return lines.every((l) => {
    const compact = normalizeWhitespace(l);
    if (dk_isDateLine(compact)) {
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

function dk_hasMeaningfulSessionSignal(segment: string): boolean {
  const compact = normalizeWhitespace(segment);
  if (!compact) return false;
  if (dk_isDateTimeOnlySegment(segment)) return false;

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

  return hasTopicAfterDate || hasReadings || hasAssignment || hasNotesLabel || hasTeachingHeader;
}

function dk_looksLikeSession(segment: string): boolean {
  const hasDanishDate =
    /mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag.*(?:d\.|den)?\s*\d{1,2}/i
      .test(segment);
  const hasLegacySessionContent =
    /læsestof|readings?:|genstand:|genstande:|supplerende:|øvelser|session|tema|emne|diskussion|case-arbejde|vejledning/i
      .test(segment);

  if (!hasDanishDate && dk_looksLikeCourseInfo(segment)) return false;
  if (dk_isDateTimeOnlySegment(segment)) return false;

  const hasMeaningfulSignal =
    hasLegacySessionContent || dk_hasMeaningfulSessionSignal(segment);

  return (hasDanishDate && hasMeaningfulSignal) ||
    (!hasDanishDate && dk_hasMeaningfulSessionSignal(segment));
}

function dk_looksLikeEvent(segment: string): boolean {
  if (dk_hasMeaningfulSessionSignal(segment) || dk_looksLikeSession(segment)) return false;
  return /\b(?:obs|deadline|seminar|workshop|påskeferie|ferie|feedback|vejledning|afslutning|talefest|skriveøvelse|midtvejsevaluering|individuel vejledning|gruppearbejde)\b/i
    .test(segment);
}

function dk_splitOnDateAnchorLines(block: string): string[] {
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
    if (!line) { current.push(raw); continue; }
    if (dk_isDateLine(line)) {
      if (current.some((l) => l.trim().length > 0)) flush();
      current.push(raw);
      continue;
    }
    current.push(raw);
  }

  flush();
  return out;
}

function dk_splitOnInlineWeekdayDateAnchors(text: string): string[] {
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

// ── 4b. Course-plan specific output types ───────────────────

type CourseInfoItem = WorkflowItem & {
  type: "course_info";
  title: string;
  teachers: string[];
  schedule: string[];
  notes: string;
};

type SessionItem = WorkflowItem & {
  type: "session";
  date: string;
  topic: string;
  readings: string[];
  assignment: string;
  notes: string;
  sourceText: string;
};

type EventItem = WorkflowItem & {
  type: "event";
  date: string;
  title: string;
  details: string;
  sourceText: string;
};

type CourseItem = CourseInfoItem | SessionItem | EventItem;

// ── 4c. Course-plan local segment parser (unchanged logic) ──

function dk_localParseSegment(segment: string): CourseItem[] {
  const stripBullet = (s: string) =>
    s.replace(/^(?:[-*•‣∙]\s*|\d+\.\s+)/, "").trim();

  const pushReadings = (arr: string[], s: string) => {
    const cleaned = stripBullet(s);
    if (!cleaned) return;
    arr.push(cleaned);
  };

  const rawLines = segment.split("\n").map((l) => l.trim());
  const lines = rawLines.filter(Boolean);
  if (!lines.length) return [];

  const nonWeekLines = lines.filter((line) => !dk_isWeekLine(line));
  if (!nonWeekLines.length) return [];
  if (dk_isDateTimeOnlySegment(segment)) return [];

  const hasAnyDate = lines.some((line) => dk_isDateLine(line));
  if (!hasAnyDate && dk_looksLikeCourseInfo(segment)) {
    return [{
      type: "course_info",
      title: "",
      teachers: [],
      schedule: [],
      notes: nonWeekLines.join(" ").trim(),
    } as CourseInfoItem];
  }

  let effectiveNonWeekLines = nonWeekLines;

  const firstDateIdx = effectiveNonWeekLines.findIndex((l) => dk_isDateLine(l));
  if (firstDateIdx > 0) {
    const dateLine = effectiveNonWeekLines[firstDateIdx];
    const extracted = dk_extractDateFromLine(dateLine);
    if (extracted) {
      const lead = effectiveNonWeekLines.slice(0, firstDateIdx);
      const isBulletish = (l: string) => /^(?:[-*•‣∙]\s*|\d+\.\s+)/.test(l);
      const isPrefixedNote = (l: string) => /^(?:supplerende|obs)\b[:.!]?\s*/i.test(l);
      const isCitationish = (l: string) =>
        /[""']/.test(l) || /\b(19|20)\d{2}\b/.test(l) ||
        /\b(?:s\.|pp?\.)\s*\d+/i.test(l) || /\bet al\.\b/i.test(l) ||
        /^[A-ZÆØÅ][^\n]{1,40}:\s+/.test(l);
      const isShortContinuationProse = (l: string) =>
        l.length <= 45 && /^[a-zæøå(,]/.test(l);
      const looksLikeContinuation = (l: string) =>
        isBulletish(l) || isPrefixedNote(l) || isCitationish(l) || isShortContinuationProse(l);
      const leadAllContinuation = lead.every(looksLikeContinuation);
      const leadHasHeaderish = lead.some((l) => dk_looksLikeSession(l) || dk_looksLikeEvent(l));
      if (leadAllContinuation && !leadHasHeaderish) {
        effectiveNonWeekLines = effectiveNonWeekLines.slice(firstDateIdx);
      }
    }
  }

  const headerLine = effectiveNonWeekLines[0];
  const dateSourceLine =
    effectiveNonWeekLines.find((line) => dk_isDateLine(line)) ?? headerLine;
  const date = dk_extractDateFromLine(dateSourceLine) ?? "";
  const remainingLines = effectiveNonWeekLines.slice(1);
  const bodyJoined = remainingLines.join("\n").trim();

  const hasSessionMarkers =
    /pensum|litteratur|readings?:|opgave|assignment|forbered|tema|emne|øvelse|genstand|supplerende|obs/i
      .test(segment);

  if (
    !hasSessionMarkers && dk_looksLikeEventLine(headerLine) &&
    !dk_hasMeaningfulSessionSignal(segment)
  ) {
    return [{
      type: "event",
      date,
      title: normalizeWhitespace(headerLine),
      details: normalizeWhitespace(bodyJoined),
      sourceText: segment,
    } as EventItem];
  }

  const parseHeaderAsContent = !/[:\-–]/.test(headerLine) &&
    !dk_looksLikeEventLine(headerLine) &&
    remainingLines.length > 0;

  // ── AU compact bullets fallback ──────────────────────────
  const auCompactMatch = segment.match(
    /^(?<day>(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag))\s+(?<rest>[\s\S]*)$/i,
  );

  if (auCompactMatch?.groups?.rest && (parseHeaderAsContent || remainingLines.length === 0)) {
    const extractedDate = dk_extractDateFromLine(segment) ?? "";
    const afterDateRaw = extractedDate
      ? normalizeWhitespace(segment.replace(extractedDate, "")).trim()
      : normalizeWhitespace(auCompactMatch.groups.rest.trim());

    const secondDateAnchorRe =
      /\b(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b\s+(?:(?:d\.|den)\s*)?\d{1,2}\.?\s*(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\b\s*(?=[:\-–]|$)/gi;

    const secondAnchor = secondDateAnchorRe.exec(afterDateRaw);
    const afterDate =
      secondAnchor && typeof secondAnchor.index === "number" && secondAnchor.index > 0
        ? afterDateRaw.slice(0, secondAnchor.index).trim()
        : afterDateRaw;

    const topicBoundaryRe =
      /(?:(?:^|[\s,;])(?:•||‣|∙)\s+)|(?:\b(?:genstande?|supplerende|obs)\b\s*(?::|,|[-–])?)/i;
    const boundaryMatch = topicBoundaryRe.exec(afterDate);
    const boundaryIdx =
      boundaryMatch && typeof boundaryMatch.index === "number" ? boundaryMatch.index : -1;

    const head = boundaryIdx > 0 ? afterDate.slice(0, boundaryIdx).trim() : afterDate.trim();
    const tail = boundaryIdx > 0 ? afterDate.slice(boundaryIdx).trim() : "";
    const parts = [head, ...tail.split(/,\s*/)].map((p) => p.trim()).filter(Boolean);

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
      const startsWithNotesMarker = /^(?:supplerende|obs)\b\s*(?::|,|[-–])?/i.test(t);
      const startsWithOtherNoteish =
        /^(?:note\b|lokale\b|rum\b|sted\b|zoom\b|teams\b|link\b|kl\.|tid\b)\b/i.test(t);
      const containsObsAnywhere = /\bobs\b/i.test(t);
      return startsWithNotesMarker || startsWithOtherNoteish || containsObsAnywhere;
    };

    const assignmentMarkerRe =
      /^(?:opgave|assignment|forbered|prepare)\b\s*(?::|,|[-–])\s*(.*)$/i;

    const splitOnTailMarker = (value: string) => {
      const m = tailMarkerRe.exec(value);
      if (!m || typeof m.index !== "number") {
        return { found: false, readingPart: "", notePart: "", markerIndex: -1 };
      }
      return {
        found: true,
        markerIndex: m.index,
        readingPart: value.slice(0, m.index).trim(),
        notePart: value.slice(m.index).trim(),
      };
    };

    const pushReadingsAu = (arr: string[], s: string) => {
      for (const chunk of s.split(/\s*(?:•||‣|∙)\s*/)) {
        const cleaned = stripBullet(chunk);
        if (!cleaned) continue;
        if (assignmentMarkerRe.test(cleaned)) continue;
        if (dk_looksLikeEventLine(cleaned)) continue;
        arr.push(cleaned);
      }
    };

    let inNotes = false;
    for (const p of parts.slice(1)) {
      const assignmentMatch = p.match(assignmentMarkerRe);
      if (assignmentMatch) {
        const remainder = (assignmentMatch[1] ?? "").trim();
        if (remainder) assignmentParts.push(stripBullet(remainder));
        continue;
      }
      if (inNotes) { notesParts.push(p); continue; }

      const midSplit = splitOnTailMarker(p);
      if (midSplit.found) {
        const tailPart = midSplit.notePart;
        if (genstandMarkerRe.test(tailPart)) {
          if (midSplit.readingPart) pushReadingsAu(readings, midSplit.readingPart);
          const remainder = tailPart.replace(/^(?:genstande?)\b\s*(?::|,|[-–])?\s*/i, "").trim();
          if (remainder) assignmentParts.push(stripBullet(remainder));
          continue;
        }
        if (!midSplit.readingPart || midSplit.markerIndex === 0 || isTailNotesItem(p)) {
          inNotes = true; notesParts.push(p); continue;
        }
        pushReadingsAu(readings, midSplit.readingPart);
        inNotes = true; notesParts.push(tailPart);
        continue;
      }
      if (/^(?:genstande?)\b\s*(?::|,|[-–])?/i.test(p)) {
        const remainder = p.replace(/^(?:genstande?)\b\s*(?::|,|[-–])?\s*/i, "").trim();
        if (remainder) assignmentParts.push(stripBullet(remainder));
        continue;
      }
      if (isTailNotesItem(p)) { inNotes = true; notesParts.push(p); continue; }
      pushReadingsAu(readings, p);
    }

    const assignmentText = assignmentParts.join(" ").trim();
    const notesText = notesParts.join(" ").trim();
    const hasTopicSignal = topic.trim().length >= 6 && /[A-Za-zÆØÅæøå]/.test(topic);
    if (!hasTopicSignal && readings.length === 0 && !assignmentText && !notesText) return [];

    return [{
      type: "session",
      date: extractedDate || date,
      topic,
      readings,
      assignment: assignmentText,
      notes: notesText,
      sourceText: segment,
    } as SessionItem];
  }

  // ── Multi-line fallback parser ───────────────────────────
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
    /^[^:]{2,40}:\s*\S+/.test(s) && !readingsLabelRe.test(s) &&
    !assignmentLabelRe.test(s) && !genstandLabelRe.test(s) && !notesLabelRe.test(s);

  let fallbackLines = effectiveNonWeekLines;
  const dateSourceIdx = effectiveNonWeekLines.findIndex((l) => l === dateSourceLine);
  if (dateSourceIdx > 0 && date) {
    const lead = effectiveNonWeekLines.slice(0, dateSourceIdx);
    const isBulletishLead = (l: string) => /^(?:[-*•‣∙]\s*|\d+\.\s+)/.test(l);
    const isNoteishLead = (l: string) => /^(?:supplerende|obs)\b[:.!]?\s*/i.test(l);
    const isCitationishLead = (l: string) =>
      /[""']/.test(l) || /\b(19|20)\d{2}\b/.test(l) ||
      /\b(?:s\.|pp?\.)\s*\d+/i.test(l) || /\bet al\.\b/i.test(l) ||
      /^[A-ZÆØÅ][^:]{1,40}:\s+\S+/.test(l);
    const isShortContinuationProse = (l: string) => l.length <= 45 && /^[a-zæøå(,]/.test(l);
    const isClearlyNotSessionStart = (l: string) => {
      const t = l.trim();
      if (!t) return true;
      if (dk_isDateLine(t)) return false;
      if (dk_looksLikeEventLine(t)) return false;
      if (dk_looksLikeSession(t) || dk_looksLikeEvent(t)) return false;
      return true;
    };
    const looksLikeContinuationLead = (l: string) =>
      isBulletishLead(l) || isNoteishLead(l) || isCitationishLead(l) ||
      isShortContinuationProse(l) || isClearlyNotSessionStart(l);

    const isLabelOnlyLine = (l: string) =>
      /^(?:pensum|litteratur|reading|readings|tekst|opgave|assignment|forbered|prepare|genstande?|obs|supplerende)\b\s*(?::|,|[-–])?/i
        .test(l.trim());

    const leadAllContinuation = lead.every(looksLikeContinuationLead);
    const leadHasHeaderish = lead.some((l) => {
      const t = l.trim();
      if (!t || isLabelOnlyLine(t)) return false;
      return dk_looksLikeSession(t) || dk_looksLikeEvent(t);
    });

    if (leadAllContinuation && !leadHasHeaderish) {
      fallbackLines = effectiveNonWeekLines.slice(dateSourceIdx);
    }
  }

  const fallbackHeaderLine = fallbackLines[0] ?? headerLine;
  const fallbackRemainingLines = fallbackLines.slice(1);

  let topic = fallbackHeaderLine;
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
    if (cleanedPrefix && !looksLikeOtherHeading(cleanedPrefix) && cleanedPrefix.length > 2) {
      topic = normalizeWhitespace([topic, cleanedPrefix].join(" "));
    }
    if (cleanedRemainder) pushReadings(readings, cleanedRemainder);
  };

  for (const line of fallbackRemainingLines) {
    if (!line.trim()) continue;

    const readingLabelMatch = line.match(readingsLabelRe);
    if (readingLabelMatch) {
      section = "readings"; justEnteredLabeledSection = true;
      const remainder = stripBullet((readingLabelMatch[1] ?? "").trim());
      if (remainder) pushReadings(readings, remainder);
      continue;
    }

    const inlineReadingsMatch = line.match(readingsInlineLabelRe);
    if (inlineReadingsMatch) {
      section = "readings"; justEnteredLabeledSection = true;
      pushReadingInlineRemainder(inlineReadingsMatch[1] ?? "", inlineReadingsMatch[2] ?? "");
      continue;
    }

    const assignmentMatch = line.match(assignmentLabelRe);
    if (assignmentMatch) {
      section = "assignment"; justEnteredLabeledSection = true;
      const remainder = stripBullet((assignmentMatch[1] ?? "").trim());
      if (remainder) assignmentParts.push(remainder);
      continue;
    }

    const genstandMatch = line.match(genstandLabelRe);
    if (genstandMatch) {
      section = "assignment"; justEnteredLabeledSection = true;
      const remainder = stripBullet((genstandMatch[1] ?? "").trim());
      if (remainder) assignmentParts.push(remainder);
      continue;
    }

    const notesMatch = line.match(notesLabelRe);
    if (notesMatch) {
      section = "notes"; justEnteredLabeledSection = true;
      const remainder = stripBullet((notesMatch[1] ?? "").trim());
      if (remainder) notesParts.push(remainder);
      continue;
    }

    const cleaned = stripBullet(line);
    if (!cleaned) continue;

    if (looksLikeOtherHeading(cleaned)) {
      if (section === "readings") pushReadings(readings, cleaned);
      else if (section === "assignment") assignmentParts.push(cleaned);
      else { section = "notes"; notesParts.push(cleaned); }
      justEnteredLabeledSection = false;
      continue;
    }

    if (section === "readings") {
      if (justEnteredLabeledSection && !isBulletish(line) && dk_looksLikeEventLine(line)) {
        section = "notes"; notesParts.push(cleaned);
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
  const hasTopicSignal = topic.trim().length >= 6 && /[A-Za-zÆØÅæøå]/.test(topic);

  if (!hasTopicSignal && readings.length === 0 && !assignmentText && !notesText) return [];

  return [{
    type: "session",
    date,
    topic,
    readings,
    assignment: assignmentText,
    notes: notesText,
    sourceText: segment,
  } as SessionItem];
}

// ── 4d. normalizeItem and cleanAndMergeItems for course-plan ─

function dk_normalizeItem(raw: unknown): WorkflowItem | null {
  const item = raw as any;
  if (!item || typeof item !== "object") return null;
  const type = item.type;

  if (type === "course_info") {
    return {
      type: "course_info",
      title: typeof item.title === "string" ? item.title : "",
      teachers: Array.isArray(item.teachers)
        ? item.teachers.filter((t: unknown) => typeof t === "string") : [],
      schedule: Array.isArray(item.schedule)
        ? item.schedule.filter((t: unknown) => typeof t === "string") : [],
      notes: typeof item.notes === "string" ? item.notes : "",
    } as CourseInfoItem;
  }

  if (type === "session") {
    return {
      type: "session",
      date: typeof item.date === "string" ? item.date : "",
      topic: typeof item.topic === "string" ? item.topic : "",
      readings: Array.isArray(item.readings)
        ? item.readings.filter((t: unknown) => typeof t === "string") : [],
      assignment: typeof item.assignment === "string" ? item.assignment : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      sourceText: typeof item.sourceText === "string" ? item.sourceText : "",
    } as SessionItem;
  }

  if (type === "event") {
    return {
      type: "event",
      date: typeof item.date === "string" ? item.date : "",
      title: typeof item.title === "string" ? item.title : "",
      details: typeof item.details === "string" ? item.details : "",
      sourceText: typeof item.sourceText === "string" ? item.sourceText : "",
    } as EventItem;
  }

  return null;
}

function dk_cleanAndMergeItems(items: WorkflowItem[]): WorkflowItem[] {
  const cleaned: WorkflowItem[] = [];
  let last: WorkflowItem | null = null;

  for (const item of items) {
    if (item.type === "course_info") {
      const ci = item as CourseInfoItem;
      if (last?.type === "course_info") {
        (last as CourseInfoItem).notes = normalizeWhitespace(
          [(last as CourseInfoItem).notes, ci.notes].filter(Boolean).join(" "),
        );
        continue;
      }
      cleaned.push(item); last = item; continue;
    }

    if (item.type === "session" && last?.type === "session") {
      const s = item as SessionItem;
      const l = last as SessionItem;
      if (s.date && l.date && s.date === l.date) {
        l.topic = normalizeWhitespace([l.topic, s.topic].filter(Boolean).join(" "));
        l.readings = [...l.readings, ...s.readings].filter(Boolean);
        l.assignment = normalizeWhitespace([l.assignment, s.assignment].filter(Boolean).join(" "));
        l.notes = normalizeWhitespace([l.notes, s.notes].filter(Boolean).join(" "));
        l.sourceText = normalizeWhitespace([l.sourceText, s.sourceText].filter(Boolean).join("\n"));
        continue;
      }
    }

    cleaned.push(item); last = item;
  }

  return cleaned;
}

// ── 4e. The config object itself ─────────────────────────────

/**
 * Config for Danish university course plan PDFs (AU format).
 * Segments on week lines + date anchors, classifies sessions /
 * events / course-info blocks, parses via regex.
 */
const danishCoursePlanConfig: DocumentTypeConfig = {
  id: "danish-course-plan",

  segmentText(fullText) {
    const blocks = fullText
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
    const base = blocks.length ? blocks : [fullText.trim()].filter(Boolean);

    const refined: string[] = [];
    for (const block of base) {
      for (const part of dk_splitOnDateAnchorLines(block)) {
        refined.push(...dk_splitOnInlineWeekdayDateAnchors(part));
      }
    }
    return refined;
  },

  isNoiseSegment: dk_isDateTimeOnlySegment,
  looksLikeMetadata: dk_looksLikeCourseInfo,
  looksLikeContentItem: dk_looksLikeSession,
  looksLikeEventItem: dk_looksLikeEvent,
  parseSegment: dk_localParseSegment,
  normalizeItem: dk_normalizeItem,
  cleanAndMergeItems: dk_cleanAndMergeItems,
};

// ============================================================
// SECTION 5 — Meeting-notes config
// Minimal second config to prove the architecture is generic.
// Handles plain-text meeting notes with "Action:" lines.
// ============================================================

type ActionItem = WorkflowItem & {
  type: "action";
  owner: string;
  description: string;
  dueDate: string;
  sourceText: string;
};

type DecisionItem = WorkflowItem & {
  type: "decision";
  description: string;
  sourceText: string;
};

type MeetingMetaItem = WorkflowItem & {
  type: "meeting_meta";
  notes: string;
};

function mn_looksLikeNoise(segment: string): boolean {
  return segment.trim().length < 5;
}

function mn_looksLikeMeta(segment: string): boolean {
  return /(?:attendees?|present:|absent:|date:|time:|location:|room:)/i.test(segment);
}

function mn_looksLikeAction(segment: string): boolean {
  return /\baction(?:\s+item)?s?\s*:/i.test(segment) ||
    /^\s*(?:[-*•]\s*)?(?:todo|action|follow.?up)\b/im.test(segment);
}

function mn_looksLikeDecision(segment: string): boolean {
  return /\bdecision\b|\bagreed?\b|\bresolved?\b/i.test(segment);
}

function mn_parseSegment(segment: string): WorkflowItem[] {
  const lines = segment.split("\n").map((l) => l.trim()).filter(Boolean);

  if (mn_looksLikeMeta(segment)) {
    return [{ type: "meeting_meta", notes: lines.join(" ") } as MeetingMetaItem];
  }

  if (mn_looksLikeDecision(segment)) {
    return [{
      type: "decision",
      description: normalizeWhitespace(segment),
      sourceText: segment,
    } as DecisionItem];
  }

  if (mn_looksLikeAction(segment)) {
    // Parse patterns like "Action: @Alice – review proposal by Friday"
    const ownerMatch = segment.match(/(?:^|\s)@([A-Za-z]+)/);
    const dueMatch = segment.match(/\bby\s+([A-Za-z]+ \d+|\w+day|\d{4}-\d{2}-\d{2})/i);
    const descLine = lines.find((l) => !/^action/i.test(l)) ?? lines[0] ?? "";
    return [{
      type: "action",
      owner: ownerMatch?.[1] ?? "",
      description: normalizeWhitespace(
        descLine.replace(/^(?:[-*•]\s*)/, "").replace(/^action(?:\s+item)?:\s*/i, ""),
      ),
      dueDate: dueMatch?.[1] ?? "",
      sourceText: segment,
    } as ActionItem];
  }

  return [];
}

function mn_normalizeItem(raw: unknown): WorkflowItem | null {
  const item = raw as any;
  if (!item || typeof item !== "object" || !item.type) return null;
  if (!["action", "decision", "meeting_meta"].includes(item.type)) return null;
  return item as WorkflowItem;
}

function mn_cleanAndMergeItems(items: WorkflowItem[]): WorkflowItem[] {
  // Merge consecutive meeting_meta blocks; keep everything else.
  const out: WorkflowItem[] = [];
  let lastMeta: MeetingMetaItem | null = null;

  for (const item of items) {
    if (item.type === "meeting_meta") {
      const mi = item as MeetingMetaItem;
      if (lastMeta) {
        lastMeta.notes = normalizeWhitespace([lastMeta.notes, mi.notes].join(" "));
        continue;
      }
      out.push(item); lastMeta = mi;
    } else {
      lastMeta = null;
      out.push(item);
    }
  }
  return out;
}

/**
 * Config for plain-text meeting notes.
 * Extracts actions, decisions, and meeting metadata.
 */
const meetingNotesConfig: DocumentTypeConfig = {
  id: "meeting-notes",

  segmentText(fullText) {
    // Split on blank lines, then on lines starting with common section headers.
    return fullText
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  },

  isNoiseSegment: mn_looksLikeNoise,
  looksLikeMetadata: mn_looksLikeMeta,
  looksLikeContentItem: mn_looksLikeAction,
  looksLikeEventItem: mn_looksLikeDecision,
  parseSegment: mn_parseSegment,
  normalizeItem: mn_normalizeItem,
  cleanAndMergeItems: mn_cleanAndMergeItems,
};

// ============================================================
// SECTION 6 — Config registry
// Add new document types here; the HTTP handler selects by id.
// ============================================================

const CONFIG_REGISTRY: Record<string, DocumentTypeConfig> = {
  [danishCoursePlanConfig.id]: danishCoursePlanConfig,
  [meetingNotesConfig.id]: meetingNotesConfig,
};

/** Fallback when caller does not specify a docType. */
const DEFAULT_CONFIG_ID = danishCoursePlanConfig.id;

// ============================================================
// SECTION 7 — Generic pipeline
// No language/domain logic here — calls config hooks only.
// ============================================================

function recordSegmentYield(
  telemetry: SegmentTelemetry,
  yielded: WorkflowItem[],
): WorkflowItem[] {
  telemetry.yieldedItems += yielded.length;
  return yielded;
}

async function analyzeSegmentWithPipeline(
  config: DocumentTypeConfig,
  apiKey: string | null,
  segment: string,
  telemetry: SegmentTelemetry,
): Promise<WorkflowItem[]> {
  telemetry.extractedSegments += 1;

  // Fast-path: noise
  if (config.isNoiseSegment(segment)) {
    return recordSegmentYield(telemetry, []);
  }

  // Fast-path: metadata blocks
  if (config.looksLikeMetadata(segment)) {
    const local = config.parseSegment(segment).filter((i) => {
      const norm = config.normalizeItem(i);
      return norm !== null && !["session", "action"].includes(norm.type);
    });
    if (local.length) {
      telemetry.localParsedSegments += 1;
      return recordSegmentYield(telemetry, local);
    }
  }

  // OpenAI path (disabled until re-enabled per docType)
  if (false && apiKey) {
    // Future: call openAiExtractItemsFromSegment with a config-supplied system prompt
  }

  telemetry.localParsedSegments += 1;

  // Event items
  if (config.looksLikeEventItem(segment) && !config.looksLikeContentItem(segment)) {
    const local = config.parseSegment(segment);
    if (local.length) return recordSegmentYield(telemetry, local);
  }

  // Primary content items
  if (config.looksLikeContentItem(segment)) {
    const local = config.parseSegment(segment);
    if (local.length) return recordSegmentYield(telemetry, local);
  }

  return recordSegmentYield(telemetry, config.parseSegment(segment));
}

async function analyzeDocument(
  fullText: string,
  config: DocumentTypeConfig,
  apiKey: string | null,
): Promise<AnalyzeResponse> {
  const segments = config.segmentText(fullText);

  const telemetry: SegmentTelemetry = {
    totalSegments: segments.length,
    extractedSegments: 0,
    localParsedSegments: 0,
    yieldedItems: 0,
  };

  const rawItems: WorkflowItem[] = [];

  for (const segment of segments) {
    const yielded = await analyzeSegmentWithPipeline(config, apiKey, segment, telemetry);
    rawItems.push(...yielded);
  }

  const normalized = rawItems
    .map((item) => config.normalizeItem(item))
    .filter((x): x is WorkflowItem => x !== null);

  const cleaned = config.cleanAndMergeItems(normalized);

  return { segmentCount: segments.length, items: cleaned };
}

// ============================================================
// SECTION 8 — Utilities
// ============================================================

function safeJsonParse<T>(input: string): T | null {
  try { return JSON.parse(input); } catch { return null; }
}

function getEnv(name: string): string | null {
  try { return Deno.env.get(name) ?? null; } catch { return null; }
}

// ============================================================
// SECTION 9 — Self-tests (unchanged from v1.2.1)
// Run with: deno test --allow-env index.ts
// ============================================================

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
      expectDateTimeOnly: true, expectSession: false, expectEvent: false,
    },
    {
      name: "2) real teaching session with topic + readings becomes session",
      segment: "Mandag d. 3. februar\nTema: Introduktion til argumentation\nPensum: Kap. 1-2 (Bog X)",
      expectDateTimeOnly: false, expectSession: true, expectEvent: false,
    },
    {
      name: "3) real teaching entry should not become event",
      segment: "Onsdag d. 5. februar\nWorkshop: Case-arbejde\nLitteratur: Artikel Y\nOpgave: Kort refleksion",
      expectDateTimeOnly: false, expectSession: true, expectEvent: false,
    },
    {
      name: "4) course metadata block without date should not become session",
      segment: "Kursusbeskrivelse\nLitteratur: Bog A, Bog B\nForkortelser: AU\nKontakt: underviser",
      expectDateTimeOnly: false, expectSession: false, expectEvent: false,
    },
  ] as const;

  Deno.test("v2.2.0: isNoiseSegment() via danishCoursePlanConfig", () => {
    for (const c of cases) {
      assertEq(c.name, danishCoursePlanConfig.isNoiseSegment(c.segment), c.expectDateTimeOnly);
    }
  });

  Deno.test("v2.2.0: looksLikeContentItem() via danishCoursePlanConfig", () => {
    for (const c of cases) {
      assertEq(c.name, danishCoursePlanConfig.looksLikeContentItem(c.segment), c.expectSession);
    }
  });

  Deno.test("v2.2.0: looksLikeEventItem() via danishCoursePlanConfig", () => {
    for (const c of cases) {
      assertEq(c.name, danishCoursePlanConfig.looksLikeEventItem(c.segment), c.expectEvent);
    }
  });

  Deno.test("v2.2.0: parseSegment() metadata block → course_info (regression)", () => {
    const segment = "Kursusbeskrivelse\nLitteratur: Bog A, Bog B\nForkortelser: AU\nKontakt: underviser";
    const items = danishCoursePlanConfig.parseSegment(segment);
    assertEq("returns single item", items.length, 1);
    assertEq("item is course_info", items[0].type, "course_info");
  });

  Deno.test("v2.2.0: meetingNotesConfig classifies action segment", () => {
    const segment = "Action: @Alice – review proposal by Friday";
    assertEq("looksLikeAction", meetingNotesConfig.looksLikeContentItem(segment), true);
    const items = meetingNotesConfig.parseSegment(segment);
    assertEq("returns one item", items.length, 1);
    assertEq("type is action", items[0].type, "action");
    assertEq("owner extracted", (items[0] as ActionItem).owner, "Alice");
  });

  Deno.test("v2.2.0: meetingNotesConfig classifies decision segment", () => {
    const segment = "Agreed: we will migrate to Deno Deploy by Q3.";
    assertEq("looksLikeDecision", meetingNotesConfig.looksLikeEventItem(segment), true);
    const items = meetingNotesConfig.parseSegment(segment);
    assertEq("returns one item", items.length, 1);
    assertEq("type is decision", items[0].type, "decision");
  });
}

// ============================================================
// SECTION 10 — HTTP handler
// Accepts an optional `docType` field in the JSON body.
// Falls back to "danish-course-plan" for backward compat.
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = getEnv("OPENAI_API_KEY");
    const body = await req.json();

    const fullText = typeof body?.text === "string" ? body.text : "";
    const docTypeId: string = typeof body?.docType === "string"
      ? body.docType
      : DEFAULT_CONFIG_ID;

    const config = CONFIG_REGISTRY[docTypeId] ?? CONFIG_REGISTRY[DEFAULT_CONFIG_ID];
    const result = await analyzeDocument(fullText, config, apiKey);

    return new Response(JSON.stringify({ ...result, docType: config.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

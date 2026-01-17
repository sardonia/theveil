import type { DashboardPayload } from "./types";

type ValidationResult =
  | { valid: true; payload: DashboardPayload }
  | { valid: false; error: string };

type SanitizationInfo = {
  changed: boolean;
  codeFencesRemoved: boolean;
  extractedJson: boolean;
  trailingCommasRemoved: boolean;
  unquotedKeysFixed: boolean;
  rootMergeApplied: boolean;
  wrapperFixApplied: boolean;
  missingBraceAdded: boolean;
};

type SanitizedParseResult =
  | { ok: true; value: DashboardPayload; info: SanitizationInfo }
  | { ok: false; error: Error; info: SanitizationInfo };

const sectionTitles = new Set(["Focus", "Relationships", "Action", "Reflection"]);
const transitTones = new Set(["soft", "neutral", "intense"]);
const quarterLabels = new Set(["Q1", "Q2", "Q3", "Q4"]);
const PLACEHOLDER_TOKEN = "__FILL";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function containsUnresolvedPlaceholders(value: unknown): boolean {
  if (typeof value === "string") {
    return value.includes(PLACEHOLDER_TOKEN);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsUnresolvedPlaceholders(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => containsUnresolvedPlaceholders(item));
  }
  return false;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  isNumber(value) && Number.isInteger(value);

const ensureArray = <T>(
  value: unknown,
  predicate: (item: unknown) => item is T
): value is T[] => Array.isArray(value) && value.every(predicate);

const inRange = (value: number, min: number, max: number) =>
  value >= min && value <= max;

function errorResult(message: string): ValidationResult {
  return { valid: false, error: message };
}

function stripCodeFences(text: string): string {
  // Some models wrap JSON in ```json fences despite instructions.
  return text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractJsonSlice(text: string): { slice: string | null; extracted: boolean } {
  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return { slice: null, extracted: false };
  }
  const slice = text.slice(startIndex, endIndex + 1);
  return { slice, extracted: slice.length !== text.length };
}

function removeTrailingCommas(text: string): { text: string; removed: boolean } {
  // Common "almost JSON" error: trailing commas before } or ]
  let out = "";
  let inString = false;
  let escaped = false;
  let removed = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const next = text[j];
      if (next === "}" || next === "]") {
        removed = true;
        continue;
      }
    }

    out += ch;
  }
  return { text: out, removed };
}

function quoteUnquotedKeys(text: string): string {
  // Best-effort conversion from JS-object-literal style to strict JSON.
  // Only runs when strict JSON.parse fails.
  let out = "";
  const stack: Array<"object" | "array"> = [];
  let inString = false;
  let escaped = false;
  let expectKey = false;

  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "{") {
      stack.push("object");
      expectKey = true;
      out += ch;
      continue;
    }
    if (ch === "[") {
      stack.push("array");
      expectKey = false;
      out += ch;
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      expectKey = stack[stack.length - 1] === "object";
      out += ch;
      continue;
    }
    if (ch === ",") {
      // Next token is a key if we're in an object.
      expectKey = stack[stack.length - 1] === "object";
      out += ch;
      continue;
    }
    if (ch === ":") {
      // After a colon we are expecting a value.
      expectKey = false;
      out += ch;
      continue;
    }

    if (expectKey) {
      // Skip whitespace while waiting for a key.
      if (/\s/.test(ch)) {
        out += ch;
        continue;
      }
      // If already quoted, let it through.
      if (ch === '"') {
        inString = true;
        out += ch;
        continue;
      }
      // Quote bare identifiers used as keys.
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < text.length && isIdent(text[j])) j += 1;
        const key = text.slice(i, j);
        // Skip whitespace after key.
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k += 1;
        if (text[k] === ":") {
          out += `"${key}"`;
          i = k - 1; // allow ':' to be processed next loop
          expectKey = false;
          continue;
        }
      }
    }

    out += ch;
  }
  return out;
}

function mergeRootObjects(text: string): { text: string; applied: boolean } {
  let out = "";
  let inString = false;
  let escaped = false;
  let depth = 0;
  let applied = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      out += ch;
      continue;
    }

    if (ch === "}") {
      if (depth === 1) {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === ",") {
          let k = j + 1;
          while (k < text.length && /\s/.test(text[k])) k += 1;
          if (text[k] === "{") {
            applied = true;
            i = k;
            continue;
          }
        }
      }
      depth -= 1;
      out += ch;
      continue;
    }

    if (ch === "[") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      out += ch;
      continue;
    }

    out += ch;
  }

  return { text: out, applied };
}

function unwrapAnonymousRootObjects(text: string): { text: string; applied: boolean } {
  let out = "";
  let inString = false;
  let escaped = false;
  let depth = 0;
  let applied = false;
  let pendingWrapperStart: number | null = null;
  let skippingWrapper = false;
  let wrapperEndDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "," && depth === 1) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === "{") {
        pendingWrapperStart = j;
        applied = true;
      }
      out += ch;
      continue;
    }

    if (pendingWrapperStart !== null && i === pendingWrapperStart && ch === "{") {
      skippingWrapper = true;
      wrapperEndDepth = depth + 1;
      depth += 1;
      pendingWrapperStart = null;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === "}") {
      if (skippingWrapper && depth === wrapperEndDepth) {
        depth -= 1;
        skippingWrapper = false;
        continue;
      }
      depth -= 1;
      out += ch;
      continue;
    }

    if (ch === "[") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      out += ch;
      continue;
    }

    out += ch;
  }

  return { text: out, applied };
}

function closeMissingFinalBrace(text: string): { text: string; added: boolean } {
  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
  }
  if (inString || depth <= 0) {
    return { text, added: false };
  }
  return { text: `${text}}`, added: true };
}

function sanitizeDashboardPayload(raw: string): { sanitized: string; info: SanitizationInfo } {
  const trimmed = raw.trim();
  const noFences = stripCodeFences(trimmed);
  const { slice, extracted } = extractJsonSlice(noFences);
  const extractedJson = slice ?? noFences;
  const { text: withoutCommas, removed } = removeTrailingCommas(extractedJson);
  const quotedKeys = quoteUnquotedKeys(withoutCommas);
  const { text: merged, applied: rootMergeApplied } = mergeRootObjects(quotedKeys);
  const { text: unwrapped, applied } = unwrapAnonymousRootObjects(merged);
  const { text: braceFixed, added } = closeMissingFinalBrace(unwrapped);
  return {
    sanitized: braceFixed,
    info: {
      changed: braceFixed !== raw,
      codeFencesRemoved: noFences !== trimmed,
      extractedJson: extracted,
      trailingCommasRemoved: removed,
      unquotedKeysFixed: quotedKeys !== withoutCommas,
      rootMergeApplied,
      wrapperFixApplied: applied,
      missingBraceAdded: added,
    },
  };
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const numeric = coerceNumber(value);
  if (numeric === null) return null;
  const rounded = Math.round(numeric);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeTransitTone(value: unknown): string | null {
  if (!isString(value)) return null;
  const normalized = value.toLowerCase();
  if (transitTones.has(normalized)) return normalized;
  if (
    normalized.includes("soft") ||
    normalized.includes("gentle") ||
    normalized.includes("hope") ||
    normalized.includes("uplift")
  ) {
    return "soft";
  }
  if (
    normalized.includes("intense") ||
    normalized.includes("strong") ||
    normalized.includes("volatile") ||
    normalized.includes("disrupt")
  ) {
    return "intense";
  }
  return "neutral";
}

export function normalizeDashboard(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const dashboard = raw as Record<string, unknown>;
  const today = dashboard.today;
  if (isRecord(today)) {
    const energyScore = clampInt(today.energyScore, 0, 100);
    if (energyScore !== null) {
      today.energyScore = energyScore;
    }
    const ratings = today.ratings;
    if (isRecord(ratings)) {
      const love = clampInt(ratings.love, 0, 5);
      const work = clampInt(ratings.work, 0, 5);
      const money = clampInt(ratings.money, 0, 5);
      const health = clampInt(ratings.health, 0, 5);
      if (love !== null) ratings.love = love;
      if (work !== null) ratings.work = work;
      if (money !== null) ratings.money = money;
      if (health !== null) ratings.health = health;
    }
    const lucky = today.lucky;
    if (isRecord(lucky)) {
      const number = clampInt(lucky.number, 0, 999);
      if (number !== null) {
        lucky.number = number;
      }
    }
    if (Array.isArray(today.bestHours)) {
      const fallback = { label: "", start: "", end: "" };
      const normalized = today.bestHours.slice(0, 2).map((entry) => {
        if (!isRecord(entry)) return { ...fallback };
        return {
          label: isString(entry.label) ? entry.label : "",
          start: isString(entry.start) ? entry.start : "",
          end: isString(entry.end) ? entry.end : "",
        };
      });
      today.bestHours = [
        ...normalized,
        ...Array.from({ length: Math.max(0, 2 - normalized.length) }, () => ({ ...fallback })),
      ];
    }
    if (Array.isArray(today.sections)) {
      const normalizeTitle = (value: unknown): string | null => {
        if (!isString(value)) return null;
        const trimmed = value.trim().toLowerCase();
        if (trimmed === "focus") return "Focus";
        if (trimmed === "relationships") return "Relationships";
        if (trimmed === "action") return "Action";
        if (trimmed === "reflection") return "Reflection";
        return null;
      };
      const byTitle = new Map<string, string>();
      for (const entry of today.sections) {
        if (!isRecord(entry)) continue;
        const title = normalizeTitle(entry.title);
        if (!title) continue;
        const body = isString(entry.body) ? entry.body : "";
        byTitle.set(title, body);
      }
      today.sections = ["Focus", "Relationships", "Action", "Reflection"].map((title) => ({
        title,
        body: byTitle.get(title) ?? "",
      }));
    }
  }

  const cosmicWeather = dashboard.cosmicWeather;
  if (isRecord(cosmicWeather) && Array.isArray(cosmicWeather.transits)) {
    cosmicWeather.transits = cosmicWeather.transits.slice(0, 2).map((transit) => {
      if (!isRecord(transit)) {
        return { title: "", tone: "neutral", meaning: "" };
      }
      const tone = normalizeTransitTone(transit.tone);
      return {
        title: isString(transit.title) ? transit.title : "",
        tone: tone ?? "neutral",
        meaning: isString(transit.meaning) ? transit.meaning : "",
      };
    });
  }

  const compatibility = dashboard.compatibility;
  if (isRecord(compatibility)) {
    if (Array.isArray(compatibility.bestFlowWith)) {
      const pad = ["", ""];
      compatibility.bestFlowWith = [
        ...compatibility.bestFlowWith.slice(0, 2).map((entry) => (isString(entry) ? entry : "")),
        ...pad.slice(0, Math.max(0, 2 - compatibility.bestFlowWith.length)),
      ];
    }
    if (Array.isArray(compatibility.handleGentlyWith)) {
      const pad = [""];
      compatibility.handleGentlyWith = [
        ...compatibility.handleGentlyWith
          .slice(0, 1)
          .map((entry) => (isString(entry) ? entry : "")),
        ...pad.slice(0, Math.max(0, 1 - compatibility.handleGentlyWith.length)),
      ];
    }
  }

  const journalRitual = dashboard.journalRitual;
  if (isRecord(journalRitual) && Array.isArray(journalRitual.starters)) {
    const pad = ["", "", ""];
    journalRitual.starters = [
      ...journalRitual.starters.slice(0, 3).map((entry) => (isString(entry) ? entry : "")),
      ...pad.slice(0, Math.max(0, 3 - journalRitual.starters.length)),
    ];
  }

  const month = dashboard.month;
  if (isRecord(month) && Array.isArray(month.keyDates)) {
    const fallback = { dateLabel: "", title: "", note: "" };
    month.keyDates = [
      ...month.keyDates.slice(0, 3).map((entry) => {
        if (!isRecord(entry)) return { ...fallback };
        return {
          dateLabel: isString(entry.dateLabel) ? entry.dateLabel : "",
          title: isString(entry.title) ? entry.title : "",
          note: isString(entry.note) ? entry.note : "",
        };
      }),
      ...Array.from({ length: Math.max(0, 3 - month.keyDates.length) }, () => ({
        ...fallback,
      })),
    ];
  }

  const year = dashboard.year;
  if (isRecord(year)) {
    if (Array.isArray(year.quarters)) {
      const byLabel = new Map<string, { label: string; focus: string }>();
      for (const entry of year.quarters) {
        if (isRecord(entry) && isString(entry.label) && isString(entry.focus)) {
          byLabel.set(entry.label, { label: entry.label, focus: entry.focus });
        }
      }
      year.quarters = ["Q1", "Q2", "Q3", "Q4"].map((label) => {
        const existing = byLabel.get(label);
        return existing ?? { label, focus: "" };
      });
    }
    if (Array.isArray(year.powerMonths)) {
      const pad = ["", ""];
      year.powerMonths = [
        ...year.powerMonths.slice(0, 2),
        ...pad.slice(0, Math.max(0, 2 - year.powerMonths.length)),
      ];
    }
  }

  return dashboard;
}

export function extractFirstJsonObject(text: string): string | null {
  const startIndex = text.indexOf("{");
  if (startIndex === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }
  return null;
}

export function parseDashboardPayload(json: string): ValidationResult {
  const result = sanitizeAndParseDashboardPayload(json);
  if (!result.ok) {
    return errorResult(result.error.message);
  }
  return { valid: true, payload: result.value };
}

function validateDashboardPayload(raw: Record<string, unknown>): ValidationResult {
  if (!isRecord(raw)) {
    return errorResult("Payload root must be an object.");
  }

  // If the model ...
  if (containsUnresolvedPlaceholders(raw)) {
    return errorResult("Payload contains unresolved placeholders.");
  }

  const meta = raw.meta;
  if (
    !isRecord(meta) ||
    !isString(meta.dateISO) ||
    !isString(meta.localeDateLabel) ||
    !isString(meta.generatedAtISO) ||
    !isString(meta.sign) ||
    !isString(meta.name)
  ) {
    return errorResult("Payload meta is missing required fields.");
  }

  const tabs = raw.tabs;
  if (!isRecord(tabs) || tabs.activeDefault !== "today") {
    return errorResult("Payload tabs.activeDefault must be \"today\".");
  }

  const today = raw.today;
  if (!isRecord(today)) {
    return errorResult("Payload today is missing.");
  }
  if (
    !isString(today.headline) ||
    !isString(today.subhead) ||
    !isString(today.theme) ||
    !isNumber(today.energyScore) ||
    !inRange(today.energyScore, 0, 100)
  ) {
    return errorResult("Payload today fields are invalid.");
  }

  if (
    !ensureArray(today.bestHours, (item): item is { label: string; start: string; end: string } =>
      isRecord(item) && isString(item.label) && isString(item.start) && isString(item.end)
    ) ||
    today.bestHours.length !== 2
  ) {
    return errorResult("Payload today.bestHours must contain exactly 2 items.");
  }

  const ratings = today.ratings;
  if (
    !isRecord(ratings) ||
    !isInteger(ratings.love) ||
    !isInteger(ratings.work) ||
    !isInteger(ratings.money) ||
    !isInteger(ratings.health) ||
    !inRange(ratings.love, 0, 5) ||
    !inRange(ratings.work, 0, 5) ||
    !inRange(ratings.money, 0, 5) ||
    !inRange(ratings.health, 0, 5)
  ) {
    return errorResult("Payload today.ratings must be 0–5 integers.");
  }

  const lucky = today.lucky;
  if (
    !isRecord(lucky) ||
    !isString(lucky.color) ||
    !isInteger(lucky.number) ||
    !isString(lucky.symbol)
  ) {
    return errorResult("Payload today.lucky is invalid.");
  }

  const doDont = today.doDont;
  if (!isRecord(doDont) || !isString(doDont.do) || !isString(doDont.dont)) {
    return errorResult("Payload today.doDont is invalid.");
  }

  if (
    !ensureArray(today.sections, (item): item is { title: string; body: string } =>
      isRecord(item) && isString(item.title) && isString(item.body)
    ) ||
    today.sections.length === 0 ||
    !today.sections.every((section) => sectionTitles.has(section.title))
  ) {
    return errorResult("Payload today.sections is invalid.");
  }

  const cosmicWeather = raw.cosmicWeather;
  if (!isRecord(cosmicWeather)) {
    return errorResult("Payload cosmicWeather is missing.");
  }
  const moon = cosmicWeather.moon;
  if (!isRecord(moon) || !isString(moon.phase) || !isString(moon.sign)) {
    return errorResult("Payload cosmicWeather.moon is invalid.");
  }
  if (
    !ensureArray(cosmicWeather.transits, (item): item is {
      title: string;
      tone: string;
      meaning: string;
    } =>
      isRecord(item) && isString(item.title) && isString(item.tone) && isString(item.meaning)
    ) ||
    cosmicWeather.transits.length > 2 ||
    !cosmicWeather.transits.every((transit) => transitTones.has(transit.tone))
  ) {
    return errorResult("Payload cosmicWeather.transits is invalid.");
  }
  if (!isString(cosmicWeather.affectsToday)) {
    return errorResult("Payload cosmicWeather.affectsToday is invalid.");
  }

  const compatibility = raw.compatibility;
  if (!isRecord(compatibility)) {
    return errorResult("Payload compatibility is missing.");
  }
  if (
    !ensureArray(compatibility.bestFlowWith, isString) ||
    compatibility.bestFlowWith.length !== 2 ||
    !ensureArray(compatibility.handleGentlyWith, isString) ||
    compatibility.handleGentlyWith.length !== 1
  ) {
    return errorResult("Payload compatibility signs are invalid.");
  }
  const tips = compatibility.tips;
  if (!isRecord(tips) || !isString(tips.conflict) || !isString(tips.affection)) {
    return errorResult("Payload compatibility.tips is invalid.");
  }

  const journalRitual = raw.journalRitual;
  if (
    !isRecord(journalRitual) ||
    !isString(journalRitual.prompt) ||
    !ensureArray(journalRitual.starters, isString) ||
    !isString(journalRitual.mantra) ||
    !isString(journalRitual.ritual)
  ) {
    return errorResult("Payload journalRitual is invalid.");
  }
  const bestDay = journalRitual.bestDayForDecisions;
  if (!isRecord(bestDay) || !isString(bestDay.dayLabel) || !isString(bestDay.reason)) {
    return errorResult("Payload journalRitual.bestDayForDecisions is invalid.");
  }

  const week = raw.week;
  if (!isRecord(week)) {
    return errorResult("Payload week is missing.");
  }
  const arc = week.arc;
  if (!isRecord(arc) || !isString(arc.start) || !isString(arc.midweek) || !isString(arc.weekend)) {
    return errorResult("Payload week.arc is invalid.");
  }
  if (!isString(week.keyOpportunity) || !isString(week.keyCaution)) {
    return errorResult("Payload week key items are invalid.");
  }
  const bestDayFor = week.bestDayFor;
  if (
    !isRecord(bestDayFor) ||
    !isString(bestDayFor.decisions) ||
    !isString(bestDayFor.conversations) ||
    !isString(bestDayFor.rest)
  ) {
    return errorResult("Payload week.bestDayFor is invalid.");
  }

  const month = raw.month;
  if (!isRecord(month) || !isString(month.theme) || !isString(month.oneThing)) {
    return errorResult("Payload month is invalid.");
  }
  if (
    !ensureArray(month.keyDates, (item): item is { dateLabel: string; title: string; note: string } =>
      isRecord(item) && isString(item.dateLabel) && isString(item.title) && isString(item.note)
    ) ||
    month.keyDates.length !== 3
  ) {
    return errorResult("Payload month.keyDates must contain 3 items.");
  }
  const newMoon = month.newMoon;
  const fullMoon = month.fullMoon;
  if (
    !isRecord(newMoon) ||
    !isString(newMoon.dateLabel) ||
    !isString(newMoon.intention) ||
    !isRecord(fullMoon) ||
    !isString(fullMoon.dateLabel) ||
    !isString(fullMoon.release)
  ) {
    return errorResult("Payload month moon entries are invalid.");
  }

  const year = raw.year;
  if (!isRecord(year) || !isString(year.headline)) {
    return errorResult("Payload year is invalid.");
  }
  if (
    !ensureArray(year.quarters, (item): item is { label: string; focus: string } =>
      isRecord(item) && isString(item.label) && isString(item.focus)
    ) ||
    year.quarters.length !== 4 ||
    !year.quarters.every((quarter) => quarterLabels.has(quarter.label))
  ) {
    return errorResult("Payload year.quarters must contain 4 labeled items.");
  }
  if (!ensureArray(year.powerMonths, isString) || year.powerMonths.length === 0) {
    return errorResult("Payload year.powerMonths is invalid.");
  }
  const challenge = year.challengeMonth;
  if (!isRecord(challenge) || !isString(challenge.month) || !isString(challenge.guidance)) {
    return errorResult("Payload year.challengeMonth is invalid.");
  }

  return { valid: true, payload: raw as unknown as DashboardPayload };
}

export function sanitizeAndParseDashboardPayload(json: string): SanitizedParseResult {
  const { sanitized, info } = sanitizeDashboardPayload(json);
  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("Invalid JSON returned by model."),
      info,
    };
  }

  const normalized = normalizeDashboard(parsed);
  if (!isRecord(normalized)) {
    return {
      ok: false,
      error: new Error("Payload root must be an object."),
      info,
    };
  }
  const validation = validateDashboardPayload(normalized);
  if (!validation.valid) {
    return { ok: false, error: new Error(validation.error), info };
  }
  return { ok: true, value: validation.payload, info };
}

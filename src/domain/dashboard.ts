import type { DashboardPayload } from "./types";

type ValidationResult =
  | { valid: true; payload: DashboardPayload; sanitizedJson: string }
  | { valid: false; error: string; sanitizedJson: string };

const sectionTitles = ["Focus", "Relationships", "Action", "Reflection"] as const;
const sectionTitleSet = new Set<string>(sectionTitles as readonly string[]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  isNumber(value) && Number.isInteger(value);

const inRange = (value: number, min: number, max: number) =>
  value >= min && value <= max;

const toInt = (value: unknown): number | null => {
  if (isInteger(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^[-+]?\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const ensureArray = <T>(
  value: unknown,
  predicate: (item: unknown) => item is T
): value is T[] => Array.isArray(value) && value.every(predicate);

function errorResult(message: string, sanitizedJson: string): ValidationResult {
  return { valid: false, error: message, sanitizedJson };
}

/**
 * Best-effort extraction of the first complete JSON object from a text blob.
 * - Does not do JSON parsing.
 * - Balances braces outside of strings.
 */
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
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.includes("```")) return trimmed;

  // Remove leading ```json / ``` and trailing ``` if present.
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Some models occasionally output an invalid pattern like:
 *   {"a":1},{"b":2}
 * when they should output:
 *   {"a":1,"b":2}
 *
 * This function unwraps the anonymous object wrappers introduced after a comma
 * at root-object depth (depth === 1).
 */
function unwrapAnonymousRootObjects(json: string): { json: string; applied: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;

  let pendingWrapperStart: number | null = null;
  let skippingWrapper = false;
  let wrapperEndDepth = -1;

  let applied = false;
  const out: string[] = [];

  const nextNonWhitespaceIndex = (from: number) => {
    for (let j = from; j < json.length; j += 1) {
      const c = json[j];
      if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") return j;
    }
    return -1;
  };

  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i];

    if (inString) {
      out.push(ch);
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
      out.push(ch);
      continue;
    }

    // Detect comma at root depth followed by an anonymous object wrapper.
    if (!skippingWrapper && depth === 1 && ch === ",") {
      const j = nextNonWhitespaceIndex(i + 1);
      if (j !== -1 && json[j] === "{") {
        pendingWrapperStart = j;
      }
      out.push(ch);
      continue;
    }

    // Start skipping wrapper "{" if we hit it.
    if (pendingWrapperStart !== null && i === pendingWrapperStart && ch === "{") {
      skippingWrapper = true;
      wrapperEndDepth = depth + 1;
      pendingWrapperStart = null;
      applied = true;
      depth += 1;
      // Skip writing this brace.
      continue;
    }

    if (ch === "{") {
      depth += 1;
      out.push(ch);
      continue;
    }

    if (ch === "}") {
      // Skip the wrapper's closing brace.
      if (skippingWrapper && depth === wrapperEndDepth) {
        skippingWrapper = false;
        wrapperEndDepth = -1;
        applied = true;
        depth -= 1;
        continue;
      }
      depth -= 1;
      out.push(ch);
      continue;
    }

    out.push(ch);
  }

  return { json: out.join(""), applied };
}

function sanitizeDashboardJson(raw: string): { json: string; applied: string[] } {
  const applied: string[] = [];

  let text = stripCodeFences(raw);
  const extracted = extractFirstJsonObject(text);
  if (extracted) {
    text = extracted;
    applied.push("extractFirstJsonObject");
  } else {
    // Fallback: trim to first "{" and last "}" if possible.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      text = text.slice(first, last + 1);
      applied.push("sliceToBraces");
    }
  }

  const unwrapped = unwrapAnonymousRootObjects(text);
  if (unwrapped.applied) {
    text = unwrapped.json;
    applied.push("unwrapAnonymousRootObjects");
  }

  return { json: text.trim(), applied };
}

function hasPlaceholders(jsonText: string): boolean {
  return jsonText.includes("__FILL__") ||
    jsonText.includes("__FILL_INT") ||
    jsonText.includes("__FILL_HHMM");
}

export function parseDashboardPayload(json: string): ValidationResult {
  const sanitized = sanitizeDashboardJson(json);

  if (!sanitized.json) {
    return errorResult("Empty model output.", sanitized.json);
  }

  if (hasPlaceholders(sanitized.json)) {
    return errorResult(
      "Model output still contains template placeholders.",
      sanitized.json
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(sanitized.json);
  } catch (error) {
    return errorResult(
      error instanceof Error ? error.message : "Invalid JSON returned by model.",
      sanitized.json
    );
  }

  if (!isRecord(raw)) {
    return errorResult("Payload root must be an object.", sanitized.json);
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
    return errorResult("Payload meta is missing required fields.", sanitized.json);
  }

  const today = raw.today;
  if (!isRecord(today)) {
    return errorResult("Payload today is missing.", sanitized.json);
  }

  const energyScore = toInt(today.energyScore);
  if (
    !isString(today.headline) ||
    !isString(today.subhead) ||
    !isString(today.theme) ||
    energyScore === null ||
    !inRange(energyScore, 0, 100)
  ) {
    return errorResult("Payload today fields are invalid.", sanitized.json);
  }

  if (
    !ensureArray(
      today.bestHours,
      (item): item is { label: string; start: string; end: string } =>
        isRecord(item) &&
        isString(item.label) &&
        isString(item.start) &&
        isString(item.end)
    ) ||
    today.bestHours.length !== 2
  ) {
    return errorResult(
      "Payload today.bestHours must contain exactly 2 items.",
      sanitized.json
    );
  }

  const ratings = today.ratings;
  const love = isRecord(ratings) ? toInt(ratings.love) : null;
  const work = isRecord(ratings) ? toInt(ratings.work) : null;
  const money = isRecord(ratings) ? toInt(ratings.money) : null;
  const health = isRecord(ratings) ? toInt(ratings.health) : null;

  if (
    !isRecord(ratings) ||
    love === null ||
    work === null ||
    money === null ||
    health === null ||
    !inRange(love, 0, 5) ||
    !inRange(work, 0, 5) ||
    !inRange(money, 0, 5) ||
    !inRange(health, 0, 5)
  ) {
    return errorResult("Payload today.ratings must be 0–5 integers.", sanitized.json);
  }

  const lucky = today.lucky;
  const luckyNumber = isRecord(lucky) ? toInt(lucky.number) : null;
  if (
    !isRecord(lucky) ||
    !isString(lucky.color) ||
    luckyNumber === null ||
    !isString(lucky.symbol)
  ) {
    return errorResult("Payload today.lucky is invalid.", sanitized.json);
  }

  const doDont = today.doDont;
  if (!isRecord(doDont) || !isString(doDont.do) || !isString(doDont.dont)) {
    return errorResult("Payload today.doDont is invalid.", sanitized.json);
  }

  if (
    !ensureArray(
      today.sections,
      (item): item is { title: string; body: string } =>
        isRecord(item) && isString(item.title) && isString(item.body)
    ) ||
    today.sections.length !== 4
  ) {
    return errorResult("Payload today.sections must contain 4 items.", sanitized.json);
  }

  const titles = today.sections.map((s) => s.title);
  const titlesValid =
    titles.length === 4 &&
    titles.every((t) => sectionTitleSet.has(t)) &&
    titles[0] === "Focus" &&
    titles[1] === "Relationships" &&
    titles[2] === "Action" &&
    titles[3] === "Reflection";

  if (!titlesValid) {
    return errorResult(
      "Payload today.sections titles must be Focus, Relationships, Action, Reflection (in order).",
      sanitized.json
    );
  }

  const compatibility = raw.compatibility;
  if (!isRecord(compatibility)) {
    return errorResult("Payload compatibility is missing.", sanitized.json);
  }

  if (
    !ensureArray(compatibility.bestFlowWith, isString) ||
    compatibility.bestFlowWith.length !== 2 ||
    !ensureArray(compatibility.handleGentlyWith, isString) ||
    compatibility.handleGentlyWith.length !== 1
  ) {
    return errorResult("Payload compatibility signs are invalid.", sanitized.json);
  }

  const tips = compatibility.tips;
  if (!isRecord(tips) || !isString(tips.conflict) || !isString(tips.affection)) {
    return errorResult("Payload compatibility.tips is invalid.", sanitized.json);
  }

  // Normalize common numeric coercions so UI always receives numbers.
  const normalized: DashboardPayload = {
    meta: {
      dateISO: meta.dateISO,
      localeDateLabel: meta.localeDateLabel,
      generatedAtISO: meta.generatedAtISO,
      sign: meta.sign,
      name: meta.name,
    },
    today: {
      headline: today.headline,
      subhead: today.subhead,
      theme: today.theme,
      energyScore,
      bestHours: today.bestHours,
      ratings: {
        love,
        work,
        money,
        health,
      },
      lucky: {
        color: lucky.color,
        number: luckyNumber,
        symbol: lucky.symbol,
      },
      doDont: {
        do: doDont.do,
        dont: doDont.dont,
      },
      sections: today.sections.map((s) => ({
        title: s.title as DashboardPayload["today"]["sections"][number]["title"],
        body: s.body,
      })),
    },
    compatibility: {
      bestFlowWith: compatibility.bestFlowWith,
      handleGentlyWith: compatibility.handleGentlyWith,
      tips: {
        conflict: tips.conflict,
        affection: tips.affection,
      },
    },
  };

  return { valid: true, payload: normalized, sanitizedJson: sanitized.json };
}

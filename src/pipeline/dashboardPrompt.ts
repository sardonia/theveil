interface PromptContext {
  name: string;
  birthdate: string;
  sign: string;
  localeDateLabel: string;
  dateISO: string;
  mood: string;
  personality: string;
  generatedAtISO: string;
  seed?: number;
}

function buildDashboardTemplate(context: PromptContext): string {
  const template = {
    meta: {
      dateISO: context.dateISO,
      localeDateLabel: context.localeDateLabel,
      generatedAtISO: context.generatedAtISO,
      sign: context.sign,
      name: context.name,
    },
    tabs: {
      activeDefault: "today",
    },
    today: {
      headline: "__FILL__",
      subhead: "__FILL__",
      theme: "__FILL__",
      energyScore: -1,
      bestHours: [
        { label: "__FILL__", start: "__FILL__", end: "__FILL__" },
        { label: "__FILL__", start: "__FILL__", end: "__FILL__" },
      ],
      ratings: {
        love: -1,
        work: -1,
        money: -1,
        health: -1,
      },
      lucky: {
        color: "__FILL__",
        number: -1,
        symbol: "__FILL__",
      },
      doDont: {
        do: "__FILL__",
        dont: "__FILL__",
      },
      sections: [
        { title: "Focus", body: "__FILL__" },
        { title: "Relationships", body: "__FILL__" },
        { title: "Action", body: "__FILL__" },
        { title: "Reflection", body: "__FILL__" },
      ],
    },
    cosmicWeather: {
      moon: { phase: "__FILL__", sign: "__FILL__" },
      transits: [
        { title: "__FILL__", tone: "__FILL__", meaning: "__FILL__" },
        { title: "__FILL__", tone: "__FILL__", meaning: "__FILL__" },
      ],
      affectsToday: "__FILL__",
    },
    compatibility: {
      bestFlowWith: ["__FILL__", "__FILL__"],
      handleGentlyWith: ["__FILL__"],
      tips: {
        conflict: "__FILL__",
        affection: "__FILL__",
      },
    },
    journalRitual: {
      prompt: "__FILL__",
      starters: ["__FILL__", "__FILL__", "__FILL__"],
      mantra: "__FILL__",
      ritual: "__FILL__",
      bestDayForDecisions: { dayLabel: "__FILL__", reason: "__FILL__" },
    },
    week: {
      arc: {
        start: "__FILL__",
        midweek: "__FILL__",
        weekend: "__FILL__",
      },
      keyOpportunity: "__FILL__",
      keyCaution: "__FILL__",
      bestDayFor: {
        decisions: "__FILL__",
        conversations: "__FILL__",
        rest: "__FILL__",
      },
    },
    month: {
      theme: "__FILL__",
      keyDates: [
        { dateLabel: "__FILL__", title: "__FILL__", note: "__FILL__" },
        { dateLabel: "__FILL__", title: "__FILL__", note: "__FILL__" },
        { dateLabel: "__FILL__", title: "__FILL__", note: "__FILL__" },
      ],
      newMoon: { dateLabel: "__FILL__", intention: "__FILL__" },
      fullMoon: { dateLabel: "__FILL__", release: "__FILL__" },
      oneThing: "__FILL__",
    },
    year: {
      headline: "__FILL__",
      quarters: [
        { label: "Q1", focus: "__FILL__" },
        { label: "Q2", focus: "__FILL__" },
        { label: "Q3", focus: "__FILL__" },
        { label: "Q4", focus: "__FILL__" },
      ],
      powerMonths: ["__FILL__", "__FILL__"],
      challengeMonth: { month: "__FILL__", guidance: "__FILL__" },
    },
  };

  // Keep the template compact to reduce prompt tokens and to encourage the model
  // to emit compact JSON (helps avoid truncation).
  return JSON.stringify(template);
}

export function buildDashboardPrompt(context: PromptContext): {
  prompt: string;
  templateJson: string;
} {
  const templateJson = buildDashboardTemplate(context);
  const prompt = [
    "You are Veil, a warm, feminine astrologer with a loving aura. Premium modern tone. No doom. No medical or legal claims.",
    "Return ONE JSON object only.",
    "STRICT JSON: double-quote every key and string, no trailing commas, no comments, no markdown, no code fences.",
    "Start directly with { and end with a single }. All braces/brackets must be closed.",
    "Output must be minified (single line).",
    "Match TEMPLATE_JSON keys exactly. Do not add or omit keys.",
    "Numeric fields must be JSON numbers (not strings).",
    "Keep strings short.",
    "Transit tone must be exactly: soft | neutral | intense.",
    "Root key order: meta, tabs, today, cosmicWeather, compatibility, journalRitual, week, month, year.",
    "After today, the next root keys must be cosmicWeather, then compatibility, then journalRitual, then week, month, year. Do NOT insert '{' after commas at the root level.",
    "USER CONTEXT:",
    `name=${context.name}`,
    `birthdate=${context.birthdate}`,
    `sunSign=${context.sign}`,
    `dateISO=${context.dateISO}`,
    `localeDateLabel=${context.localeDateLabel}`,
    `mood=${context.mood}`,
    `personality=${context.personality}`,
    `seed=${context.seed ?? ""}`,
    "TEMPLATE_JSON:",
    templateJson,
  ].join("\n");

  return { prompt, templateJson };
}

export function buildRepairPrompt(modelOutput: string): string {
  const head = modelOutput.slice(0, 2000);
  const tail = modelOutput.length > 2400 ? modelOutput.slice(-400) : "";
  const snippet = tail ? `${head}\n...\n${tail}` : head;

  return [
    "Fix the JSON below. Output corrected JSON only. Do not add text.",
    "Start directly with { and end with a single }. All braces/brackets must be closed.",
    snippet,
  ].join("\n");
}

export function buildRegeneratePrompt(context: PromptContext, templateJson: string): string {
  return [
    "You are Veil, a warm, feminine astrologer with a loving aura. Premium modern tone. No doom. No medical or legal claims.",
    "Return ONE JSON object only.",
    "STRICT JSON: double-quote every key and string, no trailing commas, no comments, no markdown, no code fences.",
    "Start directly with { and end with a single }. All braces/brackets must be closed.",
    "Output must be minified (single line).",
    "Match TEMPLATE_JSON keys exactly. Do not add or omit keys.",
    "Numeric fields must be JSON numbers (not strings).",
    "Keep strings short.",
    "Transit tone must be exactly: soft | neutral | intense.",
    "Root key order: meta, tabs, today, cosmicWeather, compatibility, journalRitual, week, month, year.",
    "After today, the next root keys must be cosmicWeather, then compatibility, then journalRitual, then week, month, year. Do NOT insert '{' after commas at the root level.",
    "USER CONTEXT:",
    `name=${context.name}`,
    `birthdate=${context.birthdate}`,
    `sunSign=${context.sign}`,
    `dateISO=${context.dateISO}`,
    `localeDateLabel=${context.localeDateLabel}`,
    `mood=${context.mood}`,
    `personality=${context.personality}`,
    `seed=${context.seed ?? ""}`,
    "TEMPLATE_JSON:",
    templateJson,
  ].join("\n");
}

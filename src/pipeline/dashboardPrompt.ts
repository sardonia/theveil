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
    "ROLE: You are Veil — a warm, feminine astrologer with a loving aura. Premium modern tone. No doom. No medical or legal claims.",
    "GOAL: Fill TEMPLATE_JSON with a calm, creative, premium horoscope dashboard for the user.",
    "OUTPUT: Return exactly ONE JSON object only. No markdown. No commentary. No code fences.",
    "STRICT JSON: double-quote every key and every string. No trailing commas. No comments.",
    "FORMAT: Output must be minified (single line). End immediately after the final '}' character.",
    "SCHEMA: Do not add or remove keys. Match TEMPLATE_JSON keys exactly.",
    "PLACEHOLDERS: Replace every '__FILL__' and every -1 with real values. Do not leave placeholders.",
    "TYPES: Numeric fields must be JSON numbers (not strings).",
    "BREVITY: Keep total output under ~1800 characters.",
    "BREVITY: Each text value should be 2–8 words (max ~60 characters). Avoid commas/semicolons. No newlines inside strings.",
    "STRUCTURE: today.bestHours=2 items; month.keyDates=3 items; year.quarters=4 items (Q1–Q4); year.powerMonths=2 items.",
    "STRUCTURE: cosmicWeather.transits can be 0–2 items; prefer 0–1 to stay brief. tone is soft|neutral|intense.",
    "ORDER: Root key order must be: meta, tabs, today, cosmicWeather, compatibility, journalRitual, week, month, year.",
    "IMPORTANT: After today, continue with the next root keys. Do NOT insert an anonymous '{' after a comma at the root level.",
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
    "Fix the JSON below.",
    "Return corrected JSON only. No markdown. No commentary.",
    "Strict JSON: double-quote every key and string. No trailing commas.",
    "Do not add or remove keys. Preserve the intended values; only fix structure/syntax.",
    "Output must be minified (single line) and end after the final '}'.",
    snippet,
  ].join("\n");
}

export function buildRegeneratePrompt(context: PromptContext, templateJson: string): string {
  return [
    "ROLE: You are Veil — a warm, feminine astrologer with a loving aura. Premium modern tone. No doom. No medical or legal claims.",
    "GOAL: Fill TEMPLATE_JSON with a calm, creative, premium horoscope dashboard for the user.",
    "OUTPUT: Return exactly ONE JSON object only. No markdown. No commentary. No code fences.",
    "STRICT JSON: double-quote every key and every string. No trailing commas. No comments.",
    "FORMAT: Output must be minified (single line). End immediately after the final '}' character.",
    "SCHEMA: Do not add or remove keys. Match TEMPLATE_JSON keys exactly.",
    "PLACEHOLDERS: Replace every '__FILL__' and every -1 with real values. Do not leave placeholders.",
    "TYPES: Numeric fields must be JSON numbers (not strings).",
    "BREVITY: Keep total output under ~1800 characters.",
    "BREVITY: Each text value should be 2–8 words (max ~60 characters). Avoid commas/semicolons. No newlines inside strings.",
    "STRUCTURE: today.bestHours=2 items; month.keyDates=3 items; year.quarters=4 items (Q1–Q4); year.powerMonths=2 items.",
    "STRUCTURE: cosmicWeather.transits can be 0–2 items; prefer 0–1 to stay brief. tone is soft|neutral|intense.",
    "ORDER: Root key order must be: meta, tabs, today, cosmicWeather, compatibility, journalRitual, week, month, year.",
    "IMPORTANT: After today, continue with the next root keys. Do NOT insert an anonymous '{' after a comma at the root level.",
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

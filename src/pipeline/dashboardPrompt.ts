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
      energyScore: "__FILL_INT_0_100__",
      bestHours: [
        { label: "__FILL__", start: "__FILL__", end: "__FILL__" },
        { label: "__FILL__", start: "__FILL__", end: "__FILL__" },
      ],
      ratings: {
        love: "__FILL_INT_0_5__",
        work: "__FILL_INT_0_5__",
        money: "__FILL_INT_0_5__",
        health: "__FILL_INT_0_5__",
      },
      lucky: {
        color: "__FILL__",
        number: "__FILL_INT__",
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

  return JSON.stringify(template, null, 2);
}

export function buildDashboardPrompt(context: PromptContext): {
  prompt: string;
  templateJson: string;
} {
  const templateJson = buildDashboardTemplate(context);
  const prompt = [
    "SYSTEM:",
    "You output JSON only. No markdown. No extra keys.",
    "",
    "USER:",
    "Create a calm, premium horoscope \"Cosmic Dashboard\" payload for:",
    `- Name: ${context.name}`,
    `- Birthdate: ${context.birthdate}`,
    `- Sun sign: ${context.sign}`,
    `- Date: ${context.dateISO}`,
    `- Seed: ${context.seed ?? ""}`,
    `- Mood: ${context.mood}`,
    `- Personality: ${context.personality}`,
    "",
    "Rules:",
    "- Output valid JSON only.",
    "- Do not add or remove keys.",
    "- Replace every placeholder value in the template below.",
    "- Keep all strings UI-friendly: 1-2 sentences max where applicable.",
    "- Numbers must respect placeholder constraints:",
    "  - energyScore 0-100 (integer)",
    "  - ratings 0-5 (integers)",
    "  - Provide exactly 2 bestHours windows",
    "  - Provide exactly 3 month.keyDates",
    "  - Provide exactly 4 year.quarters",
    "- transit tone must be \"soft\", \"neutral\", or \"intense\".",
    "- No newlines inside strings. Use short sentences.",
    "",
    "TEMPLATE_JSON:",
    templateJson,
    "",
    "Output the completed JSON only.",
  ].join("\n");

  return { prompt, templateJson };
}

export function buildRepairPrompt(
  context: PromptContext,
  templateJson: string,
  modelOutput: string
): string {
  return [
    "SYSTEM:",
    "You output JSON only. No markdown.",
    "",
    "USER:",
    "You will be given:",
    "1) The required TEMPLATE_JSON (structure is correct)",
    "2) A MODEL_OUTPUT that is supposed to match it but may be invalid JSON or missing keys.",
    "",
    "Task:",
    "- Return valid JSON only.",
    "- Make MODEL_OUTPUT conform exactly to TEMPLATE_JSON keys and types.",
    "- Do not invent new keys.",
    "- If a field is missing, fill it with a reasonable short value consistent with the user context.",
    "- No commentary.",
    "",
    "User context:",
    `Name: ${context.name}`,
    `Birthdate: ${context.birthdate}`,
    `Sun sign: ${context.sign}`,
    `Date: ${context.dateISO}`,
    `Seed: ${context.seed ?? ""}`,
    `Mood: ${context.mood}`,
    `Personality: ${context.personality}`,
    "",
    "TEMPLATE_JSON:",
    templateJson,
    "",
    "MODEL_OUTPUT:",
    modelOutput,
    "",
    "Output the fixed JSON only.",
  ].join("\n");
}

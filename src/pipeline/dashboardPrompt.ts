interface PromptContext {
  name: string;
  birthdate: string;
  sign: string;
  localeDateLabel: string;
  dateISO: string;
  mood: string;
  personality: string;
  generatedAtISO: string;
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
    today: {
      headline: "__FILL__",
      subhead: "__FILL__",
      theme: "__FILL__",
      energyScore: "__FILL_INT_0_100__",
      bestHours: [
        { label: "__FILL__", start: "__FILL_HHMM__", end: "__FILL_HHMM__" },
        { label: "__FILL__", start: "__FILL_HHMM__", end: "__FILL_HHMM__" },
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
    compatibility: {
      bestFlowWith: ["__FILL__", "__FILL__"],
      handleGentlyWith: ["__FILL__"],
      tips: {
        conflict: "__FILL__",
        affection: "__FILL__",
      },
    },
  };

  // Keep the template compact to reduce prompt size.
  return JSON.stringify(template);
}

export function buildDashboardPrompt(context: PromptContext): {
  prompt: string;
  templateJson: string;
} {
  const templateJson = buildDashboardTemplate(context);
  const prompt = [
    "ROLE:",
    "You are Veil: a warm, feminine astrologer with a loving aura. You write premium, modern astrology — gentle, confident, and creative — without doom or medical/legal claims.",
    "",
    "OUTPUT CONTRACT (MUST FOLLOW):",
    "- Return ONE JSON object only. No markdown. No commentary.",
    "- Strict JSON: double-quote every property name and every string. No trailing commas.",
    "- Use JSON numbers (not strings) for numeric fields.",
    "- Do NOT add or remove keys. Match TEMPLATE_JSON keys exactly.",
    "- Keep each text value short (typically 6–18 words).",
    "- Avoid newline characters inside strings.",
    "",
    "USER CONTEXT:",
    `name=${context.name}`,
    `birthdate=${context.birthdate}`,
    `sunSign=${context.sign}`,
    `dateISO=${context.dateISO}`,
    `localeDateLabel=${context.localeDateLabel}`,
    `mood=${context.mood}`,
    `personality=${context.personality}`,
    "",
    "STRUCTURE RULES:",
    "- today.bestHours: exactly 2 items; time format is HH:MM (24h).",
    "- today.sections: exactly 4 items with titles Focus, Relationships, Action, Reflection (in that order).",
    "- compatibility.bestFlowWith: exactly 2 signs.",
    "- compatibility.handleGentlyWith: exactly 1 sign.",
    "- today.energyScore: integer 0–100.",
    "- today.ratings.*: integers 0–5.",
    "",
    "TEMPLATE_JSON:",
    templateJson,
    "",
    "Now output the completed JSON only.",
  ].join("\n");

  return { prompt, templateJson };
}

export function buildRepairPrompt(
  context: PromptContext,
  templateJson: string,
  modelOutput: string
): string {
  return [
    "ROLE:",
    "You are Veil: a careful JSON formatter.",
    "",
    "TASK:",
    "- Return valid JSON only.",
    "- Conform exactly to TEMPLATE_JSON keys and types.",
    "- Do not invent new keys.",
    "- If a field is missing, fill it with a short, soothing value consistent with the user context.",
    "- Use JSON numbers for numeric fields.",
    "",
    "USER CONTEXT:",
    `name=${context.name}`,
    `birthdate=${context.birthdate}`,
    `sunSign=${context.sign}`,
    `dateISO=${context.dateISO}`,
    `mood=${context.mood}`,
    `personality=${context.personality}`,
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

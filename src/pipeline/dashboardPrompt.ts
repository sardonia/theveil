interface PromptContext {
  name: string;
  sign: string;
  localeDateLabel: string;
  dateISO: string;
  tone: "mystical" | "practical" | "balanced";
  focus: "general" | "love" | "work" | "money" | "health";
}

const JSON_SCHEMA_EXAMPLE = `{
  "meta": {
    "dateISO": "2025-01-14",
    "localeDateLabel": "Wednesday, January 14",
    "generatedAtISO": "2025-01-14T09:12:00.000Z",
    "sign": "Leo",
    "name": "Sean"
  },
  "tabs": {
    "activeDefault": "today"
  },
  "today": {
    "headline": "Soft focus, clear intention",
    "subhead": "A steady glow guides your choices.",
    "theme": "Clarity",
    "energyScore": 72,
    "bestHours": [
      { "label": "Morning", "start": "9:00 AM", "end": "11:00 AM" },
      { "label": "Evening", "start": "5:00 PM", "end": "7:00 PM" }
    ],
    "ratings": { "love": 4, "work": 4, "money": 3, "health": 4 },
    "lucky": { "color": "Gold", "number": 3, "symbol": "★" },
    "doDont": { "do": "Trust your instincts", "dont": "Overshare" },
    "sections": [
      { "title": "Focus", "body": "Pick one clear intention and let the rest soften." },
      { "title": "Relationships", "body": "Lead with warmth and give space for others to respond." },
      { "title": "Action", "body": "Take one grounded step that supports your long view." },
      { "title": "Reflection", "body": "Notice what feels steady and keep returning to it." }
    ]
  },
  "cosmicWeather": {
    "moon": { "phase": "First Quarter", "sign": "Cancer" },
    "transits": [
      { "title": "Mercury retrograde themes", "tone": "neutral", "meaning": "Review and simplify before committing." },
      { "title": "Venus harmony", "tone": "soft", "meaning": "Gentle conversations land well." }
    ],
    "affectsToday": "Emotional tides rise and fall; choose calm responses."
  },
  "compatibility": {
    "bestFlowWith": ["Aries", "Gemini"],
    "handleGentlyWith": ["Taurus"],
    "tips": {
      "conflict": "Pause before replying to keep things kind.",
      "affection": "Playful honesty keeps the mood light."
    }
  },
  "journalRitual": {
    "prompt": "What am I protecting right now?",
    "starters": ["I feel…", "I need…", "I'm avoiding…"],
    "mantra": "I move with grace and clear intention.",
    "ritual": "Light a candle and name one priority out loud.",
    "bestDayForDecisions": { "dayLabel": "Thursday", "reason": "Clarity peaks in the afternoon." }
  },
  "week": {
    "arc": {
      "start": "Settle into a calm, focused rhythm.",
      "midweek": "Tune inward before making changes.",
      "weekend": "Conversations flow and ease returns."
    },
    "keyOpportunity": "Strengthen a bond through simple honesty.",
    "keyCaution": "Avoid overcommitting before you feel ready.",
    "bestDayFor": {
      "decisions": "Thursday",
      "conversations": "Wednesday",
      "rest": "Sunday"
    }
  },
  "month": {
    "theme": "Clarity through gentle structure.",
    "keyDates": [
      { "dateLabel": "Jan 9–10", "title": "New Moon", "note": "Set intentions around focus." },
      { "dateLabel": "Jan 17", "title": "Personal reset", "note": "Simplify a lingering task." },
      { "dateLabel": "Jan 25", "title": "Full Moon", "note": "Release what feels heavy." }
    ],
    "newMoon": { "dateLabel": "Jan 9–10", "intention": "Commit to one steady practice." },
    "fullMoon": { "dateLabel": "Jan 25", "release": "Let go of scattered priorities." },
    "oneThing": "If you do one thing, choose the gentlest next step."
  },
  "year": {
    "headline": "A year to trust your timing and refine your craft.",
    "quarters": [
      { "label": "Q1", "focus": "Grounded beginnings and clearing space." },
      { "label": "Q2", "focus": "Momentum builds through collaboration." },
      { "label": "Q3", "focus": "Visibility grows with steady effort." },
      { "label": "Q4", "focus": "Integration and graceful completion." }
    ],
    "powerMonths": ["March", "July"],
    "challengeMonth": { "month": "October", "guidance": "Slow down and streamline." }
  }
}`;

export function buildDashboardPrompt(context: PromptContext): string {
  return [
    "SYSTEM / INSTRUCTION:",
    "You are an offline horoscope assistant generating structured content for a calm “Cosmic Dashboard” UI. You must output STRICT JSON ONLY that matches the required schema. Do NOT output markdown, explanations, or extra keys. Every key must be present. Keep text concise, soothing, and premium.",
    "",
    "USER CONTEXT (inject values):",
    `Name: ${context.name}`,
    `Sun sign: ${context.sign}`,
    `Local date label: ${context.localeDateLabel}`,
    `ISO date: ${context.dateISO}`,
    `Tone: ${context.tone}  // "mystical" | "practical" | "balanced"`,
    `Focus: ${context.focus} // "general" | "love" | "work" | "money" | "health"`,
    "",
    "OUTPUT RULES:",
    "- Output valid JSON only. No trailing commas.",
    "- Strings must be short and UI-friendly.",
    "- Ratings are integers 0–5.",
    "- energyScore is 0–100.",
    "- bestHours: provide exactly 2 windows with start/end like \"9:00 AM\".",
    "- bestFlowWith: 2 signs. handleGentlyWith: 1 sign.",
    "- transits: 2 items max, with tone and meaning.",
    "- weekly arc: 3 short lines (Start/Midweek/Weekend).",
    "- month keyDates: exactly 3 items.",
    "- year quarters: exactly 4 items.",
    "",
    "JSON SCHEMA TO PRODUCE (match keys exactly):",
    JSON_SCHEMA_EXAMPLE,
    "",
    "CONTENT STYLE:",
    "- Calm, luminous, gently directive. Avoid alarmist language.",
    "- Don’t claim factual astronomical precision; phrase as “themes” and “cosmic weather”.",
    `- Make it feel personalized to ${context.sign} without being cheesy.`,
    "",
    "Now produce the JSON payload.",
  ].join("\n");
}

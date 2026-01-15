import type { DashboardPayload, ProfileDraft } from "../domain/types";
import { zodiacSign } from "../domain/zodiac";

export class StubAdapter {
  async generate(profile: ProfileDraft, dateISO: string): Promise<string> {
    const sign = zodiacSign(profile.birthdate);
    const seed = hashSeed(
      `${profile.name}-${dateISO}-${sign}-${profile.mood}-${profile.personality}`
    );
    const rng = seeded(seed);
    const localeDateLabel = new Date(dateISO).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const title = pick(rng, [
      "Soft focus, clear intention",
      "The hush before a bright idea",
      "A horizon you can trust",
      "The spark beneath stillness",
      "A graceful return to center",
    ]);

    const openings = [
      `The day opens with a ${profile.mood.toLowerCase()} current that invites gentler choices.`,
      `A ${profile.mood.toLowerCase()} undertone guides your timing and attention.`,
      `You move through a ${profile.mood.toLowerCase()} rhythm that rewards patience.`,
    ];
    const middles = [
      `As ${sign}, your ${profile.personality.toLowerCase()} nature notices subtle shifts first.`,
      `Your ${profile.personality.toLowerCase()} instincts highlight what wants to soften.`,
      `The ${profile.personality.toLowerCase()} in you translates intuition into one clear step.`,
    ];
    const closers = [
      `Let small rituals ground you, and let clarity arrive in layers.`,
      `Pause before replying and your best phrasing will surface.`,
      `Choose one gentle action that honors your energy, and let that be enough.`,
    ];

    const message = [pick(rng, openings), pick(rng, middles), pick(rng, closers)]
      .join(" ")
      .trim();

    const payload: DashboardPayload = {
      meta: {
        dateISO,
        localeDateLabel,
        generatedAtISO: new Date().toISOString(),
        sign,
        name: profile.name,
      },
      tabs: {
        activeDefault: "today",
      },
      today: {
        headline: title,
        subhead: message,
        theme: pick(rng, ["Clarity", "Patience", "Warmth", "Alignment", "Ease"]),
        energyScore: Math.floor(rng() * 45) + 55,
        bestHours: [
          { label: "Morning", start: "9:00 AM", end: "11:00 AM" },
          { label: "Evening", start: "5:00 PM", end: "7:00 PM" },
        ],
        ratings: {
          love: Math.floor(rng() * 3) + 3,
          work: Math.floor(rng() * 3) + 3,
          money: Math.floor(rng() * 3) + 2,
          health: Math.floor(rng() * 3) + 3,
        },
        lucky: {
          color: pick(rng, ["Gold", "Moonlit Indigo", "Soft Lavender", "Sea-glass Teal"]),
          number: Math.floor(rng() * 9) + 1,
          symbol: pick(rng, ["★", "☾", "✦"]),
        },
        doDont: {
          do: "Trust your instincts and keep plans simple.",
          dont: "Overshare or rush to fill quiet moments.",
        },
        sections: [
          { title: "Focus", body: "Pick one clear priority and let the rest soften." },
          { title: "Relationships", body: "Lead with warmth and give others space to respond." },
          { title: "Action", body: "Take one grounded step that supports your long view." },
          { title: "Reflection", body: "Notice what feels steady and keep returning to it." },
        ],
      },
      cosmicWeather: {
        moon: {
          phase: pick(rng, ["First Quarter", "Waxing Crescent", "Full Moon", "New Moon"]),
          sign: pick(rng, ["Cancer", "Libra", "Scorpio", "Taurus"]),
        },
        transits: [
          {
            title: "Mercury review cycle",
            tone: "neutral",
            meaning: "Double-check details before committing.",
          },
          {
            title: "Venus harmony",
            tone: "soft",
            meaning: "Gentle conversations land with ease.",
          },
        ],
        affectsToday: "Emotional tides rise and fall; choose calm responses.",
      },
      compatibility: {
        bestFlowWith: shuffle(rng, ["Aries", "Gemini", "Libra", "Sagittarius"]).slice(
          0,
          2
        ),
        handleGentlyWith: [pick(rng, ["Taurus", "Scorpio", "Capricorn"])],
        tips: {
          conflict: "Pause before replying to keep things kind.",
          affection: "Playful honesty keeps the mood light.",
        },
      },
      journalRitual: {
        prompt: "What feels most important to protect today?",
        starters: ["I feel…", "I need…", "I'm avoiding…"],
        mantra: "I move with grace and clear intention.",
        ritual: "Light a candle and name one priority out loud.",
        bestDayForDecisions: {
          dayLabel: "Thursday",
          reason: "Clarity peaks in the afternoon.",
        },
      },
      week: {
        arc: {
          start: "Settle into a calm, focused rhythm.",
          midweek: "Tune inward before making changes.",
          weekend: "Conversations flow and ease returns.",
        },
        keyOpportunity: "Strengthen a bond through simple honesty.",
        keyCaution: "Avoid overcommitting before you feel ready.",
        bestDayFor: {
          decisions: "Thursday",
          conversations: "Wednesday",
          rest: "Sunday",
        },
      },
      month: {
        theme: "Clarity through gentle structure.",
        keyDates: [
          { dateLabel: "Jan 9–10", title: "New Moon", note: "Set intentions around focus." },
          { dateLabel: "Jan 17", title: "Personal reset", note: "Simplify a lingering task." },
          { dateLabel: "Jan 25", title: "Full Moon", note: "Release what feels heavy." },
        ],
        newMoon: { dateLabel: "Jan 9–10", intention: "Commit to one steady practice." },
        fullMoon: { dateLabel: "Jan 25", release: "Let go of scattered priorities." },
        oneThing: "If you do one thing, choose the gentlest next step.",
      },
      year: {
        headline: "A year to trust your timing and refine your craft.",
        quarters: [
          { label: "Q1", focus: "Grounded beginnings and clearing space." },
          { label: "Q2", focus: "Momentum builds through collaboration." },
          { label: "Q3", focus: "Visibility grows with steady effort." },
          { label: "Q4", focus: "Integration and graceful completion." },
        ],
        powerMonths: ["March", "July"],
        challengeMonth: { month: "October", guidance: "Slow down and streamline." },
      },
    };

    return JSON.stringify(payload);
  }
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function seeded(seed: number) {
  let state = seed + 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function pick<T>(rng: () => number, values: T[]): T {
  return values[Math.floor(rng() * values.length) % values.length];
}

function shuffle<T>(rng: () => number, values: T[]) {
  const clone = [...values];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

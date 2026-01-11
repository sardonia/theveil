import type { ProfileDraft, Reading } from "../domain/types";
import { zodiacSign } from "../domain/zodiac";

export class StubAdapter {
  async generate(profile: ProfileDraft, date: string): Promise<Reading> {
    const sign = zodiacSign(profile.birthdate);
    const seed = hashSeed(`${profile.name}-${date}-${sign}-${profile.mood}-${profile.personality}`);
    const rng = seeded(seed);

    const title = pick(rng, [
      "The hush before a bright idea",
      "Soft focus, clear intention",
      "A horizon you can trust",
      "The spark beneath stillness",
      "A graceful return to center",
    ]);

    const openings = [
      `Today opens with a ${profile.mood.toLowerCase()} current that invites gentler choices.`,
      `The day moves at a ${profile.mood.toLowerCase()} pace, offering room to breathe.`,
      `You may notice a ${profile.mood.toLowerCase()} undertone guiding your timing.`,
    ];
    const middles = [
      `As a ${profile.personality}, you naturally notice patterns others miss, so trust what quietly repeats.`,
      `Your ${profile.personality.toLowerCase()} instincts highlight what is worth protecting and what can soften.`,
      `The ${profile.personality.toLowerCase()} in you is ready to translate intuition into a simple next step.`,
    ];
    const closers = [
      `Let small rituals ground you, and remember that clarity arrives in layers, not lightning bolts.`,
      `If you pause before responding, the right phrasing will rise on its own.`,
      `Choose one gentle action that honors your energy, and let that be enough.`,
    ];

    const message = [pick(rng, openings), pick(rng, middles), pick(rng, closers)]
      .join(" ")
      .trim();

    const themes = shuffle(rng, [
      "Quiet confidence",
      "Meaningful timing",
      "Boundaries with kindness",
      "Creative listening",
      "Soft courage",
      "Steady focus",
    ]).slice(0, 3) as [string, string, string];

    const affirmation = pick(rng, [
      "I meet today with grounded curiosity.",
      "I can move gently and still be powerful.",
      "My inner compass grows clearer with every breath.",
      "I honor what I feel and choose what I need.",
    ]);

    const luckyColor = pick(rng, [
      "Moonlit Indigo",
      "Starlight Silver",
      "Luminous Lavender",
      "Sea-glass Teal",
      "Amber Mist",
    ]);

    const luckyNumber = Math.floor(rng() * 9) + 1;

    return {
      date,
      sign,
      title,
      message,
      themes,
      affirmation,
      luckyColor,
      luckyNumber,
      createdAt: new Date().toISOString(),
      source: "stub",
    };
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

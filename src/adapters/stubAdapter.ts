import type { DashboardPayload, ProfileDraft } from "../domain/types";

const stars = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export class StubAdapter {
  async generate(profile: ProfileDraft, date: string): Promise<string> {
    const name = profile?.name || "Seeker";
    const sign = profile ? guessSignFromBirthdate(profile.birthdate) : "Mystery";

    const payload: DashboardPayload = {
      meta: {
        dateISO: date,
        localeDateLabel: new Date(date).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        generatedAtISO: new Date().toISOString(),
        sign,
        name,
      },
      today: {
        headline: "A soft reset brings quiet confidence",
        subhead: "Your intuition is steady; choose one meaningful step and begin.",
        theme: "Gentle momentum",
        energyScore: 72,
        bestHours: [
          { label: "Morning", start: "08:00", end: "10:00" },
          { label: "Evening", start: "18:00", end: "20:00" },
        ],
        ratings: { love: 4, work: 4, money: 3, health: 4 },
        lucky: { color: "indigo", number: 7, symbol: "★" },
        doDont: {
          do: "Say yes to the simplest version of your plan",
          dont: "Overthink the first step",
        },
        sections: [
          { title: "Focus", body: "Pick one priority and let the rest wait." },
          {
            title: "Relationships",
            body: "Lead with warmth; ask one honest question.",
          },
          {
            title: "Action",
            body: "Start small, then build momentum with consistency.",
          },
          {
            title: "Reflection",
            body: "Notice what feels calm and keep returning to it.",
          },
        ],
      },
      compatibility: {
        bestFlowWith: ["Gemini", "Libra"],
        handleGentlyWith: ["Cancer"],
        tips: {
          conflict: "Breathe before replying; clarity lands softly.",
          affection: "Show care through presence and small gestures.",
        },
      },
    };

    return JSON.stringify(payload);
  }
}

function guessSignFromBirthdate(birthdate: string): string {
  // Simple fallback: use month to choose a sign-ish label.
  const parts = birthdate.split("-");
  const month = parts.length >= 2 ? Number.parseInt(parts[1], 10) : NaN;
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return "Mystery";
  }
  return stars[(month - 1) % stars.length];
}

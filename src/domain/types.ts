export type Route = "welcome" | "reading";

export type ModelStatus =
  | { status: "unloaded" }
  | { status: "loading"; progress: number }
  | {
      status: "loaded";
      modelPath: string;
      modelSizeMb: number;
      modelSizeBytes: number;
    }
  | { status: "error"; message: string };

export interface SamplingParams {
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  maxTokens: number;
  seed: number | null;
  stop: string[];
}

export interface ProfileDraft {
  name: string;
  birthdate: string;
  mood: string;
  personality: string;
}

export interface DashboardPayload {
  meta: {
    dateISO: string;
    localeDateLabel: string;
    generatedAtISO: string;
    sign: string;
    name: string;
  };
  tabs: {
    activeDefault: "today";
  };
  today: {
    headline: string;
    subhead: string;
    theme: string;
    energyScore: number;
    bestHours: Array<{ label: string; start: string; end: string }>;
    ratings: {
      love: number;
      work: number;
      money: number;
      health: number;
    };
    lucky: {
      color: string;
      number: number;
      symbol: string;
    };
    doDont: {
      do: string;
      dont: string;
    };
    sections: Array<{
      title: "Focus" | "Relationships" | "Action" | "Reflection";
      body: string;
    }>;
  };
  cosmicWeather: {
    moon: {
      phase: string;
      sign: string;
    };
    transits: Array<{
      title: string;
      tone: "soft" | "neutral" | "intense";
      meaning: string;
    }>;
    affectsToday: string;
  };
  compatibility: {
    bestFlowWith: string[];
    handleGentlyWith: string[];
    tips: {
      conflict: string;
      affection: string;
    };
  };
  journalRitual: {
    prompt: string;
    starters: string[];
    mantra: string;
    ritual: string;
    bestDayForDecisions: {
      dayLabel: string;
      reason: string;
    };
  };
  week: {
    arc: {
      start: string;
      midweek: string;
      weekend: string;
    };
    keyOpportunity: string;
    keyCaution: string;
    bestDayFor: {
      decisions: string;
      conversations: string;
      rest: string;
    };
  };
  month: {
    theme: string;
    keyDates: Array<{
      dateLabel: string;
      title: string;
      note: string;
    }>;
    newMoon: {
      dateLabel: string;
      intention: string;
    };
    fullMoon: {
      dateLabel: string;
      release: string;
    };
    oneThing: string;
  };
  year: {
    headline: string;
    quarters: Array<{
      label: "Q1" | "Q2" | "Q3" | "Q4";
      focus: string;
    }>;
    powerMonths: string[];
    challengeMonth: {
      month: string;
      guidance: string;
    };
  };
}

export interface AppState {
  model: {
    status: ModelStatus;
  };
  profile: {
    draft: ProfileDraft;
    saved: ProfileDraft | null;
    validationErrors: Partial<Record<keyof ProfileDraft, string>>;
  };
  reading: {
    current: DashboardPayload | null;
    history: DashboardPayload[];
    error: string | null;
  };
  ui: {
    route: Route;
    busyFlags: {
      generating: boolean;
      loadingModel: boolean;
    };
    toasts: string[];
  };
}

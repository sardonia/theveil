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

export type StreamEvent =
  | { kind: "start" }
  | { kind: "chunk"; chunk: string }
  | { kind: "end" };

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
  compatibility: {
    bestFlowWith: string[];
    handleGentlyWith: string[];
    tips: {
      conflict: string;
      affection: string;
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

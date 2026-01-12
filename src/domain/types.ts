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

export interface Reading {
  date: string;
  sign: string;
  title: string;
  message: string;
  themes: [string, string, string];
  affirmation: string;
  luckyColor: string;
  luckyNumber: number;
  createdAt: string;
  source: "model" | "stub";
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
    current: Reading | null;
    history: Reading[];
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

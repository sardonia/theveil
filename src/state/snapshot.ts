import type { AppState } from "../domain/types";
import { DEFAULT_PROFILE } from "../domain/constants";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_KEY = "veil.snapshot.v1";

interface Snapshot {
  version: number;
  savedAt: string;
  state: AppState;
}

export function getDefaultState(): AppState {
  return {
    model: {
      status: { status: "unloaded" },
    },
    profile: {
      draft: { ...DEFAULT_PROFILE },
      saved: null,
      validationErrors: {},
    },
    reading: {
      current: null,
      history: [],
    },
    ui: {
      route: "welcome",
      busyFlags: {
        generating: false,
        loadingModel: false,
      },
      toasts: [],
    },
  };
}

export function loadSnapshot(): AppState {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      return getDefaultState();
    }
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.version !== SNAPSHOT_VERSION) {
      return normalizeLoadedState(migrateSnapshot(parsed));
    }
    return normalizeLoadedState(reviveDates(parsed.state));
  } catch {
    return getDefaultState();
  }
}

export function saveSnapshot(state: AppState) {
  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function migrateSnapshot(snapshot: Snapshot): AppState {
  if (snapshot.version === 1) {
    return reviveDates(snapshot.state);
  }
  return getDefaultState();
}

function normalizeLoadedState(state: AppState): AppState {
  return {
    ...state,
    ui: {
      ...state.ui,
      route: "welcome",
      busyFlags: {
        ...state.ui.busyFlags,
        generating: false,
      },
      toasts: [],
    },
  };
}

function reviveDates(state: AppState): AppState {
  return {
    ...state,
    profile: {
      ...state.profile,
      draft: { ...state.profile.draft },
      saved: state.profile.saved ? { ...state.profile.saved } : null,
    },
    reading: {
      ...state.reading,
      current: state.reading.current ? { ...state.reading.current } : null,
      history: state.reading.history.map((reading) => ({ ...reading })),
    },
  };
}

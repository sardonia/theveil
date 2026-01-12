import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_PROFILE } from "./domain/constants";
import type { AppState, ModelStatus, ProfileDraft } from "./domain/types";
import { CommandBus } from "./state/commands";
import { loadSnapshot, saveSnapshot } from "./state/snapshot";
import { createStore } from "./state/store";
import {
  populateSelects,
  renderBusy,
  renderModelStatus,
  renderProfileDraft,
  renderReading,
  renderRoute,
  renderValidationErrors,
  showToast,
} from "./ui/dom";
import { initStarfield } from "./ui/starfield";

const store = createStore(loadSnapshot());
const commandBus = new CommandBus({
  getState: store.getState,
  applyEvents: (events) => {
    store.applyEvents(events);
    saveSnapshot(store.getState());
  },
});

function initModel() {
  invoke<ModelStatus>("init_model")
    .then((status) => commandBus.execute({ type: "ModelStatusUpdated", status }))
    .catch(() => undefined);

  listen<ModelStatus>("model:status", (event) => {
    commandBus.execute({ type: "ModelStatusUpdated", status: event.payload });
  });
}

function bindForm() {
  const form = document.querySelector<HTMLFormElement>("#profile-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const profile: ProfileDraft = {
      name: String(formData.get("name") ?? "").trim(),
      birthdate: String(formData.get("birthdate") ?? ""),
      mood: String(formData.get("mood") ?? DEFAULT_PROFILE.mood),
      personality: String(formData.get("personality") ?? DEFAULT_PROFILE.personality),
    };
    commandBus.execute({ type: "SubmitProfile", profile });
  });
}

function bindActions() {
  document.querySelector("#regenerate")?.addEventListener("click", () => {
    commandBus.execute({ type: "GenerateReading" });
  });

  document.querySelector("#edit-profile")?.addEventListener("click", () => {
    commandBus.execute({ type: "EditProfile" });
  });

  document.querySelector("#copy-reading")?.addEventListener("click", async () => {
    const reading = store.getState().reading.current;
    if (!reading) return;
    const text = `${reading.title}\n\n${reading.message}\n\nThemes: ${reading.themes.join(", ")}\nAffirmation: ${reading.affirmation}\nLucky color: ${reading.luckyColor}\nLucky number: ${reading.luckyNumber}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to your clipboard.");
    } catch {
      showToast("Unable to copy right now.");
    }
  });
}

function renderInitial(state: AppState) {
  renderRoute(state.ui.route);
  renderProfileDraft(state.profile.draft);
  renderValidationErrors(state.profile.validationErrors);
  renderModelStatus(state.model.status);
  renderReading(state.reading.current, state.profile.saved);
  renderBusy(state.ui.busyFlags.generating);
}

store.subscribe(
  (state) => state.profile.validationErrors,
  (value) => renderValidationErrors(value)
);
store.subscribe(
  (state) => state.ui.route,
  (value) => renderRoute(value)
);
store.subscribe(
  (state) => state.model.status,
  (value) => renderModelStatus(value)
);
store.subscribe(
  (state) => state.reading.current,
  (value) => renderReading(value, store.getState().profile.saved)
);
store.subscribe(
  (state) => state.ui.busyFlags.generating,
  (value) => renderBusy(value)
);
store.subscribe(
  (state) => state.ui.toasts,
  (value) => {
    const latest = value[value.length - 1];
    if (latest) showToast(latest);
  }
);

window.addEventListener("DOMContentLoaded", () => {
  populateSelects();
  bindForm();
  bindActions();
  renderInitial(store.getState());
  initModel();

  // Starfield is a purely decorative enhancement. If it fails to initialize
  // (e.g., older WKWebView builds on macOS missing APIs like ResizeObserver),
  // the rest of the app must still be interactive.
  try {
    initStarfield();
  } catch (error) {
    console.warn("Starfield failed to initialize; continuing without it.", error);
  }
});

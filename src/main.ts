import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DEFAULT_PROFILE } from "./domain/constants";
import type { AppState, ModelStatus, ProfileDraft } from "./domain/types";
import { CommandBus } from "./state/commands";
import { loadSnapshot, saveSnapshot } from "./state/snapshot";
import { createStore } from "./state/store";
import {
  appendReadingStream,
  populateSelects,
  resetReadingStream,
  renderBusy,
  renderModelStatus,
  renderProfileDraft,
  renderReading,
  renderRoute,
  renderValidationErrors,
  showToast,
  updateBirthdateInputState,
} from "./ui/dom";
import { initStarfield } from "./ui/starfield";
import {
  debugLog,
  debugModelLog,
  initDebug,
  isDebugEnabled,
  isDebugOverlayVisible,
  setDebugEnabled,
} from "./debug/logger";

type StreamEvent =
  | { kind: "start" }
  | { kind: "chunk"; chunk: string }
  | { kind: "end" };

const store = createStore(loadSnapshot());
const commandBus = new CommandBus({
  getState: store.getState,
  applyEvents: (events) => {
    store.applyEvents(events);
    saveSnapshot(store.getState());
  },
});

function initModel() {
  let fallbackTimeout: number | null = null;
  const clearFallback = () => {
    if (fallbackTimeout !== null) {
      window.clearTimeout(fallbackTimeout);
      fallbackTimeout = null;
    }
  };
  const scheduleFallback = (message: string, delayMs = 5000) => {
    clearFallback();
    fallbackTimeout = window.setTimeout(() => {
      const current = store.getState().model.status;
      if (current.status === "loading" || current.status === "unloaded") {
        commandBus.execute({
          type: "ModelStatusUpdated",
          status: { status: "error", message },
        });
      }
    }, delayMs);
  };

  scheduleFallback("Model initialization timed out.");
  debugModelLog("log", "model:init:start");
  invoke<ModelStatus>("init_model")
    .then((status) => {
      commandBus.execute({ type: "ModelStatusUpdated", status });
      debugModelLog("log", "model:init:response", status);
      if (status.status === "loaded" || status.status === "error") {
        clearFallback();
      } else {
        scheduleFallback("Model initialization is taking too long.");
      }
    })
    .catch((error) => {
      clearFallback();
      debugLog("warn", "initModel:failed", error);
      debugModelLog("error", "model:init:failed", error);
      commandBus.execute({
        type: "ModelStatusUpdated",
        status: { status: "error", message: "Model initialization failed." },
      });
    });

  listen<ModelStatus>("model:status", (event) => {
    commandBus.execute({ type: "ModelStatusUpdated", status: event.payload });
    debugModelLog("log", "model:status:update", event.payload);
    if (event.payload.status === "loaded" || event.payload.status === "error") {
      clearFallback();
    } else {
      scheduleFallback("Model initialization is taking too long.");
    }
  });
}

function initReadingStream() {
  let buffer = "";
  let chunkCount = 0;
  let flushHandle: number | null = null;

  const flush = () => {
    if (buffer.length > 0) {
      appendReadingStream(buffer);
      buffer = "";
    }
    flushHandle = null;
  };

  const scheduleFlush = () => {
    if (flushHandle !== null) return;
    flushHandle = window.setTimeout(flush, 33);
  };

  const appWindow = getCurrentWindow();
  const handleStreamEvent = (payload: StreamEvent) => {
    if (payload.kind === "start") {
      buffer = "";
      chunkCount = 0;
      resetReadingStream();
      debugModelLog("log", "reading:stream:start");
      return;
    }
    if (payload.kind === "chunk") {
      buffer += payload.chunk;
      chunkCount += 1;
      debugModelLog("log", "reading:stream:chunk", {
        index: chunkCount,
        length: payload.chunk.length,
        chunk: payload.chunk,
      });
      scheduleFlush();
      return;
    }
    debugModelLog("log", "reading:stream:end", { chunks: chunkCount });
    flush();
  };

  appWindow
    .listen<StreamEvent>("reading:stream", (event) => {
      handleStreamEvent(event.payload);
    })
    .then(() => {
      debugLog("log", "initReadingStream:ready", { target: appWindow.label });
      debugModelLog("log", "reading:stream:listener:ready", { target: appWindow.label });
    })
    .catch((error) => {
      debugLog("error", "initReadingStream:failed", error);
      debugModelLog("error", "reading:stream:listener:failed", error);
    });

  window.addEventListener("reading:stream-local", (event) => {
    const detail = (event as CustomEvent<StreamEvent>).detail;
    debugModelLog("log", "reading:stream:local", { kind: detail.kind });
    handleStreamEvent(detail);
  });
}

function bindForm() {
  const form = document.querySelector<HTMLFormElement>("#profile-form");
  if (!form) return;

  // We use our own Specification validation. Disable native HTML validation so
  // WKWebView/Safari quirks (especially around <input type="date">) cannot
  // block the submit event and make the button appear "dead".
  form.noValidate = true;

  const handleReveal = () => {
    const formData = new FormData(form);
    const profile: ProfileDraft = {
      name: String(formData.get("name") ?? "").trim(),
      birthdate: String(formData.get("birthdate") ?? ""),
      mood: String(formData.get("mood") ?? DEFAULT_PROFILE.mood),
      personality: String(formData.get("personality") ?? DEFAULT_PROFILE.personality),
    };
    debugLog("log", "reveal:handle", profile);
    void commandBus.execute({ type: "SubmitProfile", profile }).catch((error) => {
      debugLog("error", "command:SubmitProfile failed", error);
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleReveal();
  });

  // Handle the primary button click explicitly as a safety net.
  const revealButton = form.querySelector<HTMLButtonElement>("#reveal-reading");
  if (revealButton && isDebugEnabled()) {
    const rect = revealButton.getBoundingClientRect();
    const style = window.getComputedStyle(revealButton);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fromPoint = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const fromPointStyle = fromPoint ? window.getComputedStyle(fromPoint) : null;
    debugLog("log", "revealButton:bound", {
      disabled: revealButton.disabled,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      display: style.display,
      opacity: style.opacity,
      hitTestCenter: { x: cx, y: cy },
      hitTestElementFromPoint: fromPoint ? {
        tag: fromPoint.tagName,
        id: fromPoint.id || null,
        className: typeof fromPoint.className === "string" ? fromPoint.className : null,
        pointerEvents: fromPointStyle?.pointerEvents,
        zIndex: fromPointStyle?.zIndex,
        display: fromPointStyle?.display,
        opacity: fromPointStyle?.opacity,
      } : null,
    });

    revealButton.addEventListener(
      "pointerdown",
      (event) => {
        const e = event as PointerEvent;
        debugLog("log", "revealButton:pointerdown", {
          x: e.clientX,
          y: e.clientY,
          button: e.button,
        });
      },
      true
    );
  }
  revealButton?.addEventListener("click", (event) => {
    event.preventDefault();
    handleReveal();
  });

  const birthInput = form.querySelector<HTMLInputElement>("#birthdate-input");
  if (birthInput) {
    const syncBirthdate = () => updateBirthdateInputState(birthInput);
    syncBirthdate();
    birthInput.addEventListener("input", syncBirthdate);
    birthInput.addEventListener("change", syncBirthdate);
  }
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

function bindDebugToggle() {
  const toggle = document.querySelector<HTMLButtonElement>("#debug-toggle");
  if (!toggle) return;

  const syncState = () => {
    const isOn = isDebugOverlayVisible();
    toggle.classList.toggle("is-on", isOn);
    toggle.setAttribute("aria-pressed", String(isOn));
  };

  syncState();

  toggle.addEventListener("click", () => {
    const nextState = !isDebugOverlayVisible();
    setDebugEnabled(nextState);
    syncState();
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
  initDebug();
  debugLog("log", "DOMContentLoaded");

  // Helpful startup diagnostics (especially for WKWebView issues).
  debugLog("log", "UserAgent", navigator.userAgent);

  populateSelects();
  debugLog("log", "populateSelects:done", {
    moodOptions: document.querySelectorAll("#mood-input option").length,
    personalityOptions: document.querySelectorAll("#personality-input option").length,
  });

  bindForm();
  debugLog("log", "bindForm:done", {
    hasForm: Boolean(document.querySelector("#profile-form")),
    hasRevealButton: Boolean(document.querySelector("#reveal-reading")),
  });

  bindDebugToggle();

  bindActions();
  debugLog("log", "bindActions:done", {
    hasRegenerate: Boolean(document.querySelector("#regenerate")),
    hasEdit: Boolean(document.querySelector("#edit-profile")),
    hasCopy: Boolean(document.querySelector("#copy-reading")),
  });

  renderInitial(store.getState());
  debugLog("log", "renderInitial:done", {
    route: store.getState().ui.route,
  });

  initModel();
  debugLog("log", "initModel:started");
  initReadingStream();
  debugLog("log", "initReadingStream:started");

  // Starfield is purely decorative. Never let it break core interactivity.
  // (WKWebView feature support varies by macOS version.)
  try {
    initStarfield();
    if (isDebugEnabled()) {
      debugLog("log", "initStarfield:done");
    }
  } catch (error) {
    console.warn("Starfield failed to initialize; continuing without it.", error);
    debugLog("warn", "initStarfield:failed", error);
  }
});

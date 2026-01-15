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
  renderDashboard,
  renderModelStatus,
  renderProfileDraft,
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
    void commandBus.execute({ type: "GenerateReading" });
  });

  document.querySelector("#edit-profile")?.addEventListener("click", () => {
    void commandBus.execute({ type: "EditProfile" });
  });

  document.querySelector("#save-reading")?.addEventListener("click", () => {
    const payload = store.getState().reading.current;
    if (!payload) return;
    saveReading(payload);
  });

  document.querySelector("#share-reading")?.addEventListener("click", () => {
    void shareReading();
  });

  document.querySelector("#open-archive")?.addEventListener("click", () => {
    toggleArchive(true);
  });

  document.querySelector("#archive-close")?.addEventListener("click", () => {
    toggleArchive(false);
  });

  document.querySelector(".archive-modal__backdrop")?.addEventListener("click", () => {
    toggleArchive(false);
  });
}

function bindTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".dashboard__tab");
  const tabScrollTargets: Record<string, string> = {
    today: "#dashboard-primary",
    week: "#weekly-overview",
    month: "#monthly-highlights",
    year: "#year-overview",
    moon: "#cosmic-weather",
    chart: "#compatibility-card",
    journal: "#journal-ritual",
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((btn) => btn.classList.remove("is-active"));
      tab.classList.add("is-active");
      const target = tab.dataset.target;
      if (target && tabScrollTargets[target]) {
        const el = document.querySelector(tabScrollTargets[target]);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function saveReading(payload: NonNullable<AppState["reading"]["current"]>) {
  const key = `reading:${payload.meta.dateISO}:${payload.meta.sign}`;
  localStorage.setItem(key, JSON.stringify(payload));
  const indexKey = "reading:archive:index";
  const existing = JSON.parse(localStorage.getItem(indexKey) ?? "[]") as string[];
  const next = [key, ...existing.filter((entry) => entry !== key)].slice(0, 60);
  localStorage.setItem(indexKey, JSON.stringify(next));
  showToast("Saved to your archive.");
  renderArchiveList();
}

function getArchiveKeys() {
  const indexKey = "reading:archive:index";
  return JSON.parse(localStorage.getItem(indexKey) ?? "[]") as string[];
}

function renderArchiveList() {
  const list = document.querySelector<HTMLElement>("#archive-list");
  if (!list) return;
  const keys = getArchiveKeys();
  if (keys.length === 0) {
    list.innerHTML = "<p class=\"muted\">No saved readings yet.</p>";
    return;
  }
  list.innerHTML = keys
    .map((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      try {
        const payload = JSON.parse(raw) as AppState["reading"]["current"];
        if (!payload) return "";
        return `
          <button type="button" class="archive-item" data-key="${key}">
            <span>${payload.meta.localeDateLabel}</span>
            <span>${payload.meta.sign}</span>
          </button>
        `;
      } catch {
        return "";
      }
    })
    .join("");

  list.querySelectorAll<HTMLButtonElement>(".archive-item").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as AppState["reading"]["current"];
        if (!payload) return;
        store.applyEvents([{ type: "ReadingGenerated", reading: payload }]);
        saveSnapshot(store.getState());
        toggleArchive(false);
      } catch {
        showToast("Unable to open that saved reading.");
      }
    });
  });
}

function toggleArchive(open: boolean) {
  const modal = document.querySelector<HTMLElement>("#archive-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", String(!open));
  if (open) {
    renderArchiveList();
  }
}

async function shareReading() {
  const payload = store.getState().reading.current;
  if (!payload) return;
  const card = document.querySelector<HTMLElement>("#dashboard-primary");
  if (!card) return;
  try {
    const dataUrl = await captureCardImage(card);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `veil-${payload.meta.dateISO}.png`;
    link.click();
    showToast("Share image saved.");
  } catch (error) {
    debugLog("error", "shareReading:image:failed", error);
    await fallbackCopySummary(payload);
  }
}

async function fallbackCopySummary(payload: NonNullable<AppState["reading"]["current"]>) {
  const text = [
    payload.today.headline,
    payload.today.subhead,
    `Theme: ${payload.today.theme}`,
    `Energy: ${payload.today.energyScore}/100`,
    `Lucky: ${payload.today.lucky.color}, ${payload.today.lucky.number}, ${payload.today.lucky.symbol}`,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast("Summary copied to clipboard.");
  } catch (error) {
    debugLog("error", "shareReading:copy:failed", error);
    showToast("Unable to share right now.");
  }
}

async function captureCardImage(card: HTMLElement) {
  const rect = card.getBoundingClientRect();
  const cloned = card.cloneNode(true) as HTMLElement;
  inlineStyles(card, cloned);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">${cloned.outerHTML}</div>
      </foreignObject>
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await (img.decode
    ? img.decode()
    : new Promise((resolve, reject) => {
        img.onload = () => resolve(undefined);
        img.onerror = reject;
      }));
  const canvas = document.createElement("canvas");
  const scale = window.devicePixelRatio || 1;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas unavailable.");
  }
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/png");
}

function inlineStyles(source: Element, target: Element) {
  const sourceElements = source.querySelectorAll<HTMLElement>("*");
  const targetElements = target.querySelectorAll<HTMLElement>("*");
  const sourceRootStyle = getComputedStyle(source as HTMLElement);
  (target as HTMLElement).style.cssText = sourceRootStyle.cssText;
  sourceElements.forEach((node, index) => {
    const targetNode = targetElements[index];
    if (!targetNode) return;
    const computed = getComputedStyle(node);
    targetNode.style.cssText = computed.cssText;
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
  renderDashboard(state.reading.current, state.profile.saved, state.reading.error);
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
  (value) =>
    renderDashboard(value, store.getState().profile.saved, store.getState().reading.error)
);
store.subscribe(
  (state) => state.reading.error,
  (value) =>
    renderDashboard(store.getState().reading.current, store.getState().profile.saved, value)
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
    hasSave: Boolean(document.querySelector("#save-reading")),
    hasShare: Boolean(document.querySelector("#share-reading")),
  });

  bindTabs();
  debugLog("log", "bindTabs:done", {
    tabCount: document.querySelectorAll(".dashboard__tab").length,
  });

  renderInitial(store.getState());
  debugLog("log", "renderInitial:done", {
    route: store.getState().ui.route,
  });

  requestAnimationFrame(() => {
    window.setTimeout(() => {
      void closeSplashscreen();
    }, 300);
    window.setTimeout(() => {
      initModel();
      debugLog("log", "initModel:started");
    }, 0);
  });
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

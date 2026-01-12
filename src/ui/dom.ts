import { MOODS, PERSONALITIES } from "../domain/constants";
import type { AppState, ProfileDraft, Reading } from "../domain/types";
import { zodiacSign } from "../domain/zodiac";
import { debugLog, isDebugEnabled } from "../debug/logger";

let routeTransitionToken = 0;
const MIN_LOADING_MS = 1200;
const MIN_LOADED_MS = 1600;
let loadingShownAt: number | null = null;
let loadingHideTimeout: number | null = null;
let loadedShownAt: number | null = null;
let lastLoadedKey: string | null = null;

function scheduleLoadingHide(loadingShell: HTMLElement) {
  if (loadingHideTimeout !== null) {
    window.clearTimeout(loadingHideTimeout);
  }
  const elapsed = loadingShownAt ? Date.now() - loadingShownAt : MIN_LOADING_MS;
  const elapsedLoaded = loadedShownAt ? Date.now() - loadedShownAt : MIN_LOADED_MS;
  const remaining = Math.max(
    0,
    MIN_LOADING_MS - elapsed,
    MIN_LOADED_MS - elapsedLoaded
  );
  if (remaining === 0) {
    loadingShell.classList.add("is-hidden");
    loadingHideTimeout = null;
    loadingShownAt = null;
    loadingDismissed = true;
  };
  if (remaining === 0) {
    hideOverlay();
    return;
  }
  loadingHideTimeout = window.setTimeout(() => {
    hideOverlay();
  }, remaining);
}

export function populateSelects() {
  const moodSelect = document.querySelector<HTMLSelectElement>("#mood-input");
  const personalitySelect = document.querySelector<HTMLSelectElement>(
    "#personality-input"
  );

  if (moodSelect) {
    moodSelect.innerHTML = MOODS.map(
      (mood) => `<option value="${mood}">${mood}</option>`
    ).join("");
  }

  if (personalitySelect) {
    personalitySelect.innerHTML = PERSONALITIES.map(
      (personality) => `<option value="${personality}">${personality}</option>`
    ).join("");
  }
}

export function updateBirthdateInputState(
  input: HTMLInputElement | null = document.querySelector<HTMLInputElement>(
    "#birthdate-input"
  )
) {
  if (!input) return;
  input.classList.toggle("is-empty", input.value.length === 0);
}

export function renderProfileDraft(profile: ProfileDraft) {
  const nameInput = document.querySelector<HTMLInputElement>("#name-input");
  const birthInput = document.querySelector<HTMLInputElement>("#birthdate-input");
  const moodInput = document.querySelector<HTMLSelectElement>("#mood-input");
  const personalityInput = document.querySelector<HTMLSelectElement>("#personality-input");

  if (nameInput) nameInput.value = profile.name;
  if (birthInput) birthInput.value = profile.birthdate;
  if (moodInput) moodInput.value = profile.mood;
  if (personalityInput) personalityInput.value = profile.personality;
  updateBirthdateInputState(birthInput);
}

export function renderValidationErrors(
  errors: Partial<Record<keyof ProfileDraft, string>>
) {
  const fields = ["name", "birthdate", "mood", "personality"] as const;
  fields.forEach((field) => {
    const errorEl = document.querySelector<HTMLElement>(
      `[data-error-for="${field}"]`
    );
    if (errorEl) {
      errorEl.textContent = errors[field] ?? "";
    }
  });
}

export function renderRoute(route: AppState["ui"]["route"]) {
  const shell = document.querySelector<HTMLElement>("#card-shell");
  const welcome = document.querySelector<HTMLElement>("#welcome-view");
  const reading = document.querySelector<HTMLElement>("#reading-view");
  if (!shell || !welcome || !reading) return;

  const targetRoute: AppState["ui"]["route"] = route;
  const isReading = targetRoute === "reading";
  const currentRoute = (
    shell.dataset.route === "reading" ? "reading" : "welcome"
  ) as AppState["ui"]["route"];

  if (isDebugEnabled()) {
    debugLog("log", "ui:renderRoute", {
      targetRoute,
      currentRoute,
      shellDatasetRoute: shell.dataset.route ?? null,
      welcomeClass: welcome.className,
      readingClass: reading.className,
    });
  }

  const targetView = isReading ? reading : welcome;
  const otherView = isReading ? welcome : reading;

  // Keep accessibility metadata in sync with state.
  welcome.setAttribute("aria-hidden", String(isReading));
  reading.setAttribute("aria-hidden", String(!isReading));

  // If we are already on the requested route, do a simple, non-animated sync.
  if (currentRoute === targetRoute) {
    shell.dataset.route = isReading ? "reading" : "welcome";
    targetView.classList.add("is-mounted", "is-active");
    otherView.classList.remove("is-active");
    otherView.classList.remove("is-mounted");
    return;
  }

  // Cross-fade transition. We explicitly mount/unmount views rather than
  // keeping a permanently hidden layer present. This avoids WKWebView quirks
  // where an invisible (opacity: 0) element can still interfere with clicks.
  routeTransitionToken += 1;
  const token = routeTransitionToken;

  shell.dataset.route = isReading ? "reading" : "welcome";

  targetView.classList.add("is-mounted");
  otherView.classList.add("is-mounted");

  requestAnimationFrame(() => {
    if (token !== routeTransitionToken) return;
    targetView.classList.add("is-active");
    otherView.classList.remove("is-active");

    if (isDebugEnabled()) {
      debugLog("log", "ui:renderRoute:raf", {
        targetView: targetView.id,
        otherView: otherView.id,
        targetViewClass: targetView.className,
        otherViewClass: otherView.className,
      });
    }
  });

  // Matches CSS transition: opacity 0.5s ease.
  window.setTimeout(() => {
    if (token !== routeTransitionToken) return;
    otherView.classList.remove("is-mounted");

    if (isDebugEnabled()) {
      debugLog("log", "ui:renderRoute:done", {
        unmounted: otherView.id,
        otherViewClass: otherView.className,
      });
    }
  }, 520);
}

export function renderModelStatus(status: AppState["model"]["status"]) {
  const label = document.querySelector<HTMLElement>(
    "#model-status .model-status__label"
  );
  const progress = document.querySelector<HTMLElement>("#model-progress");
  const loadingShell = document.querySelector<HTMLElement>("#app-loading");
  const loadingLabel = document.querySelector<HTMLElement>("#app-loading-status");
  const loadingProgress = document.querySelector<HTMLElement>(
    "#app-loading-progress"
  );
  if (!label || !progress) return;

  if (status.status === "loading") {
    label.textContent = "Consulting the constellations…";
    progress.style.width = `${Math.round(status.progress * 100)}%`;
    if (loadingLabel) loadingLabel.textContent = "Preparing the star map…";
    if (loadingProgress) {
      loadingProgress.style.width = `${Math.round(status.progress * 100)}%`;
    }
    if (loadingShell) {
      loadingShell.classList.remove("is-hidden");
      loadingDismissed = false;
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  } else if (status.status === "loaded") {
    const sizeLabel = Number.isFinite(status.modelSizeMb)
      ? ` (${status.modelSizeMb.toFixed(1)} MB)`
      : "";
    label.textContent = `Model loaded: ${status.modelPath}${sizeLabel}.`;
    progress.style.width = "100%";
    if (loadingLabel) loadingLabel.textContent = "The stars are ready.";
    if (loadingProgress) loadingProgress.style.width = "100%";
    if (loadingShell) {
      if (!loadedShownAt) {
        loadedShownAt = Date.now();
      }
      scheduleLoadingHide(loadingShell);
    }
    const loadedKey = `${status.modelPath}|${status.modelSizeBytes}`;
    if (isDebugEnabled() && loadedKey !== lastLoadedKey) {
      lastLoadedKey = loadedKey;
      debugLog("log", "model:loaded", {
        path: status.modelPath,
        sizeBytes: status.modelSizeBytes,
        sizeMb: Number.isFinite(status.modelSizeMb)
          ? Number(status.modelSizeMb.toFixed(3))
          : status.modelSizeMb,
      });
    }
  } else if (status.status === "error") {
    label.textContent = "We will use a gentle offline reading.";
    progress.style.width = "100%";
    if (loadingLabel) loadingLabel.textContent = "App failed to load.";
    if (loadingProgress) loadingProgress.style.width = "100%";
    if (loadingShell) {
      loadingShell.classList.remove("is-hidden");
      loadingDismissed = false;
      loadingShownAt = null;
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  } else {
    label.textContent = "Preparing the star map…";
    progress.style.width = "0%";
    if (loadingLabel) loadingLabel.textContent = "Preparing the star map…";
    if (loadingProgress) loadingProgress.style.width = "0%";
    if (loadingShell && !loadingDismissed) {
      loadingShell.classList.remove("is-hidden");
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  }
}

export function renderReading(reading: Reading | null, profile: ProfileDraft | null) {
  const dateEl = document.querySelector<HTMLElement>("#reading-date");
  const titleEl = document.querySelector<HTMLElement>("#reading-title-text");
  const subtitleEl = document.querySelector<HTMLElement>("#reading-subtitle");
  const sourceEl = document.querySelector<HTMLElement>("#reading-source");
  const messageEl = document.querySelector<HTMLElement>(".reading__message");
  const themesEl = document.querySelector<HTMLUListElement>("#reading-themes");
  const affirmationEl = document.querySelector<HTMLElement>("#reading-affirmation");
  const colorEl = document.querySelector<HTMLElement>("#reading-color");
  const numberEl = document.querySelector<HTMLElement>("#reading-number");

  if (!reading) {
    if (messageEl) messageEl.textContent = "";
    if (themesEl) themesEl.innerHTML = "";
    if (sourceEl) sourceEl.textContent = "";
    return;
  }

  const formattedDate = new Date(reading.date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (dateEl) dateEl.textContent = formattedDate;
  if (titleEl) titleEl.textContent = reading.title;
  if (subtitleEl) {
    subtitleEl.textContent = profile
      ? `${profile.name}, ${zodiacSign(profile.birthdate)}`
      : `Sign: ${reading.sign}`;
  }
  if (sourceEl) {
    sourceEl.textContent = `Runtime: ${reading.source === "model" ? "Model" : "Stub"}`;
  }
  if (messageEl) messageEl.textContent = reading.message;
  if (themesEl) {
    themesEl.innerHTML = reading.themes.map((theme) => `<li>${theme}</li>`).join("");
  }
  if (affirmationEl) affirmationEl.textContent = reading.affirmation;
  if (colorEl) colorEl.textContent = reading.luckyColor;
  if (numberEl) numberEl.textContent = reading.luckyNumber.toString();
}

export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#reading-loading");
  const body = document.querySelector<HTMLElement>("#reading-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (!loading || !body || !regenerate || !edit || !copy) return;
  loading.hidden = !isGenerating;
  body.style.opacity = isGenerating ? "0.2" : "1";
  regenerate.disabled = isGenerating;
  edit.disabled = isGenerating;
  copy.disabled = isGenerating;
}

const streamTargets = new Map<HTMLElement, Text>();

function getStreamTargets() {
  const targets: HTMLElement[] = [];
  const loadingStream = document.querySelector<HTMLElement>("#reading-stream");
  const messageStream = document.querySelector<HTMLElement>(".reading__message");
  if (loadingStream) targets.push(loadingStream);
  if (messageStream) targets.push(messageStream);
  return targets;
}

export function resetReadingStream() {
  const targets = getStreamTargets();
  if (targets.length === 0) return;
  targets.forEach((target) => {
    target.textContent = "";
    const node = document.createTextNode("");
    target.appendChild(node);
    streamTargets.set(target, node);
  });
}

export function appendReadingStream(chunk: string) {
  const targets = getStreamTargets();
  if (targets.length === 0) return;
  targets.forEach((target) => {
    let node = streamTargets.get(target);
    if (!node || node.parentNode !== target) {
      node = document.createTextNode(target.textContent ?? "");
      target.textContent = "";
      target.appendChild(node);
      streamTargets.set(target, node);
    }
    node.data += chunk;
  });
}

export function showToast(message: string) {
  const footer = document.querySelector<HTMLElement>(".app__footer");
  if (!footer) return;
  footer.textContent = message;
  window.setTimeout(() => {
    footer.textContent = "For reflection and entertainment. Your intuition matters most.";
  }, 3500);
}

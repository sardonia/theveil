import type { AppState } from "../../domain/types";
import { debugLog, isDebugEnabled } from "../../debug/logger";

const MIN_LOADING_MS = 1200;
const MIN_LOADED_MS = 1600;
let loadingShownAt: number | null = null;
let loadingHideTimeout: number | null = null;
let loadedShownAt: number | null = null;
let lastLoadedKey: string | null = null;
let loadingDismissed = false;

function hideOverlay() {
  const loadingShell = document.querySelector<HTMLElement>("#app-loading");
  if (!loadingShell) return;
  loadingShell.classList.add("is-hidden");
  loadingHideTimeout = null;
  loadingShownAt = null;
  loadingDismissed = true;
}

function scheduleLoadingHide() {
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
    hideOverlay();
    return;
  }
  loadingHideTimeout = window.setTimeout(() => {
    hideOverlay();
  }, remaining);
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
      scheduleLoadingHide();
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
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
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

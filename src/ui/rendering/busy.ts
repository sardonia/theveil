import { debugLog, isDebugEnabled } from "../../debug/logger";

let loadingTimer: number | null = null;
let loadingStartMs = 0;
let defaultLoadingText: string | null = null;

function getLoadingTextEl(): HTMLElement | null {
  return (
    (document.querySelector("#dashboard-loading-text") as HTMLElement | null) ||
    (document.querySelector("#dashboard-loading")?.querySelector("p") as HTMLElement | null) ||
    null
  );
}

function getLoadingHintEl(): HTMLElement | null {
  return (document.querySelector("#dashboard-loading-hint") as HTMLElement | null) || null;
}

function startLoadingTicker() {
  if (loadingTimer != null) return;

  const textEl = getLoadingTextEl();
  if (!textEl) return;

  if (defaultLoadingText == null) {
    defaultLoadingText = textEl.textContent ?? "Weaving your message…";
  }

  const hintEl = getLoadingHintEl();
  loadingStartMs = performance.now();

  const messages = [
    "Consulting the stars…",
    "Weaving your message…",
    "Aligning your cosmic dashboard…",
    "Almost there…",
  ];

  const tick = () => {
    const elapsedSec = Math.floor((performance.now() - loadingStartMs) / 1000);
    const msg = messages[Math.floor(elapsedSec / 3) % messages.length];
    textEl.textContent = `${msg} (${elapsedSec}s)`;

    if (hintEl) {
      // Keep the UI reassuring if the local model is slower on the first run.
      if (elapsedSec >= 8) {
        hintEl.hidden = false;
        hintEl.textContent = "If this is the first run, the model may take a bit longer.";
      } else {
        hintEl.hidden = true;
        hintEl.textContent = "";
      }
    }
  };

  tick();
  loadingTimer = window.setInterval(tick, 1000);
}

function stopLoadingTicker() {
  if (loadingTimer != null) {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }

  const textEl = getLoadingTextEl();
  if (textEl && defaultLoadingText != null) {
    textEl.textContent = defaultLoadingText;
  }

  const hintEl = getLoadingHintEl();
  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "";
  }
}

export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#dashboard-loading");
  const body = document.querySelector<HTMLElement>("#dashboard-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy", {
      isGenerating,
      hasLoading: Boolean(loading),
      hasBody: Boolean(body),
      hasRegenerate: Boolean(regenerate),
      hasEdit: Boolean(edit),
      hasCopy: Boolean(copy),
    });
  }

  if (loading) {
    loading.hidden = !isGenerating;
  }

  if (isGenerating) {
    startLoadingTicker();
  } else {
    stopLoadingTicker();
  }
  if (body) {
    body.style.opacity = isGenerating ? "0.2" : "1";
    body.classList.toggle("is-loading", isGenerating);
  }

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy:state", {
      isGenerating,
      loadingHidden: loading?.hidden,
      bodyOpacity: body?.style.opacity,
      bodyLoading: body?.classList.contains("is-loading"),
    });
  }
  if (regenerate) regenerate.disabled = isGenerating;
  if (edit) edit.disabled = isGenerating;
  if (copy) copy.disabled = isGenerating;
}

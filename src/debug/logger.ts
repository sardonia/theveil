type LogLevel = "log" | "warn" | "error";

let overlayEl: HTMLDivElement | null = null;
let generalPaneEl: HTMLDivElement | null = null;
let modelPaneEl: HTMLDivElement | null = null;
let overlayVisible = false;
let installed = false;
const generalLogBuffer: OverlayEntry[] = [];
const modelLogBuffer: OverlayEntry[] = [];
const storageKey = "VEIL_DEBUG_LOGS";
const debugChannel = createDebugChannel();

type OverlayEntry = {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
};

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack ?? ""}`.trim();
    }
    if (typeof value === "string") return value;
    return JSON.stringify(value, replacer, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return "[unstringifiable]";
    }
  }
}

function replacer(_key: string, value: unknown) {
  if (value instanceof HTMLElement) {
    return {
      tag: value.tagName,
      id: value.id,
      className: value.className,
    };
  }
  return value;
}

export function isDebugEnabled(): boolean {
  // In dev, turn on by default. In production, allow enabling via localStorage.
  const fromStorage = (() => {
    try {
      return localStorage.getItem("VEIL_DEBUG") === "1";
    } catch {
      return false;
    }
  })();

  // Vite defines import.meta.env.DEV.
  const isDev = typeof import.meta !== "undefined" &&
    typeof (import.meta as any).env !== "undefined" &&
    Boolean((import.meta as any).env.DEV);

  return isDev || fromStorage;
}

export function isDebugOverlayVisible(): boolean {
  return overlayVisible;
}

export function setDebugEnabled(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem("VEIL_DEBUG", "1");
    } else {
      localStorage.removeItem("VEIL_DEBUG");
    }
  } catch {
    // ignore storage failures
  }

  if (enabled) {
    initDebug(true);
    setOverlayVisible(true);
  } else {
    setOverlayVisible(false);
  }
}

export function initDebug(force = false) {
  if (installed) return;
  if (!force && !isDebugEnabled()) return;
  installed = true;

  installOverlay();
  // Keep the overlay hidden by default; it can be enabled via the UI toggle
  // or keyboard shortcut when needed.
  setOverlayVisible(isDebugEnabled());
  installGlobalErrorHandlers();
  installGlobalPointerTracer();

  debugLog("log", "Debug enabled. Toggle overlay: Cmd/Ctrl+Shift+D");
  debugModelLog("log", "model:debug:ready");
}

export function debugLog(level: LogLevel, message: string, data?: unknown) {
  const entry = createEntry(level, message, data);
  recordEntry(entry, "general");
  if (!isDebugEnabled()) return;
  logToConsole(entry);
  appendOverlayEntry(entry, generalPaneEl);
}

export function debugModelLog(level: LogLevel, message: string, data?: unknown) {
  const entry = createEntry(level, message, data);
  recordEntry(entry, "model");
  if (!isDebugEnabled()) return;
  logToConsole(entry);
  appendOverlayEntry(entry, modelPaneEl);
}

function createEntry(level: LogLevel, message: string, data?: unknown): OverlayEntry {
  return {
    level,
    message,
    data,
    timestamp: new Date().toISOString().slice(11, 23),
  };
}

function createDebugChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel("veil-debug");
  } catch {
    return null;
  }
}

function recordEntry(entry: OverlayEntry, pane: "general" | "model") {
  if (pane === "general") {
    generalLogBuffer.push(entry);
  } else {
    modelLogBuffer.push(entry);
  }
  storeEntry(entry, pane);
  debugChannel?.postMessage({ pane, entry });
}

function storeEntry(entry: OverlayEntry, pane: "general" | "model") {
  try {
    const existing = localStorage.getItem(storageKey);
    const parsed: Array<{ pane: "general" | "model"; entry: OverlayEntry }> = existing
      ? JSON.parse(existing)
      : [];
    parsed.push({ pane, entry });
    const capped = parsed.slice(-400);
    localStorage.setItem(storageKey, JSON.stringify(capped));
  } catch {
    // Ignore storage failures
  }
}

function logToConsole(entry: OverlayEntry) {
  const prefix = "[Veil]";
  const base = `${prefix} ${entry.timestamp} ${entry.message}`;

  if (entry.level === "error") {
    // eslint-disable-next-line no-console
    console.error(base, entry.data ?? "");
  } else if (entry.level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(base, entry.data ?? "");
  } else {
    // eslint-disable-next-line no-console
    console.log(base, entry.data ?? "");
  }

}

function appendOverlayEntry(entry: OverlayEntry, target: HTMLDivElement | null) {
  if (!overlayEl || !overlayVisible) return;
  if (!target) return;
  target.appendChild(createEntryElement(entry));
  target.scrollTop = target.scrollHeight;
}

function createEntryElement(entry: OverlayEntry) {
  const prefix = "[Veil]";
  const base = `${prefix} ${entry.timestamp} ${entry.message}`;

  const element = document.createElement("div");
  element.style.whiteSpace = "pre-wrap";
  element.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
  element.style.padding = "6px 8px";
  element.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  element.style.fontSize = "12px";
  element.style.lineHeight = "1.35";

  const color = entry.level === "error"
    ? "#ffb3c7"
    : entry.level === "warn"
      ? "#ffe2a8"
      : "#e9efff";
  element.style.color = color;

  element.textContent = entry.data === undefined ? base : `${base}\n${safeStringify(entry.data)}`;
  return element;
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to legacy approach
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function installOverlay() {
  overlayEl = document.createElement("div");
  overlayEl.id = "veil-debug-overlay";
  overlayEl.style.position = "fixed";
  overlayEl.style.left = "12px";
  overlayEl.style.right = "12px";
  // Place the debug pane at the top so it doesn't block primary UI actions
  // (like the "Reveal my reading" button) that tend to live near the bottom.
  overlayEl.style.top = "12px";
  overlayEl.style.bottom = "auto";
  overlayEl.style.height = "70vh";
  overlayEl.style.maxHeight = "70vh";
  overlayEl.style.display = "none";
  overlayEl.style.flexDirection = "column";
  overlayEl.style.background = "rgba(10, 12, 26, 0.88)";
  overlayEl.style.border = "1px solid rgba(255,255,255,0.16)";
  overlayEl.style.borderRadius = "12px";
  overlayEl.style.backdropFilter = "blur(10px)";
  overlayEl.style.boxShadow = "0 18px 50px rgba(0,0,0,0.45)";
  overlayEl.style.zIndex = "999999";
  overlayEl.style.pointerEvents = "auto";
  overlayEl.style.overflow = "hidden";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.padding = "8px 10px";
  header.style.borderBottom = "1px solid rgba(255,255,255,0.12)";
  header.style.position = "sticky";
  header.style.top = "0";
  header.style.background = "rgba(10, 12, 26, 0.92)";
  header.style.backdropFilter = "blur(10px)";

  const title = document.createElement("div");
  title.textContent = "Veil Debug";
  title.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  title.style.fontSize = "12px";
  title.style.color = "rgba(255,255,255,0.82)";
  title.style.letterSpacing = "0.08em";
  title.style.textTransform = "uppercase";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";
  clearBtn.style.fontFamily = "inherit";
  clearBtn.style.fontSize = "12px";
  clearBtn.style.padding = "4px 8px";
  clearBtn.style.borderRadius = "8px";
  clearBtn.style.border = "1px solid rgba(255,255,255,0.18)";
  clearBtn.style.background = "rgba(255,255,255,0.06)";
  clearBtn.style.color = "rgba(255,255,255,0.82)";
  clearBtn.style.cursor = "pointer";
  clearBtn.addEventListener("click", () => {
    if (generalPaneEl) generalPaneEl.innerHTML = "";
    if (modelPaneEl) modelPaneEl.innerHTML = "";
    generalLogBuffer.length = 0;
    modelLogBuffer.length = 0;
  });

  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.textContent = "Hide";
  hideBtn.style.fontFamily = "inherit";
  hideBtn.style.fontSize = "12px";
  hideBtn.style.padding = "4px 8px";
  hideBtn.style.borderRadius = "8px";
  hideBtn.style.border = "1px solid rgba(255,255,255,0.18)";
  hideBtn.style.background = "rgba(255,255,255,0.06)";
  hideBtn.style.color = "rgba(255,255,255,0.82)";
  hideBtn.style.cursor = "pointer";
  hideBtn.addEventListener("click", () => setOverlayVisible(false));

  actions.appendChild(clearBtn);
  actions.appendChild(hideBtn);
  header.appendChild(title);
  header.appendChild(actions);

  overlayEl.appendChild(header);
  overlayEl.appendChild(buildSplitPane());
  document.body.appendChild(overlayEl);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const isToggle = (event.metaKey || event.ctrlKey) && event.shiftKey && key === "d";
    if (!isToggle) return;
    event.preventDefault();
    setOverlayVisible(!overlayVisible);
  });
}

function buildSplitPane() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gridTemplateColumns = "1fr 1fr";
  body.style.gap = "8px";
  body.style.padding = "8px";
  body.style.flex = "1";
  body.style.minHeight = "0";
  body.style.overflow = "hidden";

  const { pane: generalPane, list: generalList } = buildPane("Interaction log");
  const { pane: modelPane, list: modelList } = buildPane("Model lifecycle");

  generalPaneEl = generalList;
  modelPaneEl = modelList;
  renderBufferedLogs();

  body.appendChild(generalPane);
  body.appendChild(modelPane);
  return body;
}

function buildPane(title: string) {
  const pane = document.createElement("div");
  pane.style.display = "flex";
  pane.style.flexDirection = "column";
  pane.style.minWidth = "0";
  pane.style.minHeight = "0";
  pane.style.border = "1px solid rgba(255,255,255,0.12)";
  pane.style.borderRadius = "10px";
  pane.style.overflow = "hidden";
  pane.style.overscrollBehavior = "contain";
  pane.style.background = "rgba(10, 12, 26, 0.62)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  header.style.fontSize = "11px";
  header.style.textTransform = "uppercase";
  header.style.letterSpacing = "0.08em";
  header.style.color = "rgba(255,255,255,0.7)";
  header.style.padding = "6px 10px";
  header.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
  header.style.background = "rgba(10, 12, 26, 0.9)";

  const titleEl = document.createElement("div");
  titleEl.textContent = title;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.style.fontFamily = "inherit";
  copyBtn.style.fontSize = "11px";
  copyBtn.style.padding = "2px 6px";
  copyBtn.style.borderRadius = "6px";
  copyBtn.style.border = "1px solid rgba(255,255,255,0.18)";
  copyBtn.style.background = "rgba(255,255,255,0.06)";
  copyBtn.style.color = "rgba(255,255,255,0.82)";
  copyBtn.style.cursor = "pointer";

  const list = document.createElement("div");
  list.style.flex = "1";
  list.style.minHeight = "0";
  list.style.overflowX = "auto";
  list.style.overflowY = "auto";
  list.style.scrollbarGutter = "stable both-edges";
  list.style.overscrollBehavior = "contain";
  list.style.whiteSpace = "pre";

  copyBtn.addEventListener("click", () => {
    void copyTextToClipboard(list.textContent ?? "");
  });

  header.appendChild(titleEl);
  header.appendChild(copyBtn);
  pane.appendChild(header);
  pane.appendChild(list);
  return { pane, list };
}

function setOverlayVisible(visible: boolean) {
  overlayVisible = visible;
  if (!overlayEl) return;
  overlayEl.style.display = visible ? "flex" : "none";
  if (visible) {
    renderBufferedLogs();
  }
}

function renderBufferedLogs() {
  if (!generalPaneEl || !modelPaneEl) return;
  generalPaneEl.innerHTML = "";
  modelPaneEl.innerHTML = "";
  generalLogBuffer.forEach((entry) => {
    generalPaneEl?.appendChild(createEntryElement(entry));
  });
  modelLogBuffer.forEach((entry) => {
    modelPaneEl?.appendChild(createEntryElement(entry));
  });
  generalPaneEl.scrollTop = generalPaneEl.scrollHeight;
  modelPaneEl.scrollTop = modelPaneEl.scrollHeight;
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    debugLog("error", "window.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? {
        name: event.error.name,
        message: event.error.message,
        stack: event.error.stack,
      } : event.error,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    debugLog("error", "unhandledrejection", {
      reason: event.reason,
    });
  });
}

function installGlobalPointerTracer() {
  const handler = (event: Event) => {
    if (!(event instanceof MouseEvent)) return;
    const x = event.clientX;
    const y = event.clientY;
    const target = event.target as HTMLElement | null;
    const fromPoint = document.elementFromPoint(x, y) as HTMLElement | null;

    const describe = (el: HTMLElement | null) => {
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id || null,
        className: typeof el.className === "string" ? el.className : null,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
        display: style.display,
        opacity: style.opacity,
      };
    };

    // Capture phase to observe events even if something stops propagation.
    debugLog("log", `event:${event.type}`, {
      x,
      y,
      target: describe(target),
      elementFromPoint: describe(fromPoint),
    });
  };

  document.addEventListener("pointerdown", handler, true);
  document.addEventListener("click", handler, true);
}

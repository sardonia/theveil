type LogLevel = "log" | "warn" | "error";

let overlayEl: HTMLDivElement | null = null;
let overlayVisible = false;
let installed = false;

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

export function initDebug() {
  if (installed) return;
  installed = true;
  if (!isDebugEnabled()) return;

  installOverlay();
  // Show the overlay by default in debug mode so diagnostics are visible even
  // if DevTools are hard to access (common in WKWebView-based apps).
  setOverlayVisible(true);
  installGlobalErrorHandlers();
  installGlobalPointerTracer();

  debugLog("log", "Debug enabled. Toggle overlay: Cmd/Ctrl+Shift+D");
}

export function debugLog(level: LogLevel, message: string, data?: unknown) {
  if (!isDebugEnabled()) return;
  const prefix = "[Veil]";
  const timestamp = new Date().toISOString().slice(11, 23);
  const base = `${prefix} ${timestamp} ${message}`;

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(base, data ?? "");
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(base, data ?? "");
  } else {
    // eslint-disable-next-line no-console
    console.log(base, data ?? "");
  }

  if (!overlayEl) return;
  if (!overlayVisible) return;

  const entry = document.createElement("div");
  entry.style.whiteSpace = "pre-wrap";
  entry.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
  entry.style.padding = "6px 8px";
  entry.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  entry.style.fontSize = "12px";
  entry.style.lineHeight = "1.35";

  const color = level === "error" ? "#ffb3c7" : level === "warn" ? "#ffe2a8" : "#e9efff";
  entry.style.color = color;

  entry.textContent = data === undefined ? base : `${base}\n${safeStringify(data)}`;
  overlayEl.appendChild(entry);
  overlayEl.scrollTop = overlayEl.scrollHeight;
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
  overlayEl.style.maxHeight = "35vh";
  overlayEl.style.overflow = "auto";
  overlayEl.style.background = "rgba(10, 12, 26, 0.88)";
  overlayEl.style.border = "1px solid rgba(255,255,255,0.16)";
  overlayEl.style.borderRadius = "12px";
  overlayEl.style.backdropFilter = "blur(10px)";
  overlayEl.style.boxShadow = "0 18px 50px rgba(0,0,0,0.45)";
  overlayEl.style.zIndex = "999999";
  overlayEl.style.display = "none";

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
    if (!overlayEl) return;
    // Remove everything after header.
    while (overlayEl.childNodes.length > 1) {
      overlayEl.removeChild(overlayEl.lastChild as ChildNode);
    }
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
  document.body.appendChild(overlayEl);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const isToggle = (event.metaKey || event.ctrlKey) && event.shiftKey && key === "d";
    if (!isToggle) return;
    event.preventDefault();
    setOverlayVisible(!overlayVisible);
  });
}

function setOverlayVisible(visible: boolean) {
  overlayVisible = visible;
  if (!overlayEl) return;
  overlayEl.style.display = visible ? "block" : "none";
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

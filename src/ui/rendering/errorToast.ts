let toastEl: HTMLDivElement | null = null;

function ensureToastEl(): HTMLDivElement {
  if (toastEl) return toastEl;
  const el = document.createElement("div");
  el.id = "veil-error-toast";
  el.style.position = "fixed";
  el.style.left = "12px";
  el.style.right = "12px";
  el.style.bottom = "12px";
  el.style.zIndex = "999999";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "12px";
  el.style.border = "1px solid rgba(255,255,255,0.18)";
  el.style.background = "rgba(20, 10, 18, 0.92)";
  el.style.backdropFilter = "blur(10px)";
  el.style.boxShadow = "0 18px 50px rgba(0,0,0,0.45)";
  el.style.color = "rgba(255,255,255,0.92)";
  el.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  el.style.fontSize = "13px";
  el.style.lineHeight = "1.4";
  el.style.display = "none";
  el.style.pointerEvents = "auto";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "flex-start";
  row.style.justifyContent = "space-between";
  row.style.gap = "10px";

  const text = document.createElement("div");
  text.id = "veil-error-toast__text";
  text.style.whiteSpace = "pre-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Dismiss";
  btn.style.flex = "none";
  btn.style.border = "1px solid rgba(255,255,255,0.2)";
  btn.style.background = "rgba(255,255,255,0.06)";
  btn.style.color = "rgba(255,255,255,0.9)";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "10px";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", () => {
    el.style.display = "none";
  });

  row.appendChild(text);
  row.appendChild(btn);
  el.appendChild(row);
  document.body.appendChild(el);
  toastEl = el;
  return el;
}

export function renderErrorToast(message: string | null) {
  const el = ensureToastEl();
  const textEl = el.querySelector<HTMLDivElement>("#veil-error-toast__text");
  if (!message) {
    el.style.display = "none";
    return;
  }
  if (textEl) {
    textEl.textContent = `⚠️ ${message}`;
  }
  el.style.display = "block";
}

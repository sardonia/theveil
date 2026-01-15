import type { AppState } from "../../domain/types";
import { debugLog } from "../../debug/logger";
import { store } from "../../app/runtime";
import { showToast } from "../../ui/feedback/toast";

export async function shareReading() {
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

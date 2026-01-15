import { debugLog, isDebugEnabled } from "../../debug/logger";

let readingStreamBuffer = "";

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
  if (targets.length === 0) {
    if (isDebugEnabled()) {
      debugLog("warn", "reading:stream:targets:missing", { action: "reset" });
    }
    return;
  }
  readingStreamBuffer = "";
  targets.forEach((target) => {
    target.textContent = "";
  });
}

export function appendReadingStream(chunk: string) {
  const targets = getStreamTargets();
  if (targets.length === 0) {
    if (isDebugEnabled()) {
      debugLog("warn", "reading:stream:targets:missing", { action: "append" });
    }
    return;
  }
  readingStreamBuffer += chunk;
  targets.forEach((target) => {
    target.textContent = readingStreamBuffer;
  });
}

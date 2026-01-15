import { listen } from "@tauri-apps/api/event";
import type { StreamEvent } from "../../domain/types";
import { debugLog, debugModelLog } from "../../debug/logger";
import {
  appendReadingStream,
  resetReadingStream,
} from "../../ui/rendering/readingStream";

export function initReadingStream() {
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

  const appListener = listen<StreamEvent>("reading:stream", (event) => {
    handleStreamEvent(event.payload);
  })
    .then(() => {
      debugLog("log", "initReadingStream:ready", { target: "app" });
      debugModelLog("log", "reading:stream:listener:ready", { target: "app" });
    })
    .catch((error: unknown) => {
      debugLog("error", "initReadingStream:failed", error);
      debugModelLog("error", "reading:stream:listener:failed", error);
    });

  void Promise.allSettled([appListener]);

  window.addEventListener("reading:stream-local", (event) => {
    const detail = (event as CustomEvent<StreamEvent>).detail;
    debugModelLog("log", "reading:stream:local", { kind: detail.kind });
    handleStreamEvent(detail);
  });
}

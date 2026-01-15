import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ModelStatus } from "../../domain/types";
import { debugLog, debugModelLog } from "../../debug/logger";
import { commandBus, store } from "../../app/runtime";

export function initModel() {
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

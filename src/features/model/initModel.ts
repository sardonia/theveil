import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ModelStatus } from "../../domain/types";
import { debugLog, debugModelLog } from "../../debug/logger";
import { commandBus, store } from "../../app/runtime";

export function initModel() {
  let warnTimeout: number | null = null;
  let errorTimeout: number | null = null;
  const clearFallbacks = () => {
    if (warnTimeout !== null) {
      window.clearTimeout(warnTimeout);
      warnTimeout = null;
    }
    if (errorTimeout !== null) {
      window.clearTimeout(errorTimeout);
      errorTimeout = null;
    }
  };
  const scheduleFallbacks = () => {
    clearFallbacks();
    warnTimeout = window.setTimeout(() => {
      debugModelLog("warn", "model:init:slow", {
        message: "Model initialization is taking longer than expected.",
      });
    }, 5000);
    errorTimeout = window.setTimeout(() => {
      const current = store.getState().model.status;
      if (current.status === "loading" || current.status === "unloaded") {
        commandBus.execute({
          type: "ModelStatusUpdated",
          status: { status: "error", message: "Model initialization timed out." },
        });
      }
    }, 20000);
  };

  scheduleFallbacks();
  debugModelLog("log", "model:init:start");
  invoke<ModelStatus>("init_model")
    .then((status) => {
      commandBus.execute({ type: "ModelStatusUpdated", status });
      debugModelLog("log", "model:init:response", status);
      if (status.status === "loaded" || status.status === "error") {
        clearFallbacks();
      } else {
        scheduleFallbacks();
      }
    })
    .catch((error) => {
      clearFallbacks();
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
      clearFallbacks();
    } else {
      scheduleFallbacks();
    }
  });
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ModelStatus } from "../../domain/types";
import { debugLog, debugModelLog } from "../../debug/logger";
import { commandBus, store } from "../../app/runtime";
import { showToast } from "../../ui/feedback/toast";

export function initModel() {
  // The embedded model can take a while to mmap/initialize (especially in debug builds).
  // The previous 5s timeout was incorrectly marking the app as failed even though
  // the model would finish loading moments later.
  let slowNoticeTimeout: number | null = null;
  let slowNoticeShown = false;
  const clearSlowNotice = () => {
    if (slowNoticeTimeout !== null) {
      window.clearTimeout(slowNoticeTimeout);
      slowNoticeTimeout = null;
    }
  };
  const scheduleSlowNotice = (message: string, delayMs = 45000) => {
    clearSlowNotice();
    slowNoticeTimeout = window.setTimeout(() => {
      const current = store.getState().model.status;
      if (current.status === "loading" || current.status === "unloaded") {
        debugModelLog("warn", "model:init:slow", {
          message,
          status: current,
        });
        if (!slowNoticeShown) {
          slowNoticeShown = true;
          showToast(message);
        }
      }
    }, delayMs);
  };

  scheduleSlowNotice("Loading the local model (this can take 20–60s)…");
  debugModelLog("log", "model:init:start");
  invoke<ModelStatus>("init_model")
    .then((status) => {
      commandBus.execute({ type: "ModelStatusUpdated", status });
      debugModelLog("log", "model:init:response", status);
      if (status.status === "loaded" || status.status === "error") {
        clearSlowNotice();
      } else {
        scheduleSlowNotice("Still loading the local model…");
      }
    })
    .catch((error) => {
      clearSlowNotice();
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
      clearSlowNotice();
    } else {
      scheduleSlowNotice("Still loading the local model…");
    }
  });
}

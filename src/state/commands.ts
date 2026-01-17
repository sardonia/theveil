import type { AppState, ProfileDraft } from "../domain/types";
import { profileSpec } from "../domain/specs";
import { runReadingPipeline } from "../pipeline/readingPipeline";
import type { DomainEvent } from "./events";
import { AsyncQueue } from "./queue";
import { debugLog, debugModelLog, isDebugEnabled } from "../debug/logger";

function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type Command =
  | { type: "SubmitProfile"; profile: ProfileDraft }
  | { type: "GenerateReading" }
  | { type: "EditProfile" }
  | { type: "Reset" }
  | { type: "Undo" }
  | { type: "ModelStatusUpdated"; status: AppState["model"]["status"] };

interface CommandContext {
  getState: () => AppState;
  applyEvents: (events: DomainEvent[]) => void;
}

export class CommandBus {
  private queue = new AsyncQueue();
  private undoStack: AppState[] = [];

  constructor(private context: CommandContext) {}

  async execute(command: Command) {
    if (isDebugEnabled()) {
      debugLog("log", `command:execute:${command.type}`, command);
    }
    switch (command.type) {
      case "SubmitProfile":
        return this.handleSubmitProfile(command.profile);
      case "GenerateReading":
        return this.handleGenerateReading();
      case "EditProfile":
        return this.context.applyEvents([{ type: "RouteChanged", route: "welcome" }]);
      case "Reset":
        return this.context.applyEvents([
          { type: "StateRehydrated", state: defaultResetState(this.context.getState()) },
        ]);
      case "Undo":
        return this.undoLast();
      case "ModelStatusUpdated":
        return this.context.applyEvents([
          { type: "ModelStatusChanged", status: command.status },
        ]);
      default:
        return undefined;
    }
  }

  private async handleSubmitProfile(profile: ProfileDraft) {
    debugLog("log", "command:SubmitProfile:validate:start");
    const validation = profileSpec.validate(profile);
    debugLog("log", "command:SubmitProfile:validate:result", validation);
    if (!validation.valid) {
      return this.context.applyEvents([
        { type: "ProfileValidationFailed", errors: validation.errors },
      ]);
    }

    this.context.applyEvents([
      { type: "ProfileValidated", profile },
      { type: "ProfileSaved", profile },
      { type: "RouteChanged", route: "reading" },
    ]);
    debugModelLog("log", "command:SubmitProfile:accepted", {
      name: profile.name,
      birthdate: profile.birthdate,
      mood: profile.mood,
      personality: profile.personality,
    });

    debugLog("log", "command:SubmitProfile:routeChanged", {
      route: this.context.getState().ui.route,
    });

    await this.execute({ type: "GenerateReading" });
  }

  private async handleGenerateReading() {
    const state = this.context.getState();
    const startedAt = performance.now();
    debugLog("log", "command:GenerateReading:start", {
      hasProfile: Boolean(state.profile.saved),
      route: state.ui.route,
    });
    debugModelLog("log", "command:GenerateReading:start", {
      hasProfile: Boolean(state.profile.saved),
      route: state.ui.route,
    });
    if (!state.profile.saved) {
      debugModelLog("warn", "command:GenerateReading:missingProfile");
      return this.context.applyEvents([
        {
          type: "ReadingGenerationFailed",
          error: "We need your details before the stars can answer.",
        },
      ]);
    }

    const snapshotBefore = this.context.getState();
    this.queue.enqueue(async () => {
      debugModelLog("log", "command:GenerateReading:queue:begin");
      debugLog("log", "command:GenerateReading:queue:begin");
      this.context.applyEvents([
        { type: "ReadingGenerationStarted" },
        { type: "RouteChanged", route: "reading" },
      ]);

      // Give the UI a chance to paint the route change + loading spinner before
      // we start the (potentially long) model call.
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
      debugLog("log", "command:GenerateReading:routeChanged", {
        route: this.context.getState().ui.route,
      });
      try {
        const reading = await runReadingPipeline(
          state.profile.saved as ProfileDraft,
          localDateISO(),
          this.context.getState()
        );
        const durationMs = Math.round(performance.now() - startedAt);
        debugLog("log", "command:GenerateReading:timing", { durationMs });
        debugModelLog("log", "command:GenerateReading:timing", { durationMs });
        debugModelLog("log", "command:GenerateReading:success", {
          headline: reading.today.headline,
          sign: reading.meta.sign,
          dateISO: reading.meta.dateISO,
        });
        debugLog("log", "command:GenerateReading:pipeline:success", {
          headline: reading.today.headline,
          sign: reading.meta.sign,
          dateISO: reading.meta.dateISO,
        });
        this.pushUndo(snapshotBefore);
        this.context.applyEvents([
          { type: "ReadingGenerated", reading },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The stars were quiet.";
        const durationMs = Math.round(performance.now() - startedAt);
        debugLog("error", "command:GenerateReading:timing", {
          durationMs,
          message,
        });
        debugModelLog("error", "command:GenerateReading:timing", {
          durationMs,
          message,
        });
        debugLog("error", "command:GenerateReading:pipeline:error", error);
        debugModelLog("error", "command:GenerateReading:failed", { message, error });
        this.context.applyEvents([{ type: "ReadingGenerationFailed", error: message }]);
      }
      debugModelLog("log", "command:GenerateReading:queue:end");
      debugLog("log", "command:GenerateReading:queue:end");
    });
  }

  private pushUndo(state: AppState) {
    this.undoStack = [state, ...this.undoStack].slice(0, 10);
  }

  private undoLast() {
    const last = this.undoStack.shift();
    if (last) {
      this.context.applyEvents([{ type: "StateRehydrated", state: last }]);
    }
  }
}

function defaultResetState(state: AppState): AppState {
  return {
    ...state,
    profile: {
      ...state.profile,
      saved: null,
      validationErrors: {},
    },
    reading: {
      current: null,
      history: [],
      error: null,
    },
    ui: {
      ...state.ui,
      route: "welcome",
      busyFlags: {
        ...state.ui.busyFlags,
        generating: false,
      },
      toasts: [],
    },
  };
}

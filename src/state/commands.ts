import type { AppState, ProfileDraft } from "../domain/types";
import { profileSpec } from "../domain/specs";
import { runReadingPipeline } from "../pipeline/readingPipeline";
import type { DomainEvent } from "./events";
import { AsyncQueue } from "./queue";

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
    const validation = profileSpec.validate(profile);
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

    await this.execute({ type: "GenerateReading" });
  }

  private async handleGenerateReading() {
    const state = this.context.getState();
    if (!state.profile.saved) {
      return this.context.applyEvents([
        {
          type: "ReadingGenerationFailed",
          error: "We need your details before the stars can answer.",
        },
      ]);
    }

    const snapshotBefore = this.context.getState();
    this.queue.enqueue(async () => {
      this.context.applyEvents([{ type: "ReadingGenerationStarted" }]);
      try {
        const reading = await runReadingPipeline(
          state.profile.saved as ProfileDraft,
          new Date().toISOString().slice(0, 10),
          this.context.getState()
        );
        this.pushUndo(snapshotBefore);
        this.context.applyEvents([
          { type: "ReadingGenerated", reading },
          { type: "RouteChanged", route: "reading" },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The stars were quiet.";
        this.context.applyEvents([{ type: "ReadingGenerationFailed", error: message }]);
      }
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

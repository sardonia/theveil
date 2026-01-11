import type { AppState, ModelStatus, ProfileDraft, Reading, Route } from "../domain/types";

export type DomainEvent =
  | { type: "ProfileValidated"; profile: ProfileDraft }
  | { type: "ProfileValidationFailed"; errors: Partial<Record<keyof ProfileDraft, string>> }
  | { type: "ProfileSaved"; profile: ProfileDraft }
  | { type: "RouteChanged"; route: Route }
  | { type: "ReadingGenerationStarted" }
  | { type: "ReadingGenerated"; reading: Reading }
  | { type: "ReadingGenerationFailed"; error: string }
  | { type: "ModelStatusChanged"; status: ModelStatus }
  | { type: "StateRehydrated"; state: AppState };

import type { AppState } from "../domain/types";
import type { DomainEvent } from "./events";

export function reducer(state: AppState, event: DomainEvent): AppState {
  switch (event.type) {
    case "StateRehydrated":
      return event.state;
    case "ProfileValidated":
      return {
        ...state,
        profile: {
          ...state.profile,
          draft: event.profile,
          validationErrors: {},
        },
      };
    case "ProfileValidationFailed":
      return {
        ...state,
        profile: {
          ...state.profile,
          validationErrors: event.errors,
        },
      };
    case "ProfileSaved":
      return {
        ...state,
        profile: {
          ...state.profile,
          saved: event.profile,
          draft: event.profile,
        },
      };
    case "RouteChanged":
      return {
        ...state,
        ui: {
          ...state.ui,
          route: event.route,
        },
      };
    case "ReadingGenerationStarted":
      return {
        ...state,
        ui: {
          ...state.ui,
          busyFlags: {
            ...state.ui.busyFlags,
            generating: true,
          },
        },
      };
    case "ReadingGenerated":
      return {
        ...state,
        reading: {
          current: event.reading,
          history: state.reading.current
            ? [state.reading.current, ...state.reading.history].slice(0, 10)
            : state.reading.history,
        },
        ui: {
          ...state.ui,
          busyFlags: {
            ...state.ui.busyFlags,
            generating: false,
          },
        },
      };
    case "ReadingGenerationFailed":
      return {
        ...state,
        ui: {
          ...state.ui,
          busyFlags: {
            ...state.ui.busyFlags,
            generating: false,
          },
          toasts: [...state.ui.toasts, event.error].slice(-3),
        },
      };
    case "ModelStatusChanged":
      return {
        ...state,
        model: {
          status: event.status,
        },
        ui: {
          ...state.ui,
          busyFlags: {
            ...state.ui.busyFlags,
            loadingModel: event.status.status === "loading",
          },
        },
      };
    default:
      return state;
  }
}

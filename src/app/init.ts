import type { AppState } from "../domain/types";
import { debugLog, initDebug, isDebugEnabled } from "../debug/logger";
import { initStarfield } from "../ui/starfield";
import { populateSelects } from "../ui/forms/selects";
import {
  renderProfileDraft,
  renderValidationErrors,
} from "../ui/forms/profile";
import { renderRoute } from "../ui/rendering/route";
import { renderModelStatus } from "../ui/rendering/modelStatus";
import { renderDashboard } from "../ui/rendering/dashboard";
import { renderBusy } from "../ui/rendering/busy";
import { showToast } from "../ui/feedback/toast";
import { store } from "./runtime";
import { initModel } from "../features/model/initModel";
import { initReadingStream } from "../features/reading/stream";
import { bindProfileForm } from "../features/profile/bindProfileForm";
import { bindReadingActions } from "../features/reading/bindReadingActions";
import { bindTabs } from "../features/dashboard/bindTabs";
import { bindDebugToggle } from "../features/debug/bindDebugToggle";

function renderInitial(state: AppState) {
  renderRoute(state.ui.route);
  renderProfileDraft(state.profile.draft);
  renderValidationErrors(state.profile.validationErrors);
  renderModelStatus(state.model.status);
  renderDashboard(state.reading.current, state.profile.saved, state.reading.error);
  renderBusy(state.ui.busyFlags.generating);
}

function bindSubscriptions() {
  store.subscribe(
    (state) => state.profile.validationErrors,
    (value) => renderValidationErrors(value)
  );
  store.subscribe(
    (state) => state.ui.route,
    (value) => renderRoute(value)
  );
  store.subscribe(
    (state) => state.model.status,
    (value) => renderModelStatus(value)
  );
  store.subscribe(
    (state) => state.reading.current,
    (value) =>
      renderDashboard(value, store.getState().profile.saved, store.getState().reading.error)
  );
  store.subscribe(
    (state) => state.reading.error,
    (value) =>
      renderDashboard(store.getState().reading.current, store.getState().profile.saved, value)
  );
  store.subscribe(
    (state) => state.ui.busyFlags.generating,
    (value) => renderBusy(value)
  );
  store.subscribe(
    (state) => state.ui.toasts,
    (value) => {
      const latest = value[value.length - 1];
      if (latest) showToast(latest);
    }
  );
}

export function initApp() {
  initDebug(true);
  debugLog("log", "initApp:boot");
  bindSubscriptions();

  window.addEventListener("DOMContentLoaded", () => {
    debugLog("log", "DOMContentLoaded");

    // Helpful startup diagnostics (especially for WKWebView issues).
    debugLog("log", "UserAgent", navigator.userAgent);

    populateSelects();
    debugLog("log", "populateSelects:done", {
      moodOptions: document.querySelectorAll("#mood-input option").length,
      personalityOptions: document.querySelectorAll("#personality-input option").length,
    });

    bindProfileForm();
    debugLog("log", "bindForm:done", {
      hasForm: Boolean(document.querySelector("#profile-form")),
      hasRevealButton: Boolean(document.querySelector("#reveal-reading")),
    });

    bindDebugToggle();

    bindReadingActions();
    debugLog("log", "bindActions:done", {
      hasRegenerate: Boolean(document.querySelector("#regenerate")),
      hasEdit: Boolean(document.querySelector("#edit-profile")),
      hasSave: Boolean(document.querySelector("#save-reading")),
      hasShare: Boolean(document.querySelector("#share-reading")),
    });

    bindTabs();
    debugLog("log", "bindTabs:done", {
      tabCount: document.querySelectorAll(".dashboard__tab").length,
    });

    renderInitial(store.getState());
    debugLog("log", "renderInitial:done", {
      route: store.getState().ui.route,
    });
    debugLog("log", "renderInitial:dom", {
      hasAppLoading: Boolean(document.querySelector("#app-loading")),
      hasDashboardLoading: Boolean(document.querySelector("#dashboard-loading")),
    });

    initReadingStream();
    debugLog("log", "initReadingStream:started");

    requestAnimationFrame(() => {
      initModel();
      debugLog("log", "initModel:started");
    });

    // Starfield is purely decorative. Never let it break core interactivity.
    // (WKWebView feature support varies by macOS version.)
    try {
      initStarfield();
      if (isDebugEnabled()) {
        debugLog("log", "initStarfield:done");
      }
    } catch (error) {
      console.warn("Starfield failed to initialize; continuing without it.", error);
      debugLog("warn", "initStarfield:failed", error);
    }
  });
}

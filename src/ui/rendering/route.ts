import type { AppState } from "../../domain/types";
import { debugLog, isDebugEnabled } from "../../debug/logger";

let routeTransitionToken = 0;

export function renderRoute(route: AppState["ui"]["route"]) {
  const shell = document.querySelector<HTMLElement>("#card-shell");
  const welcome = document.querySelector<HTMLElement>("#welcome-view");
  const reading = document.querySelector<HTMLElement>("#reading-view");
  if (!shell || !welcome || !reading) return;

  const targetRoute: AppState["ui"]["route"] = route;
  const isReading = targetRoute === "reading";
  const currentRoute = (
    shell.dataset.route === "reading" ? "reading" : "welcome"
  ) as AppState["ui"]["route"];

  if (isDebugEnabled()) {
    debugLog("log", "ui:renderRoute", {
      targetRoute,
      currentRoute,
      shellDatasetRoute: shell.dataset.route ?? null,
      welcomeClass: welcome.className,
      readingClass: reading.className,
    });
  }

  const targetView = isReading ? reading : welcome;
  const otherView = isReading ? welcome : reading;

  // Keep accessibility metadata in sync with state.
  welcome.setAttribute("aria-hidden", String(isReading));
  reading.setAttribute("aria-hidden", String(!isReading));

  // If we are already on the requested route, do a simple, non-animated sync.
  if (currentRoute === targetRoute) {
    shell.dataset.route = isReading ? "reading" : "welcome";
    targetView.classList.add("is-mounted", "is-active");
    otherView.classList.remove("is-active");
    otherView.classList.remove("is-mounted");
    return;
  }

  // Cross-fade transition. We explicitly mount/unmount views rather than
  // keeping a permanently hidden layer present. This avoids WKWebView quirks
  // where an invisible (opacity: 0) element can still interfere with clicks.
  routeTransitionToken += 1;
  const token = routeTransitionToken;

  shell.dataset.route = isReading ? "reading" : "welcome";

  targetView.classList.add("is-mounted");
  otherView.classList.add("is-mounted");

  requestAnimationFrame(() => {
    if (token !== routeTransitionToken) return;
    targetView.classList.add("is-active");
    otherView.classList.remove("is-active");

    if (isDebugEnabled()) {
      debugLog("log", "ui:renderRoute:raf", {
        targetView: targetView.id,
        otherView: otherView.id,
        targetViewClass: targetView.className,
        otherViewClass: otherView.className,
      });
    }
  });

  // Matches CSS transition: opacity 0.5s ease.
  window.setTimeout(() => {
    if (token !== routeTransitionToken) return;
    otherView.classList.remove("is-mounted");

    if (isDebugEnabled()) {
      debugLog("log", "ui:renderRoute:done", {
        unmounted: otherView.id,
        otherViewClass: otherView.className,
      });
    }
  }, 520);
}

import { MOODS, PERSONALITIES } from "../domain/constants";
import type { AppState, DashboardPayload, ProfileDraft } from "../domain/types";
import { zodiacSign } from "../domain/zodiac";
import { debugLog, isDebugEnabled } from "../debug/logger";

let routeTransitionToken = 0;
const MIN_LOADING_MS = 1200;
const MIN_LOADED_MS = 1600;
let loadingShownAt: number | null = null;
let loadingHideTimeout: number | null = null;
let loadedShownAt: number | null = null;
let lastLoadedKey: string | null = null;
let loadingDismissed = false;
const ratingLabels: Array<keyof DashboardPayload["today"]["ratings"]> = [
  "love",
  "work",
  "money",
  "health",
];

function hideOverlay() {
  const loadingShell = document.querySelector<HTMLElement>("#app-loading");
  if (!loadingShell) return;
  loadingShell.classList.add("is-hidden");
  loadingHideTimeout = null;
  loadingShownAt = null;
  loadingDismissed = true;
}

function scheduleLoadingHide() {
  if (loadingHideTimeout !== null) {
    window.clearTimeout(loadingHideTimeout);
  }
  const elapsed = loadingShownAt ? Date.now() - loadingShownAt : MIN_LOADING_MS;
  const elapsedLoaded = loadedShownAt ? Date.now() - loadedShownAt : MIN_LOADED_MS;
  const remaining = Math.max(
    0,
    MIN_LOADING_MS - elapsed,
    MIN_LOADED_MS - elapsedLoaded
  );
  if (remaining === 0) {
    hideOverlay();
    return;
  }
  loadingHideTimeout = window.setTimeout(() => {
    hideOverlay();
  }, remaining);
}

export function populateSelects() {
  const moodSelect = document.querySelector<HTMLSelectElement>("#mood-input");
  const personalitySelect = document.querySelector<HTMLSelectElement>(
    "#personality-input"
  );

  if (moodSelect) {
    moodSelect.innerHTML = MOODS.map(
      (mood) => `<option value="${mood}">${mood}</option>`
    ).join("");
  }

  if (personalitySelect) {
    personalitySelect.innerHTML = PERSONALITIES.map(
      (personality) => `<option value="${personality}">${personality}</option>`
    ).join("");
  }
}

export function updateBirthdateInputState(
  input: HTMLInputElement | null = document.querySelector<HTMLInputElement>(
    "#birthdate-input"
  )
) {
  if (!input) return;
  input.classList.toggle("is-empty", input.value.length === 0);
}

export function renderProfileDraft(profile: ProfileDraft) {
  const nameInput = document.querySelector<HTMLInputElement>("#name-input");
  const birthInput = document.querySelector<HTMLInputElement>("#birthdate-input");
  const moodInput = document.querySelector<HTMLSelectElement>("#mood-input");
  const personalityInput = document.querySelector<HTMLSelectElement>("#personality-input");

  if (nameInput) nameInput.value = profile.name;
  if (birthInput) birthInput.value = profile.birthdate;
  if (moodInput) moodInput.value = profile.mood;
  if (personalityInput) personalityInput.value = profile.personality;
  updateBirthdateInputState(birthInput);
}

export function renderValidationErrors(
  errors: Partial<Record<keyof ProfileDraft, string>>
) {
  const fields = ["name", "birthdate", "mood", "personality"] as const;
  fields.forEach((field) => {
    const errorEl = document.querySelector<HTMLElement>(
      `[data-error-for="${field}"]`
    );
    if (errorEl) {
      errorEl.textContent = errors[field] ?? "";
    }
  });
}

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

export function renderModelStatus(status: AppState["model"]["status"]) {
  const label = document.querySelector<HTMLElement>(
    "#model-status .model-status__label"
  );
  const progress = document.querySelector<HTMLElement>("#model-progress");
  const loadingShell = document.querySelector<HTMLElement>("#app-loading");
  const loadingLabel = document.querySelector<HTMLElement>("#app-loading-status");
  const loadingProgress = document.querySelector<HTMLElement>(
    "#app-loading-progress"
  );
  if (!label || !progress) return;

  if (status.status === "loading") {
    label.textContent = "Consulting the constellations…";
    progress.style.width = `${Math.round(status.progress * 100)}%`;
    if (loadingLabel) loadingLabel.textContent = "Preparing the star map…";
    if (loadingProgress) {
      loadingProgress.style.width = `${Math.round(status.progress * 100)}%`;
    }
    if (loadingShell) {
      loadingShell.classList.remove("is-hidden");
      loadingDismissed = false;
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  } else if (status.status === "loaded") {
    const sizeLabel = Number.isFinite(status.modelSizeMb)
      ? ` (${status.modelSizeMb.toFixed(1)} MB)`
      : "";
    label.textContent = `Model loaded: ${status.modelPath}${sizeLabel}.`;
    progress.style.width = "100%";
    if (loadingLabel) loadingLabel.textContent = "The stars are ready.";
    if (loadingProgress) loadingProgress.style.width = "100%";
    if (loadingShell) {
      if (!loadedShownAt) {
        loadedShownAt = Date.now();
      }
      scheduleLoadingHide();
    }
    const loadedKey = `${status.modelPath}|${status.modelSizeBytes}`;
    if (isDebugEnabled() && loadedKey !== lastLoadedKey) {
      lastLoadedKey = loadedKey;
      debugLog("log", "model:loaded", {
        path: status.modelPath,
        sizeBytes: status.modelSizeBytes,
        sizeMb: Number.isFinite(status.modelSizeMb)
          ? Number(status.modelSizeMb.toFixed(3))
          : status.modelSizeMb,
      });
    }
  } else if (status.status === "error") {
    label.textContent = "We will use a gentle offline reading.";
    progress.style.width = "100%";
    if (loadingLabel) loadingLabel.textContent = "App failed to load.";
    if (loadingProgress) loadingProgress.style.width = "100%";
    if (loadingShell) {
      loadingShell.classList.remove("is-hidden");
      loadingDismissed = false;
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  } else {
    label.textContent = "Preparing the star map…";
    progress.style.width = "0%";
    if (loadingLabel) loadingLabel.textContent = "Preparing the star map…";
    if (loadingProgress) loadingProgress.style.width = "0%";
    if (loadingShell && !loadingDismissed) {
      loadingShell.classList.remove("is-hidden");
      if (!loadingShownAt) {
        loadingShownAt = Date.now();
      }
      if (loadingHideTimeout !== null) {
        window.clearTimeout(loadingHideTimeout);
        loadingHideTimeout = null;
      }
    }
    loadedShownAt = null;
  }
}

export function renderDashboard(
  payload: DashboardPayload | null,
  profile: ProfileDraft | null,
  error: string | null
) {
  const dateEl = document.querySelector<HTMLElement>("#dashboard-date");
  const headlineEl = document.querySelector<HTMLElement>("#dashboard-headline");
  const subheadEl = document.querySelector<HTMLElement>("#dashboard-subhead");
  const signatureEl = document.querySelector<HTMLElement>("#dashboard-signature");
  const themeEl = document.querySelector<HTMLElement>("#dashboard-theme");
  const energyEl = document.querySelector<HTMLElement>("#dashboard-energy");
  const bestHoursEl = document.querySelector<HTMLElement>("#dashboard-best-hours");
  const luckyEl = document.querySelector<HTMLElement>("#dashboard-lucky");
  const doEl = document.querySelector<HTMLElement>("#dashboard-do");
  const dontEl = document.querySelector<HTMLElement>("#dashboard-dont");
  const sectionsEl = document.querySelector<HTMLElement>("#dashboard-sections");
  const ratingsEl = document.querySelector<HTMLElement>("#dashboard-ratings");

  const cosmicMoonEl = document.querySelector<HTMLElement>("#cosmic-moon");
  const cosmicTransitsEl = document.querySelector<HTMLElement>("#cosmic-transits");
  const cosmicAffectsEl = document.querySelector<HTMLElement>("#cosmic-affects");

  const compBestEl = document.querySelector<HTMLElement>("#compatibility-best");
  const compHandleEl = document.querySelector<HTMLElement>("#compatibility-handle");
  const compConflictEl = document.querySelector<HTMLElement>("#compatibility-conflict");
  const compAffectionEl = document.querySelector<HTMLElement>("#compatibility-affection");

  const journalPromptEl = document.querySelector<HTMLElement>("#journal-prompt");
  const journalStartersEl = document.querySelector<HTMLElement>("#journal-starters");
  const journalMantraEl = document.querySelector<HTMLElement>("#journal-mantra");
  const journalRitualEl = document.querySelector<HTMLElement>("#journal-ritual");
  const journalBestDayEl = document.querySelector<HTMLElement>("#journal-best-day");
  const journalBestReasonEl = document.querySelector<HTMLElement>("#journal-best-reason");

  const weekArcEl = document.querySelector<HTMLElement>("#weekly-arc");
  const weekOpportunityEl = document.querySelector<HTMLElement>("#weekly-opportunity");
  const weekCautionEl = document.querySelector<HTMLElement>("#weekly-caution");
  const weekDecisionsEl = document.querySelector<HTMLElement>("#weekly-best-decisions");
  const weekConversationsEl = document.querySelector<HTMLElement>("#weekly-best-conversations");
  const weekRestEl = document.querySelector<HTMLElement>("#weekly-best-rest");

  const monthThemeEl = document.querySelector<HTMLElement>("#monthly-theme");
  const monthDatesEl = document.querySelector<HTMLElement>("#monthly-dates");
  const monthNewMoonEl = document.querySelector<HTMLElement>("#monthly-newmoon");
  const monthFullMoonEl = document.querySelector<HTMLElement>("#monthly-fullmoon");
  const monthOneThingEl = document.querySelector<HTMLElement>("#monthly-onething");

  const yearHeadlineEl = document.querySelector<HTMLElement>("#year-headline");
  const yearQuartersEl = document.querySelector<HTMLElement>("#year-quarters");
  const yearPowerEl = document.querySelector<HTMLElement>("#year-power");
  const yearChallengeEl = document.querySelector<HTMLElement>("#year-challenge");

  const errorEl = document.querySelector<HTMLElement>("#dashboard-error");

  if (!payload) {
    if (headlineEl) headlineEl.textContent = "";
    if (subheadEl) subheadEl.textContent = "";
    if (sectionsEl) sectionsEl.innerHTML = "";
    if (ratingsEl) ratingsEl.innerHTML = "";
    if (errorEl) errorEl.textContent = error ?? "";
    return;
  }

  if (dateEl) dateEl.textContent = payload.meta.localeDateLabel;
  if (headlineEl) headlineEl.textContent = payload.today.headline;
  if (subheadEl) subheadEl.textContent = payload.today.subhead;
  if (signatureEl) {
    signatureEl.textContent = profile
      ? `${profile.name}, ${zodiacSign(profile.birthdate)}`
      : `${payload.meta.name}, ${payload.meta.sign}`;
  }
  if (themeEl) themeEl.textContent = payload.today.theme;
  if (energyEl) energyEl.textContent = `${payload.today.energyScore}/100`;
  if (bestHoursEl) {
    bestHoursEl.textContent = payload.today.bestHours
      .map((window) => `${window.start}–${window.end}`)
      .join(" · ");
  }
  if (luckyEl) {
    luckyEl.textContent = `${payload.today.lucky.color} · ${payload.today.lucky.number} · ${payload.today.lucky.symbol}`;
  }
  if (doEl) doEl.textContent = payload.today.doDont.do;
  if (dontEl) dontEl.textContent = payload.today.doDont.dont;

  if (sectionsEl) {
    sectionsEl.innerHTML = payload.today.sections
      .map(
        (section) => `
          <div class="dashboard-section">
            <h4>${section.title}</h4>
            <p>${section.body}</p>
          </div>
        `
      )
      .join("");
  }

  if (ratingsEl) {
    ratingsEl.innerHTML = ratingLabels
      .map((label) => {
        const rating = payload.today.ratings[label];
        const labelText = `${label[0].toUpperCase()}${label.slice(1)}`;
        return `
          <div class="rating">
            <span class="rating__label">${labelText}</span>
            <span class="rating__stars">${renderStars(rating)}</span>
          </div>
        `;
      })
      .join("");
  }

  if (cosmicMoonEl) {
    cosmicMoonEl.textContent = `${payload.cosmicWeather.moon.phase} in ${payload.cosmicWeather.moon.sign}`;
  }
  if (cosmicTransitsEl) {
    cosmicTransitsEl.innerHTML = payload.cosmicWeather.transits
      .map((transit) => {
        const toneClass =
          transit.tone === "soft"
            ? "pill--soft"
            : transit.tone === "intense"
              ? "pill--intense"
              : "";
        return `
          <div class="pill ${toneClass}">
            <strong>${transit.title}</strong>
            <span>${transit.meaning}</span>
          </div>
        `;
      })
      .join("");
  }
  if (cosmicAffectsEl) cosmicAffectsEl.textContent = payload.cosmicWeather.affectsToday;

  if (compBestEl) compBestEl.textContent = payload.compatibility.bestFlowWith.join(", ");
  if (compHandleEl) {
    compHandleEl.textContent = payload.compatibility.handleGentlyWith.join(", ");
  }
  if (compConflictEl) compConflictEl.textContent = payload.compatibility.tips.conflict;
  if (compAffectionEl) {
    compAffectionEl.textContent = payload.compatibility.tips.affection;
  }

  if (journalPromptEl) journalPromptEl.textContent = payload.journalRitual.prompt;
  if (journalStartersEl) {
    journalStartersEl.innerHTML = payload.journalRitual.starters
      .map((starter) => `<span class="chip">${starter}</span>`)
      .join("");
  }
  if (journalMantraEl) journalMantraEl.textContent = payload.journalRitual.mantra;
  if (journalRitualEl) journalRitualEl.textContent = payload.journalRitual.ritual;
  if (journalBestDayEl) {
    journalBestDayEl.textContent = payload.journalRitual.bestDayForDecisions.dayLabel;
  }
  if (journalBestReasonEl) {
    journalBestReasonEl.textContent =
      payload.journalRitual.bestDayForDecisions.reason;
  }

  if (weekArcEl) {
    weekArcEl.innerHTML = `
      <p><strong>Start:</strong> ${payload.week.arc.start}</p>
      <p><strong>Midweek:</strong> ${payload.week.arc.midweek}</p>
      <p><strong>Weekend:</strong> ${payload.week.arc.weekend}</p>
    `;
  }
  if (weekOpportunityEl) weekOpportunityEl.textContent = payload.week.keyOpportunity;
  if (weekCautionEl) weekCautionEl.textContent = payload.week.keyCaution;
  if (weekDecisionsEl) weekDecisionsEl.textContent = payload.week.bestDayFor.decisions;
  if (weekConversationsEl) {
    weekConversationsEl.textContent = payload.week.bestDayFor.conversations;
  }
  if (weekRestEl) weekRestEl.textContent = payload.week.bestDayFor.rest;

  if (monthThemeEl) monthThemeEl.textContent = payload.month.theme;
  if (monthDatesEl) {
    monthDatesEl.innerHTML = payload.month.keyDates
      .map(
        (date) => `
          <li>
            <strong>${date.dateLabel}</strong>
            <span>${date.title} — ${date.note}</span>
          </li>
        `
      )
      .join("");
  }
  if (monthNewMoonEl) {
    monthNewMoonEl.textContent = `${payload.month.newMoon.dateLabel}: ${payload.month.newMoon.intention}`;
  }
  if (monthFullMoonEl) {
    monthFullMoonEl.textContent = `${payload.month.fullMoon.dateLabel}: ${payload.month.fullMoon.release}`;
  }
  if (monthOneThingEl) monthOneThingEl.textContent = payload.month.oneThing;

  if (yearHeadlineEl) yearHeadlineEl.textContent = payload.year.headline;
  if (yearQuartersEl) {
    yearQuartersEl.innerHTML = payload.year.quarters
      .map(
        (quarter) => `
          <li>
            <strong>${quarter.label}</strong>
            <span>${quarter.focus}</span>
          </li>
        `
      )
      .join("");
  }
  if (yearPowerEl) yearPowerEl.textContent = payload.year.powerMonths.join(" · ");
  if (yearChallengeEl) {
    yearChallengeEl.textContent = `${payload.year.challengeMonth.month}: ${payload.year.challengeMonth.guidance}`;
  }
  if (errorEl) errorEl.textContent = "";
}

export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#reading-loading");
  const body = document.querySelector<HTMLElement>("#reading-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (loading) {
    loading.hidden = !isGenerating;
  }
  if (body) {
    body.style.opacity = isGenerating ? "0.2" : "1";
  }
  if (regenerate) regenerate.disabled = isGenerating;
  if (edit) edit.disabled = isGenerating;
  if (copy) copy.disabled = isGenerating;
}

function getStreamTargets() {
  const targets: HTMLElement[] = [];
  const loadingStream = document.querySelector<HTMLElement>("#reading-stream");
  const messageStream = document.querySelector<HTMLElement>(".reading__message");
  if (loadingStream) targets.push(loadingStream);
  if (messageStream) targets.push(messageStream);
  return targets;
}

export function resetReadingStream() {
  const targets = getStreamTargets();
  if (targets.length === 0) {
    if (isDebugEnabled()) {
      debugLog("warn", "reading:stream:targets:missing", { action: "reset" });
    }
    return;
  }
  readingStreamBuffer = "";
  targets.forEach((target) => {
    target.textContent = "";
  });
}

export function appendReadingStream(chunk: string) {
  const targets = getStreamTargets();
  if (targets.length === 0) {
    if (isDebugEnabled()) {
      debugLog("warn", "reading:stream:targets:missing", { action: "append" });
    }
    return;
  }
  readingStreamBuffer += chunk;
  targets.forEach((target) => {
    target.textContent = readingStreamBuffer;
  });
}

export function showToast(message: string) {
  const footer = document.querySelector<HTMLElement>(".app__footer");
  if (!footer) return;
  footer.textContent = message;
  window.setTimeout(() => {
    footer.textContent = "For reflection and entertainment. Your intuition matters most.";
  }, 3500);
}

function renderStars(count: number) {
  const filled = "★".repeat(Math.max(0, Math.min(5, count)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.min(5, count)));
  return `${filled}${empty}`;
}

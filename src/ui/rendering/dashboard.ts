import type { DashboardPayload, ProfileDraft } from "../../domain/types";
import { zodiacSign } from "../../domain/zodiac";
import { debugLog, isDebugEnabled } from "../../debug/logger";

const ratingLabels: Array<keyof DashboardPayload["today"]["ratings"]> = [
  "love",
  "work",
  "money",
  "health",
];

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
  const loadingEl = document.querySelector<HTMLElement>("#dashboard-loading");
  const bodyEl = document.querySelector<HTMLElement>("#dashboard-body");

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
    if (isDebugEnabled()) {
      debugLog("warn", "renderDashboard:missingPayload", {
        hasProfile: Boolean(profile),
        hasError: Boolean(error),
        hasHeadline: Boolean(headlineEl),
        hasSections: Boolean(sectionsEl),
        hasRatings: Boolean(ratingsEl),
      });
    }
    if (headlineEl) headlineEl.textContent = "";
    if (subheadEl) subheadEl.textContent = "";
    if (sectionsEl) sectionsEl.innerHTML = "";
    if (ratingsEl) ratingsEl.innerHTML = "";
    if (errorEl) errorEl.textContent = error ?? "";
    return;
  }

  if (loadingEl) loadingEl.hidden = true;
  if (bodyEl) {
    bodyEl.style.opacity = "1";
    bodyEl.classList.remove("is-loading");
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

  if (isDebugEnabled()) {
    debugLog("log", "renderDashboard:complete", {
      dateISO: payload.meta.dateISO,
      sign: payload.meta.sign,
      sectionCount: payload.today.sections.length,
      hasError: Boolean(error),
    });
  }
}

function renderStars(count: number) {
  const filled = "★".repeat(Math.max(0, Math.min(5, count)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.min(5, count)));
  return `${filled}${empty}`;
}

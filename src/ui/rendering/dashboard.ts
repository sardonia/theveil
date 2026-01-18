import type { DashboardPayload, ProfileDraft } from "../../domain/types";
import { zodiacSign } from "../../domain/zodiac";

const ratingLabels: Array<{
  key: keyof DashboardPayload["today"]["ratings"];
  label: string;
}> = [
  { key: "love", label: "Love" },
  { key: "work", label: "Work" },
  { key: "money", label: "Money" },
  { key: "health", label: "Health" },
];

export function renderDashboard(
  payload: DashboardPayload | null,
  profile: ProfileDraft | null,
  error: string | null
) {
  const dateEl = document.getElementById("dashboard-date");
  const headlineEl = document.getElementById("dashboard-headline");
  const subheadEl = document.getElementById("dashboard-subhead");
  const signatureEl = document.getElementById("dashboard-signature");
  const themeEl = document.getElementById("dashboard-theme");
  const energyEl = document.getElementById("dashboard-energy");
  const bestHoursEl = document.getElementById("dashboard-best-hours");
  const luckyEl = document.getElementById("dashboard-lucky");
  const doEl = document.getElementById("dashboard-do");
  const dontEl = document.getElementById("dashboard-dont");
  const sectionsEl = document.getElementById("dashboard-sections");
  const ratingsEl = document.getElementById("dashboard-ratings");

  const bestFlowEl = document.getElementById("compatibility-best");
  const handleEl = document.getElementById("compatibility-handle");
  const conflictEl = document.getElementById("compatibility-conflict");
  const affectionEl = document.getElementById("compatibility-affection");

  renderDashboardError(error);

  if (!payload) {
    if (dateEl) dateEl.textContent = "";
    if (headlineEl) headlineEl.textContent = "";
    if (subheadEl) subheadEl.textContent = "";
    if (signatureEl) signatureEl.textContent = "";
    if (themeEl) themeEl.textContent = "";
    if (energyEl) energyEl.textContent = "";
    if (bestHoursEl) bestHoursEl.textContent = "";
    if (luckyEl) luckyEl.textContent = "";
    if (doEl) doEl.textContent = "";
    if (dontEl) dontEl.textContent = "";
    if (sectionsEl) sectionsEl.innerHTML = "";
    if (ratingsEl) ratingsEl.innerHTML = "";
    if (bestFlowEl) bestFlowEl.textContent = "";
    if (handleEl) handleEl.textContent = "";
    if (conflictEl) conflictEl.textContent = "";
    if (affectionEl) affectionEl.textContent = "";
    return;
  }

  if (dateEl) dateEl.textContent = payload.meta.localeDateLabel;
  if (headlineEl) headlineEl.textContent = payload.today.headline;
  if (subheadEl) subheadEl.textContent = payload.today.subhead;

  const profileName = profile?.name || payload.meta.name;
  const profileSign = profile?.birthdate
    ? zodiacSign(profile.birthdate)
    : payload.meta.sign;
  if (signatureEl) {
    signatureEl.textContent = `${profileName}, ${profileSign}`;
  }

  if (themeEl) themeEl.textContent = payload.today.theme;
  if (energyEl) energyEl.textContent = `${payload.today.energyScore}/100`;
  if (bestHoursEl) {
    bestHoursEl.textContent = payload.today.bestHours
      .map((hour) => `${hour.start}–${hour.end}`)
      .join(" · ");
  }

  if (ratingsEl) {
    ratingsEl.innerHTML = ratingLabels
      .map((item) => {
        const value = payload.today.ratings[item.key];
        return `
          <div class="rating-pill">
            <span>${item.label}</span>
            <strong>${renderStars(value)}</strong>
          </div>
        `.trim();
      })
      .join("");
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
            <p class="dashboard-section__title">${section.title}</p>
            <p class="dashboard-section__body">${section.body}</p>
          </div>
        `.trim()
      )
      .join("");
  }

  if (bestFlowEl)
    bestFlowEl.textContent = formatList(payload.compatibility.bestFlowWith);
  if (handleEl)
    handleEl.textContent = formatList(payload.compatibility.handleGentlyWith);
  if (conflictEl) conflictEl.textContent = payload.compatibility.tips.conflict;
  if (affectionEl)
    affectionEl.textContent = payload.compatibility.tips.affection;
}

function formatList(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

export function renderDashboardError(error: string | null) {
  const errorEl = document.getElementById("dashboard-error");
  if (!errorEl) return;

  if (!error) {
    errorEl.textContent = "";
    errorEl.classList.remove("is-visible");
    return;
  }

  errorEl.textContent = error;
  errorEl.classList.add("is-visible");
}

function renderStars(count: number) {
  const filled = "★".repeat(Math.max(0, Math.min(5, count)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.min(5, count)));
  return `${filled}${empty}`;
}

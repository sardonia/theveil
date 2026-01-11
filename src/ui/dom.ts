import { MOODS, PERSONALITIES } from "../domain/constants";
import type { AppState, ProfileDraft, Reading } from "../domain/types";
import { zodiacSign } from "../domain/zodiac";

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

export function renderProfileDraft(profile: ProfileDraft) {
  const nameInput = document.querySelector<HTMLInputElement>("#name-input");
  const birthInput = document.querySelector<HTMLInputElement>("#birthdate-input");
  const moodInput = document.querySelector<HTMLSelectElement>("#mood-input");
  const personalityInput = document.querySelector<HTMLSelectElement>("#personality-input");

  if (nameInput) nameInput.value = profile.name;
  if (birthInput) birthInput.value = profile.birthdate;
  if (moodInput) moodInput.value = profile.mood;
  if (personalityInput) personalityInput.value = profile.personality;
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
  const card = document.querySelector<HTMLElement>("#reading-card");
  const welcome = document.querySelector<HTMLElement>("#welcome-view");
  const reading = document.querySelector<HTMLElement>("#reading-view");
  if (!card || !welcome || !reading) return;
  const isReading = route === "reading";
  card.classList.toggle("flip-card--flipped", isReading);
  welcome.setAttribute("aria-hidden", String(isReading));
  reading.setAttribute("aria-hidden", String(!isReading));
}

export function renderModelStatus(status: AppState["model"]["status"]) {
  const label = document.querySelector<HTMLElement>(
    "#model-status .model-status__label"
  );
  const progress = document.querySelector<HTMLElement>("#model-progress");
  if (!label || !progress) return;

  if (status.status === "loading") {
    label.textContent = "Consulting the constellations…";
    progress.style.width = `${Math.round(status.progress * 100)}%`;
  } else if (status.status === "ready") {
    label.textContent = "The stars are ready.";
    progress.style.width = "100%";
  } else if (status.status === "error") {
    label.textContent = "We will use a gentle offline reading.";
    progress.style.width = "100%";
  } else {
    label.textContent = "Preparing the star map…";
    progress.style.width = "0%";
  }
}

export function renderReading(reading: Reading | null, profile: ProfileDraft | null) {
  const dateEl = document.querySelector<HTMLElement>("#reading-date");
  const titleEl = document.querySelector<HTMLElement>("#reading-title-text");
  const subtitleEl = document.querySelector<HTMLElement>("#reading-subtitle");
  const messageEl = document.querySelector<HTMLElement>(".reading__message");
  const themesEl = document.querySelector<HTMLUListElement>("#reading-themes");
  const affirmationEl = document.querySelector<HTMLElement>("#reading-affirmation");
  const colorEl = document.querySelector<HTMLElement>("#reading-color");
  const numberEl = document.querySelector<HTMLElement>("#reading-number");

  if (!reading) {
    if (messageEl) messageEl.textContent = "";
    if (themesEl) themesEl.innerHTML = "";
    return;
  }

  const formattedDate = new Date(reading.date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (dateEl) dateEl.textContent = formattedDate;
  if (titleEl) titleEl.textContent = reading.title;
  if (subtitleEl) {
    subtitleEl.textContent = profile
      ? `${profile.name}, ${zodiacSign(profile.birthdate)}`
      : `Sign: ${reading.sign}`;
  }
  if (messageEl) messageEl.textContent = reading.message;
  if (themesEl) {
    themesEl.innerHTML = reading.themes.map((theme) => `<li>${theme}</li>`).join("");
  }
  if (affirmationEl) affirmationEl.textContent = reading.affirmation;
  if (colorEl) colorEl.textContent = reading.luckyColor;
  if (numberEl) numberEl.textContent = reading.luckyNumber.toString();
}

export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#reading-loading");
  const body = document.querySelector<HTMLElement>("#reading-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (!loading || !body || !regenerate || !edit || !copy) return;
  loading.hidden = !isGenerating;
  body.style.opacity = isGenerating ? "0.2" : "1";
  regenerate.disabled = isGenerating;
  edit.disabled = isGenerating;
  copy.disabled = isGenerating;
}

export function showToast(message: string) {
  const footer = document.querySelector<HTMLElement>(".app__footer");
  if (!footer) return;
  footer.textContent = message;
  window.setTimeout(() => {
    footer.textContent = "For reflection and entertainment. Your intuition matters most.";
  }, 3500);
}

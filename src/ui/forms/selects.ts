import { MOODS, PERSONALITIES } from "../../domain/constants";

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

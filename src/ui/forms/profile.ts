import type { ProfileDraft } from "../../domain/types";

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

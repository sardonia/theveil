import { MOODS, PERSONALITIES } from "./constants";
import type { ProfileDraft } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ProfileDraft, string>>;
}

const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]{2,40}$/;

export const profileSpec = {
  validate(profile: ProfileDraft): ValidationResult {
    const errors: Partial<Record<keyof ProfileDraft, string>> = {};

    if (!nameRegex.test(profile.name.trim())) {
      errors.name = "Use 2–40 letters, spaces, apostrophes, or hyphens.";
    }

    if (!profile.birthdate) {
      errors.birthdate = "Choose a birthdate to anchor your sign.";
    } else {
      const date = new Date(profile.birthdate);
      if (Number.isNaN(date.getTime())) {
        errors.birthdate = "That date doesn't look valid.";
      } else {
        const year = date.getFullYear();
        const today = new Date();
        if (date > today) {
          errors.birthdate = "The future is beautiful—pick a past date.";
        } else if (year < 1900) {
          errors.birthdate = "Please choose a year after 1900.";
        }
      }
    }

    if (!MOODS.includes(profile.mood)) {
      errors.mood = "Select a mood from the list.";
    }

    if (!PERSONALITIES.includes(profile.personality)) {
      errors.personality = "Select a personality from the list.";
    }

    return { valid: Object.keys(errors).length === 0, errors };
  },
};

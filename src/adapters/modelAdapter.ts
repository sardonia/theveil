import { invoke } from "@tauri-apps/api/core";
import type { ProfileDraft, Reading } from "../domain/types";

export interface HoroscopeAdapter {
  generate(profile: ProfileDraft, date: string, prompt?: string): Promise<Reading>;
}

export class EmbeddedModelAdapter implements HoroscopeAdapter {
  async generate(profile: ProfileDraft, date: string, prompt?: string) {
    return invoke<Reading>("generate_horoscope", { profile, date, prompt });
  }
}

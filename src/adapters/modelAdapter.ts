import { invoke } from "@tauri-apps/api/core";
import type { ProfileDraft, Reading, SamplingParams } from "../domain/types";

export interface HoroscopeAdapter {
  generate(
    profile: ProfileDraft,
    date: string,
    prompt: string | undefined,
    sampling: SamplingParams
  ): Promise<Reading>;
}

export class EmbeddedModelAdapter implements HoroscopeAdapter {
  async generate(
    profile: ProfileDraft,
    date: string,
    prompt: string | undefined,
    sampling: SamplingParams
  ) {
    return invoke<Reading>("generate_horoscope_stream", {
      profile,
      date,
      prompt,
      sampling,
    });
  }
}

import { invoke } from "@tauri-apps/api/core";
import { debugModelLog } from "../debug/logger";
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
    debugModelLog("log", "adapter:model:invoke", {
      date,
      hasPrompt: Boolean(prompt),
      sampling,
      profile: {
        name: profile.name,
        birthdate: profile.birthdate,
        mood: profile.mood,
        personality: profile.personality,
      },
    });
    try {
      const reading = await invoke<Reading>("generate_horoscope_stream", {
        profile,
        date,
        prompt,
        sampling,
      });
      debugModelLog("log", "adapter:model:response", {
        source: reading.source,
        messageLength: reading.message.length,
      });
      return reading;
    } catch (error) {
      debugModelLog("error", "adapter:model:error", error);
      throw error;
    }
  }
}

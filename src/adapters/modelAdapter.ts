import { invoke } from "@tauri-apps/api/core";
import { debugModelLog } from "../debug/logger";
import type { ProfileDraft, SamplingParams } from "../domain/types";

export interface HoroscopeAdapter {
  generate(
    profile: ProfileDraft,
    date: string,
    prompt: string | undefined,
    sampling: SamplingParams
  ): Promise<string>;
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
      const payloadJson = await invoke<string>("generate_dashboard_payload", {
        profile,
        date,
        prompt,
        sampling,
      });
      debugModelLog("log", "adapter:model:response", {
        payloadLength: payloadJson.length,
      });
      return payloadJson;
    } catch (error) {
      debugModelLog("error", "adapter:model:error", error);
      throw error;
    }
  }
}

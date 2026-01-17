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
      const startedAt = performance.now();
      const timeoutMs = 180_000; // 3 minutes - big local GGUF models can be slow on first run.
      const logIntervalMs = 5_000;

      let logInterval: number | null = null;
      logInterval = window.setInterval(() => {
        const elapsedMs = Math.round(performance.now() - startedAt);
        debugModelLog("log", "adapter:model:waiting", { elapsedMs });
      }, logIntervalMs);

      const payloadJson = await Promise.race([
        invoke<string>("generate_dashboard_payload", {
          profile,
          date,
          prompt,
          sampling,
        }),
        new Promise<string>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error(`Model generation timed out after ${Math.round(timeoutMs / 1000)}s.`));
          }, timeoutMs);
        }),
      ]).finally(() => {
        if (logInterval !== null) {
          window.clearInterval(logInterval);
        }
      });
      const headLen = 240;
      const tailLen = 240;
      const head = payloadJson.slice(0, headLen);
      const tail = payloadJson.length > headLen + tailLen ? payloadJson.slice(-tailLen) : "";
      debugModelLog("log", "adapter:model:response", {
        payloadLength: payloadJson.length,
        payloadHead: head,
        payloadTail: tail,
      });
      return payloadJson;
    } catch (error) {
      debugModelLog("error", "adapter:model:error", error);
      throw error;
    }
  }
}

import type { ModelStatus, ProfileDraft } from "../domain/types";
import type { HoroscopeAdapter } from "../adapters/modelAdapter";
import { EmbeddedModelAdapter } from "../adapters/modelAdapter";
import { StubAdapter } from "../adapters/stubAdapter";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";
import { debugModelLog } from "../debug/logger";

export class HoroscopeRepository {
  private embeddedAdapter: HoroscopeAdapter;
  private stubAdapter: StubAdapter;

  constructor() {
    this.embeddedAdapter = new EmbeddedModelAdapter();
    this.stubAdapter = new StubAdapter();
  }

  async generate(
    profile: ProfileDraft,
    date: string,
    prompt: string | undefined,
    status: ModelStatus
  ): Promise<string> {
    debugModelLog("log", "repository:generate:start", {
      status,
      date,
      hasPrompt: Boolean(prompt),
    });
    if (status.status === "loaded") {
      try {
        debugModelLog("log", "repository:generate:using:model");
        return await this.embeddedAdapter.generate(
          profile,
          date,
          prompt,
          DEFAULT_SAMPLING_PARAMS
        );
      } catch {
        debugModelLog("warn", "repository:generate:model:error", {
          message: "Model adapter failed. Falling back to stub.",
        });
        return this.stubAdapter.generate(profile, date);
      }
    }
    debugModelLog("warn", "repository:generate:using:stub", {
      reason: status.status,
    });
    return this.stubAdapter.generate(profile, date);
  }
}

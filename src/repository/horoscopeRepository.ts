import type { ModelStatus, ProfileDraft, Reading } from "../domain/types";
import type { HoroscopeAdapter } from "../adapters/modelAdapter";
import { EmbeddedModelAdapter } from "../adapters/modelAdapter";
import { StubAdapter } from "../adapters/stubAdapter";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";

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
  ): Promise<Reading> {
    if (status.status === "loaded") {
      try {
        return await this.embeddedAdapter.generate(
          profile,
          date,
          prompt,
          DEFAULT_SAMPLING_PARAMS
        );
      } catch {
        return this.stubAdapter.generate(profile, date);
      }
    }
    return this.stubAdapter.generate(profile, date);
  }
}

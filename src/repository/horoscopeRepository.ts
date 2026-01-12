import type { ModelStatus, ProfileDraft, Reading } from "../domain/types";
import type { HoroscopeAdapter } from "../adapters/modelAdapter";
import { EmbeddedModelAdapter } from "../adapters/modelAdapter";
import { StubAdapter } from "../adapters/stubAdapter";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";
import { emit } from "@tauri-apps/api/event";

type StreamEvent =
  | { kind: "start" }
  | { kind: "chunk"; chunk: string }
  | { kind: "end" };

const STREAM_CHUNK_SIZE = 28;
const STREAM_CHUNK_DELAY_MS = 40;

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
    if (status.status === "ready") {
      try {
        return await this.embeddedAdapter.generate(
          profile,
          date,
          prompt,
          DEFAULT_SAMPLING_PARAMS
        );
      } catch {
        return this.emitStubStream(profile, date);
      }
    }
    return this.emitStubStream(profile, date);
  }

  private async emitStubStream(profile: ProfileDraft, date: string) {
    await emitStreamEvent({ kind: "start" });
    const reading = await this.stubAdapter.generate(profile, date);
    await streamMessage(reading.message);
    await emitStreamEvent({ kind: "end" });
    return reading;
  }
}

async function emitStreamEvent(event: StreamEvent) {
  await emit("reading:stream", event);
}

async function streamMessage(message: string) {
  const chunks = message.match(new RegExp(`.{1,${STREAM_CHUNK_SIZE}}`, "g")) ?? [];
  for (const chunk of chunks) {
    await emitStreamEvent({ kind: "chunk", chunk });
    await new Promise((resolve) => {
      window.setTimeout(resolve, STREAM_CHUNK_DELAY_MS);
    });
  }
}

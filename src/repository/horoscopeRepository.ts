import type { ModelStatus, ProfileDraft, Reading } from "../domain/types";
import type { HoroscopeAdapter } from "../adapters/modelAdapter";
import { EmbeddedModelAdapter } from "../adapters/modelAdapter";
import { StubAdapter } from "../adapters/stubAdapter";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";
import { emit } from "@tauri-apps/api/event";
import { debugModelLog } from "../debug/logger";

type StreamEvent =
  | { kind: "start" }
  | { kind: "chunk"; chunk: string }
  | { kind: "end" };

const STREAM_CHUNK_SIZE = 28;
const STREAM_CHUNK_DELAY_MS = 40;
const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI__" in window;

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
        return this.emitStubStream(profile, date);
      }
    }
    debugModelLog("warn", "repository:generate:using:stub", {
      reason: status.status,
    });
    return this.emitStubStream(profile, date);
  }

  private async emitStubStream(profile: ProfileDraft, date: string) {
    debugModelLog("log", "repository:stream:stub:start");
    await emitStreamEvent({ kind: "start" });
    const reading = await this.stubAdapter.generate(profile, date);
    await streamMessage(reading.message);
    await emitStreamEvent({ kind: "end" });
    debugModelLog("log", "repository:stream:stub:end", {
      messageLength: reading.message.length,
    });
    return reading;
  }
}

async function emitStreamEvent(event: StreamEvent) {
  if (isTauriRuntime()) {
    await emit("reading:stream", event);
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("reading:stream-local", { detail: event }));
  }
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

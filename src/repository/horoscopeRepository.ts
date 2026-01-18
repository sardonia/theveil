import { emit } from "@tauri-apps/api/event";
import type { ModelStatus, ProfileDraft, SamplingParams, StreamEvent } from "../domain/types";
import type { HoroscopeAdapter } from "../adapters/modelAdapter";
import { EmbeddedModelAdapter } from "../adapters/modelAdapter";
import { StubAdapter } from "../adapters/stubAdapter";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";
import { debugModelLog } from "../debug/logger";

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
    status: ModelStatus,
    sampling: SamplingParams = DEFAULT_SAMPLING_PARAMS
  ): Promise<string> {
    const startedAt = performance.now();
    debugModelLog("log", "repository:generate:start", {
      status,
      date,
      hasPrompt: Boolean(prompt),
    });
    if (status.status === "loaded") {
      try {
        debugModelLog("log", "repository:generate:using:model");
        const payload = await this.embeddedAdapter.generate(
          profile,
          date,
          prompt,
          sampling
        );
        debugModelLog("log", "repository:generate:complete", {
          source: "model",
          durationMs: Math.round(performance.now() - startedAt),
          payloadLength: payload.length,
        });
        return payload;
      } catch {
        debugModelLog("warn", "repository:generate:model:error", {
          message: "Model adapter failed. Falling back to stub.",
        });
        const payload = await this.stubAdapter.generate(profile, date);
        debugModelLog("log", "repository:generate:complete", {
          source: "stub-fallback",
          durationMs: Math.round(performance.now() - startedAt),
          payloadLength: payload.length,
        });
        return payload;
      }
    }
    debugModelLog("warn", "repository:generate:using:stub", {
      reason: status.status,
    });
    const payload = await this.emitStubStream(profile, date);
    debugModelLog("log", "repository:generate:complete", {
      source: "stub",
      durationMs: Math.round(performance.now() - startedAt),
      payloadLength: payload.length,
    });
    return payload;
  }

  private async emitStubStream(profile: ProfileDraft, date: string) {
    debugModelLog("log", "repository:stream:stub:start");
    await emitStreamEvent({ kind: "start" });
    const reading = await this.stubAdapter.generate(profile, date);
    await streamMessage(reading);
    await emitStreamEvent({ kind: "end" });
    debugModelLog("log", "repository:stream:stub:end", {
      messageLength: reading.length,
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

import type { AppState, DashboardPayload, ProfileDraft, SamplingParams } from "../domain/types";
import { HoroscopeRepository } from "../repository/horoscopeRepository";
import { debugModelLog } from "../debug/logger";
import { zodiacSign } from "../domain/zodiac";
import { buildDashboardPrompt } from "./dashboardPrompt";
import { sanitizeAndParseDashboardPayload } from "../domain/dashboard";
import { StubAdapter } from "../adapters/stubAdapter";

// Keep in sync with domain/constants DEFAULT_SAMPLING_PARAMS for runtime fallback.
const DEFAULT_SAMPLING_PARAMS: SamplingParams = {
  temperature: 0.45,
  topP: 0.9,
  topK: 50,
  repeatPenalty: 1.1,
  maxTokens: 3600,
  seed: null,
  stop: [],
};

export interface PipelineContext {
  profile: ProfileDraft;
  dateISO: string;
  localeDateLabel: string;
  prompt?: string;
  templateJson?: string;
  payloadJson?: string;
  payload?: DashboardPayload;
  sampling?: SamplingParams;
}

export interface PipelineStep {
  run(context: PipelineContext, state: AppState): Promise<void>;
}

export class BuildPromptStep implements PipelineStep {
  async run(context: PipelineContext) {
    const sign = zodiacSign(context.profile.birthdate);
    const { prompt, templateJson } = buildDashboardPrompt({
      name: context.profile.name,
      birthdate: context.profile.birthdate,
      sign,
      localeDateLabel: context.localeDateLabel,
      dateISO: context.dateISO,
      seed: context.sampling?.seed,
      mood: context.profile.mood,
      personality: context.profile.personality,
      generatedAtISO: new Date().toISOString(),
    });
    context.prompt = prompt;
    context.templateJson = templateJson;
    const promptPreview = previewText(context.prompt ?? "");
    debugModelLog("log", "pipeline:prompt:built", {
      promptLength: promptPreview.length,
      promptHead: promptPreview.head,
      promptTail: promptPreview.tail,
      templateLength: templateJson.length,
    });
  }
}

export class InvokeModelStep implements PipelineStep {
  private repository: HoroscopeRepository;

  constructor(repository: HoroscopeRepository) {
    this.repository = repository;
  }

  async run(context: PipelineContext, state: AppState) {
    debugModelLog("log", "pipeline:invoke:start", {
      modelStatus: state.model.status,
    });
    context.payloadJson = await this.repository.generate(
      context.profile,
      context.dateISO,
      context.prompt,
      state.model.status,
      context.sampling
    );
    debugModelLog("log", "pipeline:invoke:done", {
      payloadLength: context.payloadJson?.length,
    });
  }
}

export class ValidatePayloadStep implements PipelineStep {
  private stub: StubAdapter;

  constructor() {
    this.stub = new StubAdapter();
  }

  async run(context: PipelineContext, state: AppState) {
    if (!context.payloadJson) return;
    const result = sanitizeAndParseDashboardPayload(context.payloadJson);
    if (result.ok) {
      if (result.info.missingBraceAdded) {
        debugModelLog("warn", "pipeline:payload:recovered:missingBrace", {
          payloadLength: context.payloadJson.length,
        });
      }
      context.payload = result.value;
      debugModelLog("log", "pipeline:payload:validated", {
        meta: result.value.meta,
        sections: result.value.today.sections.length,
        missingBraceAdded: result.info.missingBraceAdded,
      });
      return;
    }

    const payloadHead = context.payloadJson.slice(0, 200);
    const payloadTail = context.payloadJson.length > 200 ? context.payloadJson.slice(-200) : "";
    debugModelLog("warn", "pipeline:payload:invalid", {
      error: result.error.message,
      payloadLength: context.payloadJson.length,
      payloadHead,
      payloadTail,
      payloadJson: context.payloadJson,
      location: describeJsonErrorLocation(context.payloadJson, result.error.message),
      wrapperFixApplied: result.info.wrapperFixApplied,
      rootMergeApplied: result.info.rootMergeApplied,
      missingBraceAdded: result.info.missingBraceAdded,
      sanitizer: {
        changed: result.info.changed,
        codeFencesRemoved: result.info.codeFencesRemoved,
        extractedJson: result.info.extractedJson,
        trailingCommasRemoved: result.info.trailingCommasRemoved,
        unquotedKeysFixed: result.info.unquotedKeysFixed,
      },
    });

    // If the model produces invalid JSON, fall back to the stub.
    debugModelLog("error", "pipeline:payload:fallback:stub", {
      reason: "Model produced invalid JSON on first attempt",
    });
    const stubJson = await this.stub.generate(context.profile, context.dateISO, context.sampling);
    const stubResult = sanitizeAndParseDashboardPayload(stubJson);
    if (!stubResult.ok) {
      // This should never happen, but fail loudly if it does.
      throw new Error(stubResult.error.message);
    }
    context.payload = stubResult.value;
  }
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function previewText(
  text: string,
  head = 220,
  tail = 220
): { length: number; head: string; tail: string } {
  const length = text.length;
  if (length <= head + tail + 20) {
    return { length, head: text, tail: "" };
  }
  return {
    length,
    head: text.slice(0, head),
    tail: text.slice(Math.max(0, length - tail)),
  };
}

function describeJsonErrorLocation(
  json: string,
  message: string
): { position: number | null; line: number | null; column: number | null; snippet: string | null } {
  const match = message.match(/position (\d+)/i);
  if (!match) {
    return { position: null, line: null, column: null, snippet: null };
  }
  const position = Number(match[1]);
  if (!Number.isFinite(position) || position < 0) {
    return { position: null, line: null, column: null, snippet: null };
  }
  const safePosition = Math.min(position, json.length);
  let line = 1;
  let column = 1;
  for (let i = 0; i < safePosition; i += 1) {
    if (json[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  const start = Math.max(0, safePosition - 120);
  const end = Math.min(json.length, safePosition + 120);
  const snippet = json.slice(start, end);
  return { position: safePosition, line, column, snippet };
}

function buildSamplingParams(
  profile: ProfileDraft,
  dateISO: string,
  state: AppState
): SamplingParams {
  const base = `${dateISO}|${profile.name}|${profile.birthdate}`;
  const baseSeed = hashSeed(base);
  const historySalt = state.reading.history.filter(
    (reading) => reading.meta.dateISO === dateISO
  ).length;
  const currentSalt = state.reading.current?.meta.dateISO === dateISO ? 1 : 0;
  const seed = (baseSeed + historySalt + currentSalt) >>> 0;
  return {
    ...DEFAULT_SAMPLING_PARAMS,
    seed,
  };
}

export async function runReadingPipeline(
  profile: ProfileDraft,
  dateISO: string,
  state: AppState
): Promise<DashboardPayload> {
  const repository = new HoroscopeRepository();
  const steps: PipelineStep[] = [
    new BuildPromptStep(),
    new InvokeModelStep(repository),
    new ValidatePayloadStep(),
  ];
  const [year, month, day] = dateISO.split("-").map((value) => Number(value));
  const safeLocalDate =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date();
  const localeDateLabel = safeLocalDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const context: PipelineContext = {
    profile,
    dateISO,
    localeDateLabel,
    sampling: buildSamplingParams(profile, dateISO, state),
  };
  for (const step of steps) {
    debugModelLog("log", "pipeline:step:start", {
      step: step.constructor.name,
    });
    await step.run(context, state);
    debugModelLog("log", "pipeline:step:end", {
      step: step.constructor.name,
    });
  }
  if (!context.payload) {
    throw new Error("Unable to generate dashboard payload.");
  }
  return context.payload;
}

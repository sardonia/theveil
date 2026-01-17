import type { AppState, DashboardPayload, ProfileDraft, SamplingParams } from "../domain/types";
import { HoroscopeRepository } from "../repository/horoscopeRepository";
import { debugModelLog } from "../debug/logger";
import { zodiacSign } from "../domain/zodiac";
import { buildDashboardPrompt, buildRegeneratePrompt, buildRepairPrompt } from "./dashboardPrompt";
import { sanitizeAndParseDashboardPayload } from "../domain/dashboard";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";
import { StubAdapter } from "../adapters/stubAdapter";

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

    const buildPromptContext = () => ({
      name: context.profile.name,
      birthdate: context.profile.birthdate,
      sign: zodiacSign(context.profile.birthdate),
      localeDateLabel: context.localeDateLabel,
      dateISO: context.dateISO,
      seed: context.sampling?.seed,
      mood: context.profile.mood,
      personality: context.profile.personality,
      generatedAtISO: new Date().toISOString(),
    });

    const bumpSampling = (sampling: SamplingParams | undefined, attempt: number): SamplingParams => {
      const base = sampling ?? DEFAULT_SAMPLING_PARAMS;
      const seed = base.seed == null ? null : ((base.seed + attempt * 1337) >>> 0);
      const maxTokensBase = Math.max(base.maxTokens, 3000);
      const maxTokens = Math.max(Math.round(maxTokensBase * 1.2), 3600) + attempt * 200;
      const temperature = attempt === 0 ? base.temperature : Math.min(base.temperature, 0.3);
      return { ...base, seed, maxTokens, temperature };
    };

    const isTruncationError = (message: string) => {
      const m = message.toLowerCase();
      return (
        m.includes("unexpected eof") ||
        m.includes("unexpected end") ||
        m.includes("end of json") ||
        m.includes("unterminated")
      );
    };

    const isSyntaxLikeError = (message: string) => {
      const m = message.toLowerCase();
      return (
        m.includes("property name") ||
        m.includes("string literal") ||
        m.includes("invalid") ||
        m.includes("unexpected token")
      );
    };

    const tryParse = (payloadJson: string) => sanitizeAndParseDashboardPayload(payloadJson);

    // Try initial output + up to 2 retries.
    let currentJson = context.payloadJson;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = tryParse(currentJson);
      if (result.ok) {
        context.payload = result.value;
        debugModelLog(
          "log",
          attempt === 0 ? "pipeline:payload:validated" : "pipeline:payload:repair:validated",
          {
            meta: result.value.meta,
            sections: result.value.today.sections.length,
            attempt,
          }
        );
        return;
      }

      const payloadHead = currentJson.slice(0, 200);
      const payloadTail = currentJson.length > 200 ? currentJson.slice(-200) : "";
      debugModelLog("warn", "pipeline:payload:invalid", {
        error: result.error.message,
        attempt,
        payloadLength: currentJson.length,
        payloadHead,
        payloadTail,
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

      if (!context.templateJson) break;

      // For truncation or raw JSON syntax errors, it is usually better to regenerate
      // from the template rather than "repair" a cut-off blob.
      const promptContext = buildPromptContext();
      const nextSampling = bumpSampling(context.sampling, attempt + 1);
      const regenerate = isTruncationError(result.error.message) ||
        isSyntaxLikeError(result.error.message);
      const nextPrompt = regenerate
        ? buildRegeneratePrompt(promptContext, context.templateJson)
        : buildRepairPrompt(currentJson);

      debugModelLog("log", "pipeline:payload:repair:start", {
        attempt: attempt + 1,
        mode: regenerate ? "regenerate" : "repair",
        maxTokens: nextSampling.maxTokens,
        temperature: nextSampling.temperature,
        seed: nextSampling.seed,
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
    const stubResult = tryParse(stubJson);
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

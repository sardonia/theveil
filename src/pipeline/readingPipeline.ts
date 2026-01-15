import type { AppState, DashboardPayload, ProfileDraft, SamplingParams } from "../domain/types";
import { HoroscopeRepository } from "../repository/horoscopeRepository";
import { debugModelLog } from "../debug/logger";
import { zodiacSign } from "../domain/zodiac";
import { buildDashboardPrompt, buildRepairPrompt } from "./dashboardPrompt";
import { extractFirstJsonObject, parseDashboardPayload } from "../domain/dashboard";
import { DEFAULT_SAMPLING_PARAMS } from "../domain/constants";

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
      mood: context.profile.mood,
      personality: context.profile.personality,
      generatedAtISO: new Date().toISOString(),
    });
    context.prompt = prompt;
    context.templateJson = templateJson;
    debugModelLog("log", "pipeline:prompt:built", {
      prompt: context.prompt,
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
  private repository: HoroscopeRepository;

  constructor(repository: HoroscopeRepository) {
    this.repository = repository;
  }

  async run(context: PipelineContext, state: AppState) {
    if (!context.payloadJson) return;
    const extracted = extractFirstJsonObject(context.payloadJson);
    const candidate = extracted ?? context.payloadJson;
    const result = parseDashboardPayload(candidate);
    if (!result.valid) {
      debugModelLog("warn", "pipeline:payload:invalid", {
        error: result.error,
        payloadJson: context.payloadJson,
      });
      if (!context.templateJson) {
        throw new Error(result.error);
      }
      const repairPrompt = buildRepairPrompt(
        {
          name: context.profile.name,
          birthdate: context.profile.birthdate,
          sign: zodiacSign(context.profile.birthdate),
          localeDateLabel: context.localeDateLabel,
          dateISO: context.dateISO,
          mood: context.profile.mood,
          personality: context.profile.personality,
          generatedAtISO: new Date().toISOString(),
        },
        context.templateJson,
        context.payloadJson
      );
      debugModelLog("log", "pipeline:payload:repair:start", {
        hasPrompt: Boolean(repairPrompt),
      });
      const repairedJson = await this.repository.generate(
        context.profile,
        context.dateISO,
        repairPrompt,
        state.model.status,
        context.sampling
      );
      const repairedExtracted = extractFirstJsonObject(repairedJson);
      const repairedCandidate = repairedExtracted ?? repairedJson;
      const repairedResult = parseDashboardPayload(repairedCandidate);
      if (!repairedResult.valid) {
        debugModelLog("error", "pipeline:payload:repair:failed", {
          error: repairedResult.error,
          payloadJson: repairedJson,
        });
        throw new Error(repairedResult.error);
      }
      context.payload = repairedResult.payload;
      debugModelLog("log", "pipeline:payload:repair:validated", {
        meta: repairedResult.payload.meta,
        sections: repairedResult.payload.today.sections.length,
      });
      return;
    }
    context.payload = result.payload;
    debugModelLog("log", "pipeline:payload:validated", {
      meta: result.payload.meta,
      sections: result.payload.today.sections.length,
    });
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
    new ValidatePayloadStep(repository),
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

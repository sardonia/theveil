import type { AppState, DashboardPayload, ProfileDraft } from "../domain/types";
import { HoroscopeRepository } from "../repository/horoscopeRepository";
import { debugModelLog } from "../debug/logger";
import { zodiacSign } from "../domain/zodiac";
import { buildDashboardPrompt } from "./dashboardPrompt";
import { parseDashboardPayload } from "../domain/dashboard";

export interface PipelineContext {
  profile: ProfileDraft;
  dateISO: string;
  localeDateLabel: string;
  prompt?: string;
  payloadJson?: string;
  payload?: DashboardPayload;
}

export interface PipelineStep {
  run(context: PipelineContext, state: AppState): Promise<void>;
}

export class BuildPromptStep implements PipelineStep {
  async run(context: PipelineContext) {
    const sign = zodiacSign(context.profile.birthdate);
    context.prompt = buildDashboardPrompt({
      name: context.profile.name,
      sign,
      localeDateLabel: context.localeDateLabel,
      dateISO: context.dateISO,
      tone: "balanced",
      focus: "general",
    });
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
      state.model.status
    );
    debugModelLog("log", "pipeline:invoke:done", {
      payloadLength: context.payloadJson?.length,
    });
  }
}

export class ValidatePayloadStep implements PipelineStep {
  async run(context: PipelineContext) {
    if (!context.payloadJson) return;
    const result = parseDashboardPayload(context.payloadJson);
    if (!result.valid) {
      debugModelLog("error", "pipeline:payload:invalid", {
        error: result.error,
        payloadJson: context.payloadJson,
      });
      throw new Error(result.error);
    }
    context.payload = result.payload;
    debugModelLog("log", "pipeline:payload:validated", {
      meta: result.payload.meta,
      sections: result.payload.today.sections.length,
    });
  }
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
  const localeDateLabel = new Date(dateISO).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const context: PipelineContext = { profile, dateISO, localeDateLabel };
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

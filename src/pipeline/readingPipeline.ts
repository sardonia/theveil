import type { AppState, ProfileDraft, Reading } from "../domain/types";
import { HoroscopeRepository } from "../repository/horoscopeRepository";
import { debugModelLog } from "../debug/logger";

export interface PipelineContext {
  profile: ProfileDraft;
  date: string;
  prompt?: string;
  reading?: Reading;
}

export interface PipelineStep {
  run(context: PipelineContext, state: AppState): Promise<void>;
}

export class BuildPromptStep implements PipelineStep {
  async run(context: PipelineContext) {
    context.prompt = [
      `Name: ${context.profile.name}`,
      `Birthdate: ${context.profile.birthdate}`,
      `Mood: ${context.profile.mood}`,
      `Personality: ${context.profile.personality}`,
      `Date: ${context.date}`,
    ].join(" | ");
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
    context.reading = await this.repository.generate(
      context.profile,
      context.date,
      context.prompt,
      state.model.status
    );
    debugModelLog("log", "pipeline:invoke:done", {
      source: context.reading?.source,
      messageLength: context.reading?.message.length,
    });
  }
}

export class PostProcessStep implements PipelineStep {
  async run(context: PipelineContext) {
    if (!context.reading) {
      return;
    }
    const message = context.reading.message.trim();
    context.reading = {
      ...context.reading,
      message: message.charAt(0).toUpperCase() + message.slice(1),
    };
    debugModelLog("log", "pipeline:postprocess:done", {
      messageLength: context.reading.message.length,
    });
  }
}

export async function runReadingPipeline(
  profile: ProfileDraft,
  date: string,
  state: AppState
): Promise<Reading> {
  const repository = new HoroscopeRepository();
  const steps: PipelineStep[] = [
    new BuildPromptStep(),
    new InvokeModelStep(repository),
    new PostProcessStep(),
  ];
  const context: PipelineContext = { profile, date };
  for (const step of steps) {
    debugModelLog("log", "pipeline:step:start", {
      step: step.constructor.name,
    });
    await step.run(context, state);
    debugModelLog("log", "pipeline:step:end", {
      step: step.constructor.name,
    });
  }
  if (!context.reading) {
    throw new Error("Unable to generate reading.");
  }
  return context.reading;
}

import type { DashboardPayload } from "./types";

type ValidationResult =
  | { valid: true; payload: DashboardPayload }
  | { valid: false; error: string };

const sectionTitles = new Set(["Focus", "Relationships", "Action", "Reflection"]);
const transitTones = new Set(["soft", "neutral", "intense"]);
const quarterLabels = new Set(["Q1", "Q2", "Q3", "Q4"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  isNumber(value) && Number.isInteger(value);

const ensureArray = <T>(
  value: unknown,
  predicate: (item: unknown) => item is T
): value is T[] => Array.isArray(value) && value.every(predicate);

const inRange = (value: number, min: number, max: number) =>
  value >= min && value <= max;

function errorResult(message: string): ValidationResult {
  return { valid: false, error: message };
}

export function parseDashboardPayload(json: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return errorResult(
      error instanceof Error ? error.message : "Invalid JSON returned by model."
    );
  }

  if (!isRecord(raw)) {
    return errorResult("Payload root must be an object.");
  }

  const meta = raw.meta;
  if (
    !isRecord(meta) ||
    !isString(meta.dateISO) ||
    !isString(meta.localeDateLabel) ||
    !isString(meta.generatedAtISO) ||
    !isString(meta.sign) ||
    !isString(meta.name)
  ) {
    return errorResult("Payload meta is missing required fields.");
  }

  const tabs = raw.tabs;
  if (!isRecord(tabs) || tabs.activeDefault !== "today") {
    return errorResult("Payload tabs.activeDefault must be \"today\".");
  }

  const today = raw.today;
  if (!isRecord(today)) {
    return errorResult("Payload today is missing.");
  }
  if (
    !isString(today.headline) ||
    !isString(today.subhead) ||
    !isString(today.theme) ||
    !isNumber(today.energyScore) ||
    !inRange(today.energyScore, 0, 100)
  ) {
    return errorResult("Payload today fields are invalid.");
  }

  if (
    !ensureArray(today.bestHours, (item): item is { label: string; start: string; end: string } =>
      isRecord(item) && isString(item.label) && isString(item.start) && isString(item.end)
    ) ||
    today.bestHours.length !== 2
  ) {
    return errorResult("Payload today.bestHours must contain exactly 2 items.");
  }

  const ratings = today.ratings;
  if (
    !isRecord(ratings) ||
    !isInteger(ratings.love) ||
    !isInteger(ratings.work) ||
    !isInteger(ratings.money) ||
    !isInteger(ratings.health) ||
    !inRange(ratings.love, 0, 5) ||
    !inRange(ratings.work, 0, 5) ||
    !inRange(ratings.money, 0, 5) ||
    !inRange(ratings.health, 0, 5)
  ) {
    return errorResult("Payload today.ratings must be 0–5 integers.");
  }

  const lucky = today.lucky;
  if (
    !isRecord(lucky) ||
    !isString(lucky.color) ||
    !isInteger(lucky.number) ||
    !isString(lucky.symbol)
  ) {
    return errorResult("Payload today.lucky is invalid.");
  }

  const doDont = today.doDont;
  if (!isRecord(doDont) || !isString(doDont.do) || !isString(doDont.dont)) {
    return errorResult("Payload today.doDont is invalid.");
  }

  if (
    !ensureArray(today.sections, (item): item is { title: string; body: string } =>
      isRecord(item) && isString(item.title) && isString(item.body)
    ) ||
    today.sections.length === 0 ||
    !today.sections.every((section) => sectionTitles.has(section.title))
  ) {
    return errorResult("Payload today.sections is invalid.");
  }

  const cosmicWeather = raw.cosmicWeather;
  if (!isRecord(cosmicWeather)) {
    return errorResult("Payload cosmicWeather is missing.");
  }
  const moon = cosmicWeather.moon;
  if (!isRecord(moon) || !isString(moon.phase) || !isString(moon.sign)) {
    return errorResult("Payload cosmicWeather.moon is invalid.");
  }
  if (
    !ensureArray(cosmicWeather.transits, (item): item is {
      title: string;
      tone: string;
      meaning: string;
    } =>
      isRecord(item) && isString(item.title) && isString(item.tone) && isString(item.meaning)
    ) ||
    cosmicWeather.transits.length > 2 ||
    !cosmicWeather.transits.every((transit) => transitTones.has(transit.tone))
  ) {
    return errorResult("Payload cosmicWeather.transits is invalid.");
  }
  if (!isString(cosmicWeather.affectsToday)) {
    return errorResult("Payload cosmicWeather.affectsToday is invalid.");
  }

  const compatibility = raw.compatibility;
  if (!isRecord(compatibility)) {
    return errorResult("Payload compatibility is missing.");
  }
  if (
    !ensureArray(compatibility.bestFlowWith, isString) ||
    compatibility.bestFlowWith.length !== 2 ||
    !ensureArray(compatibility.handleGentlyWith, isString) ||
    compatibility.handleGentlyWith.length !== 1
  ) {
    return errorResult("Payload compatibility signs are invalid.");
  }
  const tips = compatibility.tips;
  if (!isRecord(tips) || !isString(tips.conflict) || !isString(tips.affection)) {
    return errorResult("Payload compatibility.tips is invalid.");
  }

  const journalRitual = raw.journalRitual;
  if (
    !isRecord(journalRitual) ||
    !isString(journalRitual.prompt) ||
    !ensureArray(journalRitual.starters, isString) ||
    !isString(journalRitual.mantra) ||
    !isString(journalRitual.ritual)
  ) {
    return errorResult("Payload journalRitual is invalid.");
  }
  const bestDay = journalRitual.bestDayForDecisions;
  if (!isRecord(bestDay) || !isString(bestDay.dayLabel) || !isString(bestDay.reason)) {
    return errorResult("Payload journalRitual.bestDayForDecisions is invalid.");
  }

  const week = raw.week;
  if (!isRecord(week)) {
    return errorResult("Payload week is missing.");
  }
  const arc = week.arc;
  if (!isRecord(arc) || !isString(arc.start) || !isString(arc.midweek) || !isString(arc.weekend)) {
    return errorResult("Payload week.arc is invalid.");
  }
  if (!isString(week.keyOpportunity) || !isString(week.keyCaution)) {
    return errorResult("Payload week key items are invalid.");
  }
  const bestDayFor = week.bestDayFor;
  if (
    !isRecord(bestDayFor) ||
    !isString(bestDayFor.decisions) ||
    !isString(bestDayFor.conversations) ||
    !isString(bestDayFor.rest)
  ) {
    return errorResult("Payload week.bestDayFor is invalid.");
  }

  const month = raw.month;
  if (!isRecord(month) || !isString(month.theme) || !isString(month.oneThing)) {
    return errorResult("Payload month is invalid.");
  }
  if (
    !ensureArray(month.keyDates, (item): item is { dateLabel: string; title: string; note: string } =>
      isRecord(item) && isString(item.dateLabel) && isString(item.title) && isString(item.note)
    ) ||
    month.keyDates.length !== 3
  ) {
    return errorResult("Payload month.keyDates must contain 3 items.");
  }
  const newMoon = month.newMoon;
  const fullMoon = month.fullMoon;
  if (
    !isRecord(newMoon) ||
    !isString(newMoon.dateLabel) ||
    !isString(newMoon.intention) ||
    !isRecord(fullMoon) ||
    !isString(fullMoon.dateLabel) ||
    !isString(fullMoon.release)
  ) {
    return errorResult("Payload month moon entries are invalid.");
  }

  const year = raw.year;
  if (!isRecord(year) || !isString(year.headline)) {
    return errorResult("Payload year is invalid.");
  }
  if (
    !ensureArray(year.quarters, (item): item is { label: string; focus: string } =>
      isRecord(item) && isString(item.label) && isString(item.focus)
    ) ||
    year.quarters.length !== 4 ||
    !year.quarters.every((quarter) => quarterLabels.has(quarter.label))
  ) {
    return errorResult("Payload year.quarters must contain 4 labeled items.");
  }
  if (!ensureArray(year.powerMonths, isString) || year.powerMonths.length === 0) {
    return errorResult("Payload year.powerMonths is invalid.");
  }
  const challenge = year.challengeMonth;
  if (!isRecord(challenge) || !isString(challenge.month) || !isString(challenge.guidance)) {
    return errorResult("Payload year.challengeMonth is invalid.");
  }

  return { valid: true, payload: raw as unknown as DashboardPayload };
}

import { isValidCamelotKey, normalizeCamelotKey } from "./camelot";

export interface RecommendationInput {
  camelotKey: string;
  bpm: number;
  genre: string;
  bpmWindow: number;
}

export class ValidationError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
  }
}

function toSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

export function parseRecommendationInput(query: Record<string, unknown>): RecommendationInput {
  const rawCamelotKey = toSingleQueryValue(query.camelotKey);
  if (!rawCamelotKey) {
    throw new ValidationError("Missing required query parameter: camelotKey");
  }
  const camelotKey = normalizeCamelotKey(rawCamelotKey);
  if (!isValidCamelotKey(camelotKey)) {
    throw new ValidationError("Invalid camelotKey. Expected one of 1A..12A or 1B..12B");
  }

  const rawBpm = toSingleQueryValue(query.bpm);
  if (!rawBpm) {
    throw new ValidationError("Missing required query parameter: bpm");
  }
  const bpm = Number(rawBpm);
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new ValidationError("Invalid bpm. Expected a positive number");
  }

  const rawGenre = toSingleQueryValue(query.genre);
  const genre = (rawGenre ?? "electronic").trim();
  if (!genre) {
    throw new ValidationError("Invalid genre. If provided, it must be a non-empty string");
  }

  const rawBpmWindow = toSingleQueryValue(query.bpmWindow);
  const bpmWindow = rawBpmWindow === undefined ? 3 : Number(rawBpmWindow);
  if (!Number.isFinite(bpmWindow) || bpmWindow < 0) {
    throw new ValidationError("Invalid bpmWindow. Expected a non-negative number");
  }

  return { camelotKey, bpm, genre, bpmWindow };
}

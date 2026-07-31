import { ApiError } from "@/lib/api/responses";
import { BENCHMARK_PROVIDERS, BENCHMARK_STATUSES, type BenchmarkProvider, type BenchmarkStatus } from "@/lib/domain/constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonBody(value: unknown) {
  if (!isRecord(value)) throw new ApiError("Request body must be a JSON object.");
  return value;
}

export function requireString(value: unknown, fieldName: string, options?: { allowEmpty?: boolean }) {
  if (typeof value !== "string") throw new ApiError(`${fieldName} must be a string.`);
  const normalized = value.trim();
  if (!options?.allowEmpty && !normalized) throw new ApiError(`${fieldName} cannot be empty.`);
  return normalized;
}

export function optionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) return undefined;
  return requireString(value, fieldName, { allowEmpty: true });
}

export function requireDate(value: unknown, fieldName: string) {
  if (typeof value !== "string") throw new ApiError(`${fieldName} must be an ISO date string.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(`${fieldName} must be a valid ISO date string.`);
  return date;
}

function requireEnum<T extends readonly string[]>(value: unknown, fieldName: string, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ApiError(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  return value as T[number];
}

export function parseBenchmarkProvider(value: unknown, fieldName = "provider") {
  return requireEnum(value, fieldName, BENCHMARK_PROVIDERS) as BenchmarkProvider;
}

export function parseBenchmarkStatus(value: unknown, fieldName = "status") {
  return requireEnum(value, fieldName, BENCHMARK_STATUSES) as BenchmarkStatus;
}

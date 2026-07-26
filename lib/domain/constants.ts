export const AUDIT_SOURCES = ["web", "system", "import"] as const;
export const BENCHMARK_PROVIDERS = ["manual", "public_market"] as const;
export const BENCHMARK_STATUSES = ["active", "inactive", "sync_error"] as const;

export type AuditSource = (typeof AUDIT_SOURCES)[number];
export type BenchmarkProvider = (typeof BENCHMARK_PROVIDERS)[number];
export type BenchmarkStatus = (typeof BENCHMARK_STATUSES)[number];

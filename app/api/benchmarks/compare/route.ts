import { jsonError, jsonOk } from "@/lib/api/responses";
import {
  listBenchmarkComparison,
  parseBenchmarkIds,
  parseOptionalDateRange,
} from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function GET(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const url = new URL(request.url);
    const data = await listBenchmarkComparison({
      userId: user.id,
      benchmarkIds: parseBenchmarkIds(url.searchParams),
      ...parseOptionalDateRange(url.searchParams),
    });

    return jsonOk({ data });
  } catch (error) {
    return jsonError(error);
  }
}

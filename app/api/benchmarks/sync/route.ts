import { jsonError, jsonOk } from "@/lib/api/responses";
import { syncAllBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function POST() {
  try {
    const user = await requireWorkspaceUser();
    const result = await syncAllBenchmarks(user.id);
    return jsonOk({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { reorderBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function PATCH(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json();
    const benchmarks = await reorderBenchmarks(user.id, body);
    return jsonOk({ data: benchmarks });
  } catch (error) {
    return jsonError(error);
  }
}

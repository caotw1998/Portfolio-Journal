import { jsonError, jsonOk } from "@/lib/api/responses";
import { syncBenchmarkHistory } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const benchmark = await syncBenchmarkHistory(user.id, id);
    return jsonOk({ data: benchmark });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { syncBenchmarkHistory } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    const benchmark = await syncBenchmarkHistory(user.id, id, fetch, { force });
    return jsonOk({ data: benchmark });
  } catch (error) {
    return jsonError(error);
  }
}

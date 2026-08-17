import { jsonError, jsonOk } from "@/lib/api/responses";
import { syncAllBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const force = new URL(request.url).searchParams.get("force") === "true";
    const result = await syncAllBenchmarks(user.id, fetch, { force });
    return jsonOk({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}

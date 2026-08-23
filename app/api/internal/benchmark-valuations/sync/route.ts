import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { syncCsiDividendValuations } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { isWorkerTokenValid } from "@/lib/domain/sync-jobs";

export async function POST(request: Request) {
  try {
    if (!isWorkerTokenValid(request.headers.get("x-sync-worker-token"))) {
      throw new ApiError("同步 worker 身份无效。", 401);
    }
    const user = await requireWorkspaceUser();
    const result = await syncCsiDividendValuations(user.id);
    if (result.error) throw new ApiError(result.error, 502);
    return jsonOk({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}

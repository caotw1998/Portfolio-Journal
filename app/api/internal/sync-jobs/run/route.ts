import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { isWorkerTokenValid, processNextSyncJobBatch } from "@/lib/domain/sync-jobs";

export async function POST(request: Request) {
  try {
    if (!isWorkerTokenValid(request.headers.get("x-sync-worker-token"))) {
      throw new ApiError("同步 worker 身份无效。", 401);
    }
    return jsonOk({ data: await processNextSyncJobBatch() });
  } catch (error) {
    return jsonError(error);
  }
}

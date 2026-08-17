import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { createOrReuseAllDataSyncJob, createOrReuseForcedFundsSyncJob } from "@/lib/domain/sync-jobs";

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const force = url.searchParams.get("force");
    if (scope === "funds" && force === "true") {
      return jsonOk({ data: await createOrReuseForcedFundsSyncJob(user.id) });
    }
    if (scope) throw new ApiError("同步任务参数无效。", 400);
    return jsonOk({ data: await createOrReuseAllDataSyncJob(user.id, force === "true") });
  } catch (error) {
    return jsonError(error);
  }
}

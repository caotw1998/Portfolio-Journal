import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { createOrReuseAllDataSyncJob } from "@/lib/domain/sync-jobs";

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const force = new URL(request.url).searchParams.get("force") === "true";
    return jsonOk({ data: await createOrReuseAllDataSyncJob(user.id, force) });
  } catch (error) {
    return jsonError(error);
  }
}

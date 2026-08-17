import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getSyncJob } from "@/lib/domain/sync-jobs";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await getSyncJob(user.id, (await context.params).jobId) });
  } catch (error) {
    return jsonError(error);
  }
}

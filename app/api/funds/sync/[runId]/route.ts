import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getFundSyncRun } from "@/lib/funds/service";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await getFundSyncRun(user.id, (await context.params).runId) });
  } catch (error) {
    return jsonError(error);
  }
}

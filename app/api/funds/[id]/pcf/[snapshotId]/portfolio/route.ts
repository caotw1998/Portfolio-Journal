import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { enrichEtfPcfSnapshotPortfolio } from "@/lib/funds/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const { id, snapshotId } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    return jsonOk({ data: await enrichEtfPcfSnapshotPortfolio(user.id, id, snapshotId, fetch, force) });
  } catch (error) {
    return jsonError(error);
  }
}

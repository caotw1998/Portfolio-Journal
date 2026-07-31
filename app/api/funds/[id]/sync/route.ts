import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { syncFund } from "@/lib/funds/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    return jsonOk({ data: await syncFund(user.id, id, force) });
  } catch (error) {
    return jsonError(error);
  }
}

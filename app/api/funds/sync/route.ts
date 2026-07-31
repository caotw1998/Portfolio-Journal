import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { syncAllFunds } from "@/lib/funds/service";

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const force = new URL(request.url).searchParams.get("force") === "true";
    return jsonOk({ data: await syncAllFunds(user.id, force) });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getFundNav } from "@/lib/funds/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const url = new URL(request.url);
    return jsonOk({ data: await getFundNav(user.id, id, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined) });
  } catch (error) {
    return jsonError(error);
  }
}

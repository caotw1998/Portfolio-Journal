import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getFundOverview, removeUserFund, updateUserFundResearch } from "@/lib/funds/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    return jsonOk({ data: await getFundOverview(user.id, id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    await removeUserFund(user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    return jsonOk({ data: await updateUserFundResearch(user.id, id, await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}

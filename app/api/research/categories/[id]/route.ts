import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { deleteResearchCategory, updateResearchCategory } from "@/lib/funds/research-category-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await updateResearchCategory(user.id, (await context.params).id, await request.json()) });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    await deleteResearchCategory(user.id, (await context.params).id);
    return jsonOk({ ok: true });
  } catch (error) { return jsonError(error); }
}

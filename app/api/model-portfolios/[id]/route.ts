import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { deleteModelPortfolio, getModelPortfolio, updateModelPortfolio } from "@/lib/funds/model-portfolio-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireWorkspaceUser(); return jsonOk({ data: await getModelPortfolio(user.id, (await context.params).id) }); }
  catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireWorkspaceUser(); return jsonOk({ data: await updateModelPortfolio(user.id, (await context.params).id, await request.json()) }); }
  catch (error) { return jsonError(error); }
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireWorkspaceUser(); await deleteModelPortfolio(user.id, (await context.params).id); return jsonOk({ ok: true }); }
  catch (error) { return jsonError(error); }
}

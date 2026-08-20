import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { syncStock } from "@/lib/stocks/service";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireWorkspaceUser(); return jsonOk({ data: await syncStock(user.id, (await context.params).id) }); } catch (error) { return jsonError(error); } }

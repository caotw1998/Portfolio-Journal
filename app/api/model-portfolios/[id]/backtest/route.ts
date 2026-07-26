import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { backtestStoredPortfolio } from "@/lib/funds/model-portfolio-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireWorkspaceUser(); return jsonOk({ data: await backtestStoredPortfolio(user.id, (await context.params).id) }); }
  catch (error) { return jsonError(error); }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { getFundPortfolioReport } from "@/lib/funds/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const reportId = new URL(request.url).searchParams.get("reportId") ?? undefined;
    return jsonOk({ data: await getFundPortfolioReport(user.id, id, reportId) });
  } catch (error) {
    return jsonError(error);
  }
}

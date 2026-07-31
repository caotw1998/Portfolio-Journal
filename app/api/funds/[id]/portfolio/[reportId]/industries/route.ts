import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { enrichFundPortfolioReportIndustries } from "@/lib/funds/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const { id, reportId } = await context.params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    return jsonOk({ data: await enrichFundPortfolioReportIndustries(user.id, id, reportId, fetch, force) });
  } catch (error) {
    return jsonError(error);
  }
}

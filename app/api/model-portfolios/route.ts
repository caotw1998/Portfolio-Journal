import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { createModelPortfolio, listModelPortfolios } from "@/lib/funds/model-portfolio-service";

export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await listModelPortfolios(user.id) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await createModelPortfolio(user.id, await request.json()) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

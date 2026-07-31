import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { createResearchCategory, listResearchCategories } from "@/lib/funds/research-category-service";

export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await listResearchCategories(user.id) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await createResearchCategory(user.id, await request.json()) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { reorderResearchCategories } from "@/lib/funds/research-category-service";

export async function PUT(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json() as { categoryIds?: unknown };
    return jsonOk({ data: await reorderResearchCategories(user.id, body.categoryIds) });
  } catch (error) { return jsonError(error); }
}

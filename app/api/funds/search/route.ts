import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { searchFunds } from "@/lib/funds/service";

export async function GET(request: Request) {
  try {
    await requireWorkspaceUser();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return jsonOk({ data: await searchFunds(query) });
  } catch (error) {
    return jsonError(error);
  }
}

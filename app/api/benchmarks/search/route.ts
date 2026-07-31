import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { searchPublicBenchmarks } from "@/lib/domain/benchmarks";

export async function GET(request: Request) {
  try {
    await requireWorkspaceUser();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return jsonOk({ data: await searchPublicBenchmarks(query) });
  } catch (error) {
    return jsonError(error);
  }
}

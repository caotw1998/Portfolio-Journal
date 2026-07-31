import { jsonError, jsonOk } from "@/lib/api/responses";
import { createBenchmark, listBenchmarks } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    const benchmarks = await listBenchmarks(user.id);
    return jsonOk({ data: benchmarks });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json();
    const benchmark = await createBenchmark(user.id, body);
    return jsonOk({ data: benchmark }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

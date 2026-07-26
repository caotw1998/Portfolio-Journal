import { jsonError, jsonOk } from "@/lib/api/responses";
import { deleteBenchmark, updateBenchmark } from "@/lib/domain/benchmarks";
import { requireWorkspaceUser } from "@/lib/domain/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json();
    const { id } = await context.params;
    const benchmark = await updateBenchmark(user.id, id, body);
    return jsonOk({ data: benchmark });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await context.params;
    const benchmark = await deleteBenchmark(user.id, id);
    return jsonOk({ data: benchmark });
  } catch (error) {
    return jsonError(error);
  }
}

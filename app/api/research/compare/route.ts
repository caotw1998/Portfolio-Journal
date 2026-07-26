import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { compareResearchSeries } from "@/lib/funds/service";

function optionalDate(value: string | null) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError("日期格式应为 YYYY-MM-DD。", 400);
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const parameters = new URL(request.url).searchParams;
    const fundIds = (parameters.get("fundIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const benchmarkId = parameters.get("benchmarkId")?.trim();
    if (!benchmarkId) throw new ApiError("请选择一个指数。", 400);
    return jsonOk(await compareResearchSeries({
      userId: user.id,
      fundIds,
      benchmarkId,
      from: optionalDate(parameters.get("from")),
      to: optionalDate(parameters.get("to")),
    }));
  } catch (error) {
    return jsonError(error);
  }
}

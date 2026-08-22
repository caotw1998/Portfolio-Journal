import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { compareDetailSeries, type DetailSeriesKind } from "@/lib/funds/service";

function requiredKind(value: string | null, label: string): DetailSeriesKind {
  if (value === "fund" || value === "benchmark" || value === "stock") return value;
  throw new ApiError(`${label} 必须是 fund、benchmark 或 stock。`, 400);
}

function requiredId(value: string | null, label: string) {
  const id = value?.trim();
  if (!id) throw new ApiError(`缺少${label}。`, 400);
  return id;
}

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
    return jsonOk(await compareDetailSeries({
      userId: user.id,
      primaryKind: requiredKind(parameters.get("primaryKind"), "主标的类型"),
      primaryId: requiredId(parameters.get("primaryId"), "主标的"),
      baselineKind: requiredKind(parameters.get("baselineKind"), "基准类型"),
      baselineId: requiredId(parameters.get("baselineId"), "基准"),
      from: optionalDate(parameters.get("from")),
      to: optionalDate(parameters.get("to")),
    }));
  } catch (error) {
    return jsonError(error);
  }
}

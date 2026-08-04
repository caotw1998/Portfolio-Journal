import { ApiError, jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { importBenchmarkConstituentCsv, importBenchmarkValuationCsv } from "@/lib/domain/benchmark-imports";
import { parseBenchmarkConstituentCsv } from "@/lib/domain/benchmark-constituents";
import { parseBenchmarkValuationCsv } from "@/lib/domain/benchmark-imports";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWorkspaceUser();
    const { id } = await params;
    const benchmark = await prisma.benchmarkInstrument.findFirst({ where: { id, userId: user.id } });
    if (!benchmark) throw new ApiError("指数不存在。", 404);
    const body = await request.json() as { kind?: unknown; csv?: unknown; dryRun?: unknown };
    if (body.kind !== "valuation" && body.kind !== "constituent") throw new ApiError("导入类型无效。", 400);
    if (typeof body.csv !== "string" || !body.csv.trim()) throw new ApiError("CSV 内容不能为空。", 400);
    if (body.dryRun === true) {
      if (body.kind === "valuation") {
        const preview = parseBenchmarkValuationCsv(body.csv);
        return jsonOk({ dryRun: true, rows: preview.length, snapshots: new Set(preview.map((row) => `${row.indexCode}|${row.date}`)).size });
      }
      const preview = parseBenchmarkConstituentCsv(body.csv);
      return jsonOk({ dryRun: true, rows: preview.reduce((sum, snapshot) => sum + snapshot.constituents.length, 0), snapshots: preview.length });
    }
    const result = body.kind === "valuation"
      ? await importBenchmarkValuationCsv(user.id, body.csv, id)
      : await importBenchmarkConstituentCsv(user.id, body.csv, id);
    return jsonOk({ result });
  } catch (error) {
    return jsonError(error);
  }
}

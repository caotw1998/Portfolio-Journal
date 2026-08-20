import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { searchStocks } from "@/lib/stocks/service";
export async function GET(request: Request) { try { await requireWorkspaceUser(); return jsonOk({ data: await searchStocks(new URL(request.url).searchParams.get("q") ?? "") }); } catch (error) { return jsonError(error); } }

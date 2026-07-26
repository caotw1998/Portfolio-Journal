import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import { addUserFund, listUserFunds } from "@/lib/funds/service";

export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    return jsonOk({ data: await listUserFunds(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json() as { code?: unknown };
    return jsonOk({ data: await addUserFund(user.id, body.code) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, jsonOk } from "@/lib/api/responses";
import { requireWorkspaceUser } from "@/lib/domain/session";
import {
  getWorkspaceProfile,
  updateWorkspaceProfile,
} from "@/lib/domain/workspace";

export async function GET() {
  try {
    const user = await requireWorkspaceUser();
    const profile = await getWorkspaceProfile(user.id);
    return jsonOk({ data: profile });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireWorkspaceUser();
    const body = await request.json();
    const profile = await updateWorkspaceProfile(user.id, body);
    return jsonOk({ data: profile });
  } catch (error) {
    return jsonError(error);
  }
}

import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";

export async function requireWorkspaceUser() {
  const researchOwners = await prisma.user.findMany({
    where: {
      OR: [
        { userFunds: { some: {} } },
        { benchmarkInstruments: { some: {} } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (researchOwners.length === 1) {
    return researchOwners[0]!;
  }

  if (researchOwners.length > 1) {
    throw new ApiError(
      "检测到多个研究数据拥有者，无法确定当前工作区。",
      503,
    );
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (users.length === 1) {
    return users[0]!;
  }

  throw new ApiError(
    users.length === 0
      ? "当前数据库没有可用的工作区用户。"
      : "当前数据库存在多个空工作区用户，无法确定默认工作区。",
    503,
  );
}

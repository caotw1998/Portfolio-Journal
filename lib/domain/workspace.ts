import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { optionalString, parseJsonBody } from "@/lib/domain/validation";
import { parseChartColor, parseChartSeriesColors } from "@/lib/chart-preferences";

const profileSelection = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  chartSingleColor: true,
  chartSeriesColors: true,
} as const;

export async function getWorkspaceProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelection,
  });

  if (!user) {
    throw new ApiError("工作区用户不存在。", 404);
  }

  return user;
}

export async function updateWorkspaceProfile(userId: string, body: unknown) {
  const data = parseJsonBody(body);
  const update: {
    name?: string | null;
    chartSingleColor?: string;
    chartSeriesColors?: string[];
  } = {};
  if (Object.hasOwn(data, "name")) {
    const name = optionalString(data.name, "name");
    update.name = name && name.length > 0 ? name : null;
  }
  if (Object.hasOwn(data, "chartSingleColor")) {
    update.chartSingleColor = parseChartColor(data.chartSingleColor, "chartSingleColor");
  }
  if (Object.hasOwn(data, "chartSeriesColors")) {
    update.chartSeriesColors = parseChartSeriesColors(data.chartSeriesColors);
  }

  return prisma.user.update({
    where: { id: userId },
    data: update,
    select: profileSelection,
  });
}

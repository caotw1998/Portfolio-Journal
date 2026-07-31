import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_RESEARCH_CATEGORY_NAMES,
  MAX_RESEARCH_CATEGORIES,
  normalizeResearchCategoryName,
} from "@/lib/funds/research-category";

function categoryName(value: unknown) {
  try {
    return normalizeResearchCategoryName(value);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "分类名称无效。", 400);
  }
}

function duplicateCategoryError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError("分类名称已经存在。", 409);
  }
  throw error;
}

async function ensureResearchCategories(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { researchCategoriesInitialized: true },
  });
  if (!user) throw new ApiError("工作区用户不存在。", 404);
  if (user.researchCategoriesInitialized) return;

  await prisma.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({
      where: { id: userId },
      select: { researchCategoriesInitialized: true },
    });
    if (!current || current.researchCategoriesInitialized) return;
    await transaction.researchCategory.createMany({
      data: DEFAULT_RESEARCH_CATEGORY_NAMES.map((name, sortOrder) => ({ userId, name, sortOrder })),
      skipDuplicates: true,
    });
    await transaction.user.update({ where: { id: userId }, data: { researchCategoriesInitialized: true } });
  });
}

export async function listResearchCategories(userId: string) {
  await ensureResearchCategories(userId);
  return prisma.researchCategory.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });
}

export async function createResearchCategory(userId: string, input: unknown) {
  await ensureResearchCategories(userId);
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const name = categoryName(record.name);
  const count = await prisma.researchCategory.count({ where: { userId } });
  if (count >= MAX_RESEARCH_CATEGORIES) throw new ApiError(`最多创建 ${MAX_RESEARCH_CATEGORIES} 个分类。`, 400);
  const duplicate = await prisma.researchCategory.findUnique({ where: { userId_name: { userId, name } }, select: { id: true } });
  if (duplicate) throw new ApiError("分类名称已经存在。", 409);
  try {
    return await prisma.researchCategory.create({
      data: { userId, name, sortOrder: count },
      select: { id: true, name: true, sortOrder: true },
    });
  } catch (error) {
    duplicateCategoryError(error);
  }
}

export async function updateResearchCategory(userId: string, categoryId: string, input: unknown) {
  await ensureResearchCategories(userId);
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const name = categoryName(record.name);
  const category = await prisma.researchCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!category) throw new ApiError("分类不存在。", 404);
  try {
    return await prisma.researchCategory.update({
      where: { id: categoryId },
      data: { name },
      select: { id: true, name: true, sortOrder: true },
    });
  } catch (error) {
    duplicateCategoryError(error);
  }
}

export async function deleteResearchCategory(userId: string, categoryId: string) {
  await ensureResearchCategories(userId);
  const result = await prisma.researchCategory.deleteMany({ where: { id: categoryId, userId } });
  if (!result.count) throw new ApiError("分类不存在。", 404);
}

export async function reorderResearchCategories(userId: string, categoryIds: unknown) {
  await ensureResearchCategories(userId);
  if (!Array.isArray(categoryIds) || categoryIds.some((id) => typeof id !== "string")) {
    throw new ApiError("分类顺序无效。", 400);
  }
  const uniqueIds = Array.from(new Set(categoryIds));
  const existing = await prisma.researchCategory.findMany({ where: { userId }, select: { id: true } });
  if (uniqueIds.length !== existing.length || existing.some((item) => !uniqueIds.includes(item.id))) {
    throw new ApiError("分类顺序必须包含全部分类。", 400);
  }
  await prisma.$transaction(uniqueIds.map((id, sortOrder) => prisma.researchCategory.update({ where: { id }, data: { sortOrder } })));
  return listResearchCategories(userId);
}

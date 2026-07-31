import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createResearchCategory,
  deleteResearchCategory,
  listResearchCategories,
  reorderResearchCategories,
  updateResearchCategory,
} from "@/lib/funds/research-category-service";
import { listUserFunds, updateUserFundResearch } from "@/lib/funds/service";
import { createUniqueEmail, resetDatabase } from "./helpers";

describe("research categories", () => {
  beforeEach(resetDatabase);

  test("initializes defaults once and supports owned category CRUD and ordering", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("category"), passwordHash: "test" } });
    const defaults = await listResearchCategories(user.id);
    expect(defaults.map((item) => item.name)).toEqual(["A股", "港股", "海外资产"]);

    const custom = await createResearchCategory(user.id, { name: "  核心观察  " });
    expect(custom.name).toBe("核心观察");
    await expect(createResearchCategory(user.id, { name: "核心观察" })).rejects.toMatchObject({ status: 409 });

    await updateResearchCategory(user.id, custom.id, { name: "长期跟踪" });
    await reorderResearchCategories(user.id, [custom.id, ...defaults.map((item) => item.id)]);
    expect((await listResearchCategories(user.id)).map((item) => item.name)).toEqual(["长期跟踪", "A股", "港股", "海外资产"]);

    await Promise.all((await listResearchCategories(user.id)).map((item) => deleteResearchCategory(user.id, item.id)));
    expect(await listResearchCategories(user.id)).toEqual([]);
  });

  test("assigns several owned categories and rejects categories from another user", async () => {
    const user = await prisma.user.create({ data: { email: createUniqueEmail("owner"), passwordHash: "test" } });
    const other = await prisma.user.create({ data: { email: createUniqueEmail("other"), passwordHash: "test" } });
    const fund = await prisma.fund.create({
      data: { code: "000001", name: "测试基金", followers: { create: { userId: user.id } } },
    });
    const categories = await listResearchCategories(user.id);
    const foreign = await createResearchCategory(other.id, { name: "他人分类" });

    await updateUserFundResearch(user.id, fund.id, { categoryIds: categories.slice(0, 2).map((item) => item.id) });
    expect((await listUserFunds(user.id))[0]?.categoryIds).toEqual(categories.slice(0, 2).map((item) => item.id));
    await expect(updateUserFundResearch(user.id, fund.id, { categoryIds: "invalid" })).rejects.toMatchObject({ status: 400 });
    await expect(updateUserFundResearch(user.id, fund.id, { categoryIds: [foreign.id] })).rejects.toMatchObject({ status: 403 });

    await deleteResearchCategory(user.id, categories[0]!.id);
    expect(await prisma.fund.findUnique({ where: { id: fund.id } })).not.toBeNull();
    expect((await listUserFunds(user.id))[0]?.categoryIds).toEqual([categories[1]!.id]);
  });
});

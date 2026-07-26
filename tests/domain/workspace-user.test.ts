import { beforeEach, describe, expect, test, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findMany: findManyMock,
    },
  },
}));

describe("workspace user", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("uses the unique user who owns research data without a session", async () => {
    const owner = { id: "research-owner", email: "owner@example.com" };
    findManyMock.mockResolvedValueOnce([owner]);

    const { requireWorkspaceUser } = await import("@/lib/domain/session");

    await expect(requireWorkspaceUser()).resolves.toEqual(owner);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { userFunds: { some: {} } },
          { benchmarkInstruments: { some: {} } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
  });

  test("rejects an ambiguous workspace instead of choosing silently", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "owner-a" },
      { id: "owner-b" },
    ]);

    const { requireWorkspaceUser } = await import("@/lib/domain/session");

    await expect(requireWorkspaceUser()).rejects.toMatchObject({ status: 503 });
  });

  test("falls back only when exactly one user exists", async () => {
    const onlyUser = { id: "only-user", email: "only@example.com" };
    findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([onlyUser]);

    const { requireWorkspaceUser } = await import("@/lib/domain/session");

    await expect(requireWorkspaceUser()).resolves.toEqual(onlyUser);
  });
});

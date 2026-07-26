import { beforeEach, describe, expect, test, vi } from "vitest";

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

describe("workspace profile", () => {
  beforeEach(() => vi.clearAllMocks());

  test("updates chart preferences without clearing the display name", async () => {
    updateMock.mockResolvedValue({ id: "user-1" });
    const { updateWorkspaceProfile } = await import("@/lib/domain/workspace");
    const colors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"];

    await updateWorkspaceProfile("user-1", {
      chartSingleColor: "#ABCDEF",
      chartSeriesColors: colors,
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: {
        chartSingleColor: "#abcdef",
        chartSeriesColors: colors,
      },
    }));
  });
});

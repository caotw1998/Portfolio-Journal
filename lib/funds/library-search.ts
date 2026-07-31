export type LibrarySearchOption = {
  id: string;
  code: string;
  name: string;
};

export function searchLibraryOptions<T extends LibrarySearchOption>(
  options: T[],
  query: string,
  selectedIds: ReadonlySet<string>,
  limit = 8,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedQuery) return [];

  return options
    .filter((option) => !selectedIds.has(option.id))
    .filter((option) =>
      `${option.name} ${option.code}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery),
    )
    .slice(0, limit);
}

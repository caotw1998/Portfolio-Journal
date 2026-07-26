export function resolveLatestDisclosedSnapshot<T extends { reportDate: string }>(
  snapshots: T[],
  selectedDate: string,
): T | null {
  return snapshots
    .filter((snapshot) => snapshot.reportDate <= selectedDate)
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate))[0] ?? null;
}

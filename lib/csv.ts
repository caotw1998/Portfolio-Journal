export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (quoted) throw new Error("CSV 存在未闭合的引号。");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function csvRecords(text: string, requiredHeaders: string[]) {
  const rows = parseCsv(text);
  const headers = rows[0] ?? [];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join("、")}`);
  return rows.slice(1).map((values, index) => ({
    line: index + 2,
    value: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])),
  }));
}

export function validIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/**
 * Excel/Sheets treat cells starting with = + - @ (or tab/CR) as formulas.
 * Prefix such text with an apostrophe so user-entered values stay plain text.
 * Plain numbers like "-5" or "-12,50" are left untouched.
 */
export function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value) && !/^-?\d+([.,]\d+)?$/.test(value)) return `'${value}`;
  return value;
}

/** Build a CSV string from rows of scalar values and trigger a download. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escape = (v: unknown) =>
    `"${neutralizeFormula(String(v ?? "")).replace(/"/g, '""')}"`;
  const lines = [header, ...rows].map((row) => row.map(escape).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

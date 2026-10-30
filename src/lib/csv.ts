/** Build a CSV string from rows of scalar values and trigger a download. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escape = (v: unknown) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
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

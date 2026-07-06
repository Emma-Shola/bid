import { downloadBlob } from "@/lib/download";

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvField(String(cell ?? ""))).join(","))
    .join("\r\n");
}

const UTF8_BOM = String.fromCharCode(0xfeff);

export function downloadCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = toCsv(rows);
  // Leading BOM so Excel opens the UTF-8 file without mangling special characters.
  const blob = new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, fileName);
}

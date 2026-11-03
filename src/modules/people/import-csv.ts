import Papa from "papaparse";
import {
  IMPORT_BYTES,
  IMPORT_LIMIT,
  type ImportField,
  importRow,
} from "./import-contracts.ts";
export type CsvData = {
  headers: string[];
  rows: string[][];
  sourceRows: number[];
};
export function parseContactCsv(text: string): CsvData {
  if (
    new TextEncoder().encode(text).length > IMPORT_BYTES ||
    text.includes("\u0000") ||
    text.includes("\ufffd")
  )
    throw Error("csv_invalid");
  let headers: string[] = [],
    record = 0,
    invalid = false;
  const rows: string[][] = [],
    sourceRows: number[] = [];
  Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimitersToGuess: [",", ";", "\t"],
    step(result, parser) {
      record++;
      if (
        record > 100000 ||
        result.errors.some((e) => e.code !== "UndetectableDelimiter")
      ) {
        invalid = true;
        parser.abort();
        return;
      }
      const cells = result.data;
      if (cells.every((cell) => !cell.trim())) return;
      if (!headers.length) {
        headers = cells;
        if (headers.length > 50) {
          invalid = true;
          parser.abort();
        }
        return;
      }
      if (cells.length !== headers.length || rows.length >= IMPORT_LIMIT) {
        invalid = true;
        parser.abort();
        return;
      }
      rows.push(cells);
      sourceRows.push(record);
    },
  });
  if (invalid || !headers.length || !rows.length) throw Error("csv_invalid");
  return {
    headers: headers.map((h) => h.trim().slice(0, 120)),
    rows,
    sourceRows,
  };
}
export function mapContactCsv(
  data: CsvData,
  mapping: Record<ImportField, number>,
) {
  const used = Object.values(mapping).filter((n) => n >= 0);
  if (
    !used.length ||
    new Set(used).size !== used.length ||
    used.some((n) => n >= data.headers.length)
  )
    throw Error("csv_mapping");
  return data.rows.map((cells, index) => {
    const row = data.sourceRows[index]!;
    const raw: Record<string, unknown> = { row };
    for (const [field, column] of Object.entries(mapping))
      raw[field] = column >= 0 ? cells[column] : "";
    try {
      return { row, value: importRow(raw), error: false as const };
    } catch {
      return { row, value: null, error: true as const };
    }
  });
}

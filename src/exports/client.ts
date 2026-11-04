import { DirectoryError } from "../community/client";
import { EXPORT_BYTES, EXPORT_ROWS } from "./contracts";
export async function prepareCsv(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "text/csv" },
  });
  if (!response.ok) {
    let code = "service";
    try {
      code = (await response.json()).code ?? code;
    } catch {
      /* No private provider error text is exposed. */
    }
    throw new DirectoryError(code);
  }
  if (!response.headers.get("content-type")?.startsWith("text/csv"))
    throw new DirectoryError("service");
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (blob.size > EXPORT_BYTES) throw new DirectoryError("export_limit");
  const filename = response.headers
    .get("content-disposition")
    ?.match(/filename="(himmah-[a-z0-9_.-]+\.csv)"/)?.[1];
  const rows = Number(response.headers.get("x-himmah-export-rows")),
    generatedAt = response.headers.get("x-himmah-generated-at");
  if (
    !filename ||
    !Number.isSafeInteger(rows) ||
    rows < 0 ||
    rows > EXPORT_ROWS ||
    !generatedAt ||
    !Number.isFinite(Date.parse(generatedAt))
  )
    throw new DirectoryError("service");
  return { blob, filename, rows, generatedAt };
}

import ts from "typescript";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Search is a behavior, not just type="search". Catch text inputs wired to query state too.
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : entry.name.endsWith(".tsx")
            ? [path.join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}
const failures = [];
for (const file of await files("src")) {
  if (file === "src/components/shared/search-field.tsx") continue;
  const source = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ["Input", "input", "InputGroupInput"].includes(
        node.tagName.getText(source),
      )
    ) {
      const attributes = node.attributes.getText(source);
      if (
        /type=["']search["']|\bid=["'][^"']*(?:search|filter)[^"']*["']|\bvalue=\{(?:query|search|q|rosterSearch|filters\??\.q)(?:\s|\?|\})|\bset(?:Search|Query|Q)\s*\(|\bonFiltersChange\??\.[\s\S]*\bq\s*:/.test(
          attributes,
        )
      ) {
        failures.push(
          `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: filtering inputs must use SearchField`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Search controls use the shared component (including text/query inputs).",
  );

import { readFile, readdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith(".md")) {
      const text = await readFile(path, "utf8");
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        await access(resolve(dirname(path), target));
      }
    }
  }
}
await scan(root);
console.log("Local documentation links verified.");

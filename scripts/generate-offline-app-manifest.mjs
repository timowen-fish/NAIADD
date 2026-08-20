import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const distPath = fileURLToPath(new URL("../dist/", import.meta.url));

async function walk(directory) {
  const output = [];
  for (const name of await readdir(directory)) {
    if (name === "offline-app-manifest.json") continue;
    const full = join(directory, name);
    const info = await stat(full);
    if (info.isDirectory()) output.push(...await walk(full));
    else output.push(full);
  }
  return output;
}

const files = [];
for (const full of await walk(distPath)) {
  const bytes = await readFile(full);
  files.push({
    path: relative(distPath, full).replaceAll("\\", "/"),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
files.sort((a,b) => a.path.localeCompare(b.path));

const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`;

await writeFile(join(distPath, "offline-app-manifest.json"), JSON.stringify({
  format: "NAIADD_OFFLINE_APP_MANIFEST_V1",
  version,
  builtAt: new Date().toISOString(),
  files,
}, null, 2));
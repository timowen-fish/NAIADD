import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const helperRoot = process.cwd();
const source = resolve(helperRoot, "..", "dist");
const bundledTarget = resolve(helperRoot, "naiadd-app");
const workstationTarget = String.raw`C:\TSE\NAIADD\app`;

async function replaceDirectory(target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}

await replaceDirectory(bundledTarget);
console.log(`Copied NAIADD app to ${bundledTarget}`);

try {
  await replaceDirectory(workstationTarget);
  console.log(`Installed NAIADD offline app into ${workstationTarget}`);
} catch (error) {
  console.warn(`Could not seed ${workstationTarget}; installed helper can update it later.`, error);
}
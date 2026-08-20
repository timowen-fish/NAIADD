import { cp, mkdir, rm } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const helperRoot = process.cwd();
const source = resolve(helperRoot, "..", "dist");
const bundledTarget = resolve(helperRoot, "naiadd-app");
const workstationTarget = String.raw`C:\TSE\NAIADD\app`;

function normalizedRelative(sourceRoot, candidate) {
  return relative(sourceRoot, candidate).split(sep).join("/");
}

function shouldInclude(sourceRoot, candidate) {
  const rel = normalizedRelative(sourceRoot, candidate);

  // cp() calls the filter for the source root itself.
  if (!rel || rel === ".") return true;

  /*
   * These resources remain part of the normal Vercel deployment but are NOT
   * needed for the offline data-entry workstation bundle.
   *
   * downloads/
   *   Prevents the installer from recursively embedding a previous installer.
   *
   * data/distributions/
   * spatial/distributions/
   *   Large Distribution-page reference datasets. They are useful online but
   *   are not required for offline Location / Survey / Specimen / Draft work.
   *
   * Keep the ordinary spatial layers (counties, states, huc06, huc08,
   * physiographic provinces, etc.) because New Site uses them offline.
   */
  if (rel === "downloads" || rel.startsWith("downloads/")) {
    return false;
  }

  if (
    rel === "data/distributions" ||
    rel.startsWith("data/distributions/")
  ) {
    return false;
  }

  if (
    rel === "spatial/distributions" ||
    rel.startsWith("spatial/distributions/")
  ) {
    return false;
  }

  return true;
}

async function replaceDirectory(target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  await cp(source, target, {
    recursive: true,
    filter: (candidate) => shouldInclude(source, candidate),
  });
}

await replaceDirectory(bundledTarget);
console.log(`Copied lean NAIADD app to ${bundledTarget}`);

try {
  await replaceDirectory(workstationTarget);
  console.log(`Installed lean NAIADD offline app into ${workstationTarget}`);
} catch (error) {
  console.warn(
    `Could not seed ${workstationTarget}; installed helper can update it later.`,
    error,
  );
}

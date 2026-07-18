import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(root, "dist");
const releaseDirectory = resolve(root, "release");
const manifest = JSON.parse(await readFile(resolve(distribution, "manifest.json"), "utf8"));
const archive = resolve(releaseDirectory, `neopian-assistant-${manifest.version}.zip`);

async function collect(directory, files = {}) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, files);
    else
      files[relative(distribution, absolute).replaceAll("\\", "/")] = new Uint8Array(
        await readFile(absolute),
      );
  }
  return files;
}

await mkdir(releaseDirectory, { recursive: true });
await rm(archive, { force: true });
const files = await collect(distribution);
await writeFile(archive, zipSync(files, { level: 9 }));
process.stdout.write(`Packaged ${Object.keys(files).length} files at ${archive}\n`);

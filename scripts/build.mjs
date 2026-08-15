import { cp, mkdir, readFile, rm, watch } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src");
const distribution = resolve(root, "dist");
const watchMode = process.argv.includes("--watch");
const iconSizes = [16, 19, 24, 32, 38, 48, 64, 96, 128];

function assertGeneratedPath(target) {
  if (
    target !== resolve(root, "dist") ||
    (!target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`))
  ) {
    throw new Error("Refusing to clean a path outside the project distribution directory.");
  }
}

async function bundle(entryPoint, outfile, format) {
  await build({
    entryPoints: [resolve(source, entryPoint)],
    outfile: resolve(distribution, outfile),
    bundle: true,
    format,
    platform: "browser",
    target: "chrome114",
    minify: false,
    sourcemap: false,
    legalComments: "none",
    charset: "utf8",
  });
}

async function buildAll() {
  assertGeneratedPath(distribution);
  await rm(distribution, { force: true, recursive: true });
  await Promise.all([
    mkdir(resolve(distribution, "content"), { recursive: true }),
    mkdir(resolve(distribution, "popup"), { recursive: true }),
    mkdir(resolve(distribution, "options"), { recursive: true }),
    mkdir(resolve(distribution, "ui"), { recursive: true }),
    mkdir(resolve(distribution, "icons"), { recursive: true }),
  ]);
  await Promise.all([
    bundle("background.js", "background.js", "esm"),
    bundle("content/index.js", "content/content.js", "iife"),
    bundle("popup/popup.js", "popup/popup.js", "esm"),
    bundle("options/options.js", "options/options.js", "esm"),
  ]);
  await Promise.all([
    cp(resolve(source, "manifest.json"), resolve(distribution, "manifest.json")),
    cp(resolve(source, "content/content.css"), resolve(distribution, "content/content.css")),
    cp(resolve(source, "popup/index.html"), resolve(distribution, "popup/index.html")),
    cp(resolve(source, "popup/popup.css"), resolve(distribution, "popup/popup.css")),
    cp(resolve(source, "options/index.html"), resolve(distribution, "options/index.html")),
    cp(resolve(source, "options/options.css"), resolve(distribution, "options/options.css")),
    cp(resolve(source, "ui/common.css"), resolve(distribution, "ui/common.css")),
    cp(resolve(source, "assets/icon.svg"), resolve(distribution, "icons/icon.svg")),
  ]);
  const iconSource = await readFile(resolve(source, "assets/icon.svg"));
  await Promise.all(
    iconSizes.map((size) =>
      sharp(iconSource)
        .resize(size, size, { fit: "contain" })
        .png({ compressionLevel: 9 })
        .toFile(resolve(distribution, `icons/icon${size}.png`)),
    ),
  );
  process.stdout.write(`Built Neopian Assistant in ${distribution}\n`);
}

await buildAll();

if (watchMode) {
  let pending = null;
  const watcher = watch(source, { recursive: true });
  process.stdout.write("Watching src for changes. Press Ctrl+C to stop.\n");
  for await (const _event of watcher) {
    clearTimeout(pending);
    pending = setTimeout(() => {
      buildAll().catch(() => process.stderr.write("Development rebuild failed.\n"));
    }, 120);
  }
}

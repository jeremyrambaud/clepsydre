import { readFile, writeFile } from "node:fs/promises";

const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Missing version argument. Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

async function updateJsonVersion(path) {
  const raw = await readFile(path, "utf8");
  const json = JSON.parse(raw);
  json.version = nextVersion;
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

async function updateCargoTomlVersion(path) {
  const raw = await readFile(path, "utf8");
  const versionLineRegex = /^version\s*=\s*".*"$/m;
  if (!versionLineRegex.test(raw)) {
    throw new Error(`Unable to find version entry in ${path}`);
  }

  const updated = raw.replace(versionLineRegex, `version = "${nextVersion}"`);

  await writeFile(path, updated, "utf8");
}

await updateJsonVersion("package.json");
await updateJsonVersion("src-tauri/tauri.conf.json");
await updateCargoTomlVersion("src-tauri/Cargo.toml");
await updateJsonVersion("extension/manifest.json");
await updateJsonVersion("extension-firefox/manifest.json");

console.log(`Updated project version to ${nextVersion}`);

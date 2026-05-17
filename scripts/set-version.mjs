import { access, readFile, writeFile } from "node:fs/promises";

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

function toExtensionManifestVersion(version) {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/
  );
  if (!match) {
    throw new Error(`Unsupported release version format for extension manifest: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4] ?? "";

  for (const part of [major, minor, patch]) {
    if (!Number.isInteger(part) || part < 0 || part > 65535) {
      throw new Error(`Invalid extension manifest version component: ${part}`);
    }
  }

  if (!prerelease) {
    return `${major}.${minor}.${patch}`;
  }

  const preNumMatch = prerelease.match(/(\d+)/g);
  const preNum = preNumMatch ? Number(preNumMatch[preNumMatch.length - 1]) : 0;
  if (!Number.isInteger(preNum) || preNum < 0 || preNum > 65535) {
    throw new Error(`Invalid prerelease extension manifest component: ${preNum}`);
  }

  return `${major}.${minor}.${patch}.${preNum}`;
}

async function updateExtensionManifest(path) {
  const raw = await readFile(path, "utf8");
  const json = JSON.parse(raw);
  json.version = toExtensionManifestVersion(nextVersion);
  json.version_name = nextVersion;
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

async function updateExtensionManifestIfExists(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  await updateExtensionManifest(path);
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
await updateExtensionManifest("extension/manifest.json");
await updateExtensionManifestIfExists("extension/manifest.firefox.json");
await updateExtensionManifest("extension-firefox/manifest.json");

console.log(`Updated project version to ${nextVersion}`);

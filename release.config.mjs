/** @type {import("semantic-release").GlobalConfig} */
export default {
  branches: [
    "main",
    { name: "beta", channel: "beta", prerelease: "beta" },
  ],
  tagFormat: "v${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/exec",
      {
        prepareCmd: "node scripts/set-version.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "bun.lockb", "src-tauri/Cargo.toml", "src-tauri/tauri.conf.json"],
        message: "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}",
      },
    ],
  ],
};

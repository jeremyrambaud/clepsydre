/** @type {import("semantic-release").GlobalConfig} */
const isBetaDraftRelease = process.env.SEMANTIC_RELEASE_DRAFT === "true";
const releaseChannelLabel = process.env.SEMANTIC_RELEASE_CHANNEL_LABEL === "Beta" ? "Beta" : "Stable";

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
        assets: [
          "package.json",
          "bun.lockb",
          "src-tauri/Cargo.toml",
          "src-tauri/Cargo.lock",
          "src-tauri/tauri.conf.json",
          "extension/manifest.json",
          "extension-firefox/manifest.json",
        ],
        message: "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        // Assets are published by the tag-based release workflow (tauri-action),
        // so semantic-release only publishes notes/metadata on GitHub Releases.
        assets: [],
        addReleases: "bottom",
        draftRelease: isBetaDraftRelease,
        releaseNameTemplate: `Clepsydre ${releaseChannelLabel} v<%= nextRelease.version %>`,
      },
    ],
  ],
};

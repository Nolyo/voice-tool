#!/usr/bin/env node

/**
 * Generate releases.json file
 *
 * This script queries the GitHub API to retrieve all public releases,
 * parses assets (portable, NSIS, MSI), extracts checksums and generates
 * a structured JSON file for the website.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx node generate-releases-json.js
 */

import { Octokit } from "@octokit/rest";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const OWNER = "Nolyo";
const REPO = "voice-tool";
const OUTPUT_FILE = join(__dirname, "../../docs/releases.json");
const SCHEMA_VERSION = "1.0";

// Initialize Octokit
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Convert bytes to human-readable format (MB, KB)
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Extract SHA256 from checksums.txt file
 */
async function getChecksum(checksumUrl, filename) {
  try {
    const response = await fetch(checksumUrl);
    if (!response.ok) return null;

    const checksumContent = await response.text();
    const lines = checksumContent.split("\n");

    for (const line of lines) {
      if (line.includes(filename)) {
        const hash = line.split(" ")[0];
        return hash;
      }
    }
    return null;
  } catch (error) {
    console.warn(
      `Warning: Could not fetch checksum for ${filename}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Parse release assets
 */
async function parseReleaseAssets(release) {
  const assets = release.assets;
  const tag = release.tag_name;

  // Find checksums file
  const checksumAsset = assets.find(
    (a) => a.name.startsWith("checksums-") && a.name.endsWith(".txt"),
  );
  const checksumUrl = checksumAsset?.browser_download_url;

  const result = {};

  // Portable
  const portableAsset = assets.find((a) => a.name.includes("-portable.exe"));
  if (portableAsset) {
    result.portable = {
      filename: portableAsset.name,
      url: portableAsset.browser_download_url,
      size_bytes: portableAsset.size,
      size_human: formatBytes(portableAsset.size),
      sha256: checksumUrl
        ? await getChecksum(checksumUrl, portableAsset.name)
        : null,
      download_count: portableAsset.download_count,
    };
  }

  // NSIS Installer
  const nsisAsset = assets.find(
    (a) => a.name.includes("-setup.exe") && !a.name.includes("portable"),
  );
  if (nsisAsset) {
    result.nsis_installer = {
      filename: nsisAsset.name,
      url: nsisAsset.browser_download_url,
      size_bytes: nsisAsset.size,
      size_human: formatBytes(nsisAsset.size),
      sha256: checksumUrl
        ? await getChecksum(checksumUrl, nsisAsset.name)
        : null,
      download_count: nsisAsset.download_count,
    };
  }

  // MSI Installer
  const msiAsset = assets.find((a) => a.name.includes("-setup.msi"));
  if (msiAsset) {
    result.msi_installer = {
      filename: msiAsset.name,
      url: msiAsset.browser_download_url,
      size_bytes: msiAsset.size,
      size_human: formatBytes(msiAsset.size),
      sha256: checksumUrl
        ? await getChecksum(checksumUrl, msiAsset.name)
        : null,
      download_count: msiAsset.download_count,
    };
  }

  return result;
}

/**
 * Fetch all public releases
 */
async function fetchAllReleases() {
  console.log(`Fetching releases from ${OWNER}/${REPO}...`);

  const releases = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await octokit.rest.repos.listReleases({
      owner: OWNER,
      repo: REPO,
      per_page: 100,
      page: page,
    });

    // Filter only public releases (non-draft, non-prerelease)
    const publicReleases = data.filter((r) => !r.draft && !r.prerelease);
    releases.push(...publicReleases);

    hasMore = data.length === 100;
    page++;
  }

  console.log(`Found ${releases.length} public releases`);
  return releases;
}

/**
 * Build final JSON object
 */
async function buildReleasesJson(releases) {
  const releasesData = [];

  for (const release of releases) {
    console.log(`Processing release ${release.tag_name}...`);

    const windows = await parseReleaseAssets(release);

    // Extract version (without 'v' prefix)
    const version = release.tag_name.replace(/^v/, "");

    releasesData.push({
      version: version,
      tag: release.tag_name,
      published_at: release.published_at,
      changelog_url: release.html_url,
      release_notes: release.body || "",
      windows: windows,
    });
  }

  // Sort by version descending (newest first)
  releasesData.sort((a, b) => {
    const dateA = new Date(a.published_at);
    const dateB = new Date(b.published_at);
    return dateB - dateA;
  });

  // Build final object
  const json = {
    schema_version: SCHEMA_VERSION,
    app_name: "Voice Tool",
    repository: `${OWNER}/${REPO}`,
    generated_at: new Date().toISOString(),
    latest: releasesData.length > 0 ? releasesData[0] : null,
    releases: releasesData,
  };

  return json;
}

/**
 * Main function
 */
async function main() {
  try {
    // Check that GitHub token is present
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    console.log("=".repeat(60));
    console.log("Generate releases.json");
    console.log("=".repeat(60));

    // Fetch all releases
    const releases = await fetchAllReleases();

    if (releases.length === 0) {
      console.warn(
        "Warning: No public releases found. Creating empty structure.",
      );
    }

    // Build JSON
    const json = await buildReleasesJson(releases);

    // Write file
    const jsonContent = JSON.stringify(json, null, 2);
    writeFileSync(OUTPUT_FILE, jsonContent, "utf-8");

    console.log("=".repeat(60));
    console.log(`✓ releases.json generated successfully!`);
    console.log(`  Path: ${OUTPUT_FILE}`);
    console.log(`  Releases: ${json.releases.length}`);
    console.log(`  Latest: ${json.latest?.version || "N/A"}`);
    console.log("=".repeat(60));

    // Display summary
    if (json.latest) {
      console.log("\nLatest release summary:");
      console.log(`  Version: ${json.latest.version}`);
      console.log(
        `  Published: ${new Date(json.latest.published_at).toLocaleDateString("en-US")}`,
      );

      if (json.latest.windows?.portable) {
        console.log(`  Portable: ${json.latest.windows.portable.size_human}`);
      }
      if (json.latest.windows?.nsis_installer) {
        console.log(`  NSIS: ${json.latest.windows.nsis_installer.size_human}`);
      }
      if (json.latest.windows?.msi_installer) {
        console.log(`  MSI: ${json.latest.windows.msi_installer.size_human}`);
      }
    }
  } catch (error) {
    console.error("Error generating releases.json:", error);
    process.exit(1);
  }
}

// Execute
main();

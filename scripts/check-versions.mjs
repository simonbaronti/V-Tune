#!/usr/bin/env node
// Verify every version source of truth agrees — run locally before tagging
// and by CI (create-release job) before any platform builds:
//
//   node scripts/check-versions.mjs           # all sources must match package.json
//   node scripts/check-versions.mjs 1.0.10    # all sources must match the given version (CI: the tag)
//
// Exits non-zero with a per-source report on any mismatch. Companion to
// scripts/bump-version.mjs, which bumps all of these in one go.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const pkg = JSON.parse(read("package.json"));
const expected = process.argv[2] ?? pkg.version;

const lock = JSON.parse(read("package-lock.json"));
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const gradle = read("android/app/build.gradle");

const sources = {
  "package.json": pkg.version,
  "package-lock.json (root)": lock.version,
  'package-lock.json (packages."")': lock.packages[""].version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1],
  "src-tauri/Cargo.lock (app crate)": read("src-tauri/Cargo.lock").match(/name = "app"\nversion = "([^"]+)"/)?.[1],
  "ios pbxproj MARKETING_VERSION (Debug)": pbx.match(/MARKETING_VERSION = ([^;]+);/)?.[1],
  "ios pbxproj MARKETING_VERSION (Release)": pbx.match(/MARKETING_VERSION = ([^;]+);[\s\S]*MARKETING_VERSION = ([^;]+);/)?.[2],
  "android build.gradle versionName": gradle.match(/versionName "([^"]+)"/)?.[1],
};

let ok = true;
console.log(`Expected version: ${expected}\n`);
for (const [name, value] of Object.entries(sources)) {
  const pass = value === expected;
  ok &&= pass;
  console.log(`  ${pass ? "✓" : "✗"} ${name}: ${value ?? "NOT FOUND"}`);
}

// Build numbers just need to exist and agree internally (iOS Debug==Release).
const iosBuilds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]);
const iosBuildOk = iosBuilds.length >= 2 && new Set(iosBuilds).size === 1;
ok &&= iosBuildOk;
console.log(`  ${iosBuildOk ? "✓" : "✗"} ios pbxproj CURRENT_PROJECT_VERSION: ${[...new Set(iosBuilds)].join(", ") || "NOT FOUND"}`);
const versionCode = gradle.match(/versionCode (\d+)/)?.[1];
console.log(`  ${versionCode ? "✓" : "✗"} android build.gradle versionCode: ${versionCode ?? "NOT FOUND"}`);
ok &&= Boolean(versionCode);

// The landing page embeds download links + footer for the current version.
const landingOk = read("landing/index.html").includes(expected);
ok &&= landingOk;
console.log(`  ${landingOk ? "✓" : "✗"} landing/index.html mentions ${expected}`);

// Release notes / updater banner / TestFlight notes come from this section.
const changelogOk = read("CHANGELOG.md").includes(`## [${expected}]`);
ok &&= changelogOk;
console.log(`  ${changelogOk ? "✓" : "✗"} CHANGELOG.md has a "## [${expected}]" section`);

if (!ok) {
  console.error(`\nVersion sources disagree. Fix with: npm run bump ${expected}`);
  process.exit(1);
}
console.log("\nAll version sources agree ✓");

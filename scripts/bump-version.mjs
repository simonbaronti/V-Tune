#!/usr/bin/env node
// Bump the app version in EVERY source of truth at once.
//
//   npm run bump 1.0.10
//
// V-Tune keeps its version in several independent places; bumping only
// package.json silently ships the old version on the platforms that don't
// derive from it (this is exactly how iOS fell behind at 1.0.9). This script
// updates all of them:
//
//   package.json                              "version"
//   package-lock.json                         self-version (root + packages."")
//   src-tauri/tauri.conf.json                 "version"
//   src-tauri/Cargo.toml                      [package] version
//   src-tauri/Cargo.lock                      the "app" crate's version
//   ios/App/App.xcodeproj/project.pbxproj     MARKETING_VERSION (x2)
//                                             CURRENT_PROJECT_VERSION (x2, +1)
//   android/app/build.gradle                  versionName, versionCode (+1)
//   landing/index.html                        download links + footer
//
// Build numbers (iOS CURRENT_PROJECT_VERSION, Android versionCode) are
// monotonic counters, NOT derived from the version string — they are
// incremented by 1 so they keep rising across minor/major bumps.
//
// CI cross-checks all of these against the tag: scripts/check-versions.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) {
  console.error("Usage: npm run bump <x.y.z>   e.g. npm run bump 1.0.10");
  process.exit(1);
}

const pkgPath = resolve(root, "package.json");
const current = JSON.parse(readFileSync(pkgPath, "utf8")).version;
if (current === next) {
  console.error(`Already at ${next} — nothing to do.`);
  process.exit(1);
}
console.log(`Bumping ${current} → ${next}\n`);

const edit = (relPath, fn) => {
  const path = resolve(root, relPath);
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (after === before) {
    console.error(`✗ ${relPath}: no change made — check the file by hand`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(path, after);
  console.log(`✓ ${relPath}`);
};

// Escape the current version for use in regexes (dots are literal).
const cur = current.replace(/\./g, "\\.");

// 1. package.json
edit("package.json", (s) =>
  s.replace(`"version": "${current}"`, `"version": "${next}"`)
);

// 2. package-lock.json — the two self-version fields only; deeper x.y.z hits
//    are dependency versions and must not be touched.
edit("package-lock.json", (s) => {
  const lock = JSON.parse(s);
  lock.version = next;
  lock.packages[""].version = next;
  return JSON.stringify(lock, null, 2) + "\n";
});

// 3. tauri.conf.json
edit("src-tauri/tauri.conf.json", (s) =>
  s.replace(`"version": "${current}"`, `"version": "${next}"`)
);

// 4. Cargo.toml — [package] version (first version line in the file)
edit("src-tauri/Cargo.toml", (s) =>
  s.replace(new RegExp(`^version = "${cur}"`, "m"), `version = "${next}"`)
);

// 5. Cargo.lock — only the "app" crate's own version
edit("src-tauri/Cargo.lock", (s) =>
  s.replace(
    new RegExp(`(name = "app"\\nversion = )"${cur}"`),
    `$1"${next}"`
  )
);

// 6. iOS pbxproj — MARKETING_VERSION (Debug+Release) and
//    CURRENT_PROJECT_VERSION incremented by 1 (Debug+Release, same value)
edit("ios/App/App.xcodeproj/project.pbxproj", (s) => {
  const build = Number(s.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1]);
  if (!Number.isFinite(build)) return s;
  return s
    .replace(new RegExp(`MARKETING_VERSION = ${cur};`, "g"), `MARKETING_VERSION = ${next};`)
    .replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build + 1};`);
});

// 7. Android build.gradle — versionName + versionCode incremented by 1
edit("android/app/build.gradle", (s) => {
  const code = Number(s.match(/versionCode (\d+)/)?.[1]);
  if (!Number.isFinite(code)) return s;
  return s
    .replace(`versionName "${current}"`, `versionName "${next}"`)
    .replace(/versionCode \d+/, `versionCode ${code + 1}`);
});

// 8. Landing page — download links + footer embed the version
edit("landing/index.html", (s) =>
  s.replace(new RegExp(cur, "g"), next)
);

// CHANGELOG sanity: the release workflow derives GitHub release notes, the
// in-app updater banner AND the TestFlight "What to Test" text from the
// `## [x.y.z]` section.
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${next}]`)) {
  console.warn(`\n⚠ CHANGELOG.md has no "## [${next}]" section yet — add one before tagging.`);
}

console.log(`\nNext steps:
  node scripts/check-versions.mjs ${next}
  git add -A && git commit -m "${next}"
  git tag v${next} && git push origin main v${next}`);

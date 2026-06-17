#!/usr/bin/env node
/**
 * Assemble + publish the Tauri auto-updater manifest (latest.json) for a
 * release, across our split build (Windows/Linux in CI, macOS local).
 *
 * Run this LOCALLY after:
 *   1. CI has published the GitHub Release `v<version>` with the Windows
 *      and Linux installers AND their `.sig` files attached.
 *   2. `npm run tauri:build:mac` has produced the signed, notarized macOS
 *      universal bundle (including the `.app.tar.gz` updater artifact + sig).
 *
 * What it does:
 *   - Uploads the macOS updater artifacts (`V-Tune.app.tar.gz` + `.sig`) to
 *     the release.
 *   - Reads the macOS signature locally and downloads the Windows + Linux
 *     signatures from the release.
 *   - Writes latest.json mapping every platform to its download URL +
 *     signature, and uploads it to the release.
 *
 * The desktop apps poll
 *   https://github.com/simonbaronti/V-Tune/releases/latest/download/latest.json
 * (configured in tauri.conf.json) and update themselves from it.
 *
 * Usage:  node scripts/publish-desktop-update.mjs
 *         (reads the version from package.json)
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const REPO = 'simonbaronti/V-Tune';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const tag = `v${version}`;
const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`;

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'inherit'], ...opts });
}

// ── 1. macOS updater artifacts (built locally) ───────────────────────
const macDir = join(
  root,
  'src-tauri/target/universal-apple-darwin/release/bundle/macos',
);
const macTar = join(macDir, 'V-Tune.app.tar.gz');
const macSigPath = join(macDir, 'V-Tune.app.tar.gz.sig');

if (!existsSync(macTar) || !existsSync(macSigPath)) {
  console.error(
    `\x1b[31mMissing macOS updater artifacts.\x1b[0m\n` +
      `  Expected:\n    ${macTar}\n    ${macSigPath}\n` +
      `  Run \`npm run tauri:build:mac\` first (with the signing key in src-tauri/.env.notarize).`,
  );
  process.exit(1);
}

console.log('▶ Uploading macOS updater artifacts to the release…');
sh(`gh release upload ${tag} "${macTar}" "${macSigPath}" --clobber`);

const macSig = readFileSync(macSigPath, 'utf-8').trim();

// ── 2. Download Windows + Linux signatures from the release ──────────
const winSetup = `V-Tune_${version}_x64-setup.exe`;
const linuxAppImage = `V-Tune_${version}_amd64.AppImage`;

const dl = mkdtempSync(join(tmpdir(), 'vtune-sig-'));
console.log('▶ Fetching Windows + Linux signatures from the release…');
sh(`gh release download ${tag} --dir "${dl}" --pattern "${winSetup}.sig" --pattern "${linuxAppImage}.sig" --clobber`);

const winSig = readFileSync(join(dl, `${winSetup}.sig`), 'utf-8').trim();
const linuxSig = readFileSync(join(dl, `${linuxAppImage}.sig`), 'utf-8').trim();

// ── 3. Build + upload latest.json ────────────────────────────────────
// Pull this version's section from CHANGELOG.md for the in-app "what's new".
let notes = `V-Tune ${version}`;
try {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8');
  const re = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[)`, 'm');
  const m = changelog.match(re);
  if (m) notes = m[1].replace(/^\s+|\s+$/g, '');
} catch { /* fall back to the default */ }

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    // macOS universal — both arches resolve to the same notarized bundle.
    'darwin-aarch64': { signature: macSig, url: `${baseUrl}/V-Tune.app.tar.gz` },
    'darwin-x86_64': { signature: macSig, url: `${baseUrl}/V-Tune.app.tar.gz` },
    'windows-x86_64': { signature: winSig, url: `${baseUrl}/${winSetup}` },
    'linux-x86_64': { signature: linuxSig, url: `${baseUrl}/${linuxAppImage}` },
  },
};

const out = join(dl, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log('\n── latest.json ──');
console.log(JSON.stringify({ ...manifest, notes: notes.slice(0, 60) + '…' }, null, 2));

console.log('\n▶ Uploading latest.json to the release…');
sh(`gh release upload ${tag} "${out}" --clobber`);

console.log(`\n\x1b[32m✓ Auto-updater manifest published for ${tag}.\x1b[0m`);
console.log(`  Desktop apps will offer the update from:`);
console.log(`  https://github.com/${REPO}/releases/latest/download/latest.json`);

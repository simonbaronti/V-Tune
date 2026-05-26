#!/usr/bin/env node
/**
 * One-hit icon regenerator.
 *
 * Inputs (you control these):
 *   assets/icon.png    — 1024×1024 master icon (required)
 *   assets/splash.png  — 2732×2732 launch splash for iOS (optional)
 *
 * Outputs (regenerated, do not edit by hand):
 *   - PWA:        public/pwa-*.png, public/apple-touch-icon-*.png, etc.
 *   - Tauri:      src-tauri/icons/* (.icns, .ico, every PNG size)
 *   - iOS:        ios/App/App/Assets.xcassets/AppIcon.appiconset/*
 *                 ios/App/App/Assets.xcassets/Splash.imageset/* (if splash present)
 *   - Android:    android/app/src/main/res/mipmap-... (if android/ exists)
 *
 * Usage:
 *   npm run icons
 *
 * Drop a new master into assets/icon.png and re-run any time the design changes.
 */

import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const masterIcon = resolve(root, 'assets/icon.png');
const masterSplash = resolve(root, 'assets/splash.png');

function step(name, fn) {
  const line = '─'.repeat(Math.max(0, 60 - name.length));
  console.log(`\n\x1b[36m▶ ${name}\x1b[0m \x1b[2m${line}\x1b[0m`);
  fn();
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

// ── Sanity check ─────────────────────────────────────────────────────
if (!existsSync(masterIcon)) {
  console.error('\x1b[31mError: assets/icon.png not found.\x1b[0m');
  console.error('Drop a 1024×1024 PNG (no transparent edges) at:');
  console.error(`  ${masterIcon}`);
  console.error('Optionally also assets/splash.png (2732×2732) for iOS splash.');
  process.exit(1);
}

console.log(`\x1b[1mRegenerating icons from\x1b[0m ${masterIcon}`);
if (existsSync(masterSplash)) {
  console.log(`  + splash: ${masterSplash}`);
}

// ── 1. PWA (browser / installed PWA) ─────────────────────────────────
step('PWA icons', () => {
  // pwa-assets-generator reads from public/icon.* — copy master into place
  // so the generator picks up the latest design every time.
  const pwaSrc = resolve(root, 'public/icon.png');
  copyFileSync(masterIcon, pwaSrc);
  run('npx pwa-assets-generator --preset minimal-2023 public/icon.png');
});

// ── 2. Tauri desktop (macOS .icns, Windows .ico, Linux PNGs) ─────────
step('Tauri desktop icons', () => {
  mkdirSync(resolve(root, 'src-tauri/icons'), { recursive: true });
  run(`npx tauri icon "${masterIcon}"`);
});

// ── 3. Capacitor iOS (+ Android if scaffolded) ───────────────────────
step('Capacitor iOS / Android icons', () => {
  // @capacitor/assets reads assets/icon.png + assets/splash.png by default.
  // It writes into ios/.../Assets.xcassets and android/.../res/mipmap-* (if
  // the android project exists).
  const flags = [];
  if (existsSync(resolve(root, 'ios')))     flags.push('--ios');
  if (existsSync(resolve(root, 'android'))) flags.push('--android');
  if (flags.length === 0) {
    console.log('  (skipped — no ios/ or android/ scaffolded yet)');
    return;
  }
  run(`npx capacitor-assets generate ${flags.join(' ')}`);
});

// ── 4. Sync iOS so the new icons land inside the Xcode project ───────
step('Capacitor sync', () => {
  if (!existsSync(resolve(root, 'ios')) && !existsSync(resolve(root, 'android'))) {
    console.log('  (skipped — no native platforms scaffolded)');
    return;
  }
  // `cap sync` rebuilds the web bundle + copies it + updates native deps,
  // which also picks up any icon changes.
  try {
    run('npx cap sync');
  } catch {
    console.log('  (cap sync failed — likely fine, icons are already written)');
  }
});

console.log('\n\x1b[32m✓ All icon sets regenerated.\x1b[0m');
console.log('\x1b[2m  Commit the diff in: public/, src-tauri/icons/, ios/, android/\x1b[0m');

#!/usr/bin/env node
/**
 * Smart deploy script:
 * 1. Ensure asset versioning (always) to keep index.html in sync.
 * 2. Detect which Firebase targets changed since last commit (or optionally all if --full).
 *    - hosting: any change in public/ or scripts/version-assets.mjs or firebase.json affecting hosting.
 *    - functions: any change in functions/**
 *    - firestore: rules or indexes changes
 *    - storage: storage.rules
 * 3. Build (if any build steps) – currently none.
 * 4. Run firebase deploy with the minimal --only set.
 * 5. Deploy Cloudflare Worker only if cloudflare/worker.js or wrangler.toml changed (or --full / --worker).
 *
 * Usage:
 *   node scripts/deploy-smart.mjs          # auto detect changes
 *   node scripts/deploy-smart.mjs --full   # force all firebase targets + worker
 *   node scripts/deploy-smart.mjs --worker # force worker deploy too
 *
 * Assumptions:
 *   - Git repo initialized and previous commit exists (falls back to full if not).
 *   - Wrangler & Firebase CLIs installed and logged in.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

function gitChanged(patterns) {
  try {
    // Determine diff base: compare against HEAD (staged + unstaged) using git diff --name-only HEAD
    // If no commits yet, fallback to empty baseline (treat as all changed)
    const hasCommit =
      execSync("git rev-parse --verify HEAD", { cwd: root, stdio: "pipe" })
        .toString()
        .trim().length > 0;
    const baseList = hasCommit
      ? execSync("git diff --name-only HEAD", { cwd: root, stdio: "pipe" })
          .toString()
          .split("\n")
      : [];
    const staged = execSync("git diff --name-only --cached", {
      cwd: root,
      stdio: "pipe",
    })
      .toString()
      .split("\n");
    const all = new Set([...baseList, ...staged].filter(Boolean));
    if (!hasCommit) return true; // treat as all changed first deploy
    if (all.size === 0) return false;
    return [...all].some((f) => patterns.some((p) => matchGlob(p, f)));
  } catch (e) {
    console.warn("git diff failed, assuming changes for safety.", e.message);
    return true;
  }
}

// Minimal glob matcher (supports **, *, directory segments)
function matchGlob(pattern, file) {
  const regex = new RegExp(
    "^" +
      pattern
        .split(/[-\\^$+?.()|{}]/g)
        .map((seg) =>
          seg.replace(/\*\*/g, "(?:(?:.+/)?|)").replace(/\*/g, "[^/]*"),
        )
        .join("") +
      "$",
  );
  return regex.test(file);
}

const args = process.argv.slice(2);
const forceFull = args.includes("--full");
const forceWorker = args.includes("--worker") || forceFull;

console.log("Smart deploy starting...");

// Step 1: always version assets before computing hosting diff because it mutates index.html
run("npm run version-assets");

let firebaseTargets = new Set();
if (forceFull) {
  firebaseTargets = new Set(["hosting", "functions", "firestore", "storage"]);
} else {
  if (gitChanged(["public/**", "scripts/version-assets.mjs", "firebase.json"]))
    firebaseTargets.add("hosting");
  if (gitChanged(["functions/**"])) firebaseTargets.add("functions");
  if (gitChanged(["firestore.rules", "firestore.indexes.json"]))
    firebaseTargets.add("firestore");
  if (gitChanged(["storage.rules"])) firebaseTargets.add("storage");
}

if (firebaseTargets.size === 0) {
  console.log("No Firebase changes detected. (Use --full to force)");
} else {
  const onlyArg = [...firebaseTargets].join(",");
  run(`firebase deploy --only ${onlyArg}`);
}

// Worker deploy conditions
let deployWorker = false;
if (forceWorker) deployWorker = true;
else if (gitChanged(["cloudflare/worker.js", "cloudflare/wrangler.toml"]))
  deployWorker = true;

if (deployWorker) {
  const wranglerToml = resolve(root, "cloudflare/wrangler.toml");
  if (!existsSync(wranglerToml)) {
    console.error("Missing cloudflare/wrangler.toml – cannot deploy worker.");
  } else {
    run("npx wrangler deploy --config cloudflare/wrangler.toml");
  }
} else {
  console.log("No worker changes detected.");
}

console.log("\nSmart deploy complete.");

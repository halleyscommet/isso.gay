#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pubDir = resolve(root, 'public');

const assets = ['app.js', 'styles.css'];
function hashContent(content){
  return createHash('sha256').update(content).digest('hex').slice(0,10);
}

// Ensure template exists (if not, create from current index.html stripping ?v params)
const templatePath = resolve(pubDir, 'index.template.html');
if (!existsSync(templatePath)) {
  const cur = readFileSync(resolve(pubDir, 'index.html'), 'utf8');
  const cleaned = cur.replace(/\?v=[^"']+/g, '');
  writeFileSync(templatePath, cleaned, 'utf8');
  console.log('Created missing index.template.html from current index.html');
}

let template = readFileSync(templatePath, 'utf8');

const versionMap = {};
for (const a of assets) {
  const p = resolve(pubDir, a);
  const content = readFileSync(p);
  versionMap[a] = hashContent(content);
}

// Replace plain asset references with versioned query param
for (const [file, ver] of Object.entries(versionMap)) {
  const regex = new RegExp(`(/${file})(?!\\?v=)`, 'g');
  template = template.replace(regex, `$1?v=${ver}`);
}

// Write output to index.html
writeFileSync(resolve(pubDir, 'index.html'), template, 'utf8');
console.log('Updated index.html with versions:', versionMap);

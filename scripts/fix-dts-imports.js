// This script removes .js extensions from local import/export paths in all .d.ts files in dist/types.
// Usage: node scripts/fix-dts-imports.js


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DTS_DIR = path.join(__dirname, '../dist/types');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Replace .js in import/export statements for relative paths
  content = content.replace(/(from\s+['"]\.[^'"]*)\.js(['"])/g, '$1$2');
  content = content.replace(/(import\s*\(['"]\.[^'"]*)\.js(['"]\))/g, '$1$2');
  fs.writeFileSync(filePath, content, 'utf8');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith('.d.ts')) {
      processFile(fullPath);
    }
  }
}

walk(DTS_DIR);
console.log('Removed .js extensions from .d.ts imports/exports.');

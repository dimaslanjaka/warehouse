// scripts/replace-version.js
// Replaces the __WAREHOUSE_VERSION__ placeholder in built files with the version from package.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = pkgJson.version;
const placeholder = '__WAREHOUSE_VERSION_UNIQUE_2A1B3C4D5E6F__';

const targets = [path.join(__dirname, '../dist/cjs/database.js'), path.join(__dirname, '../dist/esm/database.js')];

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`File not found: ${file}`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(placeholder)) {
    console.warn(`Placeholder not found in: ${file}`);
    continue;
  }
  const replaced = content.replace(new RegExp(placeholder, 'g'), version);
  fs.writeFileSync(file, replaced, 'utf8');
  console.log(`Replaced version in: ${file}`);
}

// Also update placeholder in test/fixtures/db.json if present (literal string replacement)
const dbJsonPath = path.join(__dirname, '../test/fixtures/db.json');
if (fs.existsSync(dbJsonPath)) {
  try {
    let content = fs.readFileSync(dbJsonPath, 'utf8');
    const replaced = content.split(placeholder).join(version);
    if (content !== replaced) {
      fs.writeFileSync(dbJsonPath, replaced, 'utf8');
      console.log(`Replaced warehouse version placeholder in: ${dbJsonPath}`);
    } else {
      console.warn(`Placeholder not found in: ${dbJsonPath}`);
    }
  } catch (err) {
    console.error(`Failed to update ${dbJsonPath}:`, err);
  }
}

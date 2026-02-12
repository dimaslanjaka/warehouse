/**
 * Replaces the __WAREHOUSE_VERSION__ placeholder in built files with the version from package.json.
 *
 * - Updates placeholders in built database.js files (CJS and ESM).
 * - Also updates the placeholder in test/fixtures/db.json if present.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = pkgJson.version;
const placeholder = '__WAREHOUSE_VERSION_UNIQUE_2A1B3C4D5E6F__';

// Recursively search the `dist` folder for files containing the placeholder
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  console.warn(`Dist folder not found: ${distDir}`);
} else {
  const filesToCheck = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        filesToCheck.push(full);
      }
    }
  };
  walk(distDir);

  for (const file of filesToCheck) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes(placeholder)) {
        continue;
      }
      const replaced = content.replace(new RegExp(placeholder, 'g'), version);
      fs.writeFileSync(file, replaced, 'utf8');
      console.log(`Replaced version in: ${file}`);
    } catch (err) {
      console.error(`Failed to process ${file}:`, err);
    }
  }
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

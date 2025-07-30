/**
 * Auto expands the `exports` field in package.json based on the files in src/.
 *
 * - Generates the `exports` field for each file in src/.
 * - Ensures consistent and up-to-date exports for both ESM and CJS builds.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const defaultExports = {
  '.': {
    import: './dist/esm/index.js',
    require: './dist/cjs/index.js',
    types: './dist/types/index.d.ts'
  },
  './package.json': './package.json'
};

fs.readdirSync(path.join(__dirname, '../src')).forEach((file) => {
  defaultExports[`./dist/${file.replace('.ts', '')}`] = {
    import: `./dist/esm/${file.replace('.ts', '.js')}`,
    require: `./dist/cjs/${file.replace('.ts', '.js')}`,
    types: `./dist/types/${file.replace('.ts', '.d.ts')}`
  };
});

// Sort the exports to ensure consistent output
const sortedExports = Object.keys(defaultExports)
  .sort()
  .reduce((obj, key) => {
    obj[key] = defaultExports[key];
    return obj;
  }, {});

packageJson.exports = sortedExports;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');

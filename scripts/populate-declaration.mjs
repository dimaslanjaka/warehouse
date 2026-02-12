import { readdir, readFile, writeFile, stat } from 'fs/promises';
import path from 'path';

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    return false;
  }
}

async function walkAndCopy(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  let copied = 0;
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      copied += await walkAndCopy(full);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.d.ts')) continue;
    const src = full;
    const base = src.slice(0, -'.ts'.length);
    const cts = base + 'cts';
    const mts = base + 'mts';
    const content = await readFile(src);
    await writeFile(cts, content);
    await writeFile(mts, content);
    copied += 2;
  }
  return copied;
}

async function main() {
  const target = process.argv[2] || 'dist';
  if (!(await fileExists(target))) {
    console.error(`directory not found: ${target}`);
    process.exit(1);
  }
  try {
    const count = await walkAndCopy(target);
    console.log(`wrote ${count} declaration copies in ${target}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') main();

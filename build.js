import fs from 'fs';
import path from 'path';
import { build, defineConfig } from 'tsup';
import { fileURLToPath } from 'url';
import packageJson from './package.json' with { type: 'json' };
import { fixImportsPlugin, writeFilePlugin } from 'esbuild-fix-imports-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const debugLogPath = path.join(__dirname, 'build-debug.log');

// Clear previous debug log
if (fs.existsSync(debugLogPath)) {
  fs.writeFileSync(debugLogPath, `Build started at ${new Date().toISOString()}\n\n`);
}

// Simple logger that logs to console and appends to debug log file
const log = function (...args) {
  console.log(...args);
  fs.appendFileSync(debugLogPath, args.join(' ') + '\n');
};

/**
 * Packages that should be bundled (not marked as external)
 * @type {string[]}
 */
const bundledPackages = [];

/**
 * All dependencies except those in bundledPackages will be marked as external
 * @type {string[]}
 */
const externalDeps = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)].filter(
  (pkgName) => !bundledPackages.includes(pkgName)
);

/**
 * Build the project using tsup with custom config
 * @returns {Promise<void>}
 */
function buildTsup() {
  const baseConfig = defineConfig({
    define: {
      __VERSION__: JSON.stringify(packageJson.version)
    },
    banner(ctx) {
      if (ctx.format === 'esm') {
        return {
          js: `import { createRequire } from 'module';
          const require = createRequire(import.meta.url);`
        };
      }
    },
    entry: ['src/**/*.ts'],
    splitting: true,
    treeshake: true,
    bundle: false,
    shims: true,
    sourcemap: true,
    removeNodeProtocol: true,
    clean: true,
    // skipNodeModulesBundle: true,
    external: externalDeps,
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
    outExtension({ format }) {
      switch (format) {
        case 'cjs':
          return { js: '.cjs', dts: '.d.cts' };
        default:
          return { js: '.js', dts: '.d.ts' };
      }
    },
    esbuildPlugins: [
      fixImportsPlugin(), // Fix import extensions
      writeFilePlugin() // Write files to disk once the processing is done
    ],
    plugins: [
      {
        name: 'remove-dirname-import',
        buildEnd(ctx) {
          ctx.writtenFiles.forEach((file) => {
            const fullPath = path.resolve(file.name);
            if (
              !fullPath.endsWith('.js') &&
              !fullPath.endsWith('.ts') &&
              !fullPath.endsWith('.cts') &&
              !fullPath.endsWith('.mts')
            ) {
              // skip non-ESM/TS files
              return;
            }
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes('__dirname')) {
              log(`Modifying __dirname in ${fullPath}`);
              let modifiedContent = content.replace(
                /import\s+.*__dirname.*from\s+['"].*['"];?/g,
                `import NodePath from 'node:path';\nimport NodeUrl from 'node:url';\nconst __dirname = NodePath.dirname(NodeUrl.fileURLToPath(import.meta.url));`
              );
              fs.writeFileSync(fullPath, modifiedContent, 'utf-8');
            }
          });
        }
      },
      {
        name: 'fix-import-extensions',
        renderChunk(_, chunk) {
          // add extension .js to local imports/exports in esm, and change .js to .cjs in cjs
          let code = chunk.code.replace(
            /(from|import|require\()\s*['"](.*?)(?<!\.js|\.mjs|\.cjs|\.json)['"]\s*(\)?)/g,
            (match, p1, p2, p3) => {
              // Only modify relative paths (./ or ../)
              if (p2.startsWith('.')) {
                const dirFile = path.dirname(chunk.path);
                const filename = path.basename(p2);
                const fullImportPath = path.resolve(dirFile, p2);
                // Here we would normally check if it's a directory or file
                // For simplicity, let's assume it's always a file for this example
                const isDir = fs.existsSync(fullImportPath) && fs.lstatSync(fullImportPath).isDirectory();
                log(`Processing import in ${filename} (${p2} from ${dirFile}): ${match} (isDir: ${isDir})`);
                if (isDir) {
                  // directory import -> point to index file
                  return `${p1} '${p2}/index.js' ${p3}`;
                }
                return `${p1} '${p2}.js' ${p3}`;
              }
              return match;
            }
          );
          if (this.format === 'cjs') {
            // Exclude specific paths from modification
            const skipPaths = ['prismjs/components/index'];

            // replace `from '...js'` with `from '...cjs'` for cjs imports & exports
            code = code.replace(/from ['"](.*)\.js['"]/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            // replace `require('...js')` with `require('...cjs')` (preserve original quoting/spacing)
            code = code.replace(/require\(['"](.*)\.js['"]\)/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            // replace `require('...js')` with `require('...cjs')` from esbuild-fix-imports-plugin
            code = code.replace(/require\(\s?['"](.*)\.js['"]\s?\)/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            // replace dynamic require calls 'require(`...js`)' with 'require(`...cjs`)'
            code = code.replace(/require\(\s?`(.*)\.js`\s?\)/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            // replace `loadRequire('...js')` with `loadRequire('...cjs')`
            code = code.replace(/loadRequire\(['"](.*)\.js['"]\)/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            // replace dynamic loadRequire calls 'loadRequire(`...js`)' with 'loadRequire(`...cjs`)'
            code = code.replace(/loadRequire\(\s?`(.*)\.js`\s?\)/g, (m, p1) =>
              skipPaths.includes(p1) ? m : m.replace('.js', '.cjs')
            );

            return { code };
          } else {
            // for esm, just return the modified code
            return { code };
          }
        }
      }
    ]
  });
  return build(baseConfig);
}

// Run the build process
buildTsup();

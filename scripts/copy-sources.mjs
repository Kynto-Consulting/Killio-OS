// Copy non-TS capability assets that tsc does not emit (python.js, crypt.js,
// compress.wasm) from src/sources into dist/sources. Without these,
// executeCapability() cannot find the capability source at runtime and
// python/pip/crypt/compress silently break in the published package.
import { mkdirSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'sources');
const outDir = join(root, 'dist', 'sources');

mkdirSync(outDir, { recursive: true });
let n = 0;
for (const f of readdirSync(srcDir)) {
  copyFileSync(join(srcDir, f), join(outDir, f));
  n++;
}
console.log(`[copy-sources] copied ${n} asset(s) -> dist/sources`);

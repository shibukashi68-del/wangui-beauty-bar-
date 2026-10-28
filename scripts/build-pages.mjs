import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');

await mkdir(output, { recursive: true });
await cp(new URL('../css/', import.meta.url), output, { recursive: true });
await cp(new URL('../video/', import.meta.url), resolve(output, 'video'), { recursive: true });

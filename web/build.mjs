import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve('../nodivium/static');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'vendor'), { recursive: true });
for (const file of ['index.html', 'app.js', 'fasta-parser.js', 'sequence-metrics.js', 'styles.css']) {
  await cp(resolve(file), join(output, file));
}
await cp(resolve('assets'), join(output, 'assets'), { recursive: true });
const vendor = resolve('node_modules/molstar/build/viewer');
for (const file of ['molstar.js', 'molstar.css', 'molstar.js.LICENSE.txt']) {
  await cp(join(vendor, file), join(output, 'vendor', file));
}
await cp(resolve('node_modules/molstar/LICENSE'), join(output, 'vendor', 'molstar-LICENSE'));
for (const file of ['molstar-LICENSE', 'molstar.js.LICENSE.txt']) {
  const path = join(output, 'vendor', file);
  const content = await readFile(path, 'utf8');
  await writeFile(path, content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, ''));
}
console.log(`Nodivium web assets built in ${output}`);

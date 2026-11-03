import { mkdir, cp, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive:true });
await copyFile(new URL('index.html', root), new URL('dist/index.html', root));
for (const folder of ['web', 'design-kit', 'docs']) await cp(new URL(folder, root), new URL('dist/' + folder, root), { recursive:true });
await copyFile(new URL('design-qa.md', root), new URL('dist/design-qa.md', root));
console.log('Static Web built in dist/');

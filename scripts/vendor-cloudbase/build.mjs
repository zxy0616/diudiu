// Run npm ci in this directory only when regenerating the committed browser SDK.
import {build} from 'esbuild';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('node_modules/@cloudbase/js-sdk/dist/index.esm.js',import.meta.url))],bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true,outfile:fileURLToPath(new URL('../../web/vendor/cloudbase-3.11.0.js',import.meta.url)),legalComments:'external'});
const lock=JSON.parse(await readFile(new URL('package-lock.json',import.meta.url),'utf8'));
await writeFile(new URL('../../web/vendor/dependencies.json',import.meta.url),JSON.stringify(Object.fromEntries(Object.entries(lock.packages).filter(([p])=>p).map(([p,v])=>[p.replace(/^node_modules\//,''),{version:v.version,license:v.license,integrity:v.integrity}])),null,2)+'\n');
const root=new URL('node_modules/',import.meta.url);
const notices=[];
for(const entry of await readdir(root,{recursive:true,withFileTypes:true})) {
  if(entry.isFile()&&/^(LICENSE|LICENCE|COPYING)(\..*)?$/i.test(entry.name)) {
    const path=entry.parentPath+'/'+entry.name;
    notices.push(path.slice(fileURLToPath(root).length)+'\n'+await readFile(path,'utf8'));
  }
}
await writeFile(new URL('../../web/vendor/THIRD-PARTY-LICENSES.txt',import.meta.url),notices.join('\n\n====================\n\n'));

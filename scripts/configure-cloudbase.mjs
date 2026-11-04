// Writes only public browser connection settings. Never read LLM_API_KEY here.
import {writeFile} from 'node:fs/promises';
const env=process.env.CLOUDBASE_ENV_ID;
const accessKey=process.env.CLOUDBASE_PUBLISHABLE_KEY;
if(!env||!accessKey)throw Error('Set CLOUDBASE_ENV_ID and CLOUDBASE_PUBLISHABLE_KEY first. Do not use a server API key.');
const config={env,region:process.env.CLOUDBASE_REGION||'ap-shanghai',accessKey,functionName:'diudiu-ai',enabled:true};
await writeFile(new URL('../web/cloudbase-config.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
console.log('Public CloudBase browser config generated (gitignored).');

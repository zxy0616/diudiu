import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const root=new URL('../',import.meta.url);
for(const [name,source] of [['home','00-home'],['paper','10-paper-target'],['flush','17-flush'],['quiet','03-quiet']]){
  const original=await sharp(fileURLToPath(new URL(`design-kit/ui/screens/${source}.png`,root))).resize({width:390}).png().toBuffer();
  const implementation=await sharp(fileURLToPath(new URL(`docs/qa/${name}.png`,root))).png().toBuffer();
  const a=await sharp(original).metadata(),b=await sharp(implementation).metadata();
  await sharp({create:{width:800,height:Math.max(a.height,b.height),channels:4,background:'#e9dfcf'}}).composite([{input:original,left:0,top:0},{input:implementation,left:410,top:0}]).png().toFile(fileURLToPath(new URL(`docs/qa/compare-${name}.png`,root)));
  console.log(`${name}: reference 390x${a.height}, implementation ${b.width}x${b.height}`);
}

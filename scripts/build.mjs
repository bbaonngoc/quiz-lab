import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { validateRelease } from './validate-bank.mjs';
import { validateMemoryData } from '../js/memory.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'dist');
const bank=await validateRelease();
const memory=validateMemoryData(JSON.parse(await readFile(resolve(root,'data/memory-tips.json'),'utf8')));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
// Explicit public allowlist: Admin files, Excel, reports and old banks never ship.
for (const name of ['index.html','styles.css','manifest.webmanifest','sw.js','.nojekyll','icons',
  'js/app.js','js/model.js','js/db.js','js/bank.js','js/bank-schema.js','js/quiz-config.js','js/exam.js','js/memory.js','js/icons.js','data/memory-tips.json']) {
  const target=resolve(output,name);await mkdir(dirname(target),{recursive:true});
  await cp(resolve(root,name),target,{recursive:true});
}
await mkdir(resolve(output,'data'),{recursive:true});
await writeFile(resolve(output,'data/bank-manifest.json'),JSON.stringify(bank.manifest,null,2)+'\n');
for (const section of bank.manifest.sections) {
  const target=resolve(output,'data',section.url);await mkdir(dirname(target),{recursive:true});
  await cp(resolve(root,'data',section.url),target);
}
const memoryCount=memory.chapters.reduce((count,chapter)=>count+chapter.sections.reduce((count,section)=>count+section.rows.length,0),0);
console.log(`Đã đóng gói dist/: ứng dụng và ngân hàng ${bank.dataVersion}; ${bank.questions.length} câu, ${memoryCount} mục Mẹo ghi nhớ.`);

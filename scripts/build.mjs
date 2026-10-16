import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { validateRelease } from './validate-bank.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'dist');
const bank=await validateRelease();
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
// Explicit public allowlist: Admin files, Excel, reports and old banks never ship.
for (const name of ['index.html','styles.css','manifest.webmanifest','sw.js','.nojekyll','icons',
  'js/app.js','js/model.js','js/db.js','js/bank.js','js/bank-schema.js','js/quiz-config.js','js/icons.js']) {
  const target=resolve(output,name);await mkdir(dirname(target),{recursive:true});
  await cp(resolve(root,name),target,{recursive:true});
}
await mkdir(resolve(output,'data'),{recursive:true});
await writeFile(resolve(output,'data/bank-manifest.json'),JSON.stringify(bank.manifest,null,2)+'\n');
for (const section of bank.manifest.sections) {
  const target=resolve(output,'data',section.url);await mkdir(dirname(target),{recursive:true});
  await cp(resolve(root,'data',section.url),target);
}
console.log(`Đã đóng gói dist/: ứng dụng và ngân hàng ${bank.dataVersion}; ${bank.questions.length} câu.`);

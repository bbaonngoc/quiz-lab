import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assembleBank, validateManifest } from '../js/bank-schema.js';

export async function validateRelease(directory = fileURLToPath(new URL('../data/',import.meta.url))) {
  const manifest=validateManifest(JSON.parse(await readFile(resolve(directory,'bank-manifest.json'),'utf8')));
  const payloads=await Promise.all(manifest.sections.map(s=>readFile(resolve(directory,s.url))));
  return assembleBank(manifest,payloads);
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const bank=await validateRelease(process.argv[2]);
  console.log(`Ngân hàng ${bank.dataVersion}: ${bank.manifest.chapters.length} chương, ${bank.manifest.sections.length} mục, ${bank.questions.length} câu; hash và dữ liệu hợp lệ.`);
}

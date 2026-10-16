import { getSetting, commitOfficialBank } from './db.js';
import { validateManifest, assembleBank } from './bank-schema.js';
import { roleIssues } from './model.js';

const base = new URL('../', import.meta.url);
const dataBase = new URL('data/', base);
const cachePrefix = `quizlab-bank:${base.href}:`;
let pending;
export const cachedBank = () => getSetting('official-bank');

async function downloadRelease() {
  const current = await cachedBank();
  const response = await fetch(new URL('bank-manifest.json', dataBase), {cache:'no-store',signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Không tải được thông tin ngân hàng câu hỏi.');
  const invalidCurrent=current && roleIssues(current.questions).length>0;
  if (response.headers.get('X-QuizLab-Cache') && current && !invalidCurrent) return current;
  const manifest = validateManifest(await response.json());
  if (current?.dataVersion === manifest.dataVersion) {
    if (JSON.stringify(current.manifest) !== JSON.stringify(manifest)) throw new Error('Dữ liệu đã đổi nhưng chưa tăng phiên bản phát hành.');
    if (!invalidCurrent) return current;
  }
  const responses = await Promise.all(manifest.sections.map(async section => {
    const result = await fetch(new URL(section.url, dataBase), {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!result.ok) throw new Error(`Chưa tải được ${section.title}. Tiếp tục dùng bộ đã lưu.`);
    return result;
  }));
  const payloads = await Promise.all(responses.map(result => result.arrayBuffer()));
  const bank = await assembleBank(manifest, payloads);
  // Commit a verified release independently of optional browser cache support.
  // This transaction never reads or rewrites sessions.
  await commitOfficialBank(bank);
  await cacheRelease(manifest, payloads);
  return bank;
}

async function cacheRelease(manifest, payloads) {
  const name = `${cachePrefix}${manifest.dataVersion}`;
  try {
    if (!globalThis.caches) return;
    const cache = await caches.open(name);
    await Promise.all(manifest.sections.map((section,i) => cache.put(new URL(section.url,dataBase), new Response(payloads[i],{headers:{'Content-Type':'application/json'}}))));
    await cache.put(new URL('bank-manifest.json',dataBase),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    // Keep prior data caches while another window might still use that release.
    navigator.serviceWorker?.controller?.postMessage({type:'CLEAN_BANK_CACHES',version:manifest.dataVersion});
  } catch {
    // Cache restrictions must not prevent using the release already saved in IndexedDB.
    try { await globalThis.caches?.delete(name); } catch { }
  }
}

export function checkBankUpdate() {
  if (pending) return pending;
  const execute = () => downloadRelease();
  pending = (navigator.locks ? navigator.locks.request('quizlab-official-bank',execute) : execute()).finally(()=>{pending=null;});
  return pending;
}

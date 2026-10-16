// Chrome DevTools integration checks; no browser automation dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, cp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const profile=await mkdtemp(join(tmpdir(),'quizlab-browser-'));
const fixture=join(profile,'site');await mkdir(fixture);
for (const name of ['index.html','styles.css','manifest.webmanifest','sw.js','js','data','icons']) await cp(join(root,name),join(fixture,name),{recursive:true});
const originalManifest=JSON.parse(await readFile(join(root,'data/bank-manifest.json'),'utf8'));
const originalParts=await Promise.all(originalManifest.sections.map(s=>readFile(join(root,'data',s.url),'utf8').then(JSON.parse)));
const sample=JSON.parse(await readFile(join(root,'tests/fixtures/sample-bank.json'),'utf8'));
const chromePath=process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
const port=Number(process.env.QUIZLAB_TEST_PORT || 4174);
const base=`http://127.0.0.1:${port}/quiz-app/`;
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port),QUIZLAB_STATIC_ROOT:fixture},stdio:'pipe'});
const chrome=spawn(chromePath,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'pipe'});
const pending=new Map(), sockets=[], errors=[];
let socket, serial=0, debuggingPort;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=20000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {try {const value=await check();if(value)return value;}catch {}await delay(100);}
  throw new Error(`Timed out: ${label}`);
}
function send(method,params={},connection=socket) {
  return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});connection.send(JSON.stringify({id,method,params}));});
}
async function connect(url) {
  const connection=new WebSocket(url);sockets.push(connection);
  await new Promise((resolve,reject)=>{connection.addEventListener('open',resolve,{once:true});connection.addEventListener('error',reject,{once:true});});
  connection.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.id){const task=pending.get(msg.id);pending.delete(msg.id);msg.error?task?.reject(new Error(msg.error.message)):task?.resolve(msg.result);}
    else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    else if(msg.method==='Runtime.consoleAPICalled' && msg.params.type==='error')errors.push(msg.params.args.map(arg=>arg.value||arg.description).join(' '));
  });
  await send('Page.enable',{},connection);await send('Runtime.enable',{},connection);await send('Network.enable',{},connection);
  return connection;
}
async function evaluate(expression,connection=socket) {
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},connection);
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const visible=selector=>evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
async function click(selector) {
  if (!selector.startsWith('#dialog')) await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'action completes');
  await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw new Error('Missing/disabled '+${JSON.stringify(selector)});el.click();})()`);
}
async function select(selector,value) {
  await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function route(hash,selector) {
  await evaluate(`location.hash=${JSON.stringify(hash)}`);
  await until(()=>visible(selector),`route ${hash}`);await delay(120);
}
const dbSession=id=>evaluate(`(async()=>{const db=await import('./js/db.js');return db.getSession(${JSON.stringify(id)});})()`);
const setting=key=>evaluate(`(async()=>{const db=await import('./js/db.js');return db.getSetting(${JSON.stringify(key)});})()`);
async function screenshot(name,width,height) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await delay(120);
  const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const path=join(tmpdir(),`quizlab-${name}.png`);await writeFile(path,Buffer.from(result.data,'base64'));console.log(`Screenshot: ${path}`);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,'no horizontal overflow');
}
async function changeRole(role) {
  await route('settings','#user-role');
  if(await evaluate('document.querySelector("#user-role").value')===role)return;
  await select('#user-role',role);await click('#user-role-form button');
  await until(async()=>await setting('user-role')===role,'role saved');
}
async function newSession(mode='exam') {
  const form=mode==='exam'?'#exam-config':'#quiz-config';
  await route(mode==='exam'?'exam':'home',form);
  for (const key of ['shuffleQuestions','shuffleAnswers']) if(await visible(`${form} input[name=${key}]:checked`)) await click(`${form} input[name=${key}]`);
  await click(`${form} button[type=submit]`);await until(()=>visible('.answers'),'new quiz');
  return decodeURIComponent((await evaluate('location.hash')).split('/')[1]);
}
async function publishFixture(version,mutate=()=>{}) {
  const manifest=structuredClone(originalManifest);manifest.dataVersion=version;manifest.count=0;
  for(let i=0;i<manifest.sections.length;i++) {
    const part=structuredClone(originalParts[i]);part.dataVersion=version;mutate(part,i);
    const section=manifest.sections[i];section.url=`releases/${version}/${section.id}.json`;section.count=part.questions.length;manifest.count+=section.count;
    const payload=Buffer.from(JSON.stringify(part));section.sha256=createHash('sha256').update(payload).digest('hex');
    const path=join(fixture,'data',section.url);await mkdir(join(fixture,'data','releases',version),{recursive:true});await writeFile(path,payload);
  }
  await writeFile(join(fixture,'data/bank-manifest.json'),JSON.stringify(manifest));return manifest;
}

try {
  await until(async()=>{const r=await fetch(base);return r.ok;},'server');
  debuggingPort=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome');
  const targets=await(await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  socket=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  const limitedBrowser=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    Object.defineProperty(window,'caches',{configurable:true,value:undefined});
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined});
    // Emulate a browser without a native install prompt for the manual-guide check.
    window.addEventListener('beforeinstallprompt',event=>{if(event.isTrusted){event.preventDefault();event.stopImmediatePropagation();}},true);
  `});
  await send('Page.navigate',{url:base});await until(()=>visible('#role-onboarding'),'onboarding');
  assert.equal(await evaluate('document.querySelectorAll("#first-role option").length'),5);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await visible('#dialog[open]'),true);
  await select('#first-role','bi-thu-dang-uy');await click('#role-onboarding button');await until(()=>visible('#quiz-config'),'home');
  assert.equal((await setting('official-bank')).questions.length,558,'initial web load works without Cache Storage or Service Worker');
  assert.equal(await text('.status-chip'),'Có kết nối');
  assert.doesNotMatch(await text('body'),/offline|ngoại tuyến/i);
  await route('settings','.settings-grid');
  assert.equal(await visible('.settings-card [data-action="install"]'),true);
  assert.doesNotMatch(await text('.settings-grid'),/offline|ngoại tuyến|PWA/i);
  assert.match(await text('.settings-grid'),/Phiên bản & cập nhật/);
  await click('[data-action="check-update"]');
  await until(()=>text('#toast').then(value=>value?.includes('Tải lại trang')),'update check works without Service Worker');
  await click('.settings-card [data-action="install"]');
  await until(()=>visible('#dialog[open] #install-guide'),'manual installation guide');
  const guide=await text('#install-guide');
  for(const wording of ['iPhone / iPad','Safari','Chia sẻ','Thêm vào Màn hình chính','Android','Chrome','Máy tính','Edge','HTTPS','localhost']) assert.ok(guide.includes(wording),wording);
  assert.doesNotMatch(guide,/offline|ngoại tuyến/i);
  await screenshot('install-guide-mobile',390,844);
  await click('#dialog #install-guide button');await until(async()=>!await visible('#dialog[open]'),'guide closed');
  await evaluate(`(()=>{window.__installPromptCalls=0;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.__installPromptCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);window.__installPromptPrevented=event.defaultPrevented;})()`);
  await click('.settings-card [data-action="install"]');
  await until(()=>evaluate('window.__installPromptCalls===1 && document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'browser installation prompt');
  assert.equal(await evaluate('window.__installPromptPrevented'),true);
  assert.equal(await visible('#dialog[open]'),false,'dismissed browser prompt does not open another dialog');
  await click('.settings-card [data-action="install"]');await until(()=>visible('#dialog[open] #install-guide'),'consumed prompt falls back to guide');
  assert.equal(await evaluate('window.__installPromptCalls'),1,'installation prompt is only used once');
  await click('#dialog #install-guide button');
  await evaluate('window.dispatchEvent(new Event("appinstalled"))');
  assert.match(await text('.settings-grid'),/Đã cài ứng dụng/);
  assert.equal(await text('.settings-card [data-action="install"]'),'Hướng dẫn cài đặt');
  await screenshot('settings-web',1440,1000);
  await click('.sidebar-install');await until(()=>visible('#dialog[open] #install-guide'),'sidebar installation guide');await click('#dialog #install-guide button');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:limitedBrowser.identifier});
  await send('Page.reload');await until(()=>visible('.settings-grid'),'regular browser reload');
  await until(()=>evaluate('!!navigator.serviceWorker.controller'),'version update support initialized');
  await route('home','#quiz-config');
  console.log('PASS: initial bank/update work without Cache Storage/Service Worker; install guide, one-use browser prompt and installed state work without disconnected-use claims');
  assert.match(await text('#count-note'),/48 câu/);
  assert.equal(await text('.stat-value'),'372');
  assert.equal(await evaluate('!!document.querySelector("#quiz-config [name=mode],#quiz-config [name=difficulty],#quiz-config [name=scope],#quiz-config [name=count]")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".bottom-nav a").length'),6);
  await screenshot('desktop',1440,1080);await screenshot('mobile-small',320,740);await screenshot('mobile',390,844);
  assert.equal(await evaluate('[...document.querySelectorAll(".bottom-nav a")].every(a=>a.getBoundingClientRect().width>=44 && a.getBoundingClientRect().height>=44)'),true);
  await click('.bottom-nav a[href="#exam"]');await until(()=>visible('#exam-config'),'exam menu');
  await screenshot('exam-mobile-small',320,740);await screenshot('exam-mobile',390,844);
  await screenshot('exam-desktop',1440,1080);
  assert.equal(await evaluate('document.querySelector(".side-nav a.active").getAttribute("href")'),'#exam');
  assert.equal(await visible('#bank-file'),false);
  console.log('PASS: onboarding, 558-question release, role pool 372, desktop/mobile, GitHub Pages subpath');

  await route('bank','.folder-list');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".folder-count")].map(e=>e.textContent)'),['96 câu','48 câu','96 câu','48 câu','84 câu']);
  await screenshot('bank-folders-mobile',390,844);
  await click('[data-folder-id="chuong-i"]');await until(()=>visible('[data-folder-id="chuong-i-phan-1"]'),'parts');
  assert.equal(await evaluate('document.querySelectorAll(".folder-row").length'),2);
  await click('[data-folder-id="chuong-i-phan-1"]');await until(()=>visible('.question-list-item'),'part questions');
  assert.equal(await evaluate('document.querySelectorAll(".question-list-item").length'),48);
  await send('Page.reload');await until(()=>visible('.question-list-item'),'deep link reload');
  assert.match(await text('.bank-breadcrumb'),/Chương I.*Phần 1/);
  await evaluate('history.back()');await until(()=>visible('[data-folder-id="chuong-i-phan-1"]'),'back to parts');
  await route('bank/chuong-ii','.question-list-item');assert.equal(await visible('.folder-list'),false);
  assert.equal(await evaluate('document.querySelectorAll(".question-list-item").length'),48);
  await route('bank/chuong-v/chuong-v-phan-2','.question-list-item');
  await select('#bank-difficulty','Mức 4');assert.match(await text('#bank-list'),/Không tìm thấy/);
  await select('#bank-difficulty','all');await select('#bank-scope','role');assert.equal(await evaluate('document.querySelectorAll(".question-list-item").length'),6);
  await select('#bank-scope','all');await route('bank/chuong-i/no-such-part','.folder-list');assert.equal(await evaluate('location.hash'),'#bank/chuong-i');
  for(const role of ['chu-tich-hdnd','chu-tich-ubnd','chu-tich-mttq','bi-thu-dang-uy']) {
    await changeRole(role);await route('bank/chuong-i/chuong-i-phan-1','.question-list-item');
    await select('#bank-scope','role');assert.equal(await evaluate('document.querySelectorAll(".question-list-item").length'),8);
    assert.ok((await text('#bank-list')).includes((await setting('user-role'))==='bi-thu-dang-uy'?'Bí thư Đảng ủy':role==='chu-tich-hdnd'?'Chủ tịch HĐND':role==='chu-tich-ubnd'?'Chủ tịch UBND':'Chủ tịch Ủy ban MTTQ'));
  }
  await select('#bank-scope','all');
  assert.equal(await evaluate('!!document.querySelector("[data-action=import-bank],[data-action=delete-questions],#bank-select-all")'),false);
  console.log('PASS: 5 chapter folders, nested parts, direct chapters, role counts, filters, deep links/back/reload, no CRUD');

  await route('home','#quiz-config');
  assert.equal(await text('#sectionId option[value="all"]'),'Tất cả các phần');
  await select('#sectionId','all');assert.match(await text('#count-note'),/96 câu/);
  await until(async()=> (await setting('practice-config'))?.sectionId==='all','all parts saved');
  await send('Page.reload');await until(()=>visible('#quiz-config'),'all parts reload');
  assert.equal(await evaluate('document.querySelector("#sectionId").value'),'all');assert.match(await text('#count-note'),/96 câu/);
  await screenshot('practice-all-parts',1440,1080);
  const allPartsId=await newSession('practice'),allParts=await dbSession(allPartsId);
  const allPartsExpected=originalParts.slice(0,2).flatMap(p=>p.questions).filter(q=>['all','bi-thu-dang-uy'].includes(q.role));
  assert.equal(allParts.questions.length,96);assert.equal(allParts.filters.sectionId,'all');assert.equal(allParts.filters.chapterId,'chuong-i');
  assert.deepEqual(allParts.questions.map(q=>q.id).sort(),allPartsExpected.map(q=>q.id).sort());
  await route('home','#quiz-config');assert.equal(await evaluate('document.querySelector("#sectionId").value'),'all');
  await select('#sectionId','chuong-i-phan-2');assert.match(await text('#count-note'),/48 câu/);
  await select('#chapterId','chuong-v');assert.equal(await evaluate('document.querySelector("#sectionId").value'),'all');assert.match(await text('#count-note'),/84 câu/);
  await select('#sectionId','chuong-v-phan-2');assert.match(await text('#count-note'),/36 câu/);
  console.log('PASS: all parts option persists after reload and creates the exact full-chapter role pool; individual parts remain selectable');

  // Migrate old hidden filters; home must still include all shared/private levels.
  await evaluate(`(async()=>{const db=await import('./js/db.js');await db.setSetting('quiz-config',{mode:'exam',chapterId:'chuong-v',sectionId:'chuong-v-phan-2',count:'20',difficulty:'Mức 4',scope:'role',shuffleQuestions:false,shuffleAnswers:false});await db.deleteSetting('practice-config');await db.deleteSetting('exam-config');})()`);
  await route('home','#quiz-config');await send('Page.reload');await until(()=>visible('#quiz-config'),'migrate old config');
  assert.match(await text('#count-note'),/36 câu/);
  assert.equal((await setting('practice-config')).count,'all');assert.equal((await setting('practice-config')).scope,'all');
  await select('#chapterId','chuong-ii');assert.equal(await evaluate('document.querySelector("#sectionId").disabled'),true);assert.match(await text('#count-note'),/48 câu/);
  await select('#chapterId','chuong-v');await select('#sectionId','chuong-v-phan-2');
  await until(async()=> (await setting('practice-config'))?.sectionId==='chuong-v-phan-2','practice selection saved');
  await route('exam','#exam-config');assert.equal(await evaluate('document.querySelector("#exam-config button[type=submit]").disabled'),true);
  await select('#exam-chapterId','chuong-i');await select('#exam-sectionId','chuong-i-phan-1');await select('#exam-difficulty','Mức 1');await select('#exam-scope','role');
  assert.match(await text('#exam-count-note'),/2 câu khả dụng/);
  await until(async()=> (await setting('exam-config'))?.difficulty==='Mức 1','exam filters saved');
  await send('Page.reload');await until(()=>visible('#exam-config'),'saved exam reload');assert.match(await text('#exam-count-note'),/2 câu khả dụng/);
  await route('home','#quiz-config');assert.match(await text('#count-note'),/36 câu/);
  await route('exam','#exam-config');await select('#exam-chapterId','all');await select('#exam-difficulty','all');await select('#exam-scope','all');
  const examId=await newSession(), exam=await dbSession(examId);assert.equal(exam.questions.length,20);
  assert.equal(await evaluate('document.querySelector(".side-nav a.active").getAttribute("href")'),'#exam');
  assert.equal(await evaluate('document.querySelector(".quiz-heading a").getAttribute("href")'),'#exam');
  assert.equal(exam.filters.chapterId,'all');
  exam.questions.forEach(q=>assert.deepEqual(q.optionOrder,['A','B','C','D']));
  await click(`.answer[data-value="${exam.questions[0].answer}"]`);await click('[data-action=flag]');
  await until(async()=> (await dbSession(examId)).flags.length===1,'answer/flag save');assert.equal(await visible('.feedback'),false);
  await send('Page.reload');await until(()=>visible('.answers'),'resume reload');
  assert.equal((await dbSession(examId)).answers[exam.questions[0].id],exam.questions[0].answer);
  await click('[data-action=quiz-index][data-value="1"]');await until(async()=> (await dbSession(examId)).currentIndex===1,'next question');
  const wrong=['A','B','C','D'].find(v=>v!==exam.questions[1].answer);await click(`.answer[data-value="${wrong}"]`);
  await click('[data-action=submit]');await until(()=>visible('#dialog[open]'),'submit confirmation');await click('#dialog button[value=confirm]');await until(()=>visible('.result-score'),'result');
  assert.match(await text('.result-score'),/^0,5/);await click('[data-action=review-filter][data-value=wrong]');assert.match(await text('.feedback'),/Trả lời sai/);
  const finishedSnapshot=await dbSession(examId);
  const practiceId=await newSession('practice');const practice=await dbSession(practiceId);
  assert.equal(practice.questions.length,36);
  assert.deepEqual(practice.questions.map(q=>q.id).sort(),originalParts[7].questions.filter(q=>['all','bi-thu-dang-uy'].includes(q.role)).map(q=>q.id).sort());
  assert.equal(practice.mode,'practice');assert.equal(practice.filters.difficulty,'all');assert.equal(practice.filters.scope,'all');
  assert.equal(await evaluate('document.querySelector(".side-nav a.active").getAttribute("href")'),'#home');
  assert.equal((await setting('exam-config')).count,'20');
  await click(`.answer[data-value="${practice.questions[0].answer}"]`);await until(()=>visible('.feedback'),'immediate feedback');
  assert.equal(await evaluate('document.querySelectorAll(".answer:disabled").length'),4);assert.doesNotMatch(await text('.feedback'),/giải thích/i);
  const activeSnapshot=await dbSession(practiceId);await screenshot('quiz-mobile',390,844);
  console.log('PASS: separate exam page; full-section practice; old hidden filters cleared; isolated saved settings; scoring/review/progress');

  await changeRole('chu-tich-hdnd');await route('home','#quiz-config');
  assert.equal(await visible('.resume-row'),false,'overview never offers a foreign-role active quiz');
  await route(`quiz/${practiceId}`,'[data-role-mismatch]');
  assert.equal(await visible('.answers'),false,'foreign questions are hidden even on a direct quiz URL');
  assert.equal(await evaluate(`(async()=>{const db=await import('./js/db.js');try{await db.updateSession(${JSON.stringify(practiceId)},s=>s.currentIndex=1);return false;}catch{return true;}})()`),true);
  assert.equal(await evaluate(`(async()=>{const db=await import('./js/db.js');try{await db.addSession({...${JSON.stringify(activeSnapshot)},id:'stale-role-session'});return false;}catch{return true;}})()`),true,'atomic write rejects stale role');
  assert.deepEqual(await dbSession(practiceId),activeSnapshot);assert.equal(await dbSession('stale-role-session'),undefined);
  await changeRole('bi-thu-dang-uy');await route(`quiz/${practiceId}`,'.answers');
  console.log('PASS: foreign resume/deep-link blocked; current role checked atomically on create/update; snapshots preserved');

  await route('bank','.folder-list');
  await evaluate(`(async()=>{const db=await import('./js/db.js');const bank=await db.getSetting('official-bank');delete bank.questions[0].role;await db.setSetting('official-bank',bank);const c=new BroadcastChannel('quizlab-data');c.postMessage({type:'changed'});c.close();})()`);
  await until(()=>text('[role=alert]').then(value=>value?.includes('thiếu hoặc sai chức danh')),'missing role warning');
  assert.match(await text('#bank-count'),/371 câu/,'missing role is excluded rather than made common');
  await evaluate(`(()=>{window.__cacheProperty=Object.getOwnPropertyDescriptor(window,'caches');Object.defineProperty(window,'caches',{configurable:true,get(){throw new DOMException('Cache Storage blocked','SecurityError');}});})()`);
  await evaluate('window.dispatchEvent(new Event("online"))');
  await until(()=>text('#bank-count').then(value=>value?.includes('372 câu')),'same-version damaged cache repaired from verified release');
  await evaluate(`Object.defineProperty(window,'caches',window.__cacheProperty);delete window.__cacheProperty;`);
  assert.deepEqual(await dbSession(practiceId),activeSnapshot);assert.deepEqual(await dbSession(examId),finishedSnapshot);
  console.log('PASS: missing role warns and repairs even when Cache Storage throws; history and progress unchanged');
  await route(`quiz/${practiceId}`,'.answers');

  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until(()=>visible('.answers'),'interrupted connection',25000);assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  assert.equal(await text('.status-chip'),'Mất kết nối');assert.doesNotMatch(await text('body'),/offline|ngoại tuyến/i);
  await route('bank','.folder-list');await click('[data-folder-id="chuong-iv"]');await until(()=>visible('.question-list-item'),'saved bank');
  await route('history','.history-table');assert.ok((await text('.history-table')).includes('0,5'));
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  console.log('PASS: interrupted connection shows neutral status and preserves saved quiz, bank and history');

  // Legacy override migration and old snapshots, using the same database as v1.4.
  await evaluate(`(async()=>{const db=await import('./js/db.js');await db.deleteSetting('official-bank');await db.deleteSetting('bank-migration-v2');await db.setSetting('imported-bank',{version:1,title:'cau-hoi-part-1',questions:[]});await db.setSetting('bundled-bank',${JSON.stringify(sample)});})()`);
  await send('Page.reload');await until(()=>visible('.history-table'),'migration reload');await until(async()=>!!await setting('bank-migration-v2'),'migration complete');
  assert.equal((await setting('official-bank')).questions.length,558);assert.equal((await setting('legacy-imported-bank')).title,'cau-hoi-part-1');
  assert.equal(await setting('imported-bank'),undefined);assert.deepEqual(await dbSession(examId),finishedSnapshot);assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  const backup={format:'quizlab-backup',version:1,bank:{version:1,title:'Should never replace official',questions:[]},sessions:[{...finishedSnapshot,id:'restored-old'}]};
  await route('settings','.settings-grid');
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(${JSON.stringify(backup)})],'backup.json'));const input=document.querySelector('#backup-file');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(()=>visible('#dialog[open]'),'restore');await click('#dialog button[value=confirm]');await until(()=>dbSession('restored-old'),'restored session');
  assert.equal((await setting('official-bank')).questions.length,558);
  console.log('PASS: old empty override archived/retired; settings/history preserved; legacy backup cannot overwrite official bank');

  const setupBackup={format:'quizlab-backup',version:2,sessions:[],preferences:{
    'practice-config':{chapterId:'chuong-i',sectionId:'chuong-i-phan-2',count:'20',difficulty:'Mức 4',scope:'role',shuffleQuestions:true,shuffleAnswers:true},
    'exam-config':{chapterId:'chuong-iii',sectionId:'all',count:'50',difficulty:'Mức 2',scope:'shared',shuffleQuestions:false,shuffleAnswers:false}
  }};
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(${JSON.stringify(setupBackup)})],'setup-backup.json'));const input=document.querySelector('#backup-file');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(()=>visible('#dialog[open]'),'restore separate preferences');await click('#dialog button[value=confirm]');
  await until(async()=> (await setting('exam-config'))?.count==='50','independent preferences restored');
  assert.equal((await setting('practice-config')).count,'all');assert.equal((await setting('practice-config')).difficulty,'all');assert.equal((await setting('practice-config')).scope,'all');
  await route('home','#quiz-config');assert.match(await text('#count-note'),/48 câu/);assert.equal(await evaluate('document.querySelector("#sectionId").value'),'chuong-i-phan-2');
  await route('exam','#exam-config');assert.equal(await evaluate('document.querySelector("#exam-difficulty").value'),'Mức 2');assert.equal(await evaluate('document.querySelector("#exam-scope").value'),'shared');
  assert.deepEqual(await dbSession(practiceId),activeSnapshot);assert.deepEqual(await dbSession(examId),finishedSnapshot);
  console.log('PASS: backup restores independent practice/exam settings; practice ignores restored count/level/scope limits');

  await route(`quiz/${practiceId}`,'.answers');
  const beforeVersion=(await setting('official-bank')).dataVersion;
  const incomplete=await publishFixture('qa-incomplete');const last=join(fixture,'data',incomplete.sections[7].url);const lastBytes=await readFile(last);await rm(last);
  const failure=await evaluate(`(async()=>{try{await(await import('./js/bank.js')).checkBankUpdate();return false;}catch{return true;}})()`);
  assert.equal(failure,true);assert.equal((await setting('official-bank')).dataVersion,beforeVersion);await writeFile(last,lastBytes);
  const bad=await publishFixture('qa-bad-hash');bad.sections[0].sha256='0'.repeat(64);await writeFile(join(fixture,'data/bank-manifest.json'),JSON.stringify(bad));
  assert.equal(await evaluate(`(async()=>{try{await(await import('./js/bank.js')).checkBankUpdate();return false;}catch{return true;}})()`),true);
  assert.equal((await setting('official-bank')).dataVersion,beforeVersion);
  const updated=await publishFixture('qa-updated',(part,i)=>{if(i===0){part.questions[0].question='Câu cập nhật từ bản phát hành mới?';part.questions[0].revision='a'.repeat(64);}});
  const secondTarget=await send('Target.createTarget',{url:base+'#bank'});
  const list=await(await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  const second=await connect(list.find(t=>t.id===secondTarget.targetId).webSocketDebuggerUrl);
  await until(()=>evaluate('!!document.querySelector(".folder-list")',second),'second window');
  await Promise.all([evaluate('window.dispatchEvent(new Event("online"))'),evaluate('window.dispatchEvent(new Event("online"))',second)]);
  await until(async()=> (await setting('official-bank')).dataVersion===updated.dataVersion,'automatic data update');
  assert.deepEqual(await dbSession(practiceId),activeSnapshot);assert.deepEqual(await dbSession(examId),finishedSnapshot);
  await evaluate('window.__keepQuiz = "still-open"');assert.equal(await evaluate('window.__keepQuiz'),'still-open');
  console.log('PASS: missing chapter/bad hash retain old release; automatic update across windows; snapshots unchanged');

  // A worker activated by another tab must not reload a quiz currently being answered.
  const swPath=join(fixture,'sw.js');const sw=await readFile(swPath,'utf8');
  const currentVersion=sw.match(/const VERSION = '([^']+)'/)[1], nextVersion=currentVersion+'-qa';
  await writeFile(swPath,sw.replace(`const VERSION = '${currentVersion}';`,`const VERSION = '${nextVersion}';`));
  const appPath=join(fixture,'js/app.js');const app=await readFile(appPath,'utf8');await writeFile(appPath,app.replace(`const VERSION = '${currentVersion}';`,`const VERSION = '${nextVersion}';`));
  await evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();})()');
  await until(()=>evaluate(`(async()=>{const keys=await caches.keys();return keys.some(k=>k.endsWith(${JSON.stringify(':'+nextVersion)}));})()`),'new worker installed');
  await until(()=>evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.waiting && !r.installing;})()'),'second window activates worker');
  assert.equal(await evaluate('window.__keepQuiz'),'still-open');assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  await route('home','#quiz-config');await until(()=>evaluate('window.__keepQuiz===undefined && !!document.querySelector("#quiz-config")'),'deferred safe reload');
  assert.deepEqual(await dbSession(examId),finishedSnapshot);assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  await send('Target.closeTarget',{targetId:secondTarget.targetId});
  await screenshot('bank-folders-desktop',1440,1000);
  assert.deepEqual(errors,[],'no console errors or uncaught exceptions');
  console.log('PASS: code update from another tab waits for save/exit; all browser checks passed');
} finally {
  for(const connection of sockets)connection.close();chrome.kill('SIGTERM');server.kill('SIGTERM');
  await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}

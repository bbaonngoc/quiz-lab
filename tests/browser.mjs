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
// Delay history reads only in the disposable test site, without changing saves.
const dbPath=join(fixture,'js/db.js');
const dbSource=await readFile(dbPath,'utf8');
await writeFile(dbPath,dbSource.replace('export const getSessions =','const readSessions =')+`
export const getSessions = async () => {
  window.__quizlabHistoryReads=(window.__quizlabHistoryReads || 0)+1;
  if(window.__quizlabHistoryGate) await window.__quizlabHistoryGate;
  return readSessions();
};
`);
const originalManifest=JSON.parse(await readFile(join(root,'data/bank-manifest.json'),'utf8'));
const originalParts=await Promise.all(originalManifest.sections.map(s=>readFile(join(root,'data',s.url),'utf8').then(JSON.parse)));
const memoryTips=JSON.parse(await readFile(join(root,'data/memory-tips.json'),'utf8'));
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
async function pointerClick(selector) {
  await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'action completes before pointer input');
  const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw new Error('Missing/disabled '+${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();if(!r.width||!r.height)throw new Error('Hidden '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2,pageY:scrollY,navTop:document.querySelector('.question-nav')?.scrollTop};})()`);
  const {x,y}=point;
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  return point;
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
const databaseState=()=>evaluate(`(async()=>{
  const db=await(await import('./js/db.js')).openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['sessions','settings'],'readonly'),snapshot={};
    for(const name of ['sessions','settings']) {
      const request=tx.objectStore(name).getAll();request.onsuccess=()=>{snapshot[name]=request.result;};
    }
    tx.oncomplete=()=>resolve(snapshot);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
})()`);
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
function assertExamDistribution(session) {
  const questions=session.questions;
  assert.equal(questions.length,60);assert.equal(new Set(questions.map(q=>q.id)).size,60);
  assert.ok(questions.every(q=>q.role==='all'||q.role===session.role));
  assert.equal(questions.filter(q=>q.role==='all').length,30);
  assert.equal(questions.filter(q=>q.role===session.role).length,30);
  const parts=originalManifest.sections.map(s=>{
    const group=questions.filter(q=>q.sectionId===s.id);
    return {count:group.length,common:group.filter(q=>q.role==='all').length,private:group.filter(q=>q.role===session.role).length};
  });
  assert.deepEqual(parts.map(p=>p.count).sort(),[7,7,7,7,8,8,8,8]);
  assert.equal(parts.filter(p=>p.common===4&&p.private===4).length,4);
  assert.equal(parts.filter(p=>p.common===4&&p.private===3).length,2);
  assert.equal(parts.filter(p=>p.common===3&&p.private===4).length,2);
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__quizlabRealNow=Date.now.bind(Date);Date.now=()=>window.__quizlabRealNow()+Number(sessionStorage.getItem('quizlab-qa-clock-offset')||0);`});
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
  assert.equal(await evaluate('document.querySelectorAll(".bottom-nav a").length'),7);
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
  await route('exam','#exam-config');
  assert.equal(await evaluate('document.querySelectorAll("#exam-config input,#exam-config select").length'),0);
  assert.match(await text('.exam-intro'),/60 phút/);assert.match(await text('.exam-intro'),/Bài thi thử lần 1/);
  await send('Page.reload');await until(()=>visible('#exam-config'),'fixed exam reload');
  await route('home','#quiz-config');assert.match(await text('#count-note'),/36 câu/);
  const examId=await newSession(), exam=await dbSession(examId);assert.equal(exam.questions.length,60);
  assert.equal(exam.attemptNumber,1);assert.equal(exam.endTime-exam.startTime,3600000);
  assert.match(await text('#exam-timer'),/^(60:00|59:59)$/);
  assertExamDistribution(exam);
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
  await click('[data-action=submit]');await until(()=>visible('#dialog[open]'),'submit confirmation');await click('#dialog button[value=confirm]');await until(()=>visible('.result-summary'),'result');
  assert.equal(await visible('.result-score'),false);assert.equal(await visible('.feedback'),false);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".result-stats strong")].map(e=>e.textContent)'),['1','1','58']);
  await screenshot('exam-result',1440,1000);
  await click('[data-view-answers]');await until(()=>visible('.feedback'),'explicit exam review');await click('[data-action=review-filter][data-value=wrong]');assert.match(await text('.feedback'),/Trả lời sai/);
  const finishedSnapshot=await dbSession(examId);
  await route('exam','#exam-config');
  assert.equal(await evaluate('document.querySelector("#exam-config button[type=submit]").disabled'),false,'manual submission unlocks a new exam');
  const practiceId=await newSession('practice');const practice=await dbSession(practiceId);
  assert.equal(practice.questions.length,36);
  assert.deepEqual(practice.questions.map(q=>q.id).sort(),originalParts[7].questions.filter(q=>['all','bi-thu-dang-uy'].includes(q.role)).map(q=>q.id).sort());
  assert.equal(practice.mode,'practice');assert.equal(practice.filters.difficulty,'all');assert.equal(practice.filters.scope,'all');
  assert.equal(await evaluate('document.querySelector(".side-nav a.active").getAttribute("href")'),'#home');
  assert.equal((await setting('exam-config')).count,'20');
  await click(`.answer[data-value="${practice.questions[0].answer}"]`);await until(()=>visible('.feedback'),'immediate feedback');
  assert.equal(await evaluate('document.querySelectorAll(".answer:disabled").length'),4);assert.doesNotMatch(await text('.feedback'),/giải thích/i);
  const activeSnapshot=await dbSession(practiceId);await screenshot('quiz-mobile',390,844);
  console.log('PASS: fixed 60-question balanced exam, persistent deadline, result without a score, explicit review; full-section practice and legacy preferences preserved');

  const beforeMemory=await databaseState();
  await route('memory','#memory-chapter');
  assert.equal(await evaluate('document.querySelector(".side-nav a.active").getAttribute("href")'),'#memory');
  assert.equal(await text('.side-nav a[href="#memory"]'),'Mẹo ghi nhớ');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#memory-chapter option")].map(option=>({id:option.value,label:option.textContent}))'),memoryTips.chapters.map(chapter=>({id:chapter.id,label:chapter.label})));
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".memory-table [role=columnheader]")].map(header=>header.textContent.trim())'),['Chủ đề / Nội dung','Mẹo ghi nhớ']);
  assert.equal(await evaluate('[...document.querySelectorAll(".memory-row [id^=memory-detail-]")].every(detail=>detail.hidden)'),true,'details start collapsed');
  const memoryFirst='.memory-row[data-memory-row="memory-1"]';
  await pointerClick(`${memoryFirst} .memory-tip`);
  await until(()=>evaluate('document.querySelector("#memory-detail-memory-1").hidden===false'),'clicking the tip expands its row');
  assert.equal(await evaluate('document.querySelector("[data-action=memory-toggle][data-value=memory-1]").getAttribute("aria-expanded")'),'true');
  assert.equal(await text('#memory-detail-memory-1 .memory-detail-text'),memoryTips.chapters[0].sections[0].rows[0].details);
  await pointerClick(`${memoryFirst} .memory-topic-title`);
  await until(()=>evaluate('document.querySelector("#memory-detail-memory-1").hidden'),'clicking the topic collapses its row');
  await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'row action completed before keyboard input');
  await evaluate('document.querySelector("[data-action=memory-toggle][data-value=memory-1]").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate('document.querySelector("#memory-detail-memory-1").hidden===false'),'Enter expands a focused row toggle');
  await evaluate('document.querySelector("[data-action=memory-toggle][data-value=memory-1]").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' ',unmodifiedText:' '});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await until(()=>evaluate('document.querySelector("#memory-detail-memory-1").hidden'),'Space collapses a focused row toggle');
  await click('[data-action=memory-open-all]');
  await until(()=>evaluate('[...document.querySelectorAll(".memory-row [id^=memory-detail-]")].every(detail=>!detail.hidden)'),'expand all current-section details');
  await screenshot('memory-desktop',1440,1000);
  const memoryColumns=await evaluate('[...document.querySelectorAll(".memory-table [role=columnheader]")].map(header=>header.getBoundingClientRect().width)');
  assert.ok(Math.abs(memoryColumns[0]/(memoryColumns[0]+memoryColumns[1])-.35)<.02,'desktop table uses 35% / 65% columns');
  await screenshot('memory-mobile-small',320,740);
  await screenshot('memory-mobile',390,844);
  assert.equal(await evaluate('(()=>{const row=document.querySelector(".memory-row"),topic=row.querySelector(".memory-topic-title").getBoundingClientRect(),tip=row.querySelector(".memory-tip").getBoundingClientRect();return tip.top>=topic.bottom;})()'),true,'mobile rows stack the topic above its complete tip');
  await click('[data-action=memory-close-all]');
  await until(()=>evaluate('[...document.querySelectorAll(".memory-row [id^=memory-detail-]")].every(detail=>detail.hidden)'),'collapse all current-section details');

  let memoryRowCount=0;
  for(const chapter of memoryTips.chapters) {
    for(const section of chapter.sections) {
      await route(`memory/${chapter.id}/${section.id}`,'#memory-section');
      await until(()=>evaluate(`document.querySelector('#memory-chapter').value===${JSON.stringify(chapter.id)} && document.querySelector('#memory-section').value===${JSON.stringify(section.id)}`),'requested memory chapter and section');
      assert.equal(await evaluate('document.querySelector("#memory-section").disabled'),chapter.sections.length===1);
      assert.deepEqual(await evaluate('[...document.querySelectorAll("#memory-section option")].map(option=>({id:option.value,label:option.textContent}))'),chapter.sections.map(part=>({id:part.id,label:part.label})));
      const renderedRows=await evaluate('[...document.querySelectorAll(".memory-row")].map(row=>({id:row.dataset.memoryRow,topic:row.querySelector(".memory-topic-title").textContent,tip:row.querySelector(".memory-tip p").textContent,details:row.querySelector(".memory-detail-text").textContent,hidden:row.querySelector("[id^=memory-detail-]").hidden,tipVisible:getComputedStyle(row.querySelector(".memory-tip")).display!=="none",whiteSpace:getComputedStyle(row.querySelector(".memory-tip p")).whiteSpace}))');
      assert.deepEqual(renderedRows.map(({id,topic,tip,details})=>({id,topic,tip,details})),section.rows.map(({id,topic,tip,details})=>({id,topic,tip,details})),'every source string is rendered without trimming, renumbering or rewriting');
      assert.ok(renderedRows.every(row=>row.hidden&&row.tipVisible&&row.whiteSpace==='pre-wrap'),'all complete tips stay visible while source details stay collapsed');
      memoryRowCount+=renderedRows.length;
      await click('[data-action=memory-open-all]');
      await until(()=>evaluate('[...document.querySelectorAll(".memory-row [id^=memory-detail-]")].every(detail=>!detail.hidden)'),'all details open in selected section');
      assert.equal(await evaluate('document.querySelectorAll("[data-action=memory-toggle][aria-expanded=true]").length'),section.rows.length);
      await click('[data-action=memory-close-all]');
      await until(()=>evaluate('[...document.querySelectorAll(".memory-row [id^=memory-detail-]")].every(detail=>detail.hidden)'),'all details close in selected section');
    }
  }
  assert.equal(memoryRowCount,53);
  assert.equal(await text('#memory-detail-memory-53 .memory-detail-text'),memoryTips.chapters[4].sections[1].rows[6].details,'leading source whitespace is preserved');
  await send('Page.reload');await until(()=>visible('#memory-detail-memory-53'),'memory deep link survives refresh');
  assert.equal(await evaluate('location.hash'),'#memory/chapter-5/section-8');
  assert.equal(await evaluate('document.querySelector("#memory-detail-memory-53").hidden'),true,'refresh starts with source details collapsed');
  await select('#memory-chapter','chapter-1');
  await until(()=>evaluate('document.querySelector("#memory-section").value==="section-1"'),'chapter selection chooses its first section');
  await select('#memory-section','section-2');
  await until(()=>evaluate('location.hash==="#memory/chapter-1/section-2"'),'section selection is encoded in the route');
  await route('memory/no-such-chapter/no-such-section','#memory-chapter');
  await until(()=>evaluate('location.hash==="#memory"'),'invalid memory chapter safely falls back');
  await route('memory/chapter-3/section-1','#memory-chapter');
  await until(()=>evaluate('location.hash==="#memory/chapter-3"'),'foreign section falls back inside requested chapter');
  assert.equal(await evaluate('document.querySelector("#memory-section").value'),'section-4');
  assert.deepEqual(await databaseState(),beforeMemory,'reading memory tips never changes quiz snapshots, answers, deadlines, attempt counter or preferences');
  await route(`quiz/${practiceId}`,'.answers');
  assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  assert.deepEqual(await dbSession(examId),finishedSnapshot);
  console.log('PASS: Mẹo ghi nhớ preserves all 53 source records across 5 chapters/8 sections, per-row and keyboard toggles, open/close all, selections/deep links/reload, 35/65 desktop and stacked mobile layout, without writing user data');

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
  await route('history','.history-table');assert.ok((await text('.history-table')).includes('58 trống'));
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
  await route('exam','#exam-config');assert.equal(await visible('#exam-difficulty,#exam-scope'),false);assert.match(await text('.exam-intro'),/60 phút/);
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

  // Advance the browser clock instead of waiting an hour; the stored deadline stays fixed.
  const timedId=await newSession(), timed=await dbSession(timedId);
  await click(`.answer[data-value="${timed.questions[0].answer}"]`);
  await click('[data-action=flag]');
  const timedSaved=await dbSession(timedId);
  await evaluate(`sessionStorage.setItem('quizlab-qa-clock-offset','600000')`);
  await send('Page.reload');await until(()=>visible('#exam-timer'),'timed exam refresh');
  assert.deepEqual(await dbSession(timedId),timedSaved,'refresh keeps question order, answers, flags and end time');
  assert.match(await text('#exam-timer'),/^49:|^50:/);
  await click('.quiz-heading a');await until(()=>visible('#exam-config'),'save and exit exam');
  assert.equal(await evaluate('document.querySelector("[data-resume-exam]").getAttribute("href")'),`#quiz/${timedId}`);
  assert.equal(await evaluate('document.querySelector("#exam-config button[type=submit]").disabled'),true,'new exam blocked while an attempt is active');
  assert.match(await text('.exam-intro h2'),new RegExp(`lần ${timed.attemptNumber}$`));
  const lockedCounter=await setting('exam-attempt-counter');
  await evaluate('document.querySelector("#exam-config").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
  await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'forced form submission blocked');
  assert.equal(await setting('exam-attempt-counter'),lockedCounter);assert.deepEqual(await dbSession(timedId),timedSaved);
  await screenshot('exam-locked-mobile',390,844);
  await changeRole('chu-tich-hdnd');await route('exam','#exam-config');
  assert.equal(await evaluate('document.querySelector("#exam-config button[type=submit]").disabled'),true,'changing role cannot bypass the active exam');
  assert.equal(await visible('[data-resume-exam]'),false,'foreign role questions remain hidden');
  assert.match(await text('#exam-blocked-note'),/Đổi lại vai trò này để tiếp tục/);
  const foreignBlocked=await evaluate(`(async()=>{const db=await import('./js/db.js'),e=await import('./js/exam.js');try{await db.addExamSession(e.createExamSession(await db.getSetting('official-bank'),'chu-tich-hdnd'));return null;}catch(error){return error.code;}})()`);
  assert.equal(foreignBlocked,'EXAM_IN_PROGRESS');assert.equal(await setting('exam-attempt-counter'),lockedCounter);
  await changeRole('bi-thu-dang-uy');await route('exam','#exam-config');
  await click('[data-resume-exam]');await until(()=>visible('#exam-timer'),'resume timed exam');
  assert.deepEqual(await dbSession(timedId),timedSaved);
  await screenshot('exam-timer-mobile',390,844);
  await send('Page.navigate',{url:'about:blank'});await until(()=>evaluate('location.href==="about:blank"'),'app fully closed');
  const jump=await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(new URL(base).origin)})sessionStorage.setItem('quizlab-qa-clock-offset',${JSON.stringify(String(timed.endTime-Date.now()+2000))});`});
  await send('Page.navigate',{url:base+`#quiz/${timedId}`});await until(()=>visible('[data-exam-result="true"]'),'expired on reopen');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:jump.identifier});
  const timedFinished=await dbSession(timedId);
  assert.equal(timedFinished.status,'completed');assert.equal(timedFinished.completionReason,'timeout');assert.equal(timedFinished.completedAt,timed.endTime);
  assert.deepEqual(timedFinished.questions,timed.questions);assert.deepEqual(timedFinished.answers,timedSaved.answers);
  assert.equal(await visible('.result-score'),false);assert.equal(await visible('.answers'),false);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".result-stats strong")].map(e=>e.textContent)'),['1','0','59']);
  assert.equal(await evaluate(`(async()=>{const m=await import('./js/model.js');return Object.hasOwn(m.getResult(${JSON.stringify(timedFinished)}),'score');})()`),false);
  await route('history/exam','.history-table');assert.doesNotMatch(await text('.history-table'),/Điểm|\/ 10/);
  assert.match(await text('.history-table'),/Hết giờ/);await screenshot('exam-history-mobile',390,844);
  await evaluate("sessionStorage.setItem('quizlab-qa-clock-offset','0')");

  const expiringId=await newSession(), expiring=await dbSession(expiringId);
  await click('[data-action=submit]');await until(()=>visible('#dialog[open]'),'confirmation before deadline');
  const lateWrite=await evaluate(`(async()=>{sessionStorage.setItem('quizlab-qa-clock-offset',String(${expiring.endTime}-window.__quizlabRealNow()));let invoked=false;const db=await import('./js/db.js');const s=await db.updateSession(${JSON.stringify(expiringId)},s=>{invoked=true;s.answers[s.questions[0].id]=s.questions[0].answer;});return {invoked,s};})()`);
  assert.equal(lateWrite.invoked,false,'no answer callback executes at or after endTime');
  assert.equal(lateWrite.s.completionReason,'timeout');assert.deepEqual(lateWrite.s.answers,{});
  await evaluate('window.dispatchEvent(new Event("focus"))');await until(()=>visible('[data-exam-result="true"]'),'timeout during confirmation');
  assert.equal(await visible('#dialog[open]'),false);assert.equal((await dbSession(expiringId)).completedAt,expiring.endTime);
  await evaluate("sessionStorage.setItem('quizlab-qa-clock-offset','0')");

  const beforeCounter=await setting('exam-attempt-counter');
  const concurrent=await evaluate(`(async()=>{const db=await import('./js/db.js'),e=await import('./js/exam.js'),bank=await db.getSetting('official-bank'),role=await db.getSetting('user-role');const results=await Promise.allSettled([db.addExamSession(e.createExamSession(bank,role)),db.addExamSession(e.createExamSession(bank,role))]);return results.map(r=>r.status==='fulfilled'?{status:r.status,session:r.value}:{status:r.status,code:r.reason.code});})()`);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'concurrent start requests create only one exam');
  assert.equal(concurrent.find(r=>r.status==='rejected').code,'EXAM_IN_PROGRESS');
  const winner=concurrent.find(r=>r.status==='fulfilled').session;
  assert.equal(winner.attemptNumber,beforeCounter+1);assert.equal(await setting('exam-attempt-counter'),beforeCounter+1);
  const bypass=await evaluate(`(async()=>{const db=await import('./js/db.js'),e=await import('./js/exam.js');try{await db.addSession(e.createExamSession(await db.getSetting('official-bank'),await db.getSetting('user-role')));return null;}catch(error){return error.code;}})()`);
  assert.equal(bypass,'EXAM_IN_PROGRESS','generic session insertion cannot bypass the exam lock');
  assert.deepEqual(await dbSession(winner.id),winner,'blocked requests never reset the active exam');
  const wrongRole=await evaluate(`(async()=>{const db=await import('./js/db.js'),e=await import('./js/exam.js'),bank=await db.getSetting('official-bank');try{await db.addExamSession(e.createExamSession(bank,'chu-tich-hdnd'));return false;}catch{return true;}})()`);
  assert.equal(wrongRole,true);assert.equal(await setting('exam-attempt-counter'),beforeCounter+1);
  const nextAfterExpiry=await evaluate(`(async()=>{sessionStorage.setItem('quizlab-qa-clock-offset',String(${winner.endTime}-window.__quizlabRealNow()));const db=await import('./js/db.js'),e=await import('./js/exam.js');return db.addExamSession(e.createExamSession(await db.getSetting('official-bank'),await db.getSetting('user-role')));})()`);
  assert.equal(nextAfterExpiry.attemptNumber,beforeCounter+2);
  const expiredWinner=await dbSession(winner.id);
  assert.equal(expiredWinner.completionReason,'timeout');assert.equal(expiredWinner.completedAt,winner.endTime);
  const nextAfterSubmit=await evaluate(`(async()=>{const db=await import('./js/db.js'),e=await import('./js/exam.js'),m=await import('./js/model.js');await db.updateSession(${JSON.stringify(nextAfterExpiry.id)},s=>m.finishSession(s));return db.addExamSession(e.createExamSession(await db.getSetting('official-bank'),await db.getSetting('user-role')));})()`);
  assert.equal(nextAfterSubmit.attemptNumber,beforeCounter+3,'manual submission releases the exam lock');
  await evaluate("sessionStorage.setItem('quizlab-qa-clock-offset','0')");
  assert.deepEqual(await dbSession(examId),finishedSnapshot);assert.deepEqual(await dbSession(practiceId),activeSnapshot);
  console.log('PASS: active exam blocks UI, forced submits, other roles, generic insertion and concurrent starts; only submission/expiry unlocks; counter and snapshots preserved');

  await evaluate(`(async()=>{const db=await import('./js/db.js'),m=await import('./js/model.js');await db.updateSession(${JSON.stringify(nextAfterSubmit.id)},s=>m.finishSession(s));})()`);
  // Simulate a timed exam saved by the preceding algorithm. Resuming it must
  // never run the new topic allocation or replace its stored question snapshot.
  const oldExam=await evaluate(`(async()=>{
    const db=await import('./js/db.js'),m=await import('./js/model.js'),bank=await db.getSetting('official-bank'),role=await db.getSetting('user-role');
    const questions=bank.manifest.chapters.flatMap(c=>[...bank.questions.filter(q=>q.chapterId===c.id&&q.role==='all').slice(0,6),...bank.questions.filter(q=>q.chapterId===c.id&&q.role===role).slice(0,6)]);
    const saved=await db.addExamSession({...m.createSession(questions,{mode:'exam',count:'all',role,shuffleQuestions:true,shuffleAnswers:true,bankVersion:bank.dataVersion}),examVersion:1});
    return db.updateSession(saved.id,s=>{s.currentIndex=49;s.answers[s.questions[0].id]=s.questions[0].answer;s.flags=[s.questions[49].id];});
  })()`);
  for(const chapter of originalManifest.chapters)assert.equal(oldExam.questions.filter(q=>q.chapterId===chapter.id).length,12);
  await route(`quiz/${oldExam.id}`,'#exam-timer');
  await send('Page.reload');await until(()=>visible('#exam-timer'),'old five-chapter exam reload');
  assert.deepEqual(await dbSession(oldExam.id),oldExam);
  await click('.quiz-heading a');await until(()=>visible('[data-resume-exam]'),'old exam saved and exited');
  await click('[data-resume-exam]');await until(()=>visible('#exam-timer'),'resume old five-chapter exam');
  assert.deepEqual(await dbSession(oldExam.id),oldExam);
  await send('Page.navigate',{url:'about:blank'});await until(()=>evaluate('location.href==="about:blank"'),'close old exam');
  await send('Page.navigate',{url:base+`#quiz/${oldExam.id}`});await until(()=>visible('#exam-timer'),'reopen old five-chapter exam');
  assert.deepEqual(await dbSession(oldExam.id),oldExam,'new algorithm never changes an old active exam');
  await evaluate(`(async()=>{const db=await import('./js/db.js'),m=await import('./js/model.js');await db.updateSession(${JSON.stringify(oldExam.id)},s=>m.finishSession(s));})()`);
  console.log('PASS: existing five-chapter exam keeps questions, answers, option order, flags, progress and deadline through refresh, exit and reopen');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for (const role of ['bi-thu-dang-uy','chu-tich-hdnd','chu-tich-ubnd','chu-tich-mttq']) {
    await changeRole(role);
    const id=await newSession();
    assertExamDistribution(await dbSession(id));
    assert.equal(await evaluate('document.querySelector(".question-nav").scrollTop'),0,'a new exam starts at the top of its own question list');
    if (role === 'bi-thu-dang-uy') {
      const scrollTop=await evaluate('(()=>{const nav=document.querySelector(".question-nav");nav.scrollTop=nav.scrollHeight;return nav.scrollTop;})()');
      assert.ok(scrollTop>0,'the 60-question list actually overflows');
      await pointerClick('.question-nav [data-value="49"]');
      await until(()=>evaluate('document.querySelector(".question-nav [aria-current=step]")?.dataset.value==="49"'),'question 50 is selected');
      assert.equal(await evaluate('document.querySelector(".question-nav").scrollTop'),scrollTop,'selecting question 50 preserves the list scroll position');
      assert.equal(await text('#question-title'),(await dbSession(id)).questions[49].question);
      for (const [selector,index] of [['.quiz-actions button:last-child',50],['.quiz-actions button:first-child',49]]) {
        await pointerClick(selector);
        await until(()=>evaluate(`document.querySelector('.question-nav [aria-current=step]')?.dataset.value===${JSON.stringify(String(index))}`),'previous/next question updates');
        assert.equal(await evaluate('document.querySelector(".question-nav").scrollTop'),scrollTop,'previous/next preserves list scroll');
      }
      await pointerClick('.answer[data-value="A"]');await click('[data-action=flag]');
      await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'answer and flag saved at question 50');
      assert.equal(await evaluate('document.querySelector(".question-nav").scrollTop'),scrollTop,'answering and flagging preserve list scroll');
      await screenshot('exam-scroll-preserved',1440,1000);
      console.log('PASS: question 50, previous/next, answers and flags preserve navigator scroll; new exams reset their own list');
      // A scrolled page on a short desktop, tablet or phone must stay in place
      // too. Inspect after painting to catch focus and scrollIntoView effects.
      for (const width of [1100,900,390]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:width<600});
        for (const index of [54,48]) {
          const before=await pointerClick(`.question-nav [data-value="${index}"]`);
          assert.ok(before.pageY>0,'the page is scrolled before changing a lower question');
          await until(()=>evaluate(`document.querySelector('.question-nav [aria-current=step]')?.dataset.value===${JSON.stringify(String(index))} && document.querySelector('#app').getAttribute('aria-busy')!=='true'`),'lower question updates on a scrolled page');
          await delay(180);
          const after=await evaluate('({pageY:scrollY,maxY:document.documentElement.scrollHeight-innerHeight,navTop:document.querySelector(".question-nav").scrollTop})');
          assert.equal(after.navTop,before.navTop,`list scroll remains stable at width ${width}`);
          assert.ok(Math.abs(after.pageY-Math.min(before.pageY,after.maxY))<=1,`page scroll stays in place at width ${width}: ${before.pageY} -> ${after.pageY}`);
          assert.equal(await text('#question-title'),(await dbSession(id)).questions[index].question);
        }
      }
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      console.log('PASS: list and page scroll remain stable after painting on short desktop, tablet and phone');
    }
    await pointerClick('.question-nav [data-value="15"]');
    await until(async()=>(await dbSession(id)).currentIndex===15,'navigate to question 16');
    const session=await dbSession(id), question=session.questions[15];
    for (const value of ['A','B','C','D']) {
      await pointerClick(`.answer[data-value="${value}"]`);
      await until(async()=>(await dbSession(id)).answers[question.id]===value,'pointer answer saved');
      assert.equal(await evaluate('document.querySelector(".answer[aria-pressed=true]")?.dataset.value'),value,'the visible question shows the saved choice');
    }
    await pointerClick('[data-action=flag]');
    await until(async()=>(await dbSession(id)).flags.includes(question.id),'pointer flag saved');
    await pointerClick('.side-nav a[href="#history"]');await until(()=>visible('.history-table'),'history after pointer navigation');
    assert.equal(await evaluate('location.hash'),'#history');
    await pointerClick(`.history-table a[href="#quiz/${id}"]`);await until(()=>visible('.answers'),'resume from history');
    await pointerClick('.answer[data-value="A"]');
    await until(async()=>(await dbSession(id)).answers[question.id]==='A','answer after resume');
    await send('Page.reload');await until(()=>visible('.answers'),'reload before pointer selection');
    await pointerClick('.answer[data-value="B"]');
    await until(async()=>(await dbSession(id)).answers[question.id]==='B','answer after reload');
    assert.equal((await dbSession(id)).endTime,session.endTime);
    await click('[data-action=submit]');await until(()=>visible('#dialog[open]'),'submit confirmation');
    await click('#dialog button[value=confirm]');await until(()=>visible('[data-exam-result="true"]'),'exam submitted');
    const completed=await dbSession(id), nextId=await newSession(), next=await dbSession(nextId);
    assertExamDistribution(next);assert.notEqual(nextId,id);assert.equal(next.attemptNumber,completed.attemptNumber+1);assert.deepEqual(next.answers,{});
    assert.notDeepEqual(next.questions.map(q=>q.id).sort(),completed.questions.map(q=>q.id).sort(),'a new attempt samples new question IDs, not just a new order');
    assert.deepEqual(await dbSession(id),completed,'a new attempt preserves previous history');
    await evaluate(`(async()=>{const db=await import('./js/db.js'),m=await import('./js/model.js');await db.updateSession(${JSON.stringify(nextId)},s=>m.finishSession(s));})()`);
  }
  console.log('PASS: all four roles receive eight balanced topics, exactly 30 common/30 private, and fresh question samples on successive new attempts');
  console.log('PASS: all four roles can select/change answers, flag, navigate to history, resume and refresh using real pointer events');

  await changeRole('bi-thu-dang-uy');
  const responsiveId=await newSession(), responsive=await dbSession(responsiveId);
  await evaluate('window.__quizlabHistoryReads=0;window.__quizlabHistoryGate=new Promise(resolve=>window.__releaseHistory=resolve);void 0');
  await pointerClick('.answer[data-value="A"]');
  await until(()=>evaluate('document.querySelector(".answer[aria-pressed=true]")?.dataset.value==="A" && document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'save remains responsive when history is stalled',3000);
  assert.equal(await evaluate('window.__quizlabHistoryReads'),0,'saving a choice does not reload the entire history');
  await evaluate('window.__releaseHistory();window.__quizlabHistoryGate=null');

  // A real IndexedDB transaction holds both stores, reproducing a stuck save
  // and a URL changing while navigation waits for storage.
  await evaluate(`(async()=>{const db=await(await import('./js/db.js')).openDatabase();const tx=db.transaction(['sessions','settings'],'readwrite'),store=tx.objectStore('sessions');window.__blockingTxn=tx;function hold(){store.get('__quizlab_hold__').onsuccess=()=>{if(window.__blockingTxn===tx)hold();};}hold();})()`);
  const errorCount=errors.length;
  await pointerClick('.answer[data-value="B"]');
  await until(()=>text('.save-status').then(value=>value==='Đang lưu…'),'pending save is visible');
  // This link remains usable while a save is pending.
  await evaluate('document.querySelector(".side-nav a[href=\\"#history\\"]").click()');
  await until(()=>text('#main').then(value=>value?.includes('Đang tải…')),'navigation hides the obsolete quiz while loading');
  await until(()=>visible('[data-action=retry-navigation]'),'stalled navigation provides retry',15000);
  await until(()=>evaluate('document.querySelector("#app").getAttribute("aria-busy")!=="true"'),'stalled save releases action lock');
  assert.equal(await evaluate('location.hash'),'#history');
  assert.match(await text('#main'),/Dữ liệu trên thiết bị phản hồi quá lâu/);
  assert.equal(await visible('.answers'),false,'a failed navigation cannot leave the old quiz interactive under the history URL');
  await evaluate('window.__blockingTxn.abort();window.__blockingTxn=null');
  const afterTimeout=await dbSession(responsiveId);
  assert.equal(afterTimeout.answers[responsive.questions[0].id],'A','an aborted answer never saves later');
  assert.equal(afterTimeout.endTime,responsive.endTime);assert.deepEqual(afterTimeout.questions,responsive.questions);
  const expectedErrors=errors.splice(errorCount);
  assert.ok(expectedErrors.length>0);assert.ok(expectedErrors.every(error=>error.includes('Dữ liệu trên thiết bị phản hồi quá lâu')),expectedErrors.join('\n'));
  await click('[data-action=retry-navigation]');await until(()=>visible('.history-table'),'navigation recovers without reload or data deletion');
  await pointerClick(`.history-table a[href="#quiz/${responsiveId}"]`);await until(()=>visible('.answers'),'resume after storage recovery');
  await pointerClick('.answer[data-value="B"]');
  await until(()=>evaluate('document.querySelector(".answer[aria-pressed=true]")?.dataset.value==="B"'),'answer works after storage recovery');
  assert.equal((await dbSession(responsiveId)).answers[responsive.questions[0].id],'B');
  assert.equal((await dbSession(responsiveId)).endTime,responsive.endTime);
  console.log('PASS: history reads never block answers; stalled storage aborts safely, unlocks actions and navigation retries without losing the exam');
  assert.deepEqual(errors,[],'no console errors or uncaught exceptions');
  console.log('PASS: code update from another tab waits for save/exit; all browser checks passed');
} finally {
  for(const connection of sockets)connection.close();chrome.kill('SIGTERM');server.kill('SIGTERM');
  await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}

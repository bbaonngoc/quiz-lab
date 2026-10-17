import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assembleBank, validateManifest, filterQuestions, sha256 } from '../js/bank-schema.js';
import { createSession, getResult, validateSession, currentMistakes, ROLES } from '../js/model.js';

const manifest=JSON.parse(await readFile(new URL('../data/bank-manifest.json',import.meta.url),'utf8'));
const payloads=await Promise.all(manifest.sections.map(s=>readFile(new URL('../data/'+s.url,import.meta.url))));
const bank=await assembleBank(manifest,payloads);
const config={mode:'exam',count:'all',shuffleQuestions:true,shuffleAnswers:true};

test('ngân hàng thật: 5 chương, 8 mục, 558 câu và đúng phạm vi của bốn vai trò',()=>{
  assert.equal(bank.manifest.chapters.length,5);assert.equal(bank.manifest.sections.length,8);
  assert.equal(bank.questions.length,558);assert.equal(new Set(bank.questions.map(q=>q.id)).size,558);
  assert.equal(bank.questions.filter(q=>q.role==='all').length,310);
  for (const role of ROLES) {
    const questions=filterQuestions(bank,role.id);
    assert.equal(questions.length,372);
    assert.ok(questions.every(q=>q.role==='all'||q.role===role.id));
    assert.deepEqual(manifest.chapters.map(c=>filterQuestions(bank,role.id,{chapterId:c.id}).length),[96,48,96,48,84]);
    const session=createSession(bank.questions,{...config,role:role.id,bankVersion:bank.dataVersion,filters:{chapterId:'all',sectionId:'all',scope:'all',difficulty:'all'}},()=>.17);
    session.questions.forEach(q=>session.answers[q.id]=q.answer);
    assert.equal(getResult(session).correct,questions.length);assert.equal(Object.hasOwn(getResult(session),'score'),false);assert.deepEqual(validateSession(session),session);
  }
  assert.deepEqual(filterQuestions(bank,null),[]);
});

test('lọc giao nhau chương/phần, mức độ, chung/riêng và tìm kiếm',()=>{
  const role=ROLES[0].id;
  assert.equal(filterQuestions(bank,role,{chapterId:'chuong-i',sectionId:'chuong-i-phan-1',difficulty:'Mức 1',scope:'role'}).length,2);
  assert.equal(filterQuestions(bank,role,{sectionId:'chuong-v-phan-2',difficulty:'Mức 4'}).length,0);
  assert.equal(filterQuestions(bank,role,{scope:'shared'}).length,310);
  assert.equal(filterQuestions(bank,role,{scope:'role'}).length,62);
  assert.equal(filterQuestions(bank,role,{difficulty:'unclassified'}).length,0);
  assert.ok(filterQuestions(bank,role,{},'chuyển đổi số').length>0);
  assert.equal(bank.manifest.sections.find(s=>s.id==='chuong-ii').partNumber,null);
  assert.equal(bank.manifest.sections.find(s=>s.id==='chuong-iv').partNumber,null);
});

test('manifest chặn đường dẫn ngoài bộ dữ liệu, trùng chương/mục, sai cấp và schema',()=>{
  for (const mutate of [
    m=>m.schemaVersion=99,
    m=>m.sections[0].url='../secrets.json',
    m=>m.sections[1].id=m.sections[0].id,
    m=>m.chapters[1].id=m.chapters[0].id,
    m=>m.sections[2].partNumber=1,
    m=>m.count++,
    m=>m.sections[0].sha256='invalid'
  ]) {const invalid=structuredClone(manifest);mutate(invalid);assert.throws(()=>validateManifest(invalid));}
});

test('bộ tải từ chối thiếu chương, sai hash, sai phiên bản, ID trùng và chức danh sai',async()=>{
  await assert.rejects(()=>assembleBank(manifest,payloads.slice(0,7)),/Chưa tải đủ/);
  const corrupt=[...payloads];corrupt[0]=new TextEncoder().encode('{}');
  await assert.rejects(()=>assembleBank(manifest,corrupt),/hash/);
  for (const mutate of [
    p=>p.dataVersion='other',
    p=>p.questions[1].id=p.questions[0].id,
    p=>p.questions[0].answer='E',
    p=>p.questions[0].role='unknown',
    p=>p.questions[0].sectionId='chuong-iv'
  ]) {
    const m=structuredClone(manifest), parts=[...payloads], part=JSON.parse(new TextDecoder().decode(parts[0]));
    mutate(part);parts[0]=new TextEncoder().encode(JSON.stringify(part));m.sections[0].sha256=await sha256(parts[0]);
    await assert.rejects(()=>assembleBank(m,parts));
  }
});

test('ôn sai dùng nội dung hiện hành; bản đúng cũ không xóa sai của revision mới',()=>{
  const q=bank.questions[0], role=ROLES[0].id;
  const attempt=(question,answer,time)=>{
    const s=createSession([question],{...config,role});s.status='completed';s.completedAt=time;s.answers[q.id]=answer;return s;
  };
  const wrong=['A','B','C','D'].find(a=>a!==q.answer);
  const old={...q,question:'Bản cũ',revision:'old'};
  const legacyWrong=attempt(old,wrong,100), currentWrong=attempt(q,wrong,200), oldCorrect=attempt(old,q.answer,300);
  assert.equal(currentMistakes([legacyWrong],bank,role)[0].question,q.question);
  assert.equal(currentMistakes([legacyWrong,currentWrong,oldCorrect],bank,role).length,1);
  assert.equal(currentMistakes([legacyWrong,currentWrong,oldCorrect,attempt(q,q.answer,400)],bank,role).length,0);
  assert.equal(currentMistakes([legacyWrong],{...bank,questions:[]},role).length,0);
  assert.equal(getResult(legacyWrong).wrong,1);
  const other=bank.questions.find(q=>q.role===ROLES[1].id);
  const foreign=createSession([{...other,id:q.id}],{...config,role:ROLES[1].id});
  foreign.status='completed';foreign.completedAt=500;foreign.answers[q.id]=['A','B','C','D'].find(a=>a!==other.answer);
  assert.equal(currentMistakes([foreign],bank,role).length,0);
});

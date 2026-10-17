import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBank, createSession, getResult, getMistakes, questionStatus, validateSession, shuffle, LETTERS } from '../js/model.js';

const legacySample = JSON.parse(await readFile(new URL('./fixtures/sample-bank.json',import.meta.url),'utf8'));
// Test data explicitly declares its audience; old fixtures stay unchanged for backups.
const bank = validateBank({...legacySample,questions:legacySample.questions.map(q=>({...q,role:'all'}))});
const config = { mode:'practice',count:'all',shuffleQuestions:false,shuffleAnswers:false,role:'bi-thu-dang-uy' };

test('10 câu mẫu đủ A/B/C/D, đáp án, giải thích và chủ đề',()=>{
  assert.equal(bank.questions.length,10);
  assert.equal(validateBank(bank.questions).questions.length,10);
  for(const q of bank.questions)assert.deepEqual(Object.keys(q.options),LETTERS);
});
test('từ chối ngân hàng trùng ID, đáp án thiếu và ID thuộc tính hệ thống',()=>{
  assert.throws(()=>validateBank({version:1,questions:[bank.questions[0],bank.questions[0]]}),/id/);
  assert.throws(()=>validateBank([{...bank.questions[0],answer:'E'}]),/answer/);
  assert.throws(()=>validateBank([{...bank.questions[0],options:{A:'a',B:'b',C:'c'}}]),/A, B, C, D/);
  assert.throws(()=>validateBank([{...bank.questions[0],id:'__proto__'}]),/id/);
  assert.throws(()=>validateBank([{...bank.questions[0],id:'toString'}]),/id/);
  assert.throws(()=>validateBank([]),/questions/);
});
test('JSON: ID/Chủ đề/Giải thích có thể thiếu, null hoặc trống',()=>{
  const required = { question: 'Câu hỏi tối giản?', options: { A:'a', B:'b', C:'c', D:'d' }, answer:'C',role:'all' };
  let id;
  for (const optional of [{}, {id:null,topic:null,explanation:null}, {id:'  ',topic:' ',explanation:''}]) {
    const [question]=validateBank([{...required,...optional}]).questions;
    assert.equal(question.topic,'Tổng hợp');
    assert.equal(question.explanation,'');
    assert.match(question.id,/^question-/);
    id ||= question.id;
    assert.equal(question.id,id,'ID stable across equivalent missing/null metadata');
    const session=createSession([question],config);
    session.answers[question.id]='C';
    assert.equal(getResult(session).score,10);
    assert.deepEqual(validateSession(session),session);
  }
});
test('JSON: câu hỏi, bốn phương án và đáp án đúng luôn phải có dữ liệu',()=>{
  const q=bank.questions[0];
  for (const empty of [null, undefined, '', '   ']) {
    assert.throws(()=>validateBank([{...q,question:empty}]),/question/);
    assert.throws(()=>validateBank([{...q,answer:empty}]),/answer/);
    for (const key of LETTERS) assert.throws(()=>validateBank([{...q,options:{...q.options,[key]:empty}}]),/A, B, C, D/);
  }
});
test('20/50/100 lấy đủ 10 câu hiện có, không lặp câu',()=>{
  for(const count of ['20','50','100','all']) {
    const session=createSession(bank.questions,{...config,count});
    assert.equal(session.questions.length,10);
    assert.equal(new Set(session.questions.map(q=>q.id)).size,10);
  }
});
test('ngân hàng 300 câu chọn đúng số lượng yêu cầu',()=>{
  const questions=Array.from({length:300},(_,i)=>({...bank.questions[i%10],id:`q-${i}`}));
  for(const count of ['20','50','100','all'])assert.equal(createSession(questions,{...config,count}).questions.length,count==='all'?300:Number(count));
});
test('trộn đáp án giữ nguyên ID đúng và chấm đúng sau khi trộn',()=>{
  const session=createSession(bank.questions,{...config,shuffleQuestions:true,shuffleAnswers:true},()=>.17);
  assert.notDeepEqual(session.questions.map(q=>q.id),bank.questions.map(q=>q.id));
  session.questions.forEach(q=>{assert.deepEqual([...q.optionOrder].sort(),LETTERS);session.answers[q.id]=q.answer;});
  assert.equal(getResult(session).score,10);
  assert.equal(getResult(session).correct,10);
  assert.notDeepEqual(session.questions[0].optionOrder,LETTERS);
  assert.deepEqual(shuffle(LETTERS,()=>.1).sort(),LETTERS);
});
test('tắt đảo đáp án giữ đúng thứ tự A/B/C/D và đáp án gốc',()=>{
  const session=createSession(bank.questions,{...config,shuffleQuestions:true,shuffleAnswers:false},()=>.17);
  for(const question of session.questions) {
    assert.deepEqual(question.optionOrder,LETTERS);
    assert.equal(question.answer,bank.questions.find(q=>q.id===question.id).answer);
    session.answers[question.id]=question.answer;
  }
  assert.equal(getResult(session).score,10);
});
test('ngân hàng đã xóa hết được chuẩn hóa cho lưu trữ, vẫn chặn bài làm rỗng',()=>{
  const empty={version:1,title:'Ngân hàng trống',questions:[]};
  assert.deepEqual(validateBank(empty,{allowEmpty:true}),{...empty,title:''});
  assert.throws(()=>validateBank(empty),/questions/);
  assert.throws(()=>validateBank({...empty,version:99},{allowEmpty:true}),/version/);
  assert.throws(()=>createSession([],config),/Chưa có câu hỏi/);
});
test('chấm đúng/sai/bỏ trống và điểm thang 10',()=>{
  const session=createSession(bank.questions,config);
  session.questions.slice(0,6).forEach(q=>session.answers[q.id]=q.answer);
  session.questions.slice(6,8).forEach(q=>session.answers[q.id]=LETTERS.find(key=>key!==q.answer));
  assert.deepEqual(getResult(session),{correct:6,wrong:2,blank:2,total:10,answered:8,score:6});
  assert.equal(questionStatus(session,session.questions[9]),'blank');
  assert.equal(getResult({...session,questions:session.questions.slice(0,3),answers:{[session.questions[0].id]:session.questions[0].answer}}).score,3.3);
});
test('bài làm giữ bản sao câu hỏi khi ngân hàng thay đổi',()=>{
  const questions=structuredClone(bank.questions);
  const session=createSession(questions,config);
  questions[0].question='Đã đổi';questions[0].options.A='Đáp án mới';
  assert.equal(session.questions[0].question,bank.questions[0].question);
  assert.equal(session.questions[0].options.A,bank.questions[0].options.A);
});
test('câu sai theo lần trả lời gần nhất, trả lời đúng sẽ xóa câu cần ôn',()=>{
  const old=createSession(bank.questions,config);old.status='completed';old.completedAt=100;
  old.answers[old.questions[0].id]=LETTERS.find(key=>key!==old.questions[0].answer);
  const later=structuredClone(old);later.id='new';later.completedAt=200;
  later.answers[later.questions[0].id]=later.questions[0].answer;
  assert.equal(getMistakes([old]).length,1);
  assert.equal(getMistakes([old,later]).length,0);
  later.answers={};assert.equal(getMistakes([later,old]).length,1);
  later.status='active';assert.equal(getMistakes([old,later]).length,1);
});
test('bản sao lưu giữ thứ tự và đáp án, loại dữ liệu lỗi',()=>{
  const session=createSession(bank.questions,{...config,shuffleAnswers:true});
  session.answers[session.questions[0].id]=session.questions[0].answer;
  session.flags=[session.questions[0].id];
  assert.deepEqual(validateSession(session),session);
  assert.throws(()=>validateSession({...session,currentIndex:100}),/Vị trí/);
  const invalid=structuredClone(session);invalid.questions[0].optionOrder=['A','A','B','C'];
  assert.throws(()=>validateSession(invalid),/Thứ tự/);
  assert.throws(()=>validateSession({...session,answers:{[session.questions[0].id]:'E'}}),/Đáp án/);
  const missingId=structuredClone(session);missingId.questions[0].id=null;
  assert.throws(()=>validateSession(missingId),/ID câu hỏi/);
});

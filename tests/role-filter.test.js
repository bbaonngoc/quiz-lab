import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, normalizeRole, questionsForRole, roleIssues, roleLabel, validateBank, createSession, validateSession, canResumeSession, currentMistakes } from '../js/model.js';
import { filterQuestions } from '../js/bank-schema.js';

const q={id:'q-common',question:'Câu kiểm thử?',options:{A:'a',B:'b',C:'c',D:'d'},answer:'B',role:'all',scope:'shared'};
const config={mode:'practice',count:'all',shuffleQuestions:false,shuffleAnswers:false};

test('role bắt buộc: null, thiếu, trống hoặc sai không được mặc định Chung',()=>{
  const invalid=[undefined,null,'','   ','vai-trò-không-có'];
  for(const role of invalid) {
    assert.throws(()=>normalizeRole(role),/role|Vai trò/);
    assert.throws(()=>validateBank([{...q,role}]),/role|Vai trò/);
    for(const selected of ROLES) {
      assert.deepEqual(questionsForRole([{...q,role}],selected.id),[]);
      assert.equal(roleIssues([{...q,role}]).length,1);
    }
  }
  assert.equal(normalizeRole('Chung'),'all');
  assert.equal(roleLabel(null),'Chưa xác định');
  const contradictory={...q,role:ROLES[0].id,scope:'shared'};
  assert.equal(roleIssues([contradictory]).length,1);
  assert.deepEqual(questionsForRole([contradictory],ROLES[0].id),[]);
});

test('đối chiếu ID từng vai trò ở ngân hàng, ôn tập, thi thử và ôn sai',()=>{
  const common={...q,role:'Chung'};
  const privateQuestions=ROLES.map((r,i)=>({...q,id:`private-${i}`,role:r.id,scope:'role'}));
  const bad={...q,id:'missing',role:null};
  const bank={questions:[common,...privateQuestions,bad]};
  for(let i=0;i<ROLES.length;i++) {
    const role=ROLES[i].id, expected=['q-common',`private-${i}`];
    assert.deepEqual(filterQuestions(bank,role).map(q=>q.id),expected);
    for(const mode of ['practice','exam']) {
      const session=createSession(bank.questions,{...config,mode,role});
      assert.deepEqual(session.questions.map(q=>q.id),expected);
      assert.equal(canResumeSession(session,role),true);
      assert.equal(canResumeSession(session,ROLES[(i+1)%4].id),false);
    }
    const canonical={questions:[{...q},...privateQuestions,bad]};
    const completed=ROLES.map(r=>{
      const s=createSession(canonical.questions,{...config,role:r.id});s.status='completed';s.completedAt=Date.now();
      s.questions.forEach(item=>s.answers[item.id]='A');return s;
    });
    assert.deepEqual(currentMistakes(completed,canonical,role).map(q=>q.id).sort(),expected.sort());
  }
  assert.throws(()=>createSession(bank.questions,config),/chọn vai trò/);
  assert.throws(()=>createSession(bank.questions,{...config,role:'all'}),/chọn vai trò/);
});

test('sao lưu cũ thiếu role vẫn giữ để xem lịch sử, không đưa vào bài mới',()=>{
  const session=createSession([q],{...config,role:ROLES[0].id});
  delete session.questions[0].role;
  const restored=validateSession(session);
  assert.equal(restored.questions[0].role,null);
  assert.equal(canResumeSession(restored,ROLES[0].id),false);
  restored.status='completed';restored.completedAt=Date.now();restored.answers[q.id]='A';
  assert.deepEqual(currentMistakes([restored],{questions:[q]},ROLES[0].id),[]);
});

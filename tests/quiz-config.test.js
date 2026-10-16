import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../scripts/validate-bank.mjs';
import { normalizeQuizConfig } from '../js/quiz-config.js';
import { filterQuestions } from '../js/bank-schema.js';
import { createSession, ROLES } from '../js/model.js';

const bank=await validateRelease();
const legacy={mode:'exam',chapterId:'chuong-v',sectionId:'chuong-v-phan-2',count:'20',difficulty:'Mức 4',scope:'role',shuffleQuestions:false,shuffleAnswers:false};

test('ôn tập luôn đủ câu trong phần dù cấu hình cũ giới hạn số lượng/mức độ/phân loại',()=>{
  const config=normalizeQuizConfig(bank,legacy,'practice');
  for(const role of ROLES) {
    const questions=filterQuestions(bank,role.id,config);
    const session=createSession(questions,{...config,role:role.id});
    const expected=bank.questions.filter(q=>q.sectionId==='chuong-v-phan-2' && ['all',role.id].includes(q.role));
    assert.equal(session.mode,'practice');assert.equal(session.questions.length,36);
    assert.deepEqual(session.questions.map(q=>q.id).sort(),expected.map(q=>q.id).sort());
    assert.deepEqual([...new Set(session.questions.map(q=>q.difficulty))].sort(),['Mức 1','Mức 2','Mức 3']);
    assert.equal(session.questions.filter(q=>q.scope==='role').length,6);
  }
});

test('ôn riêng từng mục; chương II/IV không có phần giả',()=>{
  for(const section of bank.manifest.sections) {
    const config=normalizeQuizConfig(bank,{chapterId:section.chapterId,sectionId:section.id});
    const questions=filterQuestions(bank,ROLES[0].id,config);
    assert.equal(questions.length,section.id==='chuong-v-phan-2'?36:48);
    assert.ok(questions.every(q=>q.sectionId===section.id));
  }
  assert.equal(normalizeQuizConfig(bank,{chapterId:'chuong-ii',sectionId:'all'}).sectionId,'chuong-ii');
  assert.equal(normalizeQuizConfig(bank,{chapterId:'chuong-iv',sectionId:'chuong-i-phan-1'}).sectionId,'chuong-iv');
  const initial=normalizeQuizConfig(bank,{chapterId:'all',sectionId:'invalid'});
  assert.equal(initial.chapterId,'chuong-i');assert.equal(initial.sectionId,'chuong-i-phan-1');
});

test('tất cả các phần lấy đủ câu trong chương cho từng vai trò và giữ lựa chọn đã lưu',()=>{
  const counts={'chuong-i':96,'chuong-ii':48,'chuong-iii':96,'chuong-iv':48,'chuong-v':84};
  for(const chapter of bank.manifest.chapters) {
    const config=normalizeQuizConfig(bank,{...legacy,chapterId:chapter.id,sectionId:'all'});
    const sections=bank.manifest.sections.filter(s=>s.chapterId===chapter.id);
    assert.equal(config.sectionId,sections.length>1?'all':sections[0].id);
    assert.deepEqual(normalizeQuizConfig(bank,structuredClone(config)),config,'giữ phạm vi khi đọc lại thiết lập');
    for(const role of ROLES) {
      const questions=filterQuestions(bank,role.id,config);
      const session=createSession(questions,{...config,role:role.id});
      const expected=bank.questions.filter(q=>q.chapterId===chapter.id && ['all',role.id].includes(q.role));
      assert.equal(session.questions.length,counts[chapter.id]);
      assert.deepEqual(session.questions.map(q=>q.id).sort(),expected.map(q=>q.id).sort());
      assert.deepEqual([...new Set(session.questions.map(q=>q.sectionId))].sort(),sections.map(s=>s.id).sort());
    }
  }
});

test('thi thử giữ các bộ lọc và số câu riêng; không thay thiết lập ôn tập',()=>{
  const practice=normalizeQuizConfig(bank,legacy,'practice');
  const exam=normalizeQuizConfig(bank,legacy,'exam');
  assert.equal(filterQuestions(bank,ROLES[0].id,exam).length,0);
  assert.equal(exam.count,'20');assert.equal(exam.difficulty,'Mức 4');assert.equal(exam.scope,'role');
  const all=normalizeQuizConfig(bank,{chapterId:'all',count:'50'},'exam');
  const session=createSession(filterQuestions(bank,ROLES[0].id,all),{...all,role:ROLES[0].id});
  assert.equal(session.mode,'exam');assert.equal(session.questions.length,50);
  assert.equal(practice.count,'all');assert.equal(practice.difficulty,'all');assert.equal(practice.scope,'all');
  assert.equal(practice.shuffleQuestions,false);assert.equal(practice.shuffleAnswers,false);
  assert.equal(legacy.count,'20','không sửa dữ liệu cấu hình cũ');
});

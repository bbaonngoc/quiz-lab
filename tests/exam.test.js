import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../scripts/validate-bank.mjs';
import { selectExamQuestions, createExamSession } from '../js/exam.js';
import { ROLES, roleLabel, EXAM_DURATION_MS, isExamExpired, ongoingExam, finishSession, getResult, validateSession, nextExamAttemptNumber, examRemainingSeconds, formatDuration, createSession } from '../js/model.js';

const bank=await validateRelease(), role=ROLES[0].id;
const seeded = seed => () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

function distribution(questions, selectedRole) {
  return bank.manifest.sections.map(section=>{
    const part=questions.filter(q=>q.sectionId===section.id);
    return {id:section.id,total:part.length,common:part.filter(q=>q.role==='all').length,private:part.filter(q=>q.role===selectedRole).length};
  });
}

function limitGroup(sectionId, groupRole, count, source=bank) {
  const changed=structuredClone(source);
  let kept=0;
  changed.questions=changed.questions.filter(q=>q.sectionId!==sectionId || q.role!==groupRole || kept++<count);
  return changed;
}

test('8 chủ đề: bốn nhóm 8, bốn nhóm 7, đúng 30 chung/30 riêng cho cả bốn chức danh',()=>{
  for (const selectedRole of ROLES) {
    const seen=new Map(bank.manifest.sections.map(s=>[s.id,new Set()]));
    for(let seed=1;seed<=64;seed++) {
      const questions=selectExamQuestions(bank,selectedRole.id,seeded(Math.imul(seed,0x9e3779b1)>>>0));
      assert.equal(questions.length,60);assert.equal(new Set(questions.map(q=>q.id)).size,60);
      assert.ok(questions.every(q=>q.role==='all'||q.role===selectedRole.id));
      assert.equal(questions.filter(q=>q.role==='all').length,30);
      assert.equal(questions.filter(q=>q.role===selectedRole.id).length,30);
      const parts=distribution(questions,selectedRole.id);
      assert.deepEqual(parts.map(p=>p.total).sort(),[7,7,7,7,8,8,8,8]);
      assert.equal(parts.filter(p=>p.common===4&&p.private===4).length,4);
      assert.equal(parts.filter(p=>p.common===4&&p.private===3).length,2);
      assert.equal(parts.filter(p=>p.common===3&&p.private===4).length,2);
      for(const part of parts)seen.get(part.id).add(`${part.common}/${part.private}`);
      const runs=1+questions.slice(1).filter((q,i)=>q.sectionId!==questions[i].sectionId).length;
      assert.ok(runs>8,'trộn toàn bộ đề, không giữ nguyên tám khối chủ đề sau khi lấy mẫu');
    }
    for(const quotas of seen.values())assert.deepEqual([...quotas].sort(),['3/4','4/3','4/4'],'mỗi chủ đề có thể nhận cả ba cách phân bổ');
  }
});

test('lượt mới thay đổi thành phần câu hỏi và lấy mẫu từ toàn bộ ngân hàng hợp lệ',()=>{
  const original=structuredClone(bank);
  for(const selectedRole of ROLES) {
    const first=selectExamQuestions(bank,selectedRole.id,seeded(1));
    const second=selectExamQuestions(bank,selectedRole.id,seeded(2));
    assert.notDeepEqual(first.map(q=>q.id).sort(),second.map(q=>q.id).sort(),'khác tập ID, không chỉ đổi thứ tự');
    const seen=new Set();
    for(let seed=1;seed<=200;seed++)for(const q of selectExamQuestions(bank,selectedRole.id,seeded(Math.imul(seed,0x9e3779b1)>>>0)))seen.add(q.id);
    const eligible=bank.questions.filter(q=>q.role==='all'||q.role===selectedRole.id);
    assert.deepEqual([...seen].sort(),eligible.map(q=>q.id).sort(),'mọi câu hợp lệ trong pool đều có thể được chọn');
  }
  assert.deepEqual(bank,original,'không thay đổi ngân hàng hoặc thứ tự gốc');
});

test('thiếu nhóm ở bất kỳ chủ đề/chức danh nào đều báo rõ, không bù từ nhóm hoặc chủ đề khác',()=>{
  for(const selectedRole of ROLES)for(const section of bank.manifest.sections)for(const groupRole of ['all',selectedRole.id])for(const count of [0,2]) {
    const changed=limitGroup(section.id,groupRole,count), original=structuredClone(changed);
    assert.throws(()=>selectExamQuestions(changed,selectedRole.id,seeded(9)),error=>{
      assert.ok(error.message.includes(section.title)&&error.message.includes(section.id),error.message);
      assert.ok(error.message.includes(groupRole==='all'?'dùng chung':`riêng cho ${roleLabel(selectedRole.id)}`),error.message);
      assert.match(error.message,new RegExp(`cần [34], hiện có ${count}`));
      return true;
    });
    assert.deepEqual(changed,original);
  }
});

test('đúng ngưỡng 4/4, 4/3, 3/4 vẫn tạo đủ đề; thiếu một câu theo quota đã random phải dừng',()=>{
  const unchangedOrder=()=>1-Number.EPSILON;
  for(const selectedRole of ROLES)for(const [index,common,privateCount] of [[0,4,4],[4,4,3],[6,3,4]]) {
    const section=bank.manifest.sections[index];
    let changed=limitGroup(section.id,'all',common);
    changed=limitGroup(section.id,selectedRole.id,privateCount,changed);
    const questions=selectExamQuestions(changed,selectedRole.id,unchangedOrder);
    assert.equal(questions.length,60);
    assert.deepEqual(distribution(questions,selectedRole.id)[index],{id:section.id,total:common+privateCount,common,private:privateCount});
    for(const [groupRole,needed] of [['all',common],[selectedRole.id,privateCount]]) {
      const missing=limitGroup(section.id,groupRole,needed-1,changed);
      assert.throws(()=>selectExamQuestions(missing,selectedRole.id,unchangedOrder),new RegExp(`cần ${needed}, hiện có ${needed-1}`));
    }
  }
});

test('không coi role thiếu/sai là Chung, không lấy câu của chức danh khác để bù',()=>{
  const section=bank.manifest.sections[0];
  for(const invalid of [null,undefined,'','khong-hop-le']) {
    const changed=structuredClone(bank);
    changed.questions.filter(q=>q.sectionId===section.id&&q.role==='all').forEach(q=>{q.role=invalid;});
    assert.throws(()=>selectExamQuestions(changed,role),/không đủ câu hỏi dùng chung.*hiện có 0/);
  }
  for(const [index,selectedRole] of ROLES.entries()) {
    const changed=structuredClone(bank), foreignRole=ROLES[(index+1)%ROLES.length].id;
    changed.questions.filter(q=>q.sectionId===section.id&&q.role===selectedRole.id).forEach(q=>{q.role=foreignRole;});
    assert.throws(()=>selectExamQuestions(changed,selectedRole.id),/không đủ câu hỏi riêng.*hiện có 0/);
  }
});

test('từ chối vai trò sai, thiếu/trùng chủ đề và ID thiếu hoặc trùng giữa các chủ đề',()=>{
  for(const invalid of [null,'admin'])assert.throws(()=>selectExamQuestions(bank,invalid),/vai trò/);
  const sections=bank.manifest.sections;
  for(const invalid of [undefined,null,sections.slice(1),[...sections,sections[0]],[...sections.slice(1),sections[1]],[null,...sections.slice(1)]]) {
    assert.throws(()=>selectExamQuestions({...bank,manifest:{...bank.manifest,sections:invalid}},role),/8 chủ đề/);
  }
  const common=bank.questions.find(q=>q.role==='all');
  assert.throws(()=>selectExamQuestions({...bank,questions:[...bank.questions,{...common,sectionId:sections[7].id}]},role),/ID/);
  for(const id of [null,undefined,'']) {
    const changed=structuredClone(bank);
    changed.questions.find(q=>q.id===common.id).id=id;
    assert.throws(()=>selectExamQuestions(changed,role),/ID/);
  }
});

test('snapshot thi giữ nội dung, đáp án gốc và thứ tự lựa chọn; không tính điểm',()=>{
  const original=structuredClone(bank);
  for(const shuffleAnswers of [true,false]) {
    const session=createExamSession(bank,role,{shuffleAnswers,now:1000,random:seeded(4)});
    assert.equal(session.endTime-session.startTime,EXAM_DURATION_MS);
    for(const q of session.questions) {
      assert.deepEqual(q.options,bank.questions.find(source=>source.id===q.id).options);
      assert.equal(q.answer,bank.questions.find(source=>source.id===q.id).answer);
      assert.deepEqual([...q.optionOrder].sort(),['A','B','C','D']);
      if(!shuffleAnswers)assert.deepEqual(q.optionOrder,['A','B','C','D']);
      session.answers[q.id]=q.answer;
    }
    assert.deepEqual(getResult(session),{correct:60,wrong:0,blank:0,total:60,answered:60});
    assert.deepEqual(bank,original);
    session.questions[0].question='Snapshot thay đổi riêng';
    assert.deepEqual(bank,original);
  }
});

test('đề cũ theo 5 chương giữ nguyên khi đọc lại, khôi phục và tạo đề mới theo 8 chủ đề',()=>{
  for(const selectedRole of ROLES) {
    const oldQuestions=bank.manifest.chapters.flatMap(chapter=>[
      ...bank.questions.filter(q=>q.chapterId===chapter.id&&q.role==='all').slice(0,6),
      ...bank.questions.filter(q=>q.chapterId===chapter.id&&q.role===selectedRole.id).slice(0,6)
    ]);
    const old={...createSession(oldQuestions,{mode:'exam',count:'all',role:selectedRole.id,shuffleQuestions:true,shuffleAnswers:true,bankVersion:'old-five-chapters'},seeded(3)),
      examVersion:1,attemptNumber:7,createdAt:1000,updatedAt:2000,startTime:1000,endTime:1000+EXAM_DURATION_MS};
    old.currentIndex=49;old.answers[old.questions[0].id]=old.questions[0].answer;old.flags=[old.questions[49].id];
    const snapshot=structuredClone(old);
    assert.deepEqual(validateSession(JSON.parse(JSON.stringify(old))),snapshot);
    const next=createExamSession(bank,selectedRole.id,{now:5000,random:seeded(4)});
    assert.notEqual(next.id,old.id);assert.deepEqual(next.answers,{});
    assert.deepEqual(old,snapshot,'tạo lượt mới không ghi lại đề hoặc thời hạn của lượt cũ');
    finishSession(old,old.endTime+1000);
    assert.deepEqual(old.questions,snapshot.questions);assert.deepEqual(old.answers,snapshot.answers);
    assert.deepEqual(old.flags,snapshot.flags);assert.equal(old.currentIndex,snapshot.currentIndex);
    assert.equal(old.completedAt,snapshot.endTime);assert.equal(old.endTime,snapshot.endTime);
  }
});

test('đồng hồ dùng hạn cố định: 60:00 ban đầu, không reset, hết giờ tại đúng endTime',()=>{
  const session={...createExamSession(bank,role,{now:1000}),attemptNumber:1};
  assert.equal(formatDuration(examRemainingSeconds(session,1000)),'60:00');
  assert.equal(formatDuration(examRemainingSeconds(session,1000+10*60*1000)),'50:00');
  assert.equal(formatDuration(examRemainingSeconds(session,session.endTime-1)),'00:01');
  assert.equal(isExamExpired(session,session.endTime-1),false);
  assert.equal(isExamExpired(session,session.endTime),true);
  assert.equal(examRemainingSeconds(session,session.endTime+10000),0);
  const snapshot=structuredClone(session.questions);
  finishSession(session,session.endTime+10000);
  assert.equal(session.completedAt,session.endTime);assert.equal(session.completionReason,'timeout');
  const completed=structuredClone(session);finishSession(session,session.endTime+20000);assert.deepEqual(session,completed);
  assert.deepEqual(session.questions,snapshot);assert.deepEqual(validateSession(session),session);
});

test('nộp thủ công lưu thời gian thực tế, thống kê đúng/sai/trống; ôn tập vẫn tính điểm',()=>{
  const session={...createExamSession(bank,role,{now:1000}),attemptNumber:2};
  session.answers[session.questions[0].id]=session.questions[0].answer;
  session.answers[session.questions[1].id]=['A','B','C','D'].find(a=>a!==session.questions[1].answer);
  finishSession(session,1000+75000);
  assert.equal(session.completedAt,76000);assert.equal(session.completionReason,'submitted');
  assert.deepEqual(getResult(session),{correct:1,wrong:1,blank:58,total:60,answered:2});
  assert.deepEqual(validateSession(session),session);
  const practice=createSession([bank.questions.find(q=>q.role==='all')],{mode:'practice',count:'all',role});
  practice.answers[practice.questions[0].id]=practice.questions[0].answer;assert.equal(getResult(practice).score,10);
});

test('backup giữ hạn và lần thi; từ chối metadata thời gian lỗi; bài cũ vẫn đọc được',()=>{
  const session={...createExamSession(bank,role,{now:1000}),attemptNumber:1};
  assert.deepEqual(validateSession(session),session);
  for(const mutate of [s=>delete s.endTime,s=>s.endTime++,s=>s.attemptNumber=0,s=>s.examVersion=99,s=>s.startTime++,s=>s.questions.pop()]) {
    const invalid=structuredClone(session);mutate(invalid);assert.throws(()=>validateSession(invalid),/Thời hạn/);
  }
  const legacy=createSession(bank.questions,{mode:'exam',count:'20',role});
  assert.deepEqual(validateSession(legacy),legacy);assert.equal(isExamExpired(legacy,Number.MAX_SAFE_INTEGER),false);
});

test('số lần thi tính cả bài đã bắt đầu, bài cũ và bộ đếm được khôi phục',()=>{
  assert.equal(nextExamAttemptNumber([]),1);
  const sessions=[{mode:'exam'},{mode:'exam',status:'active'},{mode:'practice'}];
  assert.equal(nextExamAttemptNumber(sessions),3);
  assert.equal(nextExamAttemptNumber([...sessions,{mode:'exam',attemptNumber:8}]),9);
  assert.equal(nextExamAttemptNumber(sessions,20),21);
  assert.equal(nextExamAttemptNumber(sessions,-100),3);
});

test('bài thi đang làm chặn bài mới toàn cục; đã nộp/hết giờ và ôn tập không chặn',()=>{
  const first=createExamSession(bank,role,{now:1000});
  const otherRole=createExamSession(bank,ROLES[1].id,{now:2000});
  const practice=createSession(bank.questions,{mode:'practice',count:'all',role});
  const legacy=createSession(bank.questions,{mode:'exam',count:'20',role});
  const sessions=[otherRole,practice,first,legacy], original=[...sessions];
  assert.equal(ongoingExam(sessions,3000),first,'chọn bài đang chạy cũ nhất, không phụ thuộc vai trò');
  assert.deepEqual(sessions,original,'không sắp xếp lại lịch sử gốc');
  finishSession(first,4000);
  assert.equal(ongoingExam(sessions,4000),otherRole,'vai trò khác cũng chặn tạo bài mới');
  assert.equal(ongoingExam(sessions,otherRole.endTime-1),otherRole);
  assert.equal(ongoingExam(sessions,otherRole.endTime),null,'hết giờ thì có thể tạo đề mới');
  assert.equal(ongoingExam([practice,legacy],3000),null,'không đặt thời hạn mới cho bài cũ hoặc ôn tập');
});

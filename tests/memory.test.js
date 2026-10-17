import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMemoryData, memorySelection, renderMemoryPage } from '../js/memory.js';

const source=JSON.parse(await readFile(new URL('../data/memory-tips.json',import.meta.url),'utf8'));

test('mẹo ghi nhớ: kiểm tra dữ liệu mà không sửa chữ, xuống dòng hoặc khoảng trắng nguồn',()=>{
  const data=structuredClone(source),before=structuredClone(data);
  validateMemoryData(data);
  assert.deepEqual(data,before);
  for(const mutate of [
    data=>{data.schemaVersion=999;},
    data=>{data.chapters=[];},
    data=>{data.chapters[0].sections=[];},
    data=>{data.chapters[0].sections[0].rows=[];},
    data=>{data.chapters[0].sections[0].rows[1].id=data.chapters[0].sections[0].rows[0].id;},
    data=>{delete data.chapters[0].sections[0].rows[0].details;},
    data=>{data.chapters[0].sections[0].rows[0].tip=null;}
  ]) {
    const malformed=structuredClone(source);mutate(malformed);
    assert.throws(()=>validateMemoryData(malformed));
  }
});

test('mẹo ghi nhớ: chọn phần trong đúng chương, đường dẫn sai trở về phần đầu phù hợp',()=>{
  const before=structuredClone(source);
  for(const chapter of source.chapters) {
    for(const section of chapter.sections) {
      const selected=memorySelection(source,chapter.id,section.id);
      assert.equal(selected.chapter.id,chapter.id);
      assert.equal(selected.section.id,section.id);
    }
  }
  const foreign=memorySelection(source,'chapter-3','section-1');
  assert.equal(foreign.chapter.id,'chapter-3');assert.equal(foreign.section.id,'section-4');
  const missing=memorySelection(source,'no-such-chapter','no-such-section');
  assert.equal(missing.chapter.id,'chapter-1');assert.equal(missing.section.id,'section-1');
  assert.deepEqual(source,before,'selection never changes the source hierarchy');
});

test('mẹo ghi nhớ: nội dung Excel được xuất dưới dạng chữ, không trở thành mã HTML',()=>{
  const data=structuredClone(source),row=data.chapters[0].sections[0].rows[0];
  row.topic='<script>window.injected=true</script>';
  row.tip='<img src=x onerror="window.injected=true">';
  row.details=' Hồ sơ & dữ liệu <b>nguyên văn</b>\nDòng thứ hai';
  const before=structuredClone(data);
  const html=renderMemoryPage(data,{chapterId:'chapter-1',sectionId:'section-1',expanded:new Set([row.id])});
  assert.doesNotMatch(html,/<script>|<img src=x|<b>nguyên văn<\/b>/);
  assert.ok(html.includes('&lt;script&gt;window.injected=true&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;window.injected=true&quot;&gt;'));
  assert.ok(html.includes(' Hồ sơ &amp; dữ liệu &lt;b&gt;nguyên văn&lt;/b&gt;\nDòng thứ hai'));
  assert.deepEqual(data,before);
});

test('mẹo ghi nhớ: tải lỗi có thể thử lại, không giữ vĩnh viễn kết quả tải thất bại',async t=>{
  const realFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=realFetch;});
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return calls===1?{ok:false,status:503}:{ok:true,json:async()=>structuredClone(source)};
  };
  const {loadMemoryTips}=await import('../js/memory.js?test-retry');
  await assert.rejects(loadMemoryTips());
  assert.deepEqual(await loadMemoryTips(),source);
  assert.equal(calls,2);
});

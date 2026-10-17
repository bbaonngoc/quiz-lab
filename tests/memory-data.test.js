import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const memory=JSON.parse(await readFile(new URL('../data/memory-tips.json',import.meta.url),'utf8'));
const sections=memory.chapters.flatMap(chapter=>chapter.sections);
const rows=sections.flatMap(section=>section.rows);

test('mẹo ghi nhớ: nguyên cấu trúc Excel 5 chương, 8 phần, 53 nội dung theo thứ tự nguồn',()=>{
  assert.equal(memory.schemaVersion,1);
  assert.equal(memory.title,'BẢNG TỔNG HỢP NỘI DUNG VÀ MẸO NHỚ');
  assert.deepEqual(memory.source,{
    fileName:'tong-hop-noi-dung-va-meo-ghi-nho.xlsx',
    sha256:'8732d35b00716c48391106fc492a643cfa5a9a0c7c4e107a1db09dca69cd1bb1',
    sheet:'Trang tính1'
  });
  assert.deepEqual(memory.chapters.map(c=>c.id),['chapter-1','chapter-2','chapter-3','chapter-4','chapter-5']);
  assert.deepEqual(memory.chapters.map(c=>c.label),['CHƯƠNG 1','CHƯƠNG 2','CHƯƠNG 3','CHƯƠNG 4','CHƯƠNG 5']);
  assert.deepEqual(memory.chapters.map(c=>c.sections.length),[2,1,2,1,2]);
  assert.deepEqual(sections.map(s=>s.id),Array.from({length:8},(_,i)=>`section-${i+1}`));
  assert.deepEqual(sections.map(s=>s.rows.length),[6,7,7,6,6,7,7,7]);
  assert.deepEqual(sections.map(s=>s.label),[
    'PHẦN 1: SẴN SÀNG THAY ĐỔI VÀ VĂN HÓA SỐ',
    'PHẦN 2: CẢI TIẾN QUY TRÌNH','—','PHẦN 1: CÔNG CỤ SỐ',
    'PHẦN 2: ỨNG DỤNG AI','—','PHẦN 1: THỰC THI CHÍNH SÁCH','PHẦN 2: TƯƠNG TÁC SỐ VỚI NGƯỜI DÂN'
  ]);
  assert.equal(rows.length,53);
  assert.equal(new Set(rows.map(r=>r.id)).size,53);
  for (const [i,row] of rows.entries()) {
    assert.deepEqual(Object.keys(row).sort(),['id','stt','topic','details','tip','sourceRow'].sort());
    assert.equal(row.id,`memory-${i+1}`);
    assert.equal(row.stt,i+1);
    assert.equal(row.sourceRow,i+3);
    for (const field of ['topic','details','tip']) {
      assert.equal(typeof row[field],'string');
      assert.ok(row[field].trim().length>0);
    }
  }
});

test('mẹo ghi nhớ: toàn bộ ô chữ, STT và thứ tự hàng khớp bản Excel đã đối chiếu',()=>{
  // Digest pinned after --check compared every cell to the original workbook.
  // Covers every source string, not only the examples displayed in the UI.
  const cells=memory.chapters.flatMap(chapter=>chapter.sections.flatMap(section=>section.rows.map(row=>[
    row.stt,chapter.label,section.label,row.topic,row.details,row.tip,row.sourceRow
  ])));
  assert.equal(createHash('sha256').update(JSON.stringify(cells)).digest('hex'),
    'a47840e5047e65b8e8e772346bfb2c84ce6ccbab0f5c22c7425ef021bbf81056');
});

test('mẹo ghi nhớ: giữ nguyên đánh số chủ đề, mẹo dài, xuống dòng và khoảng trắng gốc',()=>{
  assert.equal(rows[0].topic,'1. Mục đích của chuyển đổi số');
  assert.equal(rows[0].tip,'Người dân cần nhanh hơn – minh bạch hơn – ít đi lại hơn. Chuyển đổi số không nhằm giảm biên chế hay chỉ để hoàn thành chỉ tiêu thi đua.');
  assert.equal(rows[6].topic,'1. Phân biệt quy trình nghiệp vụ, quy trình số và luồng dữ liệu');
  assert.equal(rows[42].details.includes('  cần chú ý'),true);
  assert.equal(rows[37].details.includes('bảo cáo đúng đầu mối'),true);
  assert.equal(rows[52].details.startsWith(' hồ sơ thủ tục hành chính'),true);
  assert.equal(rows[52].details.split('\n').length,3);
  assert.equal(rows[51].details,
    '- Xử lý, trả lời phản ánh về việc thực hiện thủ tục hành chính: 15 ngày làm việc\n'+
    '- Phản ánh do Văn phòng Chính phủ, bộ, ngành hoặc địa phương khác chuyển đến: 12 ngày làm việc\n'+
    '- Phản ánh quá hạn nhưng chưa xử lý xong: Cập nhật kết quả hoặc tiến độ tiếp theo định kỳ 3 ngày làm việc\n'+
    '- Văn phòng UBND Thành phố trả lại kết quả trả lời không phù hợp: 2 ngày làm việc\n'+
    '- Cơ quan xử lý cập nhật lại kết quả sau khi bị trả: 3 ngày làm việc\n'+
    '- Phê duyệt công khai kết quả phản ánh hiện trường trên iHanoi: Không quá 1 ngày làm việc');
});

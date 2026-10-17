# Kế hoạch chuyển QuizLab sang ngân hàng câu hỏi phát hành tập trung

Trạng thái: đã triển khai local, bản hiện hành 2.2.4, gồm converter Admin, 558 câu JSON, thư mục chương/phần, lọc vai trò, chuyển đổi dữ liệu cũ và cập nhật website. Tổng quan ôn một phần hoặc tất cả các phần trong chương; Thi thử có trang riêng, cố định 60 câu/60 phút, 12 câu mỗi chương, tự kết thúc theo hạn đã lưu và không tính điểm. Có nút cài và hướng dẫn thêm vào màn hình chính. Gói GitHub Pages được tạo bằng `npm run build`; hướng dẫn vận hành nằm trong [README](../README.md). Tài liệu dưới đây giữ đặc tả và tiêu chí của kế hoạch đã thực hiện.

## 1. Đánh giá

Phương án một Excel gồm 8 sheet, thuộc 5 chương, chuyển thành JSON trước khi phát hành phù hợp với QuizLab chạy tĩnh, không có backend hoặc đăng nhập. Chương I, III và V có hai phần; Chương II và IV không chia phần. Admin quản lý nguồn; website chỉ đọc ngân hàng chính thức và lưu bài làm, lịch sử, tùy chọn trên thiết bị.

Lợi ích chính:

- Một nguồn dữ liệu được kiểm tra trước khi phát hành, tránh mỗi thiết bị có ngân hàng khác nhau.
- Giao diện người dùng gọn hơn; không cần bộ đọc Excel hoặc thao tác chỉnh sửa câu hỏi trên website.
- Triển khai trên GitHub Pages và sử dụng trực tiếp bằng trình duyệt.
- Có thể đối chiếu thay đổi theo từng chương/phần và từng phiên bản dữ liệu.

Lọc theo vai trò là quy tắc hiển thị và tạo bài. Với website tĩnh không đăng nhập, dữ liệu đóng gói vẫn có thể được tải xuống; đây không phải cơ chế bảo mật bộ câu hỏi theo chức danh.

## 2. Quy ước dữ liệu

### Cấu trúc nguồn

- Nguồn đã kiểm tra: `cau-hoi-on-tap.xlsx`, có 8 sheet và 558 câu. Xem [báo cáo kiểm tra](BAO_CAO_KIEM_TRA_EXCEL.md).
- Cấu hình rõ 5 `chapterId` và 8 `sectionId` ổn định, tên hiển thị, thứ tự, sheet nguồn. Không lấy tên file, số thứ tự sheet hoặc chuỗi tên sheet bị rút ngắn làm định danh.
- Một sheet tương ứng một đơn vị nội dung (`sectionId`). Chương có chia phần thì đơn vị là phần; Chương II và IV dùng một đơn vị cho toàn chương, `partNumber: null`, không tự đặt thêm “Phần 1”.
- Ánh xạ theo đúng tên sheet đã cấu hình; thay đổi thứ tự tab Excel không đổi chương/phần. Sheet ngoài cấu hình được báo rõ; sheet hướng dẫn chỉ bỏ qua nếu đã khai báo.
- Các sheet hiện có tiêu đề tại hàng 1, cùng 10 cột. Mức độ thực tế là Mức 1–4; riêng Chương V – Phần 2 có Mức 1–3. Không yêu cầu mọi phần phải có đủ bốn mức.
- Giữ yêu cầu không có phần giải thích trong giao diện hoặc dữ liệu phát hành mới.

| Chương | Phần | Tên nội dung chính thức | `sectionId` | Sheet nguồn | Số câu |
| --- | --- | --- | --- | --- | ---: |
| I | 1 | Sẵn sàng thay đổi và văn hóa số | `chuong-i-phan-1` | `I.1_San_sang_thay_doi_va_van_ho` | 72 |
| I | 2 | Quản trị đổi mới và cải tiến quy trình | `chuong-i-phan-2` | `I.2_Cải tiến quy trình` | 72 |
| II | Không chia phần | Quản trị dữ liệu địa bàn | `chuong-ii` | `II_Dữ liệu địa bàn` | 72 |
| III | 1 | Sử dụng công cụ làm việc số | `chuong-iii-phan-1` | `III.1_Công cụ số` | 72 |
| III | 2 | Ứng dụng AI hỗ trợ công việc | `chuong-iii-phan-2` | `III.2_Ứng dụng AI` | 72 |
| IV | Không chia phần | An toàn thông tin | `chuong-iv` | `IV_An toàn thông tin` | 72 |
| V | 1 | Tổ chức thực thi chính sách | `chuong-v-phan-1` | `V.1_Thực thi chính sách` | 72 |
| V | 2 | Tương tác số với người dân | `chuong-v-phan-2` | `V.2_Tương tác số` | 54 |

Không đổi tên hoặc sửa dữ liệu trong workbook gốc khi lập kế hoạch. Tên hiển thị đầy đủ lấy từ bảng cấu hình trên, không bị giới hạn theo tên tab Excel.

### Ánh xạ cột

| Cột Excel | Trường JSON | Quy tắc |
| --- | --- | --- |
| ID kỹ thuật, bổ sung nếu cần | `id` | Ổn định qua các lần sửa; không lấy từ nội dung hay vị trí hàng. |
| STT | `stt` | Số thứ tự hiển thị, có thể trống; không tự coi là ID lâu dài. |
| Mức độ | `difficulty` | Giá trị thuộc danh mục cấu hình; trống thành `null`, hiển thị “Chưa phân loại”. |
| Phân loại | `scope` | Chuẩn hóa “Dùng chung” → `shared`, “Chức danh” → `role`. |
| Chức danh | `role` | Bắt buộc khai báo: Chung/Dùng chung/all với câu chung; một vai trò hợp lệ với câu riêng. |
| Nội dung | `question` | Bắt buộc có nội dung sau khi bỏ khoảng trắng thừa. |
| Phương án A–D | `options.A` đến `options.D` | Cả bốn trường bắt buộc có nội dung. |
| Đáp án đúng | `answer` | Bắt buộc; chuẩn hóa chữ thường/khoảng trắng thành A, B, C hoặc D. |
| Cấu hình sheet | `chapterId`, `sectionId` | Tự gán chương và đơn vị nội dung cho tất cả câu trong sheet. |

Sáu trường nội dung bắt buộc là câu hỏi, bốn phương án và đáp án đúng. Theo yêu cầu sửa lọc vai trò mới nhất, Chức danh cũng phải được khai báo rõ; không mặc định role trống thành dùng chung. Metadata khác có thể trống theo các quy tắc sau:

- `Dùng chung`: phải có chức danh “Chung”, “Dùng chung” hoặc `all`, chuẩn hóa thành `all`; chức danh trống là lỗi, chức danh riêng là mâu thuẫn. Workbook hiện dùng “Chung” cho toàn bộ câu chung.
- `Chức danh`: bắt buộc có một trong bốn chức danh hợp lệ. Thiếu hoặc sai chức danh là lỗi chặn phát hành.
- Thiếu `Phân loại` nhưng có chức danh hợp lệ: có thể suy ra phạm vi từ chức danh đã khai báo, ghi rõ cảnh báo trong báo cáo chuẩn hóa.
- Thiếu `Chức danh`, kể cả câu ghi `Dùng chung`: báo lỗi và chặn phát hành; không có cấu hình cho phép mặc định role trống thành chung.
- Giá trị không nhận diện được phải báo lỗi; chỉ chuẩn hóa các cách viết đã khai báo, không đoán gần đúng.

Bốn mã vai trò giữ nguyên từ ứng dụng hiện có:

| Chức danh | Mã |
| --- | --- |
| Bí thư Đảng ủy | `bi-thu-dang-uy` |
| Chủ tịch HĐND | `chu-tich-hdnd` |
| Chủ tịch UBND | `chu-tich-ubnd` |
| Chủ tịch Ủy ban MTTQ | `chu-tich-mttq` |

### ID và phiên bản câu hỏi

Khuyến nghị bổ sung cột ID kỹ thuật do công cụ cấp một lần. Lần chuẩn hóa đầu có thể xuất một bản Excel mới có ID, không sửa file gốc; các lần sau Admin cập nhật trên bản đã có ID. Người soạn không phải tự nhập ID.

Chỉ dùng `sectionId + STT` làm ID nếu STT được cam kết giữ nguyên, không đánh lại số hoặc tái sử dụng sau khi xóa câu. STT hiện bắt đầu lại từ 1 ở từng sheet, kể cả các phần cùng chương, nên `chapterId + STT` sẽ bị trùng. Nếu STT có thể đổi, dùng nó làm ID sẽ làm sai liên kết lịch sử.

- Sửa chính tả hoặc đáp án: giữ ID, thay `revision` tính từ nội dung chuẩn hóa.
- Câu mới hoặc thay thế bằng một câu khác: ID mới; ID đã nghỉ không tái sử dụng.
- Chuyển một câu sang chương/phần khác: giữ ID nếu vẫn là cùng câu hỏi.
- `revision` phản ánh thay đổi nội dung, phương án, đáp án và phạm vi; không phụ thuộc thứ tự dòng hoặc STT hiển thị.

Ví dụ một câu chuẩn hóa:

```json
{
  "id": "q-7b8d66c0-157c-4dd9-9337-e4605c1c10aa",
  "chapterId": "chuong-i",
  "sectionId": "chuong-i-phan-1",
  "stt": 1,
  "difficulty": null,
  "scope": "shared",
  "role": "all",
  "question": "Nội dung câu hỏi mẫu?",
  "options": { "A": "Phương án A", "B": "Phương án B", "C": "Phương án C", "D": "Phương án D" },
  "answer": "B",
  "revision": "<hash-noi-dung>"
}
```

## 3. Công cụ Admin chạy local

Đề xuất Python + openpyxl cho công cụ chuyển đổi. Thư viện chỉ có trên máy Admin; website vẫn dùng JavaScript thuần. openpyxl hỗ trợ đọc workbook ở chế độ read-only; xem [tài liệu chính thức](https://openpyxl.readthedocs.io/en/stable/optimized.html).

Luồng sử dụng dự kiến:

1. Chọn một workbook Excel có 8 sheet câu hỏi, đặt ngoài thư mục được deploy.
2. Chạy lệnh kiểm tra theo cấu hình 5 chương, 8 đơn vị nội dung, sheet, danh mục mức độ và alias chức danh.
3. Nhận báo cáo có file, sheet, hàng, cột, nguyên nhân và thống kê từng chương/phần/vai trò.
4. Sửa lỗi; chạy chuyển đổi để sinh 8 JSON, manifest và báo cáo thay đổi so với bản phát hành trước.
5. Kiểm tra bản preview, sau đó phát hành JSON cùng ứng dụng.

Kiểm tra bắt buộc:

- Đủ 8 sheet nguồn theo cấu hình; mỗi sheet ánh xạ duy nhất vào một đơn vị nội dung. Cho phép hai phần thuộc cùng chương.
- Đúng cột bắt buộc; không có cột trùng gây nhập nhằng; hàng trống được bỏ qua.
- Không thiếu câu hỏi, A/B/C/D hoặc đáp án đúng; đáp án thuộc A/B/C/D.
- Không trùng ID trong cả 8 đơn vị nội dung; STT chỉ cần duy nhất trong từng sheet. So sánh với bản trước, báo rõ mọi thay đổi nội dung hoặc phạm vi trên cùng ID để Admin kiểm tra.
- Phân loại, mức độ và chức danh hợp lệ; câu riêng không được thiếu chức danh.
- Công thức tại ô bắt buộc phải được báo để chuyển thành giá trị, tránh phụ thuộc kết quả Excel đã lưu.
- Câu trùng nội dung và phương án được báo cảnh báo kèm hai vị trí để Admin quyết định; không tự xóa vì có thể xuất hiện có chủ đích ở nhiều chương/phần.
- Báo cáo số câu thêm, sửa, bỏ khỏi bản trước, đặc biệt thay đổi đáp án hoặc phạm vi chức danh.

Công cụ ghi kết quả vào thư mục tạm; chỉ thay bộ đầu ra khi toàn bộ kiểm tra chặn lỗi đã đạt. Có lỗi thì trả mã thoát khác 0 và giữ nguyên dữ liệu phát hành cũ. JSON tạo ra phải xác định được: cùng nguồn/cấu hình thì cùng nội dung và hash, không tự đổi ID mỗi lần chạy.

## 4. Dữ liệu phát hành và nạp trong ứng dụng

Cấu trúc đã triển khai:

```text
tools/bank/                  # Công cụ, cấu hình và hướng dẫn Admin
data/bank-manifest.json      # Phiên bản dữ liệu hiện hành
data/releases/<dataVersion>/
  chuong-i-phan-1.json
  chuong-i-phan-2.json
  chuong-ii.json
  chuong-iii-phan-1.json
  chuong-iii-phan-2.json
  chuong-iv.json
  chuong-v-phan-1.json
  chuong-v-phan-2.json
js/bank.js                   # Nạp, kiểm tra và chuyển phiên bản ngân hàng
```

Manifest chứa `schemaVersion`, `dataVersion`, danh sách 5 chương và 8 đơn vị nội dung. Mỗi đơn vị có `sectionId`, `chapterId`, `partNumber` (hoặc `null`), tên/thứ tự, URL JSON, SHA-256 và số câu. Không nhân đôi dữ liệu ở thư mục chương: số câu chương được cộng từ các đơn vị thuộc chương đó. Dùng đường dẫn tương đối để chạy được trên GitHub Pages có tiền tố repository.

Tách ba số phiên bản: phiên bản ứng dụng, phiên bản dữ liệu và phiên bản cấu trúc IndexedDB. Sửa câu hỏi không buộc phải thay cấu trúc lưu trữ cá nhân.

Excel nguồn, công cụ Admin, báo cáo và bản sao dữ liệu cũ cá nhân không nằm trong gói deploy. JSON đã sinh được review và kiểm tra lại bằng CI trước khi đưa lên GitHub Pages.

## 5. Giao diện và bộ lọc

- Giữ chọn vai trò lần đầu, thay đổi vai trò trong Cài đặt và hai chế độ làm bài. Từ bản 2.2.0, Thi thử cố định 60 câu/60 phút theo thuật toán cân bằng chương/chức danh; không chọn số câu hoặc bộ lọc cho đề thi mới.
- Ngân hàng mở đầu bằng 5 thư mục chương; Chương I, III, V mở danh sách hai thư mục phần, sau đó mới hiển thị câu hỏi. Chương II và IV mở thẳng danh sách câu hỏi, không tạo thêm cấp phần giả.
- Mỗi thư mục có tên và số câu phù hợp vai trò/bộ lọc đang áp dụng; bố cục hàng gọn, có thể bấm cả hàng, thao tác được bằng bàn phím. Các thư mục là điều hướng trong ứng dụng, không phải thư mục do người dùng tự quản lý.
- Có đường dẫn điều hướng và nút quay lại, ví dụ “Ngân hàng câu hỏi / Chương I / Phần 1”. Nút Back/Forward của trình duyệt và tải lại trang giữ đúng vị trí; thư mục không còn hợp lệ thì về cấp cha phù hợp.
- Giữ tìm kiếm, bộ lọc Mức độ và Tất cả–Dùng chung–Theo chức danh trong phạm vi thư mục đang xem. Thay vai trò phải tính lại danh sách và số đếm, không lộ câu riêng của vai trò khác.
- Thiết lập Ôn tập có lựa chọn Chương và Phần phụ thuộc chương; có thể chọn một phần hoặc tất cả phần trong chương. Thi thử luôn lấy đủ 12 câu mỗi chương theo vai trò. Chương II, IV không có lựa chọn “Phần 1”. Hiển thị số câu thực tế phù hợp. Bộ lọc “Theo chức danh” luôn là vai trò đang chọn, không cho chọn bộ riêng của vai trò khác.
- Thứ tự lọc: điều kiện vai trò → chương → phần/đơn vị nội dung → mức độ → chung/riêng → tìm kiếm nếu có. Số đếm và nguồn tạo bài dùng cùng quy tắc.
- Không có câu phù hợp thì giải thích ngắn và vô hiệu hóa nút bắt đầu. Thi thử thiếu số câu chung theo phân bổ 12 câu/chương phải báo lỗi và dừng tạo đề, không tự tạo đề ít hơn 60 câu.
- Lưu các lựa chọn bộ lọc cho lần sau; khi đổi vai trò hoặc dữ liệu, kiểm tra lại giá trị còn hợp lệ.
- Xóa Import/Thêm/Sửa/Xóa, chọn hàng/xóa hàng loạt, tải mẫu và khôi phục câu mẫu. Gỡ cả handler, hàm ghi ngân hàng và module đọc Excel khỏi bản website, không chỉ ẩn nút.
- Sao lưu/khôi phục dữ liệu cá nhân chỉ xử lý bài làm và tùy chọn; không được ghi đè ngân hàng chính thức.

Giao diện tiếp tục dùng bảng màu và bố cục tối giản hiện tại; không cần thiết kế lại toàn bộ.

Cây thư mục hiển thị:

```text
Ngân hàng câu hỏi
├── Chương I
│   ├── Phần 1: Sẵn sàng thay đổi và văn hóa số
│   └── Phần 2: Quản trị đổi mới và cải tiến quy trình
├── Chương II: Quản trị dữ liệu địa bàn
├── Chương III
│   ├── Phần 1: Sử dụng công cụ làm việc số
│   └── Phần 2: Ứng dụng AI hỗ trợ công việc
├── Chương IV: An toàn thông tin
└── Chương V
    ├── Phần 1: Tổ chức thực thi chính sách
    └── Phần 2: Tương tác số với người dân
```

Với dữ liệu hiện tại và chưa lọc mức độ/chung-riêng, mỗi vai trò thấy 372 câu. Số đếm thư mục Chương I/II/III/IV/V lần lượt là 96/48/96/48/84. Các phần có 48 câu phù hợp, riêng Chương V – Phần 2 có 36 câu. Không dùng số 558 của toàn bộ nguồn để hiển thị như số câu khả dụng cho một vai trò.

## 6. Giữ lịch sử và chuyển đổi dữ liệu cũ

Ba vấn đề của mã bản 1.4 đã được xử lý trong quá trình triển khai:

1. `imported-bank` từng được ưu tiên, che ngân hàng mới; hiện được lưu trữ riêng, không còn là nguồn tạo bài.
2. ID sinh theo nội dung từng thay đổi khi sửa câu; converter hiện cấp ID một lần và ghi vào Excel chuẩn hóa. Bộ đọc snapshot cũ giữ ID cũ.
3. Service Worker từng cập nhật một `questions.json`; hiện dữ liệu có manifest và 8 JSON theo phiên bản, kiểm tra đủ trước khi áp dụng.

Chuyển đổi một lần, có dấu mốc để chạy lại an toàn:

- Giữ nguyên database `quizlab`, kho bài làm, vai trò và tùy chọn; không gọi xóa database khi nâng cấp.
- Ngừng dùng `imported-bank` và `bundled-bank` cũ làm nguồn chính thức. Lưu bản cũ vào dữ liệu lưu trữ chuyển đổi hoặc cho xuất sao lưu, không âm thầm xóa nguồn riêng từng nhập.
- Chỉ đánh dấu chuyển đổi nguồn hoàn tất khi đã có ngân hàng chính thức tải đủ và kiểm tra thành công. Nếu mất mạng trước bước đó, giữ khả năng mở và tiếp tục bài cũ; không hứa có ngân hàng mới khi chưa tải.
- Giữ nguyên ID và snapshot trong các bài đã có; không viết lại đáp án hay chấm lại lịch sử theo bộ mới.
- Bài mới lưu `bankVersion`, bộ lọc, vai trò, revision và snapshot đầy đủ của câu hỏi, đáp án, thứ tự lựa chọn. Bài đang làm tiếp tục bằng snapshot ban đầu.
- “Ôn câu sai” cho bài mới đối chiếu ID với ngân hàng hiện hành, dùng nội dung mới và lọc đúng vai trò. Câu đã rút khỏi ngân hàng vẫn xem được trong bài cũ nhưng không được đưa vào bài mới.
- Không tự suy đoán liên kết giữa ID hash cũ và ID chính thức mới. Nếu có thể xác minh cùng câu, cung cấp bảng ánh xạ; nếu không, giữ câu sai cũ trong lịch sử thay vì gán nhầm.
- Theo dõi kết quả ôn sai theo ID và revision để lần trả lời đúng ở nội dung cũ không xóa nhầm lỗi của nội dung mới. Lịch sử vẫn giữ kết quả và câu trả lời tại thời điểm làm; Thi thử từ bản 2.2.0 không tính điểm.
- Khôi phục bản sao lưu cũ vẫn được đọc các snapshot; phần ngân hàng trong bản sao lưu không thay nguồn chính thức.

Cam kết ở đây là bản cập nhật ứng dụng không chủ động xóa dữ liệu cá nhân. Việc giữ lịch sử khi deploy còn đòi hỏi giữ cùng origin; nếu chuyển sang tên miền khác cần xuất/nhập dữ liệu cá nhân.

## 7. Cập nhật website và ngân hàng

Luồng đề xuất:

1. Khi mở ứng dụng, quay lại ứng dụng hoặc có mạng trở lại, kiểm tra manifest mới; không chặn việc dùng phiên bản đã lưu.
2. Nếu phiên bản mới tương thích, tải cả 8 JSON của phiên bản mới.
3. Kiểm tra cấu trúc, đúng 5 chương/8 đơn vị nội dung, hash, số câu, ID và phạm vi chức danh.
4. Chỉ chuyển ngân hàng trong IndexedDB sau khi toàn bộ dữ liệu đã tải và hợp lệ. Nếu tải lỗi, thiếu bộ nhớ hoặc kiểm tra sai, tiếp tục dùng bộ cũ. Cache trình duyệt chỉ là tối ưu tùy chọn, không chặn việc nhận dữ liệu hợp lệ.
5. Bài mới dùng bộ hiện hành; bài đang làm giữ nguyên snapshot. Thông báo cập nhật ngắn, không buộc tải lại giữa bài.
6. Dọn cache cũ sau khi bản mới hoàn tất và các tab liên quan không còn cần dữ liệu cũ; không xóa kho lịch sử. Tải dữ liệu và đổi phiên bản cần phối hợp giữa nhiều tab.

Giao diện hiển thị trạng thái kết nối mạng. Manifest mới phải được kiểm tra qua mạng; JSON theo phiên bản không được thay nội dung tại cùng URL.

Nếu schema mới đòi hỏi mã ứng dụng mới, giữ bộ đang dùng cho đến khi ứng dụng tương thích được kích hoạt ở thời điểm an toàn. Vòng đời cài đặt/kích hoạt của Service Worker có giai đoạn chờ; cần xử lý cập nhật mã riêng với cập nhật dữ liệu, theo [tài liệu MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#updating_your_service_worker). Trình duyệt không hỗ trợ cơ chế này vẫn dùng website qua mạng; kiểm tra ngân hàng độc lập với Service Worker và tải lại trang để nhận giao diện mới.

“Tự nhận dữ liệu mới” nghĩa là tự kiểm tra và tải khi ứng dụng có cơ hội chạy và có mạng. Không cam kết cập nhật nền khi người dùng đã đóng ứng dụng hoàn toàn.

## 8. Các giai đoạn thực hiện

| Giai đoạn | Công việc | Kết quả cần đạt |
| --- | --- | --- |
| 1. Chốt quy ước | Đã kiểm tra workbook thật và xác định 5 chương/8 đơn vị, mức độ, scope, alias; chốt cơ chế cấp/giữ ID. | Tài liệu schema và workbook mẫu chuẩn hóa. |
| 2. Công cụ Admin | Viết converter cho một workbook nhiều sheet, cấp/giữ ID, kiểm tra lỗi, báo cáo thay đổi, tạo manifest và 8 JSON. | Đủ 8 sheet chuyển đổi được; có lỗi không thay đầu ra cũ. |
| 3. Nguồn dữ liệu chính thức | Viết loader/validator; sửa model để giữ metadata; chuyển đổi nguồn cũ; lưu snapshot tương thích. | Ngân hàng phát hành là nguồn duy nhất cho bài mới; lịch sử và bài cũ mở được. |
| 4. Giao diện chỉ đọc | Gỡ CRUD/import; thêm duyệt thư mục chương/phần, đường dẫn điều hướng, bộ lọc và số đếm; cập nhật sao lưu cá nhân, ôn sai và lưu lựa chọn. | Mở đúng thư mục/câu hỏi, không có đường ghi ngân hàng qua giao diện; các vai trò nhận đúng câu. |
| 5. Cập nhật an toàn | Đổi ngân hàng sau kiểm tra, cache tùy chọn, giữ bộ cũ khi lỗi, phối hợp nhiều tab. | Không trộn chương, không gián đoạn bài đang làm; thiếu/chặn cache không chặn tải ngân hàng. |
| 6. Kiểm thử và phát hành | Kiểm thử dữ liệu, model, trình duyệt và chuyển đổi; CI kiểm tra JSON; sửa gói deploy/hướng dẫn. | Bản preview đạt tiêu chí nghiệm thu, rồi phát hành GitHub Pages. |

Ưu tiên làm luồng hoàn chỉnh với một sheet/phần trước, sau đó chạy đủ 8 sheet thuộc 5 chương; không cần đợi hoàn tất toàn bộ giao diện mới kiểm tra được converter và dữ liệu.

## 9. Tiêu chí nghiệm thu

- Đúng 5 chương và 8 đơn vị nội dung theo bảng cấu hình; mọi câu có ID duy nhất và phạm vi hợp lệ.
- Ngân hàng hiển thị 5 thư mục chương theo thứ tự I–V; I/III/V có hai thư mục phần, II/IV mở thẳng câu hỏi. Đường dẫn điều hướng, Back/Forward và tải lại trang hoạt động đúng.
- Đổi thứ tự tab Excel không đổi chương/phần; tên hiển thị đầy đủ không phụ thuộc tên sheet rút ngắn.
- Cả bốn vai trò đều chỉ thấy câu chung và câu riêng đúng vai trò, kể cả khi kết hợp tất cả bộ lọc, tạo bài và ôn câu sai.
- Bộ lọc có kết quả rỗng, thiếu mức độ và số câu ít hơn mức chọn được xử lý đúng.
- Đảo đáp án hoặc giữ thứ tự gốc vẫn chấm đúng, kể cả sau tải lại trang và tiếp tục bài.
- Import lỗi ID, nội dung, đáp án, chức danh, sheet hoặc chương đều có vị trí lỗi rõ ràng và không xuất bản một phần.
- Sửa câu không đổi ID; thêm/xóa/đổi đáp án hiện trong báo cáo phát hành.
- Mở website đã deploy bằng trình duyệt để duyệt cả 5 chương/8 đơn vị nội dung, làm bài, lưu và xem lịch sử; không yêu cầu cài app.
- Nâng cấp từ bản hiện tại giữ vai trò, tùy chọn, lịch sử và bài đang làm; ngân hàng từng nhập không che bộ mới.
- Giả lập mất mạng giữa chừng, JSON lỗi/hash sai, cập nhật khi đang làm bài và nhiều tab: giữ được bộ hợp lệ, không mất dữ liệu cá nhân.
- Bản sao lưu cũ xem được bài đã làm nhưng không thay ngân hàng chính thức.
- Bản deploy không chứa Excel nguồn, module import, công cụ Admin hoặc thao tác sửa/xóa câu hỏi.

Các lệnh chạy, cập nhật Excel và đóng gói hiện có trong [README](../README.md). Thay đổi tiếp theo cho trang Tổng quan được tách thành [kế hoạch riêng](KE_HOACH_DIEU_CHINH_TONG_QUAN.md).

# QuizLab

Ứng dụng ôn tập và thi thử trắc nghiệm bằng HTML, CSS, JavaScript thuần. Giao diện tiếng Việt, dùng trên điện thoại và máy tính; không có backend, tài khoản đăng nhập hoặc API AI.

**Phiên bản ứng dụng:** 2.3.7 · **Phiên bản ngân hàng:** 2026.10.15.1.

Dữ liệu hiện tại: **558 câu hỏi**, thuộc **5 chương và 8 phần/chủ đề**; **53 mục Mẹo ghi nhớ** từ Excel. Mỗi chức danh có **372 câu phù hợp**, gồm 310 câu chung và 62 câu riêng.

## Chạy trên máy

Cần **Node.js 22 trở lên**. Tại thư mục dự án có `package.json`, chạy:

```sh
npm start
```

Mở **http://127.0.0.1:4173**. Không cần `npm install` để chạy giao diện; Python chỉ cần cho công cụ xử lý Excel. Không mở trực tiếp `index.html` bằng `file://`.

## Chức năng chính

Lần đầu sử dụng, chọn một trong bốn chức danh: **Bí thư Đảng ủy, Chủ tịch HĐND, Chủ tịch UBND, Chủ tịch Ủy ban MTTQ**. Có thể đổi tại **Cài đặt**. Ngân hàng, ôn tập, thi thử và ôn câu sai đều lọc câu chung cùng câu riêng của chức danh đã chọn; câu thiếu hoặc sai chức danh không được tự coi là câu chung.

| Mục | Chức năng |
| --- | --- |
| **Ôn tập** | Thống kê ngắn gọn và thiết lập ôn tập. Mỗi khi mở trang hoặc tải lại, mặc định **Tất cả các phần** trong chương đang chọn; vẫn có thể chọn riêng từng phần trước khi bắt đầu. Làm toàn bộ câu phù hợp, không chọn số lượng, mức độ hay phân loại tại đây. |
| **Ôn tập** | Không giới hạn thời gian; mỗi câu trả lời một lần và hiển thị đúng/sai, đáp án đúng ngay. Có bật/tắt trộn câu hỏi, đảo đáp án; lưu lựa chọn cho lần sau. Trên mobile, chuyển câu bằng nút trước/tiếp hoặc số câu sẽ đưa nội dung câu mới về đầu vùng nhìn thấy. Trang kết quả hiển thị đúng/sai/bỏ trống; điểm ôn tập thang 10 vẫn xem được ở Lịch sử. |
| **Thi thử** | Đề ngẫu nhiên 60 câu/60 phút; được đổi hoặc bỏ lựa chọn trước khi nộp. Kết quả chỉ thống kê đúng/sai/bỏ trống, không tính điểm. |
| **Lịch sử** | Lưu bài đang làm và bài đã hoàn thành; tiếp tục hoặc xem lại bài, lọc câu sai/bỏ trống/đánh dấu. Trên mobile có hai mục **Bài làm** và **Câu cần ôn**; thanh điều hướng dưới còn 6 tab với biểu tượng và vùng bấm lớn hơn. |
| **Câu cần ôn** | Ôn lại câu sai dựa trên lần trả lời gần nhất và ngân hàng hiện hành, theo đúng chức danh. Trên mobile mở tại **Lịch sử → Câu cần ôn**; máy tính giữ mục riêng trên sidebar. |
| **Ngân hàng** | Duyệt thư mục Chương → Phần → Câu hỏi; tìm kiếm và lọc mức độ, câu chung/câu riêng. Người học không nhập, thêm, sửa hoặc xóa câu hỏi. |
| **Mẹo ghi nhớ** | Chọn chương/phần; bảng hai cột 35%/65%, mẹo hiển thị đầy đủ, chi tiết mở/thu theo hàng hoặc toàn bộ phần. Nội dung giữ nguyên từ Excel; chuyển bố cục dọc trên điện thoại. |
| **Cài đặt** | Đổi chức danh, sao lưu/khôi phục và kiểm tra cập nhật. |

Ứng dụng không hiển thị giải thích cho câu hỏi. Bài làm hỗ trợ chuyển câu, đánh dấu, hiển thị tiến độ và tự lưu trên thiết bị.

## Cấu trúc ngân hàng

| Chương | Phần/chủ đề |
| --- | --- |
| I | I.1 — Sẵn sàng thay đổi và văn hóa số |
| I | I.2 — Quản trị đổi mới và cải tiến quy trình |
| II | Quản trị dữ liệu địa bàn |
| III | III.1 — Sử dụng công cụ làm việc số |
| III | III.2 — Ứng dụng AI hỗ trợ công việc |
| IV | An toàn thông tin |
| V | V.1 — Tổ chức thực thi chính sách |
| V | V.2 — Tương tác số với người dân |

Chương II và IV mở thẳng câu hỏi vì không chia phần. Tên chương/phần của Mẹo ghi nhớ được giữ riêng theo Excel nguồn, có thể ngắn hơn tên trong ngân hàng.

## Quy tắc thi thử

- Mỗi lượt mới lấy mẫu từ toàn bộ câu hợp lệ trong **8 chủ đề**, không dùng bộ đề cố định. Bốn chủ đề lấy 8 câu, bốn chủ đề lấy 7 câu; chủ đề nhận từng mức được chọn ngẫu nhiên mỗi lượt.
- Trong từng chủ đề lấy 4 chung + 4 riêng, 4 chung + 3 riêng hoặc 3 chung + 4 riêng; toàn đề có đúng **30 câu chung + 30 câu riêng**, không trùng ID và được trộn sau khi chọn.
- Nếu nhóm nào thiếu câu, báo rõ chủ đề, chức danh và số câu cần/có; dừng tạo đề, không bù từ chức danh hoặc nhóm khác.
- Đề, thứ tự phương án, đáp án gốc, câu trả lời, tiến độ và hạn kết thúc được lưu cố định. Tải lại, thoát rồi mở lại không tạo lại đề hoặc gia hạn.
- Thời hạn tính từ lúc bắt đầu: `endTime = startTime + 60 phút`. Hết giờ tự kết thúc khi ứng dụng đang mở; nếu đã đóng, lần mở sau kiểm tra hạn và kết thúc bài trước khi cho tiếp tục.
- Khi còn bài thi chưa nộp và chưa hết giờ, không được tạo bài mới, kể cả đổi chức danh hoặc mở nhiều tab trên cùng trình duyệt. Chọn đúng chức danh của bài để tiếp tục.
- Số lần thi tăng theo các bài đã bắt đầu. Bài cũ được giữ nguyên đề, đáp án và thời hạn khi nâng cấp.

## Cài lên màn hình chính

Mở website qua **HTTPS** hoặc dùng localhost khi phát triển. Trên máy tính, nút **Cài ứng dụng** trong sidebar mở hướng dẫn hoặc hộp cài của trình duyệt. Trên điện thoại, dùng menu của trình duyệt theo hướng dẫn bên dưới.

- **iPhone/iPad:** Safari → Chia sẻ → Thêm vào Màn hình chính.
- **Android:** Chrome → menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.
- **Máy tính:** dùng biểu tượng cài đặt trên thanh địa chỉ Chrome/Edge khi trình duyệt hỗ trợ.

Đây là website có Manifest và Service Worker; không cần biên dịch thành ứng dụng điện thoại.

## Lưu dữ liệu và cập nhật

Bài làm, lịch sử, chức danh và thiết lập được lưu trong **IndexedDB của từng trình duyệt và thiết bị**, theo origin của website (giao thức, tên miền, cổng), không theo đường dẫn URL. Không tự đồng bộ giữa các thiết bị; đổi origin sẽ dùng vùng lưu trữ khác. Dùng **Cài đặt → Sao lưu & khôi phục** để xuất/nhập JSON. Khôi phục giữ bài đã có cùng ID, không thay ngân hàng chính thức. Xóa dữ liệu trang web có thể làm mất lịch sử nếu chưa sao lưu.

Khi có mạng và ứng dụng đang mở, ngân hàng được kiểm tra khi khởi động, quay lại trang hoặc có kết nối trở lại. Chỉ áp dụng khi tải đủ và kiểm tra hợp lệ cấu trúc, hash SHA-256, ID, đáp án, chức danh và số câu; lỗi thì giữ bộ đã lưu. Bài đang làm và lịch sử giữ bản sao câu hỏi tại thời điểm tạo bài.

Service Worker hỗ trợ quản lý phiên bản và cache của trình duyệt. Bản mã mới được áp dụng khi không ở màn hình làm bài và thao tác đã lưu xong; đang làm bài thì **Lưu & thoát** trước. Có thể chủ động dùng **Cài đặt → Kiểm tra cập nhật**. Cập nhật không chủ động xóa IndexedDB; không cam kết cập nhật nền khi đã đóng ứng dụng.

## Cập nhật nội dung từ Excel — dành cho Admin

Người học chỉ đọc JSON đã phát hành. Công cụ Admin chạy riêng trên máy local, cần **Python 3.10 trở lên** và `openpyxl`:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/bank/requirements.txt
```

### Ngân hàng câu hỏi

Một workbook gồm 8 sheet, mỗi sheet tương ứng một phần/chủ đề. Tên sheet và ánh xạ được khai báo trong [tools/bank/config.json](tools/bank/config.json).

- Bắt buộc có câu hỏi, phương án A/B/C/D, đáp án đúng và chức danh hợp lệ; câu chung ghi rõ **Chung**.
- STT và mức độ có thể trống. Phân loại gồm **Dùng chung/Chức danh**; thiếu phân loại nhưng có chức danh hợp lệ được suy ra kèm cảnh báo. Thiếu chức danh là lỗi.
- ID được cấp trong bản Excel chuẩn hóa. Giữ ID khi sửa câu hiện có, để trống cho câu mới; không tái sử dụng ID câu đã rút. Dùng bản Excel đã có ID cho các lần cập nhật sau.
- Công cụ báo lỗi ô công thức, đáp án sai, ID trùng, chức danh không hợp lệ; nội dung trùng được cảnh báo để Admin kiểm tra.

Ví dụ phát hành phiên bản dữ liệu tiếp theo, thay đường dẫn bằng file nguồn trên máy:

```sh
npm run bank:import -- /duong-dan/cau-hoi-co-id.xlsx --version 2026.10.15.2 --output data --check
npm run bank:import -- /duong-dan/cau-hoi-co-id.xlsx --version 2026.10.15.2 --output data
```

Đọc `tools/bank/output/report.json` trước khi phát hành. Bản Excel có ID nằm tại `tools/bank/output/cau-hoi-co-id.xlsx`; giữ file này làm nguồn lần sau. `--check` chỉ kiểm tra và ghi báo cáo, không phát hành JSON. Cần tăng `--version` khi nội dung đổi; không sửa trực tiếp JSON của phiên bản cũ. File Excel nguồn và kết quả local không được đưa vào Git.

### Mẹo ghi nhớ

Workbook có sheet mặc định `Trang tính1`, tiêu đề ở A1 và hàng 2 gồm: **STT, Chương, Phần, Chủ đề / Nội dung, Nội dung chi tiết, Mẹo nhớ**.

```sh
python tools/memory/convert.py /duong-dan/tong-hop-noi-dung-va-meo-ghi-nho.xlsx
python tools/memory/convert.py /duong-dan/tong-hop-noi-dung-va-meo-ghi-nho.xlsx --check
```

JSON được ghi tại `data/memory-tips.json`. `--check` đối chiếu từng ô và thứ tự với Excel, không ghi file. Giữ nguyên chữ, dấu câu, xuống dòng và khoảng trắng. Xem thêm [hướng dẫn công cụ](tools/memory/README.md). Khi thay nguồn, cập nhật các giá trị đối chiếu trong kiểm thử theo đúng Excel mới.

## Kiểm tra và đóng gói

```sh
npm test
npm run bank:validate
npm run build
```

Kiểm thử công cụ Excel, sau khi kích hoạt môi trường Python ở trên:

```sh
npm run test:admin
python -m unittest discover -s tools/memory -p 'test_*.py'
```

Kiểm tra giao diện bằng Chrome đã cài trên máy:

```sh
npm run test:browser
```

Có thể đặt `CHROME_PATH` để dùng Chrome/Edge ở vị trí khác. Kiểm tra giao diện sử dụng profile tạm, mặc định cổng 4174; không dùng profile cá nhân.

`npm run build` kiểm tra dữ liệu rồi tạo **dist/**, gồm giao diện, Manifest, Service Worker, icon, 8 JSON câu hỏi và JSON Mẹo ghi nhớ. Excel nguồn, công cụ Admin, tài liệu và kiểm thử không được đưa vào bản website.

## Triển khai GitHub Pages

Repository: [bbaonngoc/quiz-lab](https://github.com/bbaonngoc/quiz-lab).

Trong repository, chọn **Settings → Pages → Source → GitHub Actions**. Push mã và JSON đã kiểm tra lên `main`; workflow [pages.yml](.github/workflows/pages.yml) chạy kiểm thử JavaScript, kiểm thử công cụ ngân hàng, build và deploy `dist/`. Kiểm thử trình duyệt và công cụ Mẹo ghi nhớ hiện chạy riêng, chưa có trong workflow.

Phiên bản ứng dụng nằm tại `js/app.js`, `sw.js`, `package.json`: tăng đồng bộ khi đổi mã hoặc Mẹo ghi nhớ để phát hành qua cache mới. Phiên bản ngân hàng ở `data/bank-manifest.json` độc lập; cập nhật câu hỏi bằng bản dữ liệu mới. Chỉ sửa tài liệu thì không cần tăng phiên bản ứng dụng.

## Các file chính

```text
js/app.js                 Giao diện, điều hướng và cập nhật
js/model.js               Câu hỏi, bài làm, kết quả và vai trò
js/exam.js                Lấy mẫu đề thi theo 8 chủ đề
js/memory.js              Hiển thị Mẹo ghi nhớ
js/db.js                  Lưu bài làm và thiết lập bằng IndexedDB
js/bank.js                Tải và áp dụng ngân hàng
js/bank-schema.js         Kiểm tra dữ liệu và lọc câu hỏi
js/quiz-config.js         Thiết lập bài làm
js/icons.js               Biểu tượng SVG
styles.css                Giao diện responsive
manifest.webmanifest      Thông tin cài ứng dụng
sw.js                     Service Worker và phiên bản cache
data/bank-manifest.json   Danh mục và phiên bản ngân hàng
data/releases/            JSON câu hỏi theo phiên bản
data/memory-tips.json     Nội dung Mẹo ghi nhớ
tools/bank/               Công cụ Excel ngân hàng câu hỏi
tools/memory/             Công cụ Excel Mẹo ghi nhớ
scripts/                  Server local, kiểm tra và build
tests/                    Kiểm thử tự động
```

Tài liệu trong `docs/` được giữ trên máy local và loại khỏi Git bằng `.gitignore`.

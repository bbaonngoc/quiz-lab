# QuizLab — Web Quiz

HTML/CSS/JavaScript thuần, tiếng Việt, không backend hoặc đăng nhập. Bản **2.3.0** dùng ngân hàng chính thức chỉ đọc: **558 câu, 5 chương, 8 mục nội dung**, nhập từ một workbook Excel có 8 sheet bằng công cụ Admin chạy local. Mỗi vai trò có 372 câu phù hợp (310 chung + 62 riêng). Có thêm **53 mục Mẹo ghi nhớ**, theo 5 chương và 8 phần, giữ nguyên nội dung Excel. Người dùng mở địa chỉ website đã deploy để học và làm bài.

## Mở giao diện

Cần Node.js 22 trở lên, không cần `npm install`:

```sh
cd /Users/baongoc/quiz-app
npm start
```

Mở **http://127.0.0.1:4173**. Trên máy khác, chuyển đến thư mục dự án rồi chạy `npm start`. Dùng HTTP/HTTPS; không mở trực tiếp `index.html` bằng `file://`.

## Chức năng

- Lần đầu chọn Bí thư Đảng ủy / Chủ tịch HĐND / Chủ tịch UBND / Chủ tịch Ủy ban MTTQ; đổi tại Cài đặt.
- Ôn tập: xem đúng/sai ngay, mỗi câu trả lời một lần. Thi thử: đổi/bỏ đáp án trước khi xác nhận nộp.
- **Tổng quan → Ôn tập theo phần:** chọn chương rồi chọn riêng một phần hoặc **Tất cả các phần** để ôn cả chương; lưu lựa chọn cho lần sau. Luôn lấy toàn bộ câu Chung và câu riêng phù hợp vai trò trong phạm vi đã chọn. Không có trường Mức độ, Phân loại hoặc Số câu hỏi. Chương II/IV ôn cả chương; mỗi mục có 48 câu phù hợp, riêng Chương V – Phần 2 có 36 câu. Ôn tất cả các phần: Chương I/III có 96 câu, Chương V có 84 câu.
- **Menu → Thi thử:** Bài thi thử lần X, 60 câu trong 60 phút; lấy mẫu ngẫu nhiên từ cả 8 chủ đề, bốn chủ đề lấy 8 câu và bốn chủ đề lấy 7 câu. Toàn đề đúng 30 câu Chung + 30 câu riêng theo chức danh. Thiếu nhóm nào thì báo rõ chủ đề, chức danh và số câu cần/có; dừng tạo đề.
- Giới hạn số câu/mức độ/phân loại của bản cũ không tác động ôn tập toàn phần hoặc cấu trúc Thi thử 60 câu/60 phút. Tiếp tục và Lưu & thoát quay về đúng trang theo chế độ của bài.
- Trộn câu hỏi, bật/tắt đảo đáp án; lưu tùy chọn ngay. Chấm theo mã đáp án gốc nên không bị sai khi đổi vị trí.
- Chuyển câu, đánh dấu, tiến độ và tự lưu IndexedDB; tiếp tục bài sau khi đóng trang. Giữ vị trí cuộn của danh sách câu hỏi và toàn trang khi chuyển câu, chọn đáp án hoặc đánh dấu, kể cả trên điện thoại và tablet.
- Chọn đáp án chỉ lưu bài hiện tại, không đọc lại toàn bộ lịch sử. Hiển thị trạng thái đang lưu; thao tác lưu bị treo quá 10 giây được hủy và báo lỗi để thử lại. Nếu chưa tải được trang, có nút Thử lại; đề, đáp án đã lưu và thời hạn thi được giữ nguyên.
- Ôn tập tính điểm thang 10, làm tròn một chữ số. Thi thử không tính điểm: chỉ thống kê đúng/sai/bỏ trống; điểm trung bình ở Tổng quan chỉ tính bài ôn tập.
- Xem lại bài và lọc câu sai/bỏ trống/đánh dấu. Chỉ hiển thị đáp án lưu sẵn, không có giải thích hay AI API.
- Ngân hàng duyệt theo thư mục, có tìm kiếm và bộ lọc. Không có thao tác nhập/thêm/sửa/xóa câu hỏi.
- **Mẹo ghi nhớ:** chọn chương/phần, đọc nguyên văn mẹo; nhấn vào hàng để xem/ẩn nội dung chi tiết hoặc dùng Mở tất cả/Thu gọn. Bảng có hai cột 35%/65%, chuyển sang bố cục dọc trên điện thoại.
- Lịch sử và bài đang làm lưu bản sao câu hỏi, đáp án và thứ tự lựa chọn tại thời điểm tạo bài. Đề thi, số lần thi và hạn kết thúc được lưu cố định trong IndexedDB; refresh không tạo lại đề hoặc gia hạn.
- Ôn sai dùng câu hỏi hiện hành có cùng ID và đúng vai trò. Câu đã rút khỏi ngân hàng hoặc ID cũ không đối chiếu được chỉ còn trong lịch sử. Trả lời đúng ở revision cũ không xóa lỗi ở revision mới; bỏ trống không xóa lỗi cũ.
- Sao lưu/khôi phục bài làm, vai trò và thiết lập cá nhân; không thay ngân hàng chính thức.
- Sử dụng qua trình duyệt; tự kiểm tra dữ liệu khi mở/quay lại trang hoặc có mạng trở lại.

## Thi thử 60 câu / 60 phút

Trước khi thi hiển thị **Bài thi thử lần X**, thời gian 60 phút, số câu 60 và lưu ý: “Tiến trình được tự động lưu khi thoát. Thời gian thi vẫn tiếp tục đếm và bài thi tự kết thúc khi hết 60 phút.” Bắt đầu bài mới tăng số lần thi theo tất cả bài đã bắt đầu trên trình duyệt, kể cả bài chưa nộp và bài cũ; tiếp tục bài giữ nguyên số lần, đề và thời hạn. Khi còn bài thi chưa nộp và chưa hết giờ, nút Bắt đầu thi bị khóa; chỉ có thể tiếp tục bài đang làm. Quy tắc áp dụng cả khi đổi vai trò hoặc mở nhiều tab. Nộp bài hoặc hết giờ mới cho tạo đề mới; thao tác bị chặn không tăng số lần thi và không thay đề/thời hạn. Nếu bài đang làm thuộc vai trò khác, chọn lại vai trò đó để tiếp tục. Dữ liệu cũ hoặc sao lưu có nhiều bài đang chạy vẫn được giữ nguyên; xử lý bài cũ nhất trước, và không tạo thêm khi còn bài chưa kết thúc.

Từ bản 2.2.5, mỗi lượt mới trộn ngẫu nhiên 8 chủ đề: bốn chủ đề lấy 4 Chung + 4 riêng, hai chủ đề lấy 4 Chung + 3 riêng, hai chủ đề lấy 3 Chung + 4 riêng. Mỗi chủ đề lấy mẫu từ toàn bộ nguồn câu hợp lệ; không lấy câu của chức danh khác hoặc câu thiếu role. Thiếu nhóm nào thì báo rõ chủ đề, chức danh và số câu cần/có, không bù từ nhóm khác, không lưu bài hoặc tăng số lần thi. Gộp và trộn cả 60 câu, không trùng ID; toàn đề luôn có đúng 30 Chung + 30 riêng. Bản sao đề giữ đáp án gốc và thứ tự phương án. Bài đang làm đã lưu theo quy tắc cũ tiếp tục giữ nguyên đề, tiến độ và thời hạn.

Khi bài được lưu thành công, `startTime` và `endTime = startTime + 3.600.000` được ghi cùng `attemptNumber` trong một giao dịch IndexedDB. Kiểm tra bài đang chạy, cấp số lần thi và lưu đề diễn ra trong cùng giao dịch; hai tab bấm bắt đầu đồng thời chỉ tạo một bài. Bài đã hết hạn được tự kết thúc trước khi xét tạo đề mới. Bộ đếm không giảm khi khôi phục sao lưu cũ.

Đồng hồ hiển thị từ 60:00, tính lại từ `endTime - Date.now()` mỗi lần cập nhật. Không dùng số lần chạy bộ đếm làm thời gian thực vì trình duyệt có thể làm chậm timer khi tab bị ẩn ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API#policies_in_place_to_aid_background_page_performance)). Khi quay lại tab hoặc mở lại trang, kiểm tra hạn trước khi tiếp tục. Nếu trang đã đóng lúc hết giờ, lần mở sau ghi nhận bài kết thúc tại `endTime`.

Mỗi thao tác ghi đáp án/chuyển câu/đánh dấu đều kiểm tra hạn trong giao dịch. Hết giờ sẽ kết thúc bài, chặn thay đổi tiếp theo và mở kết quả; hộp xác nhận nộp đang mở cũng được đóng. Nộp thủ công ghi thời gian nộp thực tế. Cả hai trường hợp chỉ hiển thị đúng/sai/bỏ trống, thời gian và trạng thái kết thúc. Nút **Xem lại bài làm** mới mở đáp án; **Thi đề mới** quay về màn hình trước khi thi, **Về trang chủ** trở lại Tổng quan.

Lịch sử thi thử ở `#history/exam` có số lần thi, thời gian bắt đầu/kết thúc, thời gian làm bài, kết quả và trạng thái. Bản sao lưu giữ nguyên các trường thời gian, số lần thi và kết quả. Các bài Thi thử trước bản 2.2.0 vẫn được giữ nguyên đề/tiến trình và hiển thị là bài cũ; không tự gán thời hạn mới cho chúng. Ngân hàng cập nhật không thay snapshot của bài đã bắt đầu.

## Thư mục ngân hàng

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

Chương II và IV mở thẳng câu hỏi. Có đường dẫn điều hướng, Quay lại và hỗ trợ Back/Forward/tải lại URL. Số câu thư mục được tính theo vai trò và bộ lọc, không lấy tổng số câu của mọi chức danh. Chương V – Phần 2 hiện chỉ có Mức 1–3, giữ nguyên theo nguồn.

## Mẹo ghi nhớ từ Excel

Mở mục **Mẹo ghi nhớ** trên menu hoặc `#memory`. Dữ liệu nằm riêng tại `data/memory-tips.json`, gồm 53 mục của file `tong-hop-noi-dung-va-meo-ghi-nho.xlsx`. Giữ đúng thứ tự, tên chương/phần, chủ đề, nội dung chi tiết, mẹo, dấu câu, xuống dòng và khoảng trắng trong nguồn; không tự sửa lỗi gõ. Chương 2 và 4 có nhãn phần `—` như Excel. Tài liệu này dùng chung cho cả bốn chức danh.

Ứng dụng đọc JSON đã đóng gói; người học không cần Excel hoặc thư viện đọc Excel. Công cụ Python chỉ chạy trên máy Admin, dùng cùng `openpyxl` với công cụ ngân hàng:

```sh
python3 tools/memory/convert.py /duong-dan/tong-hop-noi-dung-va-meo-ghi-nho.xlsx
python3 tools/memory/convert.py /duong-dan/tong-hop-noi-dung-va-meo-ghi-nho.xlsx --check
```

Lệnh `--check` đối chiếu từng ô JSON với Excel, không ghi file. Sau khi cập nhật, chạy `npm test`, `npm run build` và tăng phiên bản ứng dụng/Service Worker khi phát hành để nhận dữ liệu mới. Bài làm và lịch sử lưu riêng trong IndexedDB, không bị sửa bởi thao tác đọc Mẹo ghi nhớ.

## Công cụ Excel dành cho Admin

Công cụ này nằm trong `tools/bank/`, không được đưa vào bản deploy. Chỉ máy Admin cần Python 3.9+ và openpyxl. Người dùng website không cần Python hoặc thư viện Excel.

Cài một lần:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/bank/requirements.txt
```

Đã tạo bản nguồn có ID tại **`tools/bank/source/cau-hoi-on-tap.xlsx`** từ file bạn cung cấp. File trong Downloads được giữ nguyên. Thư mục nguồn và kết quả local được `.gitignore` loại trừ.

Quy trình cập nhật:

1. Sửa trên Excel đã có cột **ID**. Giữ ID khi sửa một câu; câu mới để trống ID; câu thay bằng nội dung khác hẳn dùng ID mới. STT chỉ để hiển thị, có thể đánh lại số trong sheet. Không tái sử dụng ID câu đã rút.
2. Kiểm tra và đọc báo cáo `tools/bank/output/report.json`:

   ```sh
   npm run bank:import -- tools/bank/source/cau-hoi-on-tap.xlsx --version 2026.10.15.2 --output data --check
   ```

3. Sinh bản phát hành sau khi sửa lỗi:

   ```sh
   npm run bank:import -- tools/bank/source/cau-hoi-on-tap.xlsx --version 2026.10.15.2 --output data
   ```

4. Công cụ xuất `tools/bank/output/cau-hoi-co-id.xlsx`, gồm ID mới được cấp. Dùng bản này cho lần chỉnh sửa tiếp theo; sau khi kiểm tra có thể chép lại làm nguồn:

   ```sh
   cp tools/bank/output/cau-hoi-co-id.xlsx tools/bank/source/cau-hoi-on-tap.xlsx
   ```

5. Chạy `npm test` và `npm run build`, xem preview, review JSON và báo cáo thêm/sửa/xóa trước khi deploy.

Nếu muốn kiểm tra một file mới từ nơi khác, thay đường dẫn nguồn trong lệnh. `--output` mặc định là `tools/bank/output/data` để tạo bản thử riêng; `--report`, `--normalized`, `--config` có thể đổi đường dẫn. Đầu ra chuẩn hóa phải khác nguồn để tránh ghi đè file gốc.

Tên sheet → chương/phần, danh mục mức độ và thứ tự nằm trong [config.json](tools/bank/config.json). Đổi thứ tự tab không đổi phân loại. Sheet ngoài cấu hình hoặc thiếu sheet được báo lỗi. Sheet hướng dẫn chỉ bỏ qua nếu có trong `ignoredSheets`.

| Cột | Quy tắc |
| --- | --- |
| Nội dung câu hỏi, Phương án A/B/C/D, Đáp án đúng | Bắt buộc; đáp án A/B/C/D, nhận chữ thường/khoảng trắng. |
| ID | Công cụ cấp lần đầu, lưu trong bản Excel chuẩn hóa; duy nhất toàn ngân hàng. Không tạo từ nội dung hoặc vị trí hàng. |
| STT | Có thể trống; nếu có là số nguyên dương, không trùng trong sheet. |
| Mức độ | Mức 1–4 theo cấu hình; trống thành Chưa phân loại. |
| Phân loại | Dùng chung hoặc Chức danh. |
| Chức danh | Bắt buộc ghi rõ: Chung/Dùng chung/all với câu chung, hoặc đúng một trong bốn tên/mã vai trò với câu riêng. |

Thiếu Phân loại nhưng có chức danh hợp lệ có thể suy ra phạm vi, có cảnh báo. Thiếu Chức danh luôn là lỗi, kể cả Phân loại ghi Dùng chung; không tự coi role trống/null là Chung. Không đoán chức danh gần đúng. Ô công thức/lỗi Excel được báo để đổi thành giá trị. Câu trùng nội dung/phương án là cảnh báo, không tự xóa.

Quy tắc lọc dùng chung cho Ngân hàng, Ôn tập, Thi thử và ôn sai: role phải được khai báo hợp lệ, thuộc vai trò đang chọn hoặc là Chung. Câu thiếu/sai role hoặc mâu thuẫn Phân loại bị loại khỏi truy vấn và có cảnh báo nếu nằm trong cache cũ. Bộ tải từ chối phát hành mới có lỗi này; cache hỏng có thể được tải và kiểm tra lại dù số phiên bản không đổi.

Bài đang làm thuộc vai trò khác không xuất hiện ở nút Tiếp tục trên Tổng quan; mở URL trực tiếp sẽ yêu cầu chọn đúng vai trò, không hiển thị câu hỏi. Lịch sử và snapshot được giữ. Lúc tạo/cập nhật bài, IndexedDB kiểm tra vai trò hiện hành trong cùng giao dịch để chặn dữ liệu cũ từ tab khác. Bản sao lưu thiếu role vẫn đọc được để giữ lịch sử; câu chưa xác định chức danh không đưa vào bài mới.

Có lỗi thì công cụ trả mã thoát 1 và giữ nguyên manifest đang phát hành. Báo cáo ghi sheet/dòng/cột, câu thêm/sửa/rút, thay đổi đáp án và phạm vi. Cùng phiên bản dữ liệu không được thay nội dung; hãy tăng `--version`. Nhập lại cùng nguồn không đổi ID. Nếu sửa file gốc chưa có ID mà không đối chiếu được nội dung cũ, công cụ yêu cầu dùng bản Excel đã cấp ID.

## Đóng gói và GitHub Pages

```sh
npm test
npm run build
```

`npm run build` chỉ sao chép và kiểm tra các file web tĩnh vào `dist/`, không biên dịch app điện thoại. `dist/` gồm giao diện, JavaScript, icon, manifest dữ liệu và 8 JSON của phiên bản hiện hành. Excel nguồn, công cụ Admin, báo cáo, test và ngân hàng cũ không được đóng gói.

Đẩy mã và JSON đã sinh lên nhánh `main` của repository; chọn **Settings → Pages → Source → GitHub Actions**. Workflow tự chạy test JavaScript, test công cụ Admin, kiểm tra dữ liệu, đóng gói và deploy; không bắt buộc chạy build trên máy cá nhân. Không cần đưa Excel nguồn lên GitHub. Mọi URL/scope đều tương đối, hỗ trợ tên miền gốc và đường dẫn `/ten-repository/`.

## Sử dụng website và cập nhật

Mở URL HTTPS đã deploy trên điện thoại hoặc máy tính; dùng localhost khi phát triển. Cần kết nối mạng để mở website và nhận bản phát hành mới. Có thể thêm QuizLab vào màn hình chính để mở nhanh bằng nút **Cài ứng dụng** ở sidebar hoặc trong **Cài đặt → Cài QuizLab lên thiết bị**. Không dùng font/CDN bên ngoài.

Phiên bản dữ liệu trong `data/bank-manifest.json` độc lập với phiên bản ứng dụng `js/app.js`, `sw.js`, `package.json` và schema IndexedDB. Sửa dữ liệu chỉ cần sinh phiên bản dữ liệu mới và deploy. Sửa code giao diện cần tăng phiên bản ứng dụng ở cả ba file.

Khi có mạng và ứng dụng đang chạy, bộ mới được tải đủ, kiểm tra schema/hash/số câu/ID/chức danh, rồi thay nguồn chính thức trong một giao dịch IndexedDB. Tải thiếu, sai hash hoặc hết dung lượng thì giữ bộ cũ. Các tab phối hợp qua Web Locks và BroadcastChannel. Không cam kết tải nền khi ứng dụng đã đóng hoàn toàn.

Cache Storage và Service Worker là phần hỗ trợ của trình duyệt, không phải điều kiện để tải ngân hàng hoặc làm bài trên web. Ngân hàng đã kiểm tra được lưu vào IndexedDB trước; lỗi cache không làm thất bại việc nhận dữ liệu mới. IndexedDB vẫn cần được phép sử dụng để lưu tiến độ, lịch sử và tùy chọn cá nhân.

Bài đang làm tiếp tục theo snapshot cũ. Khi trình duyệt hỗ trợ Service Worker, mã ứng dụng mới tự áp dụng khi không ở màn hình làm bài và đã lưu xong thao tác; nếu tab khác kích hoạt worker, tab đang làm bài đợi đến Lưu & thoát. Worker vẫn dùng kiểu classic để các bản cũ nhận được nâng cấp. Khi không dùng được cơ chế này, nút Kiểm tra cập nhật vẫn kiểm tra ngân hàng và hướng dẫn tải lại trang để nhận giao diện mới.

Giữ nguyên database `quizlab`, hai store `sessions`/`settings`, không xóa lịch sử khi nâng cấp. Ngân hàng từng nhập được lưu thành `legacy-imported-bank`, có thể tải xuống tại Cài đặt; không che ngân hàng chính thức mới. Chỉ hoàn tất chuyển nguồn khi tải thành công bộ chính thức.

Sao lưu mới có định dạng phiên bản 2, gồm bài làm và tùy chọn cá nhân. Thiết lập ôn tập nằm trong `practice-config`; `exam-config` cũ chỉ được giữ để tương thích tùy chọn đảo đáp án và sao lưu, không quyết định số câu hoặc phạm vi đề thi mới; `quiz-config` cũ được đọc để chuyển đổi khi nâng cấp/khôi phục. Bản sao lưu phiên bản 1 vẫn khôi phục được các bài; phần ngân hàng cũ không ghi đè ngân hàng chính thức. Bài trùng ID giữ bản đang có. Chuyển origin/tên miền hoặc thiết bị cần xuất/khôi phục dữ liệu cá nhân.

## Cài QuizLab lên thiết bị

- **iPhone / iPad:** mở bằng Safari → nút Chia sẻ → Thêm vào Màn hình chính.
- **Android:** mở bằng Chrome → menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.
- **Máy tính:** chọn biểu tượng cài đặt trên thanh địa chỉ của Chrome / Edge.

Cần mở bằng HTTPS (hoặc localhost). Nếu ứng dụng đã được cài, hãy mở từ màn hình chính. Không cần build APK/IPA; trình duyệt sử dụng website đã deploy. Nút Cài ứng dụng mở hộp cài đặt khi trình duyệt hỗ trợ; nếu chưa có hộp cài đặt thì hiển thị hướng dẫn trên.

## Kiểm thử

```sh
npm test
npm run test:admin
npm run test:browser
```

`test:admin` chạy trong môi trường Python đã cài requirements. `test:browser` cần Chrome, dùng DevTools Protocol và hồ sơ tạm; không cần Playwright/Puppeteer. Có thể đặt `CHROME_PATH`. Test tự chạy localhost cổng 4174 và dọn tài nguyên khi xong; không đụng profile cá nhân.

Các kiểm tra bao gồm ngân hàng thật, bốn vai trò, ID/revision, trộn/chấm điểm, null metadata, import lỗi không thay bản cũ, thư mục/deep link, sao lưu cũ, chuyển ngân hàng cũ, trình duyệt thiếu/chặn cache, gián đoạn kết nối, cập nhật thiếu file/sai hash và cập nhật mã từ nhiều tab trong lúc làm bài. Mười câu mẫu cũ được giữ trong `tests/fixtures/sample-bank.json` cho kiểm thử tương thích lịch sử.

## Cấu trúc mã

```text
js/app.js                 Giao diện, thư mục, thiết lập, luồng bài làm và cập nhật
js/model.js               Snapshot, thống kê, thời hạn thi, ôn sai và đọc sao lưu cũ
js/exam.js                Tạo đề 60 câu theo 8 chủ đề và chức danh
js/memory.js              Đọc, kiểm tra và hiển thị Mẹo ghi nhớ
js/db.js                  IndexedDB và chuyển đổi nguồn dữ liệu
js/bank-schema.js         Schema, hash, bộ lọc và tên chương/phần
js/bank.js                Tải và áp dụng trọn bộ dữ liệu
js/quiz-config.js         Chuẩn hóa thiết lập ôn tập toàn phần và thi độc lập
sw.js                     Cache giao diện/dữ liệu, vòng đời cập nhật
data/bank-manifest.json   Phiên bản, 5 chương và 8 mục
data/memory-tips.json     53 mục Mẹo ghi nhớ nguyên văn từ Excel
data/releases/<version>/  JSON theo phiên bản, không sửa tại cùng URL
tools/bank/               Converter Python, cấu hình, test Admin
tools/memory/             Converter và đối chiếu nguyên văn Excel Mẹo ghi nhớ
scripts/                  Server local, kiểm tra dữ liệu, đóng gói
tests/                    Test model, ngân hàng, Chrome và fixture lịch sử
```

Vai trò là bộ lọc nội dung trong ứng dụng tĩnh, không phải phân quyền bảo mật file JSON. Dữ liệu đầu vào luôn được hiển thị dạng văn bản.

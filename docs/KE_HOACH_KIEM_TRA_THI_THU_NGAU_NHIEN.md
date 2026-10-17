# Kế hoạch kiểm tra và sửa Thi thử: tạo đề ngẫu nhiên, tiếp tục đúng bài

Trạng thái: kế hoạch, chưa triển khai thay đổi chức năng theo tài liệu này.

## Mục tiêu

- Mỗi lần bắt đầu lượt thi mới lấy mẫu ngẫu nhiên từ ngân hàng hiện hành, theo chức danh đã chọn; không lấy một bộ 60 câu cố định rồi chỉ đảo thứ tự.
- Refresh, lưu và thoát, đóng tab, mở lại hoặc mở ứng dụng đã cài đều tiếp tục đúng bài đã lưu: giữ đề, thứ tự câu, thứ tự phương án, đáp án đã chọn và hạn kết thúc.
- Lượt thi mới có ID mới, số lần thi mới và thực hiện lại việc chọn câu. Một số câu có thể xuất hiện ở nhiều lượt thi.
- Giữ quy tắc 60 câu/60 phút, 12 câu mỗi chương, phân bổ chung/riêng theo thuật toán đã thống nhất. Chỉ cho bắt đầu lượt mới sau khi bài đang làm đã nộp hoặc hết giờ.

## Hiện trạng đã đọc trong mã nguồn

- `js/exam.js`: `selectExamQuestions()` lọc câu chung và câu đúng vai trò, trộn từng nhóm trước khi lấy mẫu và trộn lại toàn đề. Nguồn ngẫu nhiên mặc định là `Math.random`, không phải seed cố định.
- `js/app.js`: `startExam()` tạo đề mới; `navigateRoute()` lấy lại bài theo ID khi tiếp tục.
- `js/db.js`: `addExamSession()` kiểm tra bài đang làm, cấp số lần thi và lưu đề cùng `startTime`/`endTime` trong một giao dịch. Các hàm đọc tự kết thúc bài đã hết hạn.
- Đã có kiểm thử phân bổ câu, thứ tự ngẫu nhiên, hạn thi, refresh, mở lại sau khi hết giờ và chặn tạo đồng thời hai bài.
- Cần bổ sung kiểm tra thay đổi **tập ID câu hỏi** giữa các lượt, thay vì chỉ so sánh danh sách ID có thứ tự. Khác thứ tự chưa đủ chứng minh đã chọn một tập câu mới.

Các nhận xét trên là kết quả đọc mã; cần kiểm chứng lại trên trình duyệt và phiên bản ứng dụng đang chạy trước khi kết luận có lỗi.

## Trình tự thực hiện

### 1. Tái hiện và xác định đúng phiên bản

Kiểm tra phiên bản trên giao diện, nguồn ngân hàng hiện hành và trạng thái Service Worker. Tạo hai lượt thi liên tiếp bằng cùng chức danh, nộp lượt trước rồi mới tạo lượt sau. Ghi lại ID bài, số lần thi, vai trò, phiên bản ngân hàng, ID câu hỏi theo thứ tự, thứ tự phương án và thời hạn.

So sánh cả danh sách có thứ tự lẫn tập ID đã sắp xếp để phân biệt việc lấy mẫu câu hỏi với việc chỉ đảo thứ tự. Không thay đổi hoặc xóa lịch sử thật của người dùng; thực hiện trong hồ sơ trình duyệt kiểm thử riêng.

### 2. Kiểm tra và sửa luồng bắt đầu lượt mới

Phạm vi: `js/exam.js`, `js/app.js`, `js/db.js`.

Chỉ nút Bắt đầu thi cho lượt mới được gọi thuật toán chọn câu. Mỗi lượt đọc chức danh hiện hành và lấy mẫu từ toàn bộ nguồn câu hợp lệ trong từng chương: câu Chung và câu riêng của chức danh đó. Giữ phân bổ hiện tại, không trùng ID trong một đề và báo lỗi nếu nguồn không đủ.

Kiểm tra không có bộ đề cố định, seed cố định hoặc đề của lượt trước được tái sử dụng trong luồng chạy thực tế. Tùy chọn đảo đáp án không được vô hiệu hóa việc chọn ngẫu nhiên câu hỏi. Giữ cơ chế lưu giao dịch để bấm hai lần hoặc mở nhiều tab không tạo hai bài đang làm.

### 3. Kiểm tra và sửa luồng tiếp tục

Phạm vi: `js/app.js`, `js/db.js`, `js/model.js`.

Tiếp tục bài phải đọc bản sao đã lưu theo ID; không gọi hàm tạo đề. Bản sao giữ nội dung câu, đáp án đúng, thứ tự câu/phương án, câu trả lời, đánh dấu, vị trí hiện tại, chức danh và phiên bản ngân hàng lúc bắt đầu.

`startTime` và `endTime = startTime + 60 phút` chỉ được thiết lập khi lưu lượt mới. Đồng hồ tính thời gian còn lại từ `endTime - Date.now()`. Nếu đã hết hạn, kết thúc bài trước khi cho làm tiếp. Nếu đọc bài thất bại, hiển thị lỗi để thử lại; không tự tạo đề thay thế.

Ngân hàng hoặc phiên bản ứng dụng được cập nhật không được viết lại đề của lượt đang làm. Giữ kiểm tra chức danh khi tiếp tục và quy tắc chặn tạo lượt mới khi còn bài chưa kết thúc.

### 4. Bổ sung kiểm thử

Phạm vi: `tests/exam.test.js`, `tests/browser.mjs`.

| Tình huống | Kết quả cần đạt |
| --- | --- |
| Tạo đề cho cả bốn chức danh | Đủ 60 câu, đúng phân bổ, chỉ có câu Chung và câu đúng chức danh; không trùng ID trong đề. |
| Tạo đề với các nguồn ngẫu nhiên kiểm soát được trong kiểm thử | Tập ID câu hỏi thay đổi giữa các lần lấy mẫu khi ngân hàng đủ đa dạng; không chỉ thay thứ tự. |
| Nộp bài rồi bắt đầu lượt mới trên giao diện | Gọi lại thuật toán chọn câu; ID bài và số lần thi mới, câu trả lời ban đầu rỗng. |
| Chọn đáp án, đánh dấu, chuyển câu, chờ xác nhận lưu rồi refresh | Khôi phục nguyên trạng đề và tiến trình; `startTime`/`endTime` không đổi. |
| Lưu và thoát, đóng tab rồi mở lại trước hạn | Tiếp tục cùng ID bài; đồng hồ giảm theo thời gian đã trôi qua. |
| Mở lại sau hạn hoặc để hết giờ trong lúc đang mở | Bài tự kết thúc đúng hạn đã lưu, giữ các đáp án đã lưu và không sinh đề mới. |
| Cập nhật ngân hàng hoặc mã ứng dụng khi còn bài đang làm | Bản sao đề, tiến trình và hạn thi giữ nguyên. |
| Hai tab hoặc hai thao tác bắt đầu đồng thời | Chỉ một bài mới được lưu; yêu cầu bị chặn không tăng số lần thi hoặc thay đề đang làm. |

Kiểm thử ngẫu nhiên dùng các nguồn có thể lặp lại trong kiểm thử để tránh kết quả thất thường; luồng sử dụng thực tế vẫn dùng nguồn ngẫu nhiên mới mỗi lần bắt đầu.

### 5. Xác nhận và phát hành bản sửa nếu cần

Chạy `npm test`, kiểm tra trình duyệt trên Edge/Chrome và `npm run build`. Kiểm tra gói triển khai chứa đúng mã và ngân hàng được dùng khi thử.

Nếu cần sửa mã, tăng đồng bộ phiên bản trong `js/app.js`, `sw.js` và `package.json` để ứng dụng nhận bản mới; cập nhật hướng dẫn liên quan. Việc nhận bản mới phải giữ lịch sử và tiến trình. Báo rõ lỗi đã xác nhận, phần đã sửa và kết quả kiểm thử.

## Tiêu chí hoàn thành

Từ giao diện người dùng có thể chứng minh: **lượt mới chọn câu ngẫu nhiên lại từ ngân hàng đúng chức danh; tiếp tục lượt cũ giữ nguyên đề và tiến trình; đồng hồ luôn theo hạn kết thúc đã lưu**. Các quy tắc đã có về phân bổ đề, chặn bài mới, lọc vai trò và lưu lịch sử tiếp tục hoạt động.

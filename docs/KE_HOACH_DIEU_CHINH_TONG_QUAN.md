# Điều chỉnh Tổng quan và tách trang thi

Trạng thái: đã triển khai trong bản 2.1.0, bổ sung “Tất cả các phần” trong bản 2.1.1 và nội dung sử dụng qua web trong bản 2.1.2. Thi thử được cập nhật thành đề 60 câu/60 phút trong bản 2.2.0. Tổng quan dành cho ôn tập toàn bộ câu trong phần hoặc chương đã chọn; chế độ thi nằm trong mục Thi thử riêng ở sidebar và menu di động. Lọc vai trò của bản 2.0.1 được giữ nguyên.

Thi thử từ bản 2.2.0 có cấu hình cố định 60 câu/60 phút, tự kết thúc theo hạn trong IndexedDB và chỉ thống kê đúng/sai/bỏ trống. Các thiết lập thi cũ được giữ khi đọc sao lưu, không ảnh hưởng đề mới; xem [Thi thử 60 câu / 60 phút](../README.md#thi-thử-60-câu--60-phút). Tên hiển thị là “Thi thử”, route `#exam`. Ôn tập dùng `#home`. Bài đang làm và kết quả tự chọn đúng mục menu theo chế độ đã lưu trong bài.

## Ưu tiên 0: lọc vai trò

Đã sửa trong bản 2.0.1:

- Excel → JSON giữ role, scope, difficulty; role trống được báo lỗi, kể cả câu dùng chung.
- Role phải được khai báo rõ là Chung hoặc một trong bốn chức danh. Câu thiếu/sai role bị loại khỏi Ngân hàng, Ôn tập, Thi thử và ôn sai.
- Dữ liệu cache thiếu role có cảnh báo và có thể tải lại từ bộ phát hành đã kiểm tra.
- Tổng quan chỉ đưa ra bài tiếp tục phù hợp vai trò. URL bài đang làm thuộc vai trò khác hiển thị yêu cầu kiểm tra vai trò, không hiển thị câu hỏi.
- Giao dịch tạo/cập nhật bài kiểm tra vai trò đang lưu, chặn trạng thái cũ từ tab khác; lịch sử và snapshot cũ được giữ.
- Đối chiếu từng ID với workbook thật cho cả bốn vai trò, không chỉ kiểm tra tổng số câu.

## Bước 1: Tổng quan dành cho Ôn tập

- Giữ thống kê ngắn gọn, chọn Chương/Phần và nút “Bắt đầu ôn tập”; mặc định chọn mục đầu tiên nếu chưa có lựa chọn hợp lệ đã lưu.
- Bỏ chọn chế độ, Mức độ, Phân loại và Số câu hỏi trên trang này.
- Với chương chia phần, chọn một phần hoặc “Tất cả các phần” để ôn toàn chương; lưu và khôi phục lựa chọn này. Chương II và IV dùng toàn chương, không tạo phần giả.
- Mọi lần tạo bài từ Tổng quan cố định `mode: practice`, `count: all`, `difficulty: all`, `scope: all` trong logic tạo bài, không chỉ ẩn các trường trên giao diện.
- Loại bỏ tác động của count/mức độ/phân loại từng lưu ở bản cũ. Ôn tập lấy toàn bộ câu Chung + câu riêng đúng vai trò trong mục đã chọn.
- Hiển thị số câu thực tế trước khi bắt đầu: hiện tại 48 câu/mục cho mỗi vai trò, riêng Chương V – Phần 2 có 36 câu. Khi chọn tất cả các phần, Chương I/III có 96 câu và Chương V có 84 câu.
- Giữ tùy chọn đảo đáp án và trộn câu nếu không có thay đổi yêu cầu. Lưu lựa chọn chương/phần độc lập với trang thi.

## Bước 2: Trang Thi thử riêng

- Mục Thi thử trong sidebar và menu di động mở `#exam`, luôn chọn đúng menu khi làm hoặc xem lại bài thi.
- Trước khi thi hiển thị Bài thi thử lần X, 60 câu, 60 phút và lưu ý thời gian tiếp tục đếm khi thoát. Có Bắt đầu thi, Tiếp tục bài thi nếu còn bài phù hợp vai trò và Lịch sử thi thử.
- Tạo đề đủ 12 câu mỗi chương, lấy tối đa 6 câu riêng đúng vai trò rồi bù câu Chung; thiếu câu Chung thì báo lỗi và không tăng bộ đếm.
- Trộn toàn bộ đề và lưu snapshot, đáp án gốc, thứ tự lựa chọn, số lần thi, startTime/endTime. Không tạo lại đề khi refresh.
- Bản 2.2.1 khóa Bắt đầu thi khi còn bài chưa nộp/chưa hết giờ, kể cả đổi vai trò hoặc mở nhiều tab; chỉ tiếp tục bài cũ.
- Kiểm tra bài đang chạy, ghi đề và cấp số lần thi trong một giao dịch; kiểm tra hạn khi đọc và ghi bài để tự kết thúc đúng endTime, kể cả khi quay lại sau khi đóng trang.
- Bài thi không tính điểm; chỉ hiển thị đúng/sai/bỏ trống, thời gian và trạng thái nộp hoặc hết giờ. Xem lại bài làm mở đáp án sau khi hoàn tất; Thi đề mới quay về màn hình trước khi thi.
- Lịch sử thi thử ở `#history/exam`; giữ các bài cũ, không tự thêm đồng hồ cho đề cũ. Sao lưu/khôi phục giữ hạn và bộ đếm, không đặt lại thời gian.
- Ôn tập vẫn tính điểm và giữ lựa chọn một phần/tất cả phần trong chương; các giới hạn của thiết lập thi cũ không tác động bài mới.

## Bước 3: kiểm thử trước khi phát hành

- Bốn vai trò, từng mục, cả hai chế độ: tập ID luôn bằng câu chung hợp lệ cộng câu riêng hợp lệ.
- Thử cấu hình cũ đã lưu `count: 20`, chỉ Mức 4 hoặc chỉ câu riêng: Ôn tập vẫn lấy đủ toàn bộ câu trong mục.
- Role thiếu/null/trống/sai không trở thành Chung; không tạo bài hoặc tiếp tục bài sai vai trò qua URL hay trạng thái nhiều tab.
- Chương II/IV không có phần giả; Chương V – Phần 2 không sinh câu Mức 4.
- Tiếp tục bài, xem kết quả, ôn sai, backup và cập nhật website vẫn giữ dữ liệu; mất kết nối hoặc trình duyệt chặn cache không làm mất bài đã lưu.
- Kiểm tra refresh/tiếp tục giữ hạn, mở lại sau hạn, chặn đáp án muộn, hết giờ lúc đang xác nhận nộp, cấp số lần thi đồng thời và khôi phục backup.
- Chỉ tăng phiên bản code khi các kiểm tra liên quan và đóng gói đều đạt.

Đã kiểm tra bộ logic, trình duyệt Chrome qua đường dẫn con GitHub Pages, menu 6 mục ở màn hình 320/390 px, ôn đủ 36 câu dù cấu hình cũ chỉ chọn Mức 4/câu riêng/20 câu, lưu thiết lập riêng, tiếp tục bài, lọc vai trò, gián đoạn kết nối và cập nhật nhiều tab. Lệnh kiểm tra/đóng gói nằm trong [README](../README.md).

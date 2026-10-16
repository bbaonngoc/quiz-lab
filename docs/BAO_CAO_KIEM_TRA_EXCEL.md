# Kiểm tra workbook câu hỏi và cấu trúc chương/phần

Nguồn: [cau-hoi-on-tap.xlsx](/Users/baongoc/Downloads/cau-hoi-on-tap.xlsx). Ngày kiểm tra: 15/10/2026. Đã đọc cấu trúc và giá trị ô; không sửa workbook gốc.

SHA-256 của file đã kiểm tra:

```text
dcdb1b035392f40ca5fd4ea3b2c9159ae952504a2dc472447f1ecb4e4ff2dcee
```

## Kết quả

- Một workbook, 8 sheet hiển thị, 558 câu; thuộc 5 chương, không phải 8 chương.
- Chương I, III và V có hai phần; Chương II và IV không chia phần. Mỗi sheet tương ứng một phần hoặc toàn bộ một chương không chia phần.
- Cả 8 sheet có hàng tiêu đề tại hàng 1 với cùng 10 cột: STT, Mức độ, Phân loại, Chức danh, Nội dung câu hỏi, Phương án A/B/C/D, Đáp án đúng.
- Có 310 câu dùng chung, cột Chức danh ghi “Chung”; 248 câu riêng, chia đều 62 câu cho mỗi chức danh đã cấu hình.
- Mỗi vai trò có 372 câu khả dụng: 310 dùng chung + 62 dành riêng.

| Nội dung chính thức | Tổng câu nguồn | Dùng chung | Riêng mỗi chức danh | Mỗi vai trò được xem |
| --- | ---: | ---: | ---: | ---: |
| Chương I – Phần 1: Sẵn sàng thay đổi và văn hóa số | 72 | 40 | 8 | 48 |
| Chương I – Phần 2: Quản trị đổi mới và cải tiến quy trình | 72 | 40 | 8 | 48 |
| Chương II: Quản trị dữ liệu địa bàn | 72 | 40 | 8 | 48 |
| Chương III – Phần 1: Sử dụng công cụ làm việc số | 72 | 40 | 8 | 48 |
| Chương III – Phần 2: Ứng dụng AI hỗ trợ công việc | 72 | 40 | 8 | 48 |
| Chương IV: An toàn thông tin | 72 | 40 | 8 | 48 |
| Chương V – Phần 1: Tổ chức thực thi chính sách | 72 | 40 | 8 | 48 |
| Chương V – Phần 2: Tương tác số với người dân | 54 | 30 | 6 | 36 |
| **Tổng** | **558** | **310** | **62** | **372** |

“Riêng mỗi chức danh” là số câu cho một chức danh; tổng câu riêng trong nguồn bằng cột này nhân bốn.

## Kiểm tra dữ liệu

Các kiểm tra sau đã đạt trên file hiện tại:

- Câu hỏi, bốn phương án và đáp án đúng đều có nội dung.
- Tất cả đáp án đúng thuộc A/B/C/D.
- Phân loại chỉ có “Dùng chung” hoặc “Chức danh”. Các câu chung khớp chức danh “Chung”; tất cả câu riêng khớp một trong bốn vai trò.
- STT là số nguyên dương, liên tục và không trùng trong từng sheet. Bảy sheet có STT 1–72, sheet cuối có STT 1–54. Giá trị số lưu dạng `1.0` có thể chuẩn hóa thành số nguyên khi chuyển đổi.
- Không phát hiện câu trùng nội dung sau khi chuẩn hóa Unicode, chữ hoa/thường và khoảng trắng. Không có nhóm câu trùng cả nội dung lẫn bốn phương án.
- Không có bốn phương án bị trùng nhau trong cùng câu, ô lỗi Excel, ô công thức hoặc hàng ẩn trong các sheet câu hỏi.

Đây là kiểm tra cấu trúc và tính nhất quán kỹ thuật, chưa thẩm định tính chính xác chuyên môn của từng câu hoặc đáp án.

## Mức độ

| Giá trị | Số câu trong toàn bộ nguồn |
| --- | ---: |
| Mức 1 | 144 |
| Mức 2 | 144 |
| Mức 3 | 144 |
| Mức 4 | 126 |

Chương V – Phần 2 có 54 câu, gồm 18 câu ở mỗi Mức 1, 2, 3; hiện không có Mức 4. Các đơn vị còn lại có 18 câu ở mỗi Mức 1–4. Không coi việc thiếu Mức 4 là lỗi vì chưa có yêu cầu mọi phần phải đủ bốn mức; giữ đúng dữ liệu nguồn.

## Quy tắc cần áp dụng khi triển khai

- Dùng tên chương/phần đầy đủ do người dùng cung cấp; ánh xạ tường minh tên sheet thực tế theo [kế hoạch](KE_HOACH_NGAN_HANG_CAU_HOI.md).
- Tạo hai trường `chapterId` và `sectionId`; không biến 8 sheet thành 8 chương. Chương II và IV không được tự hiển thị thêm “Phần 1”.
- Workbook gốc không có cột ID kỹ thuật. Converter đã cấp ID ổn định và xuất bản có ID tại `tools/bank/source/cau-hoi-on-tap.xlsx`; STT lặp giữa các sheet nên không dùng STT đơn lẻ hoặc `chapterId + STT` làm ID toàn cục.
- Chuẩn hóa “Dùng chung” + “Chung” thành câu dùng chung cho tất cả vai trò.
- Số câu trên thư mục được tính sau khi lọc vai trò. Khi chưa lọc thêm, năm thư mục chương lần lượt có 96, 48, 96, 48 và 84 câu cho mỗi vai trò.
- Các con số trên phục vụ đối chiếu file hiện tại, không được ghi cố định vào logic ứng dụng; ứng dụng phải tính từ dữ liệu từng phiên bản.

Trạng thái: 558 câu đã đưa vào bản local 2.0.1. Đối chiếu độc lập từng câu Excel → JSON cho kết quả không sai lệch Chức danh, Phân loại, Mức độ, nội dung, phương án hoặc đáp án; tập ID Ngân hàng/Ôn tập/Thi thử khớp nguồn Excel cho cả bốn vai trò. Báo cáo đối chiếu có tại `tools/bank/output/source-role-audit.json` trên máy local. Chưa thực hiện phát hành lên một URL GitHub Pages thực tế.

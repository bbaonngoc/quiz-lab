# Đóng gói Mẹo ghi nhớ

Công cụ local dùng Python và `openpyxl` để chuyển file Excel thành `data/memory-tips.json`. Trình duyệt chỉ tải JSON; không đọc Excel, không cần thư viện Python hay backend.

```sh
python3 -m pip install openpyxl
python3 tools/memory/convert.py '/đường/dẫn/tong-hop-noi-dung-va-meo-ghi-nho.xlsx'
python3 tools/memory/convert.py '/đường/dẫn/tong-hop-noi-dung-va-meo-ghi-nho.xlsx' --check
```

`--check` chỉ đọc và đối chiếu tất cả nhãn chương/phần, STT, chủ đề, nội dung chi tiết, mẹo nhớ và thứ tự hàng với Excel; đồng thời kiểm tra SHA-256 của file nguồn. Có thể dùng `--output` để chỉ định JSON khác và `--sheet` để chỉ định tên sheet.

Định dạng: A1 là tiêu đề; hàng 2 gồm `STT`, `Chương`, `Phần`, `Chủ đề / Nội dung`, `Nội dung chi tiết`, `Mẹo nhớ`. Từ hàng 3 là dữ liệu. STT phải là số nguyên dương, không trùng; các trường văn bản không được trống; chương/phần phải được nhóm liên tiếp trong workbook. Công cụ dừng khi gặp ô công thức, ô lỗi hoặc trường không hợp lệ.

Nội dung văn bản được giữ nguyên, kể cả xuống dòng, khoảng trắng đầu/cuối, chữ hoa, dấu câu và cách viết trong Excel. Nhãn phần `—` của chương không chia phần cũng giữ nguyên. ID `chapter-*`, `section-*`, `memory-*` tuần tự theo thứ tự xuất hiện trong file; `sourceRow` lưu hàng Excel để đối chiếu. Không chỉnh sửa file Excel gốc.

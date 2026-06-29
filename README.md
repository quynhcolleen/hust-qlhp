# Quản lý học phần HUST

Chrome extension hỗ trợ sinh viên HUST theo dõi tiến độ học tập trực tiếp trên CTT-SIS.

Tiện ích đọc dữ liệu đang hiển thị trên các trang CTT-SIS, sau đó tạo dashboard để xem nhanh CPA, tín chỉ tích lũy, học phần còn thiếu, mô đun chuyên ngành, bảng điểm cá nhân và kết quả học tập theo từng học kỳ.

> **Lưu ý quan trọng:** Extension này hiện có thể chỉ hoạt động đúng với mã ngành **ET1**. Một số dữ liệu chương trình đào tạo của các mã ngành khác chưa đủ để phân loại học phần, mô đun chuyên ngành và tín chỉ bắt buộc một cách chính xác, nên kết quả ở các ngành khác có thể sai hoặc thiếu.

## Tính năng

- Tổng hợp chương trình đào tạo từ trang CTT-SIS.
- Tính CPA theo điểm hệ 4 và trọng số tín chỉ.
- Hiển thị tín chỉ đã tích lũy, tín chỉ yêu cầu và tín chỉ còn thiếu.
- Phân loại học phần theo các khối kiến thức: đại cương, lý luận chính trị, giáo dục thể chất, quốc phòng, ngoại ngữ, cơ sở ngành, thực tập, đồ án và mô đun chuyên ngành.
- Cho phép chọn mô đun chuyên ngành và ghi nhớ lựa chọn gần nhất.
- Liệt kê học phần đã qua, học phần còn thiếu và học phần có thể chọn.
- Copy nhanh mã học phần chưa học.
- Xếp hạng bảng điểm cá nhân theo điểm tốt nhất hoặc cần chú ý nhất.
- Hiển thị điểm chữ A+, A, B+, B, C+, C, D+, D, F/R và điểm hệ 4 tương ứng.
- Hiển thị dashboard tổng quát cho GPA, CPA, tín chỉ qua, tín chỉ tích lũy, tín chỉ nợ đăng ký, tín chỉ đăng ký, trình độ và mức cảnh báo theo học kỳ.

Tiện ích không hiển thị nút nổi ở trang đăng nhập CTT-SIS.

## Cài đặt

1. Tải source code về máy bằng một trong hai cách:

```bash
git clone https://github.com/quynhcolleen/hust-dghp.git
```

Hoặc tải ZIP từ GitHub rồi giải nén.

2. Mở Chrome và truy cập:

```text
chrome://extensions
```

3. Bật **Developer mode** / **Chế độ dành cho nhà phát triển**.
4. Chọn **Load unpacked** / **Tải tiện ích đã giải nén**.
5. Chọn thư mục source code của extension.
6. Refresh lại trang CTT-SIS nếu trang đang mở sẵn.

## Cách sử dụng

Đăng nhập CTT-SIS, sau đó mở một trang bất kỳ trong domain:

```text
https://ctt-sis.hust.edu.vn/
```

Ở góc dưới bên phải sẽ có ba nút:

- **Quản lý học phần**: mở trang Chương trình đào tạo và hiển thị dashboard tiến độ.
- **Quản lý điểm số**: mở trang Bảng điểm cá nhân và hiển thị bảng xếp hạng điểm.
- **Quản lý tổng quát**: mở dashboard Kết quả học tập sinh viên với biểu đồ GPA/CPA, tín chỉ và trạng thái học tập theo học kỳ.

Các đường dẫn chính:

```text
https://ctt-sis.hust.edu.vn/Students/StudentProgram.aspx
https://ctt-sis.hust.edu.vn/Students/StudentCourseMarks.aspx
```

Nếu đang ở trang khác trong CTT-SIS, extension sẽ tự chuyển đến đúng trang khi bạn bấm nút tương ứng.

Trong dashboard học phần, dùng **Quét lại** khi bạn vừa đổi bộ lọc, CTT-SIS vừa tải thêm dữ liệu, hoặc muốn đọc lại nội dung mới nhất trên trang.

## Cách extension đọc dữ liệu

Extension quét trực tiếp bảng HTML đang hiển thị trên CTT-SIS. Dữ liệu không được hardcode và không được lưu thành bản sao cố định.

Việc phân loại học phần dựa trên:

- Mã học phần.
- Tên học phần.
- Ghi chú trong bảng chương trình đào tạo.
- Nhóm/loại học phần nếu CTT-SIS hiển thị.
- Thông tin viện/khoa khi cần thiết.

Nếu CTT-SIS thay đổi cấu trúc bảng hoặc đổi nhãn dữ liệu, phần quét và phân loại trong `content.js` có thể cần cập nhật.

## Cập nhật sau khi sửa code

Sau khi chỉnh sửa source:

1. Mở lại `chrome://extensions`.
2. Bấm reload extension.
3. Refresh trang CTT-SIS.
4. Mở lại dashboard bằng nút nổi.

## Cấu trúc source

- `manifest.json`: cấu hình Chrome extension.
- `content.js`: bootstrap content script, quét dữ liệu CTT-SIS, phân loại học phần, đọc bảng điểm và đọc kết quả học tập theo học kỳ.
- `ui.js`: điều hướng trang, dựng dashboard, xử lý nút bấm, bảng điểm và biểu đồ tổng quát.
- `panel.html`: template HTML cho nút nổi, dashboard học phần, dashboard điểm và dashboard tổng quát.
- `styles.css`: toàn bộ style của extension.
- `logo*.png`: icon extension theo nhiều kích thước.

## Quyền truy cập

Extension chỉ khai báo quyền:

- `storage`: lưu lựa chọn mô đun chuyên ngành gần nhất.
- `https://ctt-sis.hust.edu.vn/*`: chạy content script trên CTT-SIS.

Không có backend riêng và không gửi dữ liệu học tập ra server ngoài.

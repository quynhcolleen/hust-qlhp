# Hướng dẫn cài đặt và sử dụng tool quản lý học phần

Tiện ích Chrome này hỗ trợ sinh viên HUST xem nhanh tiến độ học tập từ trang **Chương trình đào tạo** trên CTT-SIS.

Tool sẽ đọc bảng học phần trên trang hiện tại, sau đó hiển thị dashboard gồm CPA, số tín chỉ đã tích lũy, tín chỉ còn thiếu, các khối kiến thức, mô đun chuyên ngành và điểm của các học phần đã qua.

## 1. Tải source code về máy

### Cách 1: Clone từ GitHub

Mở Terminal / Command Prompt và chạy lệnh:

```bash
git clone https://github.com/quynhcolleen/hust-dghp.git
```

Sau khi clone xong, bạn sẽ có một thư mục chứa source code của tiện ích.

### Cách 2: Tải file ZIP

1. Truy cập trang GitHub của repository.
2. Nhấn **Code**.
3. Chọn **Download ZIP**.
4. Giải nén file ZIP ra một thư mục bất kỳ.

## 2. Cài đặt tiện ích vào Chrome

1. Mở trình duyệt Google Chrome.
2. Truy cập đường dẫn:

```text
chrome://extensions
```

3. Bật **Chế độ dành cho nhà phát triển** ở góc trên bên phải.
4. Nhấn **Tải tiện ích đã giải nén** / **Load unpacked**.
5. Chọn thư mục source code vừa clone hoặc vừa giải nén.
6. Kiểm tra tiện ích đã xuất hiện trong danh sách extensions.

## 3. Cách sử dụng

1. Đăng nhập CTT-SIS.
2. Mở trang **Chương trình đào tạo**:

```text
https://ctt-sis.hust.edu.vn/Students/StudentProgram.aspx
```

3. Đợi bảng học phần tải xong.
4. Nhấn nút **Quản lý học phần** ở góc dưới bên phải màn hình.
5. Xem tiến độ học tập trong dashboard.

Nếu bạn thay đổi bộ lọc hoặc trang CTT-SIS cập nhật dữ liệu, nhấn **Quét lại** trong dashboard để lấy dữ liệu mới.

## 4. Các chức năng chính

- Hiển thị CPA tích lũy theo điểm hệ 4.
- Hiển thị tổng tín chỉ đã tích lũy.
- Thống kê các khối kiến thức bắt buộc và tự chọn.
- Nhận diện các học phần Giáo dục Quốc phòng - An ninh, Giáo dục thể chất, Tiếng Anh, thực tập, đồ án và mô đun chuyên ngành.
- Xem điểm chữ và điểm số của các học phần đã qua.
- Xem các học phần còn thiếu hoặc các học phần có thể chọn.
- Copy nhanh mã học phần đối với các học phần chưa học.

## 5. Cập nhật sau khi chỉnh sửa code

Sau khi sửa file trong source code:

1. Vào lại:

```text
chrome://extensions
```

2. Nhấn nút reload của tiện ích.
3. Refresh lại trang CTT-SIS.
4. Mở lại dashboard bằng nút **Quản lý học phần**.

## 6. Cấu trúc thư mục

- `manifest.json`: cấu hình extension Chrome.
- `content.js`: đọc bảng học phần và phân loại dữ liệu.
- `ui.js`: xử lý dashboard, nút bấm, chọn mô đun và copy mã học phần.
- `panel.html`: khung HTML của dashboard.
- `styles.css`: giao diện light mode của dashboard.
- `README.md`: hướng dẫn cài đặt và sử dụng.

## 7. Lưu ý

Tool phân loại học phần dựa trên nội dung bảng và phần ghi chú trên CTT-SIS. Nếu CTT-SIS thay đổi cấu trúc bảng, phần đọc dữ liệu trong `content.js` có thể cần được cập nhật.

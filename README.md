# SHS Marketing Dashboard

Hệ thống theo dõi hoạt động truyền thông và kết quả chuyển đổi của **TT.Marcom SHS**.

| Trang | Ai dùng | Làm gì |
|---|---|---|
| `index.html` — **Dashboard** | Viewer, Admin | Xem KPI, biểu đồ, funnel, xu hướng chuyển đổi, bảng chi tiết |
| `cms.html` — **Quản trị dữ liệu** | Admin | Nhập checklist (bảng kiểu Excel), đăng 1 nội dung nhiều kênh, sửa danh mục, up CSV chuyển đổi, quản lý key |

## Kiến trúc

```
Trình duyệt (GitHub Pages)  ──►  Apps Script (API + kiểm tra key)  ──►  Google Sheet (kho dữ liệu)
 index.html / cms.html            apps-script/Code.gs                    Checklist, Danh mục, Chuyển đổi, Key, Nhật ký
```

- **Repo này chỉ chứa code**, không chứa dữ liệu. Dữ liệu nằm trong Google Sheet của tài khoản TT.Marcom.
- Mọi thao tác đều phải có **key hợp lệ**. Key được kiểm tra phía máy chủ và lưu dạng mã hóa một chiều (SHA-256 + salt).
- Hai cấp quyền:
  - **Viewer:** chỉ xem Dashboard.
  - **Admin:** xem và nhập liệu.
  - **Chủ hệ thống:** một key Admin đặc biệt, là key duy nhất được tạo, sửa, khóa các key khác.

---

## Cài đặt lần đầu (khoảng 15 phút, làm một lần)

> Dùng **tài khoản Google chung của TT.Marcom**, không dùng tài khoản cá nhân, để khi có biến động nhân sự hệ thống vẫn chạy.

### Bước 1: Tạo Google Sheet dữ liệu
1. Tải file `SHS_MKT_Data_KhoiTao.xlsx` (do TT.Marcom giữ, **không** nằm trong repo) lên Google Drive.
2. Mở file → **Tệp → Lưu dưới dạng Google Trang tính**. Sau đó xóa bản `.xlsx` gốc trên Drive để tránh nhầm.
3. Kiểm tra chia sẻ của Sheet: để **Bị hạn chế**. Không chia sẻ cho ai; mọi người truy cập qua Dashboard.

### Bước 2: Dán Apps Script
1. Trong Google Sheet vừa tạo: **Tiện ích mở rộng → Apps Script**.
2. Xóa đoạn code mẫu, dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs). Bấm biểu tượng **Lưu**.
3. Vào **Cài đặt dự án** (biểu tượng bánh răng) → tích **Hiển thị tệp kê khai "appsscript.json"** → quay lại trình soạn thảo, mở `appsscript.json`, thay bằng nội dung file [`apps-script/appsscript.json`](apps-script/appsscript.json) → **Lưu**.

### Bước 3: Khởi tạo và lấy key Chủ hệ thống
1. Ở thanh trên trình soạn thảo, chọn hàm **`setup`** → bấm **Chạy**.
2. Google hỏi cấp quyền → chọn tài khoản → **Nâng cao → Đi tới … (không an toàn)** → **Cho phép**. Đây là script của chính anh/chị nên bước này an toàn.
3. Mở **Nhật ký thực thi** ở dưới cùng, tìm dòng `KEY CHỦ HỆ THỐNG …: SHS-XXXX-XXXX-XXXX-XXXX` → **lưu key này ở nơi an toàn**. Key chỉ hiện một lần.

### Bước 4: Triển khai Web app
1. **Triển khai → Tùy chọn triển khai mới** → bánh răng **Chọn loại → Ứng dụng web**.
2. **Thực thi dưới dạng:** *Tôi*. **Người có quyền truy cập:** *Bất kỳ ai*.
3. **Triển khai** → sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
4. Kiểm tra: mở URL đó trên trình duyệt, thấy `{"ok":true,"service":"SHS Marketing Dashboard API",…}` là đúng.

> "Bất kỳ ai" chỉ có nghĩa là URL nhận được yêu cầu. Không có key hợp lệ thì không đọc hay ghi được gì.

### Bước 5: Gắn URL vào giao diện
Sửa file [`assets/config.js`](assets/config.js), điền URL vào `apiUrl`, rồi commit. Nếu chưa làm bước này, màn hình đăng nhập sẽ hỏi URL và lưu riêng trên trình duyệt của từng người.

### Bước 6: Bật GitHub Pages
Repo → **Settings → Pages → Source:** *Deploy from a branch* → **Branch:** `main` / `(root)` → **Save**.
Sau 1–2 phút, trang chạy tại `https://shs-marcom.github.io/shs-marketing-dashboard/`.

### Bước 7: Tạo key cho mọi người
Mở `…/cms.html` → đăng nhập bằng key Chủ hệ thống → tab **Key truy cập**:
- **Viewer:** đặt tên theo người hoặc đơn vị nhận (VD: *Ban TGĐ*, *Khối Nguồn*).
- **Admin:** đặt tên theo từng Marcomer (VD: tên từng người). Tên key được ghi vào mọi dòng người đó nhập.

Key chỉ hiện một lần khi tạo. Gửi riêng cho từng người qua kênh nội bộ.

---

## Vận hành hằng ngày

| Việc | Ai | Ở đâu |
|---|---|---|
| Nhập / sửa checklist | Admin | `cms.html` → tab **Checklist truyền thông**: gõ hoặc dán từ Excel, rồi bấm **Lưu thay đổi** |
| Một bài đăng lên nhiều kênh | Admin | Tab **Đăng 1 nội dung nhiều kênh**: nhập 1 lần, tích các hạng mục, hệ thống tự tạo các dòng |
| Thêm chương trình / kênh / PIC | Admin | Các tab **Danh mục chương trình**, **Danh sách kênh**, **PIC** |
| Cập nhật số liệu chuyển đổi | Admin | Tab **Dữ liệu chuyển đổi**: up file CSV mới (thay toàn bộ bản cũ) |
| Cấp / khóa / đặt lại key | Chủ hệ thống | Tab **Key truy cập** |
| Xem ai đã làm gì | Chủ hệ thống | Tab **Nhật ký** |

**Hai người cùng sửa một dòng:** người lưu sau sẽ được báo xung đột và không ghi đè lên người lưu trước. Bấm **Tải lại** để lấy bản mới nhất rồi nhập lại phần của mình.

**Xóa nhầm:** dòng bị xóa được chuyển sang tab **Đã xóa** trong Google Sheet. Muốn khôi phục thì copy dòng đó về tab Checklist.

**Quên key:** Chủ hệ thống bấm **Đặt lại key** cho người đó; key cũ hết hiệu lực ngay.

**Mất key Chủ hệ thống:** mở Apps Script → chọn hàm **`taoLaiKeyChu`** → **Chạy** → đọc key mới trong Nhật ký thực thi.

## Cập nhật code Apps Script về sau

Khi `Code.gs` có bản mới: dán đè code → **Lưu** → **Triển khai → Quản lý các bản triển khai** → biểu tượng bút chì → **Phiên bản: Phiên bản mới** → **Triển khai**.

> ⚠ Không bấm *Tùy chọn triển khai mới*: làm vậy sẽ tạo URL mới, giao diện sẽ mất kết nối.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| "Máy chủ API phản hồi không đúng định dạng" | Web app chưa đặt quyền *Bất kỳ ai*, hoặc URL sai (phải kết thúc bằng `/exec`) |
| Không có lựa chọn *Bất kỳ ai* khi triển khai | Tài khoản Google Workspace bị quản trị viên giới hạn; cần dùng tài khoản được phép |
| "Phiên làm việc đã hết" | Phiên đăng nhập kéo dài tối đa 6 giờ; đăng nhập lại |
| "Hệ thống đang bận" | Có người khác đang lưu cùng lúc; đợi vài giây rồi thử lại |

## Cấu trúc thư mục

```
index.html            Dashboard
cms.html              Quản trị dữ liệu
assets/config.js      URL máy chủ API
assets/common.js      Đăng nhập, gọi API, đọc CSV, tiện ích dùng chung
assets/common.css     Giao diện đăng nhập, hộp thoại, thông báo
assets/cms.js         Logic trang Quản trị dữ liệu
assets/logo.png       Logo SHS (bản dùng trên nền sáng)
apps-script/          Code máy chủ (dán vào Google Apps Script)
vendor/               Thư viện đóng gói sẵn, không phụ thuộc CDN
```

## Thư viện

Tất cả đóng gói trong `vendor/`, kèm file giấy phép:

| Thư viện | Phiên bản | Giấy phép |
|---|---|---|
| Jspreadsheet CE | 4.13.4 | MIT |
| jSuites | 4.17.7 | MIT |
| Chart.js | 4.4.1 | MIT |
| SheetJS Community | 0.18.5 | Apache-2.0 |

---
TT.Marcom — Công ty CP Chứng khoán Sài Gòn – Hà Nội (SHS)

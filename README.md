# ShortLink
Ứng dụng web Next.js + SQLite, gồm frontend responsive và API tạo link/redirect/analytics. Backend yêu cầu Node.js 20+ và npm; phần tiện ích Python SQLite hiện có vẫn dùng Python 3.10+.

## Chạy ứng dụng web
```bash
npm install
npm run dev
```
Mở `http://localhost:3000`. Dùng `npm run build && npm start` để chạy production. Node API dùng `better-sqlite3` và `schema.sql`; mặc định DB ở `shortlink.db` trong thư mục dự án. Có thể đặt `SHORTLINK_DB_PATH=/path/to/shortlink.db`.

## Tài khoản
- `POST /api/auth/register` — body `{ "email": "you@example.com", "password": "ít nhất 10 ký tự" }`, tạo tài khoản và đăng nhập ngay.
- `POST /api/auth/login` — đăng nhập bằng email/mật khẩu.
- `POST /api/auth/logout` — thu hồi phiên hiện tại.
- `GET /api/auth/me` — thông tin tài khoản của phiên hiện tại (`user: null` nếu chưa đăng nhập).

Mật khẩu được hash bằng Node.js `scrypt`; session token ngẫu nhiên được lưu ở dạng SHA-256 hash trong bảng `AuthSessions`, còn cookie phiên là `HttpOnly`, `SameSite=Lax`, 30 ngày (có `Secure` khi production). Tạo link khi đăng nhập sẽ gắn `user_id`; endpoint liệt kê/chỉnh sửa/xóa/analytics chỉ cho chủ sở hữu truy cập. Các link tạo ở chế độ khách vẫn là link công khai không gắn user.

## API
- `POST /api/links` — tạo link. JSON: `{"originalUrl":"https://example.com/page","customAlias":"my-page","title":"Optional","expiresAt":"2027-01-01T00:00:00Z","qrConfig":{"color":"#176b55"}}`. `customAlias`, `title`, `expiresAt`, `qrConfig` là tùy chọn. Trả `201` với `link` và `shortUrl`.
- `GET /api/links?limit=20` — danh sách link gần đây.
- `GET /api/links/:code` — chi tiết link.
- `PATCH /api/links/:code` — cập nhật `title`, `expiresAt`, `isActive`, `qrConfig`.
- `DELETE /api/links/:code` — xóa link và Analytics tương ứng.
- `GET /api/links/:code/analytics` — tổng hợp click theo ngày, thiết bị, referer, cùng lượt click gần nhất.
- `GET /:code` — ghi Analytics và redirect `307` tới URL gốc; link hết hạn/vô hiệu hóa/không tồn tại không redirect và trả trang `404`.

Ví dụ tạo link:
```bash
curl -X POST http://localhost:3000/api/links \\
  -H 'content-type: application/json' \\
  -d '{"originalUrl":"https://example.com/page","customAlias":"my-page"}'
```
Lưu ý: mật khẩu của link chưa được triển khai trong API/schema hiện tại. IP lưu theo header proxy (`x-forwarded-for`/`x-real-ip`); chỉ tin header này khi app chạy sau proxy tin cậy. Quốc gia không thể suy ra chỉ từ request hiện có.

## SQLite Python cũ
Yêu cầu: Python 3.10+.

## Khởi tạo CSDL
```bash
python3 database.py
```

Lệnh tạo `shortlink.db` trong thư mục dự án, gồm các bảng `Users`, `Links`, `Analytics`, `AuthSessions` và các index tương ứng. `schema.sql` của web sẽ tự tạo thêm bảng phiên khi server khởi động. Chạy lại lệnh an toàn: các bảng đã tồn tại sẽ được giữ nguyên.

## Sử dụng trong Python
```python
from database import connect
with connect() as db:
    db.execute(
        "INSERT INTO Links (id, original_url, short_code) VALUES (?, ?, ?)",
        ("link-uuid", "https://example.com", "aB3x9"),
    )
```

`connect()` bật kiểm tra khóa ngoại cho mỗi kết nối. `qr_config` dùng kiểu JSON của SQLite (giá trị được lưu như JSON text).

## Kiểm thử
```bash
python3 -m unittest -v
```

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShortLink - FREE Shorten links - Create QR Online",
  description:
    "Rút gọn link nhanh chóng với ShortLink. Tạo mã QR tùy chỉnh, quản lý URL và theo dõi lượt nhấp dễ dàng trên cùng một nền tảng.",
  applicationName: "ShortLink",
  keywords: [
    "rút gọn link",
    "tạo link rút gọn",
    "tạo mã QR",
    "quản lý link",
    "thống kê lượt nhấp",
  ],
  openGraph: {
    title: "ShortLink - FREE Shorten links - Create QR Online",
    description:
      "Rút gọn link, tạo mã QR tùy chỉnh và theo dõi lượt nhấp dễ dàng với ShortLink.",
    type: "website",
    locale: "vi_VN",
    siteName: "ShortLink",
  },
  twitter: {
    card: "summary",
    title: "ShortLink - FREE Shorten links - Create QR Online",
    description:
      "Rút gọn link, tạo mã QR tùy chỉnh và theo dõi lượt nhấp dễ dàng với ShortLink.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

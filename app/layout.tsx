import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShortLink Studio - URL Shortener & QR Code Generator",
  description: "Create short links and customized QR codes, track click performance and analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

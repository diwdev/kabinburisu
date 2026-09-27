import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "kabinburisu — แจ้งขอความช่วยเหลือน้ำท่วม",
  description:
    "ปักหมุดขอความช่วยเหลือน้ำท่วม อำเภอกบินทร์บุรี จังหวัดปราจีนบุรี เชื่อมครัวเรือนที่ประสบภัยกับหน่วยกู้ภัย",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

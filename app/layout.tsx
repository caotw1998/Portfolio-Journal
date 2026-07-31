import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "基金研究台",
    template: "%s | 基金研究台",
  },
  description: "面向中国公募基金的信息搜集、研究与指数对比系统。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedMode = cookieStore.get("portfolio-layout-mode")?.value;
  const layoutMode = storedMode === "mobile" || storedMode === "desktop" ? storedMode : "auto";
  return (
    <html lang="zh-CN" className="h-full antialiased" data-layout-mode={layoutMode}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

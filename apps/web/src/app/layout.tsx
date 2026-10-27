import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "未命名工作室 · 作品集", template: "%s · 作品集" },
  description: "用作品，认真表达。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          跳至内容
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}

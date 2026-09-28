import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docly.uz — юридические документы за минуты",
  description: "AI-конструктор юридических документов для Узбекистана: аренда, бизнес, претензии.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className="h-full antialiased"
    >
      <head>
        {/* Официальный SDK Telegram Mini Apps — без него window.Telegram.WebApp не существует. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

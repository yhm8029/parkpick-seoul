import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegister } from "@/components/Pwa";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "ParkPick Seoul",
  description: "GPS 기반 서울 공영주차 추천과 네이버지도·길안내 연동 PWA",
  applicationName: "ParkPick Seoul",
  appleWebApp: { capable: true, title: "ParkPick", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0b6b57",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body id="top">
        <PwaRegister />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

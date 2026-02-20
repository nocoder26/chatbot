import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import NotificationPrompt from "@/components/NotificationPrompt";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Izana AI — Your Private Fertility Companion",
  description: "Anonymous, secure fertility health guidance. Your data is private and auto-deleted in 24 hours.",
  manifest: "/manifest.json",
  themeColor: "#6C63FF",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Izana AI",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <CookieConsent />
        <NotificationPrompt />
      </body>
    </html>
  );
}

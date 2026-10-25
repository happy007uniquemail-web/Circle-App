/**
 * Root layout - Portfolio Website
 *
 * Includes:
 * - Fonts (next/font)
 * - Theme provider (next-themes)
 * - Metadata
 * - Global CSS
 */

import "./globals.css";
import { Provider } from "next-themes";

import type { Metadata } from "next";
import type { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] }, {
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Khushi Adhikari - Full-Stack Developer",
  description: "Portfolio of Khushi Adhikari, Full-Stack Developer",
  icons: {
    icon: "/favicon.ico",
  },
  apple: {
    title: "Khushi Adhikari - Full-Stack Developer",
    description: "Portfolio of Khushi Adhikari, Full-Stack Developer",
    images: "/favicon.ico",
  },
  openGraph: {
    title: "Khushi Adhikari - Full-Stack Developer",
    description: "Portfolio of Khushi Adhikari, Full-Stack Developer",
    images: "/og-image.png",
    type: "website",
    url: "https://khushiadhikari.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "Khushi Adhikari - Full-Stack Developer",
    description: "Portfolio of Khushi Adhikari, Full-Stack Developer",
    images: "/og-image.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Provider attribute="class" defaultTheme="system">
          {children}
        </Provider>
      </body>
    </html>
  );
}
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevLens AI",
  description: "Understand any codebase in minutes, not days.",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noface",
  description: "Anonymous daily confessions with zero identity and no social pressure."
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
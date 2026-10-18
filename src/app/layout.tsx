import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Himmah Hub — Take part. Grow together.",
  description:
    "A place for youth to connect, contribute and grow with their community.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

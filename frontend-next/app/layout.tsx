import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartQueue — Bank Queue Simulation",
  description: "A real-time multi-window bank queue simulation system with priority routing and auto-balancing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}

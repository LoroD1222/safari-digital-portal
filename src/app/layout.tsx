import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Safari Digital Portal", template: "%s · Safari Digital" },
  description: "Your marketing, website and inquiries in one place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-ink">{children}</body>
    </html>
  );
}

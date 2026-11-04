import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nextmove — Job tracker",
  description: "Search jobs, save listings, and track application status.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

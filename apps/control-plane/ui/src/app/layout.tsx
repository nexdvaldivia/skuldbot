import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
export const metadata: Metadata = {
  title: 'Skuld Control Plane',
  description: 'Manage clients, orchestrators, and licenses',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={
          {
            "--font-montserrat": "system-ui, -apple-system, 'Segoe UI', sans-serif",
            "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
          } as React.CSSProperties
        }
        className="font-sans antialiased"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

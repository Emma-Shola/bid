import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Topbrass",
  description: "Topbrass job application management backend and admin console"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#0b1220", color: "#e5eefc" }}>
        {children}
      </body>
    </html>
  );
}

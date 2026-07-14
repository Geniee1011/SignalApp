import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signals",
  description: "Live counter-trading signals",
};

// Set the theme before paint (no flash of the wrong theme).
const noFouc = `(function(){try{var t=localStorage.getItem('signal-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFouc }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "KeeperLab — Allenamenti portieri",
  description: "Archivio esercizi, creazione sedute e agenda settimanale per preparatori dei portieri.",
  applicationName: "KeeperLab",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "KeeperLab" },
  themeColor: "#173e32",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

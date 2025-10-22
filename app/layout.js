import { Inter } from "next/font/google";
import "./globals.css";
import header from "@/components/header";

const inter =Inter({subsets: ["latin"]});

export const metadata = {
  title: "SlpitGenie",
  description: "Smartest way to split expenses with friends",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logos/logo-s.png" size="any"/>
      </head>

      <body
        className={`${inter.className}`}
      >

        <Header/>
        
        <main className="min-h-screen"> {children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Cormorant_Garamond, Crimson_Pro } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const crimson = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-crimson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wirasat — Pakistan Inheritance Law Assistant",
  description:
    "AI-assisted inheritance share calculations based on Pakistan Succession Act 1925, MFLO 1961, and Shariat Application Act 1962. Informational only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${crimson.variable}`}>
      <body>{children}</body>
    </html>
  );
}

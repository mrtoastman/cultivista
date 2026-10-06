import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
export const metadata: Metadata = { title: "CultiVista", description: "Monitoreo satelital de sus lotes: vea dónde cambió el cultivo y qué revisar en campo." };
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (<html lang="es" className={`${geist.variable} h-full antialiased`}><body className="min-h-full flex flex-col">{children}</body></html>);
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Music Hall — Listen together in real time",
    template: "%s · Music Hall",
  },
  description:
    "Create a room, queue tracks from Spotify, and listen in sync with friends — with live chat built in.",
  applicationName: "Music Hall",
  openGraph: {
    title: "Music Hall",
    description: "Social, synchronized listening rooms powered by Spotify.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} Music Hall · Playback powered by Spotify
        </footer>
      </body>
    </html>
  );
}

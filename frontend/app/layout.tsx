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
    "Create or join a music room. Everyone inside hears the same song at the same moment and chats along.",
  applicationName: "Music Hall",
  openGraph: {
    title: "Music Hall",
    description: "Live music rooms: listen together and chat in real time.",
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
          © {new Date().getFullYear()} Music Hall · Music from Audius &amp; Apple Music previews
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PlayerProvider } from "@/components/player-provider";
import { PlayerBar } from "@/components/player-bar";
import { PlayerSpacer } from "@/components/player-spacer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Podcast Vocabulary Extractor",
  description: "Extract vocabulary from German podcasts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PlayerProvider>
          {children}
          <PlayerSpacer />
          <PlayerBar />
        </PlayerProvider>
      </body>
    </html>
  );
}

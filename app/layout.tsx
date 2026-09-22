import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GameMog: play and create worlds',
  description:
    'Bring a character, describe a world, publish a playable link. Millions of small games on one engine.',
};

/**
 * No webfont. Roblox ships a proprietary face and falls back to Helvetica
 * Neue; we cannot ship theirs, so we render the fallback they already render,
 * out of the operating system, with no network request and no layout shift.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import '@fontsource-variable/figtree';
import './globals.css';

export const metadata: Metadata = {
  title: 'GameMog: play and create worlds',
  description:
    'Bring a character, describe a world, publish a playable link. Millions of small games on one engine.',
};

/** Figtree is bundled locally under the SIL Open Font License. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

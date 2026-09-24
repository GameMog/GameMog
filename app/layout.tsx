import type { Metadata } from 'next';
import '@fontsource-variable/figtree';
import '@fontsource-variable/hubot-sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'GameMog',
  description:
    'Bring a character, describe a world, publish a playable link. Millions of small games on one engine.',
};

/** Figtree (interface) and Hubot Sans (titles) are bundled locally under the SIL Open Font License. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

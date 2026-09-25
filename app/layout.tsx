import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/figtree';
import '@fontsource-variable/hubot-sans';
import './globals.css';
import { Beacon } from './beacon';
import { DEFAULT_DESCRIPTION, pageMeta, siteUrl } from './seo';

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: 'GameMog',
  ...pageMeta({ description: DEFAULT_DESCRIPTION, path: '/' }),
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F2F4F7' };

/** Figtree (interface) and Hubot Sans (titles) are bundled locally under the SIL Open Font License. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Beacon />
      </body>
    </html>
  );
}

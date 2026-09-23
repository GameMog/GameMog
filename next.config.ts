import type { NextConfig } from 'next';

const config: NextConfig = {
  // node:sqlite is a built-in; keep it out of the bundler's way
  serverExternalPackages: ['node:sqlite'],
  // the asset library is read by sandboxed game frames, whose origin is
  // opaque: allow any origin to read these public, hash-checked files
  async headers() {
    return [{
      source: '/assets/:path*',
      headers: [
        { key: 'access-control-allow-origin', value: '*' },
        { key: 'cache-control', value: 'public, max-age=86400' },
        { key: 'x-content-type-options', value: 'nosniff' },
      ],
    }];
  },
};

export default config;

import type { NextConfig } from 'next';

const config: NextConfig = {
  // node:sqlite is a built-in; keep it out of the bundler's way
  serverExternalPackages: ['node:sqlite'],
  // `next build` loads every route to collect page data, and each route opens
  // the database. From several worker processes at once, a fresh database
  // fails the build ("duplicate column name", "database is locked": the first
  // Render deploys, 30 Sep). One worker opens it once.
  experimental: { cpus: 1 },
  // the asset library is read by sandboxed game frames, whose origin is
  // opaque: allow any origin to read these public, hash-checked files
  // Miami OG was renamed Zombie Beach (the owner, 28 Sep): its old links still land
  async redirects() {
    return [
      { source: '/:section(g|mog)/miami-og/:rest*', destination: '/:section/zombie-beach/:rest*', permanent: true },
      // MarioMog Canyon GP became Mog Kart Canyon GP (the owner, 1 Oct; deploy/migrate.mjs)
      { source: '/:section(g|mog)/mariomog-canyon-gp/:rest*', destination: '/:section/mog-kart-canyon-gp/:rest*', permanent: true },
    ];
  },
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

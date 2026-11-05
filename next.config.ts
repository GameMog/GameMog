import type { NextConfig } from 'next';

// storykit/voices/browser-voice-pass.js (MODEL_HUB, RUNTIME_CDN): the hosts a creator's browser fetches the voices from
const STUDIO_CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

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
      // Typson: Honky Tonk Havoc became Country Box (the owner, 5 Oct; deploy/migrate.mjs)
      { source: '/:section(g|mog)/typson-honky-tonk-havoc/:rest*', destination: '/:section/country-box/:rest*', permanent: true },
    ];
  },
  // The Story Kit's static files (public/storykit: the forge, the voices, the work page; a world plays on Mog City,
  // mc.gamemog.com, public/storykit/README.md)
  async rewrites() {
    return [
      // the GPL program the Story Kit serves, its licence and its source offer (public/storykit/vendor/gpl/SOURCE.md)
      { source: '/storykit/vendor/gpl', destination: '/storykit/vendor/gpl/index.html' },
    ];
  },
  // Caching (the owner, 1 Oct: faster loads). Render's edge cache is OFF: with it
  // on, browsers were sent recompressed JPEGs (13 KB for a 32 KB eye texture),
  // which fail the runtime's hash check and broke the worlds that use them. These
  // headers still give browsers long caching, and forbid transforms if it returns.
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          { key: 'access-control-allow-origin', value: '*' },
          // no-transform: a CDN must never recompress these; the runtime checks every byte
          { key: 'cache-control', value: 'public, max-age=3600, s-maxage=31536000, no-transform' },
          { key: 'x-content-type-options', value: 'nosniff' },
        ],
      },
      // asked for by its hash (the runtime adds ?h=): the same bytes forever
      { source: '/assets/:path*', has: [{ type: 'query', key: 'h' }], headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable, no-transform' }] },
      // the library itself is always checked, so a new hash is seen at once
      { source: '/assets/library.json', headers: [{ key: 'cache-control', value: 'public, max-age=0, must-revalidate, no-transform' }] },
      // films and pictures: an hour in the browser, at the edge until the next deploy
      { source: '/media/:path*', headers: [{ key: 'cache-control', value: 'public, max-age=3600, s-maxage=31536000' }] },
      // The Story Kit's voice studio (storykit/voices, framed by the work page): the creator's browser downloads the
      // voice model from Hugging Face (huggingface.co, which redirects the big files to its CDN on *.hf.co) and
      // transformers.js + ONNX Runtime's wasm from jsDelivr; only the GPL phonemizer comes from here. Nothing else.
      { source: '/storykit/voices/:path*', headers: [{ key: 'content-security-policy', value: STUDIO_CSP }] },
    ];
  },
};

export default config;

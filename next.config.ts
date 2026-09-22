import type { NextConfig } from 'next';

const config: NextConfig = {
  // node:sqlite is a built-in; keep it out of the bundler's way
  serverExternalPackages: ['node:sqlite'],
};

export default config;

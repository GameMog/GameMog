/**
 * Lets `node` run the app's TypeScript directly without touching its imports.
 *
 * The lib code uses bundler-style extensionless imports, which is correct for
 * Next. Node's ESM resolver wants explicit extensions. Rather than contort the
 * app to suit a test runner, retry a failed relative resolution with `.ts`.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of ['.ts', '/index.ts']) {
        try { return await next(specifier + ext, context); } catch { /* keep trying */ }
      }
    }
    throw err;
  }
}

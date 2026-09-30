/**
 * Lets the webhook test import cht-voice.ts, which uses extensionless
 * relative imports for the Replit bundler.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(?:[cm]?[jt]s|json|node)$/.test(specifier)
  ) {
    return nextResolve(specifier + ".ts", context);
  }
  return nextResolve(specifier, context);
}

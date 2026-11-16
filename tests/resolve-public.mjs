export async function resolve(specifier, context, next) {
  if (/^\/(shared|games|sdk|vendor)\//.test(specifier)) return next(new URL(`../public${specifier}`, import.meta.url).href, context);
  return next(specifier, context);
}

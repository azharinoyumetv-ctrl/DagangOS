// Each subscription product supplies its own trusted billing and account backend.
export const CATALOG = {
  geraina: { name: 'Geraina POS', hostVariable: 'GERAINA_BACKEND_ORIGIN', host: 'geraina-os.vercel.app', prices: { starter: [149000, 1490000], pro: [349000, 3490000], business: [549000, 5490000] } },
  dapuros: { name: 'DapurOS', hostVariable: 'BACKEND_ORIGIN', host: 'dapuros.vercel.app', prices: { starter: [249000, 2490000], pro: [499000, 4990000], business: [749000, 7490000] } },
};

export function subscriptionBackendHost(env, module) {
  if (!Object.hasOwn(CATALOG, module)) return null;
  const product = CATALOG[module];
  return env[product.hostVariable] || product.host;
}

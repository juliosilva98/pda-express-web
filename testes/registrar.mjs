// Faz o "../supabase.js" dos módulos apontar para o banco falso durante os testes.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '../supabase.js' && ctx.parentURL && ctx.parentURL.includes('/src/plataforma/'))
    return next(new URL('./banco-falso.js', ${JSON.stringify(new URL('./', import.meta.url).href)}).href, ctx);
  return next(spec, ctx);
}`));

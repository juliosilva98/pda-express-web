import { createClient } from '@supabase/supabase-js';

// tolera espaços e o final /rest/v1 copiado do painel do Supabase
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const configurado = Boolean(url && key);

export const supabase = configurado
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

// endereço para onde os e-mails de convite e de nova senha devem voltar
export const enderecoDoSite = () => window.location.origin + import.meta.env.BASE_URL;

export function mensagemDeErro(e) {
  const m = (e && (e.message || e.error_description)) || String(e || '');
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Use o link do convite.';
  if (/password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos.';
  if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da anterior.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet ou a rede da empresa.';
  return m || 'Erro inesperado.';
}

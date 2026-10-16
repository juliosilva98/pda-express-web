import { useEffect, useState } from 'react';
import { supabase, configurado } from './supabase.js';
import Login from './Login.jsx';
import DefinirSenha from './DefinirSenha.jsx';
import Painel from './Painel.jsx';

// o link do convite ou de nova senha chega com o tipo no endereço;
// lido antes de o Supabase limpar o endereço
const tipoDoLink = (() => {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return h.get('type');
})();

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [definirSenha, setDefinirSenha] = useState(tipoDoLink === 'invite' || tipoDoLink === 'recovery');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setDefinirSenha(true);
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configurado) {
    return (
      <Moldura>
        <h1>Configuração incompleta</h1>
        <p>O endereço do banco e a chave pública não foram informados na publicação. Cadastre as variáveis
          VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no GitHub e publique de novo.</p>
      </Moldura>
    );
  }
  if (sessao === undefined) return <Moldura><p className="discreto">Carregando…</p></Moldura>;
  if (!sessao) return <Login />;
  if (definirSenha) return <DefinirSenha primeiraVez={tipoDoLink === 'invite'} onPronto={() => setDefinirSenha(false)} />;
  return <Painel sessao={sessao} />;
}

export function Moldura({ children, largura = 420 }) {
  return (
    <main className="moldura">
      <div className="marca">
        <span className="marca-nome">PDA Express</span>
        <span className="marca-sub">Cotação de custos portuários e prestação de contas</span>
      </div>
      <section className="cartao" style={{ maxWidth: largura }}>{children}</section>
    </main>
  );
}

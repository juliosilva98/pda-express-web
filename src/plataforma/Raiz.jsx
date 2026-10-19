import { useEffect, useState } from 'react';
import { supabase, configurado, enderecoDoSite, mensagemDeErro } from '../supabase.js';
import { carregarCadastros, traduzirErro } from './cadastros.js';
import { carregarColecoes, instalarCapacidades } from './colecoes.js';
import { App, AccessGate, COA, LOGO_B64, ROLES } from '../legacy/sistema.jsx';

const tipoDoLink = (() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type'))();
const senhaFraca = (s) => s.length < 10 || !/[A-Za-z]/.test(s) || !/\d/.test(s);

function Moldura({ children }) {
  return (
    <div className="login-wrap"><div className="login-card">
      <img src={'data:image/png;base64,' + LOGO_B64} alt="Seatrade" className="login-logo" />
      <h1>Gestão de Custeio Seatrade</h1>
      <p className="login-sub">Cotação de custos portuários e prestação de contas</p>
      {children}
    </div></div>
  );
}

function Entrar() {
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState(''), [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const entrar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro(mensagemDeErro(error));
    setOcupado(false);
  };
  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setAviso(''); setOcupado(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDoSite() });
    if (error) setErro(mensagemDeErro(error));
    else setAviso('Se o e-mail estiver cadastrado, você vai receber um link para definir a senha. Ele vale por pouco tempo.');
    setOcupado(false);
  };
  return (
    <Moldura>
      <form onSubmit={modo === 'entrar' ? entrar : enviar} className="login-form">
        {modo === 'link' && <p className="login-note" style={{ marginTop: 0 }}>Informe seu e-mail corporativo. Enviaremos um link para você criar uma senha nova.</p>}
        <div className="field"><label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {modo === 'entrar' && <div className="field"><label htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></div>}
        {erro && <div className="login-msg" role="alert"><strong>{erro}</strong></div>}
        {aviso && <div className="login-msg" role="status"><span>{aviso}</span></div>}
        <button className="btn btn-primary btn-full" disabled={ocupado}>
          {ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Enviar link'}</button>
        <button type="button" className="login-link" onClick={() => { setModo(modo === 'entrar' ? 'link' : 'entrar'); setErro(''); setAviso(''); }}>
          {modo === 'entrar' ? 'Esqueci a senha ou ainda não tenho senha' : 'Voltar para entrar'}</button>
      </form>
      <p className="login-note">Acesso restrito a usuários convidados pela Seatrade.</p>
    </Moldura>
  );
}

function DefinirSenha({ primeiraVez, pronto }) {
  const [s1, setS1] = useState(''), [s2, setS2] = useState('');
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('');
  const salvar = async (e) => {
    e.preventDefault(); setErro('');
    if (senhaFraca(s1)) return setErro('Use pelo menos 10 caracteres, com letras e números.');
    if (s1 !== s2) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: s1 });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    window.history.replaceState(null, '', window.location.pathname);
    pronto();
  };
  return (
    <Moldura>
      <form onSubmit={salvar} className="login-form">
        <p className="login-note" style={{ marginTop: 0 }}><strong>{primeiraVez ? 'Crie sua senha.' : 'Defina uma nova senha.'}</strong> Pelo menos 10 caracteres, com letras e números.</p>
        <div className="field"><label htmlFor="s1">Senha</label><input id="s1" type="password" autoComplete="new-password" required value={s1} onChange={(e) => setS1(e.target.value)} /></div>
        <div className="field"><label htmlFor="s2">Repita a senha</label><input id="s2" type="password" autoComplete="new-password" required value={s2} onChange={(e) => setS2(e.target.value)} /></div>
        {erro && <div className="login-msg" role="alert"><strong>{erro}</strong></div>}
        <button className="btn btn-primary btn-full" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar senha'}</button>
      </form>
    </Moldura>
  );
}

const sair = async () => { await supabase.auth.signOut(); window.location.reload(); };

async function prepararSistema(sessao) {
  const { data: eu, error } = await supabase.from('app_user').select('id, name, email, role, active')
    .eq('auth_id', sessao.user.id).maybeSingle();
  if (error) throw error;
  if (!eu || !eu.active) return { fase: eu ? 'desativado' : 'pendente' };
  const [perms, users] = await Promise.all([
    supabase.from('role_permission').select('permission').eq('role', eu.role),
    supabase.from('app_user').select('id, name, email'),
  ]);
  if (perms.error) throw perms.error;
  if (users.error) throw users.error;
  const contasLista = await carregarCadastros();
  for (const g of Object.keys(COA)) COA[g].items.length = 0;
  for (const a of contasLista) if (COA[a.grp]) COA[a.grp].items.push({ ref: a.code ?? a.ref, name: a.name, ...(a.is_local ? { local: true } : {}) });
  await carregarColecoes(users.data);
  const me = { id: eu.id, name: eu.name, email: eu.email, role: eu.role };
  window.__PDX__ = { supabase, me, role: eu.role, perms: new Set(perms.data.map((p) => p.permission)), sair };
  instalarCapacidades(me);
  return { fase: 'pronto' };
}

export default function Raiz() {
  const [sessao, setSessao] = useState(undefined);
  const [definirSenha, setDefinirSenha] = useState(tipoDoLink === 'invite' || tipoDoLink === 'recovery');
  const [estado, setEstado] = useState({ fase: 'aguardando' });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setDefinirSenha(true);
      if (evento === 'SIGNED_OUT') setEstado({ fase: 'aguardando' });
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const iniciar = () => {
    setEstado({ fase: 'carregando' });
    prepararSistema(sessao).then(setEstado).catch((e) => setEstado({ fase: 'erro', msg: traduzirErro(e) }));
  };
  const userId = sessao && sessao.user && sessao.user.id;
  useEffect(() => { if (userId && !definirSenha && estado.fase === 'aguardando') iniciar(); }, [userId, definirSenha]);

  if (!configurado) return <Moldura><div className="login-msg"><strong>Configuração incompleta.</strong>
    <span>O endereço do banco e a chave pública não foram informados na publicação.</span></div></Moldura>;
  if (sessao === undefined) return <Moldura><p className="login-msg">Carregando…</p></Moldura>;
  if (!sessao) return <Entrar />;
  if (definirSenha) return <DefinirSenha primeiraVez={tipoDoLink === 'invite'} pronto={() => setDefinirSenha(false)} />;
  if (estado.fase === 'pronto') return <AccessGate><App /></AccessGate>;

  const email = sessao.user.email;
  return (
    <Moldura>
      {(estado.fase === 'carregando' || estado.fase === 'aguardando') && <p className="login-msg">Carregando seus dados…</p>}
      {estado.fase === 'pendente' && <div className="login-msg"><strong>Acesso aguardando liberação.</strong>
        <span>Seu login ({email}) funcionou, mas o administrador ainda não liberou seu perfil. Depois da liberação, entre de novo.</span></div>}
      {estado.fase === 'desativado' && <div className="login-msg"><strong>Acesso desativado.</strong><span>Fale com o administrador do sistema.</span></div>}
      {estado.fase === 'erro' && <><div className="login-msg" role="alert"><strong>Não foi possível abrir o sistema.</strong><span>{estado.msg}</span></div>
        <button className="btn btn-primary btn-full" onClick={iniciar}>Tentar de novo</button></>}
      {estado.fase !== 'carregando' && estado.fase !== 'aguardando' && <button className="btn btn-line btn-full" style={{ marginTop: 10 }} onClick={sair}>Sair</button>}
    </Moldura>
  );
}

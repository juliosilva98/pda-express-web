import { useState } from 'react';
import { supabase, enderecoDoSite, mensagemDeErro } from './supabase.js';
import { Moldura } from './App.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState('entrar');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const entrar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro(mensagemDeErro(error));
    setOcupado(false);
  };

  const enviarLink = async (e) => {
    e.preventDefault(); setErro(''); setAviso(''); setOcupado(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDoSite() });
    if (error) setErro(mensagemDeErro(error));
    else setAviso('Se o e-mail estiver cadastrado, você vai receber um link para definir a senha. Ele vale por pouco tempo.');
    setOcupado(false);
  };

  return (
    <Moldura>
      {modo === 'entrar' ? (
        <form onSubmit={entrar}>
          <h1>Entrar</h1>
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button className="primario" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
          <button type="button" className="link" onClick={() => { setModo('link'); setErro(''); }}>Esqueci a senha ou ainda não tenho senha</button>
        </form>
      ) : (
        <form onSubmit={enviarLink}>
          <h1>Definir senha</h1>
          <p className="discreto">Informe seu e-mail corporativo. Enviaremos um link para você criar uma senha nova.</p>
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          {aviso && <p className="ok" role="status">{aviso}</p>}
          <button className="primario" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar link'}</button>
          <button type="button" className="link" onClick={() => { setModo('entrar'); setErro(''); setAviso(''); }}>Voltar para entrar</button>
        </form>
      )}
      <p className="rodape">Acesso restrito a usuários convidados pela Seatrade.</p>
    </Moldura>
  );
}

import { useState } from 'react';
import { supabase, mensagemDeErro } from './supabase.js';
import { Moldura } from './App.jsx';

// senha forte: 10+ caracteres, com letra e número
const fraca = (s) => s.length < 10 || !/[A-Za-z]/.test(s) || !/\d/.test(s);

export default function DefinirSenha({ primeiraVez, onPronto }) {
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e) => {
    e.preventDefault(); setErro('');
    if (fraca(senha)) return setErro('Use pelo menos 10 caracteres, com letras e números.');
    if (senha !== conf) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    window.history.replaceState(null, '', window.location.pathname);
    onPronto();
  };

  return (
    <Moldura>
      <form onSubmit={salvar}>
        <h1>{primeiraVez ? 'Crie sua senha' : 'Nova senha'}</h1>
        <p className="discreto">Pelo menos 10 caracteres, com letras e números. Não reutilize senhas de outros sistemas.</p>
        <label>Senha<input type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        <label>Repita a senha<input type="password" autoComplete="new-password" required value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="primario" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar senha'}</button>
      </form>
    </Moldura>
  );
}

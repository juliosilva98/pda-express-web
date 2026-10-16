import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const PERFIS = { admin: 'Administrador', financeiro: 'Financeiro', operacional: 'Operacional', leitura: 'Leitura' };
const PERMISSOES = {
  ver: 'Consultar os dados', cadastros: 'Editar cadastros', tarifas: 'Editar tarifas e taxas',
  conta_bancaria: 'Cadastrar e conferir contas bancárias', usuarios: 'Gerenciar usuários',
  cotar: 'Fazer cotações', aprovar: 'Aprovar PDA', fda_editar: 'Lançar despesas na FDA',
  fda_validar: 'Validar vouchers', fda_adiantamento: 'Lançar adiantamentos', fda_emitir: 'Emitir PDF da FDA',
  fda_finalizar: 'Finalizar e cancelar FDA', fda_reabrir: 'Reabrir FDA finalizada', auditoria: 'Consultar auditoria',
};
const brl = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Painel({ sessao }) {
  const [estado, setEstado] = useState({ fase: 'carregando' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: eu, error: e1 } = await supabase.from('app_user')
          .select('id, name, role, active').eq('auth_id', sessao.user.id).maybeSingle();
        if (e1) throw e1;
        if (!eu || !eu.active) { if (vivo) setEstado({ fase: 'pendente' }); return; }
        const [perms, fdas, vouchers, despesas, cotacoes] = await Promise.all([
          supabase.from('role_permission').select('permission').eq('role', eu.role),
          supabase.from('fda').select('id, vessel_name, client_name, status, created_at').order('created_at', { ascending: false }),
          supabase.from('voucher').select('id', { count: 'exact', head: true }),
          supabase.from('voucher_expense').select('amount_brl'),
          supabase.from('quotation_doc').select('id', { count: 'exact', head: true }),
        ]);
        const falha = [perms, fdas, vouchers, despesas, cotacoes].find((r) => r.error);
        if (falha) throw falha.error;
        if (vivo) setEstado({
          fase: 'ok', eu,
          perms: perms.data.map((p) => p.permission),
          fdas: fdas.data, nVouchers: vouchers.count, nCotacoes: cotacoes.count,
          totalDespesas: despesas.data.reduce((a, d) => a + Number(d.amount_brl || 0), 0),
        });
      } catch (e) {
        if (vivo) setEstado({ fase: 'erro', msg: (e && (e.message || e.details || e.hint)) || 'Erro desconhecido ao consultar o banco.' });
      }
    })();
    return () => { vivo = false; };
  }, [sessao.user.id]);

  const sair = () => supabase.auth.signOut();

  return (
    <div className="app">
      <header className="topo">
        <div className="marca"><span className="marca-nome">PDA Express</span>
          <span className="marca-sub">Cotação de custos portuários e prestação de contas</span></div>
        <div className="quem">
          {estado.eu && <span><strong>{estado.eu.name}</strong><small>{PERFIS[estado.eu.role]}</small></span>}
          <button className="secundario" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="conteudo">
        {estado.fase === 'carregando' && <p className="discreto">Lendo seus dados…</p>}

        {estado.fase === 'pendente' && (
          <section className="cartao">
            <h1>Acesso aguardando liberação</h1>
            <p>Seu login funcionou, mas o administrador ainda não liberou seu acesso ao sistema.
              Assim que ele definir seu perfil, basta entrar de novo.</p>
          </section>
        )}

        {estado.fase === 'erro' && (
          <section className="cartao">
            <h1>Não foi possível ler os dados</h1>
            <p className="erro">{estado.msg}</p>
            <p className="discreto">Se a mensagem falar em rede ou conexão, a rede da empresa pode estar bloqueando o endereço do Supabase.</p>
          </section>
        )}

        {estado.fase === 'ok' && (<>
          <section className="faixa">
            <p className="faixa-titulo">Ambiente de homologação conectado</p>
            <p>Esta é a primeira etapa do sistema na web: login e leitura do banco. As telas de cotação e prestação de contas chegam na próxima entrega.</p>
          </section>

          <div className="grade">
            <section className="cartao">
              <h2>Dados no banco</h2>
              <dl className="numeros">
                <div><dt>Prestações de contas</dt><dd>{estado.fdas.length}</dd></div>
                <div><dt>Vouchers</dt><dd>{estado.nVouchers}</dd></div>
                <div><dt>Cotações</dt><dd>{estado.nCotacoes}</dd></div>
                <div><dt>Despesas lançadas</dt><dd>{brl(estado.totalDespesas)}</dd></div>
              </dl>
            </section>
            <section className="cartao">
              <h2>O que seu perfil permite</h2>
              <ul className="permissoes">
                {Object.entries(PERMISSOES).map(([k, rot]) => (
                  <li key={k} className={estado.perms.includes(k) ? 'sim' : 'nao'}>
                    <span aria-hidden="true">{estado.perms.includes(k) ? '✓' : '–'}</span>{rot}
                    <span className="sr">{estado.perms.includes(k) ? ' (permitido)' : ' (não permitido)'}</span>
                  </li>))}
              </ul>
            </section>
          </div>

          <section className="cartao">
            <h2>Prestações de contas</h2>
            <div className="rolagem"><table>
              <thead><tr><th>Navio</th><th>Cliente</th><th>Situação</th><th>Criada em</th></tr></thead>
              <tbody>{estado.fdas.map((f) => (
                <tr key={f.id}><td>{f.vessel_name}</td><td>{f.client_name || <span className="discreto">não informado</span>}</td>
                  <td>{{ open: 'Aberta', closed: 'Finalizada', cancelled: 'Cancelada' }[f.status]}</td>
                  <td>{new Date(f.created_at).toLocaleDateString('pt-BR')}</td></tr>))}
              </tbody></table></div>
          </section>
        </>)}
      </main>
    </div>
  );
}

/* ============================================================
   CADASTROS — o "store" do sistema, agora no Supabase.
   O sistema lê e grava listas inteiras (portos, armadores...).
   Aqui elas ficam em memória; a cada alteração, só os itens que
   mudaram são gravados no banco, que aplica as regras de cada perfil.
   ============================================================ */
import { supabase } from '../supabase.js';

const cache = {};                 // chave -> lista atual
const salvo = {};                 // chave -> Map(id -> JSON gravado)
const primeira = {};              // a primeira gravação de cada lista é a da abertura: vira referência
const timers = {}, filas = {};
const tentativas = {};
export const mapa = { company: {}, bank: {}, port: {}, terminal: {}, supplier: {}, shipowner: {}, vessel: {} };
export const rev = { company: {}, bank: {}, port: {}, terminal: {}, supplier: {}, shipowner: {}, vessel: {} };
export const caminhos = {};       // comprovante: id -> caminho no Storage
export const contas = { codeToRef: {}, refToCode: {}, grupoCodigo: {}, lista: [] };
let empresaPadrao = null;

const ligar = (tipo, legado, uuid) => { if (legado && uuid) { mapa[tipo][legado] = uuid; rev[tipo][uuid] = legado; } };
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const inteiro = (v) => Math.round(num(v, 0));
const vazio = (v) => (v === '' || v === undefined ? null : v);
export const ehUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ---------- mensagens ---------- */
let ultimoAviso = { m: '', t: 0 };
export function traduzirErro(e) {
  const m = (e && (e.message || e.details || e.hint)) || String(e || '');
  if (/row-level security|permission denied/i.test(m)) return 'Seu perfil não tem permissão para esta alteração';
  if (/duplicate key|unique/i.test(m)) {
    if (/cnpj/i.test(m)) return 'Já existe um cadastro com este CNPJ';
    if (/shipowner_name|name_key/i.test(m)) return 'Já existe um cadastro com este nome';
    if (/city_state/i.test(m)) return 'Já existe um porto nesta cidade/UF';
    return 'Já existe um registro igual';
  }
  if (/violates not-null/i.test(m)) return 'Há campo obrigatório em branco';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. A alteração não foi gravada.';
  return m;
}
export function avisar(msg) {
  const agora = Date.now();
  if (msg === ultimoAviso.m && agora - ultimoAviso.t < 6000) return;
  ultimoAviso = { m: msg, t: agora };
  if (window.__PDX_TOAST) window.__PDX_TOAST(msg, 'bad'); else console.error(msg);
}
const falha = (contexto, e) => { const err = new Error(`${contexto}: ${traduzirErro(e)}`); err.cause = e; return err; };
async function ok(promessa, contexto) {
  const r = await promessa;
  if (r.error) throw falha(contexto, r.error);
  return r.data;
}

/* ---------- leitura inicial ---------- */
export async function carregarCadastros() {
  const sel = (t, q = '*') => supabase.from(t).select(q);
  const [acc, comp, banks, branches, ports, terms, sups, supPorts, owners, vessels, quots] = await Promise.all([
    sel('account').order('sort_order'), sel('company'), sel('company_bank_account'), sel('company_branch').order('sort_order'),
    sel('port'), sel('terminal'), sel('supplier'), sel('supplier_port'), sel('shipowner'), sel('vessel'),
    sel('quotation_doc').order('quote_date', { ascending: false }),
  ]);
  for (const r of [acc, comp, banks, branches, ports, terms, sups, supPorts, owners, vessels, quots]) if (r.error) throw falha('Leitura dos cadastros', r.error);

  contas.lista = acc.data;
  for (const a of acc.data) {
    const code = a.code ?? a.ref;
    contas.refToCode[a.ref] = code;
    if (code && !(code in contas.codeToRef)) contas.codeToRef[code] = a.ref;
    if (code) contas.grupoCodigo[a.grp + '|' + code] = a.ref;   // o mesmo código pode existir em dois grupos (4129301)
  }
  comp.data.forEach((c) => ligar('company', c.legacy_id || c.id, c.id));
  banks.data.forEach((b) => ligar('bank', b.legacy_id || b.id, b.id));
  ports.data.forEach((p) => ligar('port', p.legacy_id || p.id, p.id));
  terms.data.forEach((t) => ligar('terminal', t.legacy_id || t.id, t.id));
  sups.data.forEach((s) => ligar('supplier', s.legacy_id || s.id, s.id));
  owners.data.forEach((o) => ligar('shipowner', o.legacy_id || o.id, o.id));
  vessels.data.forEach((v) => ligar('vessel', v.legacy_id || v.id, v.id));
  empresaPadrao = (comp.data.find((c) => c.is_default) || comp.data[0] || {}).id || null;

  cache.companies = comp.data.filter((c) => c.active).map((c) => ({
    ...(c.legacy_config || {}),
    id: c.legacy_id || c.id, isDefault: c.is_default, logo: c.logo_url || (c.legacy_config || {}).logo || '',
    legalName: c.legal_name, tradeName: c.trade_name || '', cnpj: c.cnpj, stateReg: c.state_reg || '',
    address: c.address, city: c.city, state: c.state, zip: c.zip || '', country: c.country, phone: c.phone || '', email: c.email || '',
    bankAccounts: banks.data.filter((b) => b.company_id === c.id && b.active).map((b) => ({
      id: b.legacy_id || b.id, label: b.label, beneficiary: b.beneficiary, bank: b.bank, agency: b.agency || '',
      account: b.account, swift: b.swift || '', iban: b.iban || '', bankAddress: b.bank_address || '',
      bankCity: b.bank_city || '', isDefault: b.is_default,
    })),
    branches: branches.data.filter((b) => b.company_id === c.id)
      .map((b) => ({ id: b.id, title: b.title, lines: [b.line1, b.line2].filter((x) => x != null && x !== '') })),
  }));
  const doc = (r, base) => (r.legacy_config ? { ...r.legacy_config, id: r.legacy_id || r.id } : { id: r.legacy_id || r.id, ...base });
  cache.ports = ports.data.filter((p) => p.active).map((p) => doc(p, { name: p.name, city: p.city, state: p.state }));
  cache.terminals = terms.data.filter((t) => t.active).map((t) => doc(t, { portId: rev.port[t.port_id], name: t.name, type: t.kind }));
  cache.suppliers = sups.data.filter((s) => s.active).map((s) => {
    const o = doc(s, { name: s.name, service: s.service, acct: contas.refToCode[s.account_ref] || s.account_ref });
    o.portIds = supPorts.data.filter((x) => x.supplier_id === s.id).map((x) => rev.port[x.port_id]).filter(Boolean);
    return o;
  });
  cache.shipowners = owners.data.filter((o) => o.active).map((o) => doc(o, { name: o.name }));
  cache.vessels = vessels.data.filter((v) => v.active).map((v) => doc(v, {
    name: v.name, shipownerId: rev.shipowner[v.shipowner_id] || '', loa: num(v.loa), grossTonnage: v.gross_tonnage,
    deadWeight: v.dead_weight, vesselType: v.vessel_type, navigation: v.navigation, imo: v.imo || '', flag: v.flag || '',
    ...(v.beam != null ? { beam: num(v.beam) } : {}),
  }));
  cache.quotations = quots.data.map((q) => ({ ...q.data, id: q.legacy_id || q.id, ...(q.fda_id ? { fdaId: q.fda_id } : {}) }));
  cache.companies.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  return contas.lista;
}

/* ---------- store usado pelo sistema ---------- */
const LOCAL = 'pda_v3:';
export const store = {
  get(k, fb) {
    if (k === 'theme') { try { const r = localStorage.getItem(LOCAL + k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
    return k in cache ? cache[k] : fb;
  },
  set(k, v) {
    if (k === 'theme') { try { localStorage.setItem(LOCAL + k, JSON.stringify(v)); } catch (e) {} return; }
    if (!(k in GRAVAR)) return;               // 'company' (legado) e outros: só em memória
    cache[k] = v;
    if (!primeira[k]) {                       // abertura: o que veio do banco é a referência
      primeira[k] = true;
      salvo[k] = new Map((v || []).map((x) => [x.id, JSON.stringify(x)]));
      return;
    }
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => sincronizar(k), 700);
  },
};

function sincronizar(k) {
  filas[k] = (filas[k] || Promise.resolve()).then(() => passo(k)).catch((e) => avisar(e.message));
}
async function passo(k) {
  const lista = cache[k] || [];
  const antes = salvo[k] || new Map();
  const agora = new Map(lista.map((x) => [x.id, JSON.stringify(x)]));
  let mudou = lista.filter((x) => antes.get(x.id) !== agora.get(x.id));
  if (k === 'companies') mudou = [...mudou.filter((c) => !c.isDefault), ...mudou.filter((c) => c.isDefault)];
  const saiu = [...antes.keys()].filter((id) => !agora.has(id));
  let erro = null;
  for (const item of mudou) {
    try {
      const anterior = antes.has(item.id) ? JSON.parse(antes.get(item.id)) : null;
      await GRAVAR[k].salvar(item, anterior);
      antes.set(item.id, agora.get(item.id));
    } catch (e) { erro = erro || e; }
  }
  for (const id of saiu) {
    try { await GRAVAR[k].remover(id); antes.delete(id); } catch (e) { erro = erro || e; }
  }
  salvo[k] = antes;
  if (erro) {
    tentativas[k] = (tentativas[k] || 0) + 1;
    if (tentativas[k] <= 2 && /aguardando/i.test(erro.message)) { setTimeout(() => sincronizar(k), 2500); return; }
    tentativas[k] = 0;
    throw new Error(`${erro.message}. A alteração não foi gravada no banco; recarregue a página para ver os dados atuais.`);
  }
  tentativas[k] = 0;
}

const upsert = async (tabela, linha, contexto) => {
  const d = await ok(supabase.from(tabela).upsert(linha, { onConflict: 'legacy_id' }).select('id').single(), contexto);
  return d.id;
};
const desativar = (tabela, tipo) => async (legado) => {
  const id = mapa[tipo][legado]; if (!id) return;
  await ok(supabase.from(tabela).update({ active: false }).eq('id', id), 'Exclusão');
};
const refConta = (code) => (code && contas.codeToRef[code]) || null;

const GRAVAR = {
  companies: {
    async salvar(c, anterior) {
      const nome = c.tradeName || c.legalName || 'Empresa';
      if (!c.legalName || !c.cnpj || !c.address || !c.city || !c.state)
        throw new Error(`${nome}: preencha razão social, CNPJ, endereço, cidade e UF para gravar`);
      const { bankAccounts, ...resto } = c;
      const id = await upsert('company', {
        legacy_id: c.id, legal_name: c.legalName, trade_name: vazio(c.tradeName), cnpj: c.cnpj, state_reg: vazio(c.stateReg),
        address: c.address, city: c.city, state: String(c.state).slice(0, 2).toUpperCase(), zip: vazio(c.zip),
        country: c.country || 'Brazil', phone: vazio(c.phone), email: vazio(c.email), logo_url: vazio(c.logo),
        is_default: !!c.isDefault, active: true, legacy_config: resto,
      }, `Empresa ${nome}`);
      ligar('company', c.id, id);
      if (c.isDefault) empresaPadrao = id;
      const bancos = [...(bankAccounts || [])].sort((a, b) => (a.isDefault ? 1 : 0) - (b.isDefault ? 1 : 0));
      const antes = (anterior && anterior.bankAccounts) || [];
      for (const b of bancos) {
        if (JSON.stringify(b) === JSON.stringify(antes.find((x) => x.id === b.id))) continue;
        if (!b.beneficiary || !b.bank || !b.account) throw new Error(`Conta ${b.label || ''}: preencha beneficiário, banco e conta`);
        const bid = await upsert('company_bank_account', {
          legacy_id: b.id, company_id: id, label: b.label || b.bank, beneficiary: b.beneficiary, bank: b.bank,
          agency: vazio(b.agency), account: b.account, swift: vazio(b.swift), iban: vazio(b.iban),
          bank_address: vazio(b.bankAddress), bank_city: vazio(b.bankCity), is_default: !!b.isDefault, active: true,
        }, `Conta bancária ${b.label || ''}`);
        ligar('bank', b.id, bid);
      }
      for (const b of antes) if (!bancos.some((x) => x.id === b.id) && mapa.bank[b.id])
        await ok(supabase.from('company_bank_account').update({ active: false, is_default: false }).eq('id', mapa.bank[b.id]), 'Conta bancária');
      if (JSON.stringify(c.branches || []) !== JSON.stringify((anterior && anterior.branches) || [])) {
        await ok(supabase.from('company_branch').delete().eq('company_id', id), 'Filiais');
        const linhas = (c.branches || []).map((b, i) => ({ company_id: id, title: b.title || b.t || '', line1: (b.lines || [])[0] ?? null, line2: (b.lines || [])[1] ?? null, sort_order: i }));
        if (linhas.length) await ok(supabase.from('company_branch').insert(linhas), 'Filiais');
      }
    },
    remover: desativar('company', 'company'),
  },
  ports: {
    async salvar(p) {
      if (!p.name || !p.city || !p.state) throw new Error(`Porto ${p.name || ''}: preencha nome, cidade e UF para gravar`);
      ligar('port', p.id, await upsert('port', {
        legacy_id: p.id, name: p.name, city: p.city, state: String(p.state).slice(0, 2).toUpperCase(),
        company_id: mapa.company[p.companyId] || null, active: true, legacy_config: p,
      }, `Porto ${p.name}`));
    },
    remover: desativar('port', 'port'),
  },
  terminals: {
    async salvar(t) {
      const port = mapa.port[t.portId];
      if (!port) throw new Error(`Terminal ${t.name || ''}: aguardando o porto ser gravado`);
      ligar('terminal', t.id, await upsert('terminal', {
        legacy_id: t.id, port_id: port, name: t.name || 'Terminal', kind: t.type === 'private' ? 'private' : 'public',
        active: true, legacy_config: t,
      }, `Terminal ${t.name}`));
    },
    remover: desativar('terminal', 'terminal'),
  },
  suppliers: {
    async salvar(s) {
      const id = await upsert('supplier', {
        legacy_id: s.id, name: s.name || 'Fornecedor', cnpj: vazio(s.cnpj),
        service: ['towage', 'mooring'].includes(s.service) ? s.service : 'other', contact: vazio(s.contact), email: vazio(s.email),
        account_ref: refConta(s.acct) || refConta('4122008') || contas.lista[0].ref, pda_label: vazio(s.pdaLabel),
        pda_comment: vazio(s.comment), active: true, legacy_config: s,
      }, `Fornecedor ${s.name}`);
      ligar('supplier', s.id, id);
      await ok(supabase.from('supplier_port').delete().eq('supplier_id', id), 'Portos do fornecedor');
      const linhas = (s.portIds || []).map((p) => mapa.port[p]).filter(Boolean).map((port_id) => ({ supplier_id: id, port_id }));
      if (linhas.length) await ok(supabase.from('supplier_port').insert(linhas), 'Portos do fornecedor');
    },
    remover: desativar('supplier', 'supplier'),
  },
  shipowners: {
    async salvar(o) {
      ligar('shipowner', o.id, await upsert('shipowner', {
        legacy_id: o.id, name: o.name || 'Armador', contact: vazio(o.contact), email: vazio(o.email),
        legal_name: vazio(o.legalName), tax_id: vazio(o.taxId), billing_address: vazio(o.billingAddress), country: vazio(o.country),
        invoice_currency: o.invoiceCurrency === 'BRL' ? 'BRL' : 'USD', accounts_email: vazio(o.accountsEmail),
        payment_terms: vazio(o.paymentTerms), company_id: mapa.company[o.companyId] || null,
        bank_account_id: mapa.bank[o.bankAccountId] || null, pilotage_agreement: vazio(o.pilotage_agreement),
        agency_fee: num(o.agency_fee), psp_fee: num(o.psp_fee), communication_fee: num(o.communication_fee),
        car_hire_fee: num(o.car_hire_fee), active: true, legacy_config: o,
      }, `Armador ${o.name}`));
    },
    remover: desativar('shipowner', 'shipowner'),
  },
  vessels: {
    async salvar(v) {
      ligar('vessel', v.id, await upsert('vessel', {
        legacy_id: v.id, name: v.name || 'Navio', imo: vazio(v.imo), flag: vazio(v.flag),
        shipowner_id: mapa.shipowner[v.shipownerId] || null,
        vessel_type: v.vesselType === 'container' ? 'container' : 'bulk',
        navigation: v.navigation === 'cabotagem' ? 'cabotagem' : 'longo',
        loa: num(v.loa), beam: v.beam === '' || v.beam == null ? null : num(v.beam),
        gross_tonnage: inteiro(v.grossTonnage), dead_weight: inteiro(v.deadWeight), active: true, legacy_config: v,
      }, `Navio ${v.name}`));
    },
    remover: desativar('vessel', 'vessel'),
  },
  quotations: {
    async salvar(q) {
      await upsert('quotation_doc', {
        legacy_id: q.id, port_id: mapa.port[(q.port || {}).id] || null,
        shipowner_id: mapa.shipowner[(q.shipowner || {}).id || (q.vessel || {}).shipownerId] || null,
        vessel_name: (q.vessel || {}).name || null, quote_date: q.date || null,
        status: ['draft', 'approved', 'cancelled'].includes(q.status) ? q.status : 'draft',
        approved_at: q.approvedAt || null, fda_id: ehUuid(q.fdaId) ? q.fdaId : null, data: q,
      }, 'Cotação');
    },
    async remover(legado) { await ok(supabase.from('quotation_doc').delete().eq('legacy_id', legado), 'Exclusão da cotação'); },
  },
};
export const empresaPadraoId = () => empresaPadrao;

/* ---------- comprovantes ---------- */
const caminhoDe = (id) => (id && String(id).includes('/') ? id : caminhos[id]) || null;
const MSG_PENDENTE = 'Este comprovante ainda está guardado no sistema antigo e será transferido na próxima etapa da migração.';
export async function abrirComprovante(id) {
  const p = caminhoDe(id);
  if (!p) return avisar('Comprovante não encontrado.');
  if (p.startsWith('pendente/')) return avisar(MSG_PENDENTE);
  const janela = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(p, 300);
  if (error) { if (janela) janela.close(); return avisar('Não foi possível abrir o comprovante: ' + traduzirErro(error)); }
  if (janela) janela.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
export async function baixarComprovante(id) {
  const p = caminhoDe(id);
  if (!p) throw new Error('comprovante não encontrado');
  if (p.startsWith('pendente/')) throw new Error(MSG_PENDENTE);
  const { data, error } = await supabase.storage.from('comprovantes').download(p);
  if (error) throw new Error(traduzirErro(error));
  return new Response(data, { headers: { 'content-type': data.type || 'application/octet-stream' } });
}

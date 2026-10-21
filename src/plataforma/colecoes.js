/* ============================================================
   PRESTAÇÕES E VOUCHERS — o sistema usa uma interface de "coleções"
   (a mesma do artifact). Aqui ela é implementada sobre as tabelas do
   Supabase: fda, fda_advance, fda_export, fda_event, voucher,
   voucher_expense e attachment. As regras (validação, fechamento,
   segregação de funções) são aplicadas pelo banco.
   ============================================================ */
import { supabase } from '../supabase.js';
import { mapa, rev, caminhos, contas, traduzirErro, avisar, empresaPadraoId } from './cadastros.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v) => (v === null || v === undefined ? '' : v);
const clone = (o) => JSON.parse(JSON.stringify(o));
let usuarios = {};
const linhasAdv = {};   // prestação -> { idFrente: uuid }
const nome = (id) => (id && usuarios[id] && usuarios[id].name) || '';

async function ok(promessa, contexto) {
  const r = await promessa;
  if (r.error) { const e = new Error(`${contexto}: ${traduzirErro(r.error)}`); e.cause = r.error; throw e; }
  return r.data;
}

/* ---------- FDA ---------- */
const FDA = [
  ['vessel', 'vessel_name', 't'], ['voyage', 'voyage', 't'], ['port', 'port_label', 't'], ['loa', 'loa', 'n'], ['beam', 'beam', 'n'],
  ['grt', 'grt', 'i'], ['dwt', 'dwt', 'i'], ['arrivedAt', 'arrived_at', 't'], ['arrivedFrom', 'arrived_from', 't'],
  ['sailedAt', 'sailed_at', 't'], ['sailedTo', 'sailed_to', 't'], ['draft', 'draft', 't'], ['loadedQty', 'loaded_qty', 't'],
  ['dischargeQty', 'discharge_qty', 't'], ['remarks', 'remarks', 't'], ['agent', 'agent_name', 't'], ['agentAddress', 'agent_address', 't'],
  ['to', 'client_name', 't'], ['clientAddress', 'client_address', 't'], ['remitTo', 'remit_to', 't'], ['bank', 'remit_bank', 't'],
  ['account', 'remit_account', 't'], ['swift', 'remit_iban_swift', 't'], ['currency', 'currency', 'moeda'], ['invoiceNo', 'invoice_no', 't'],
  ['invoiceDate', 'invoice_date', 'd'], ['roe', 'roe', 'roe'], ['pdaId', 'pda_legacy_id', 't'], ['pdaTerminal', 'pda_terminal', 't'],
];
const FDA_REFS = [['companyId', 'company_id', 'company'], ['shipownerId', 'shipowner_id', 'shipowner'], ['bankAccountId', 'bank_account_id', 'bank']];
const FDA_ESPECIAIS = new Set(['id', 'status', 'createdAt', 'advances', 'exports', 'closing', 'closedAt', 'history', 'copiedFrom', 'kind', 'parentFdaId']);
const FDA_CONHECIDOS = new Set([...FDA.map((f) => f[0]), ...FDA_REFS.map((f) => f[0]), ...FDA_ESPECIAIS]);

function conv(v, t) {
  if (t === 't') return v === undefined || v === null ? null : String(v);
  if (t === 'n') return num(v);
  if (t === 'i') return v === '' || v == null ? null : Math.round(Number(v));
  if (t === 'd') return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? String(v).slice(0, 10) : null;
  if (t === 'roe') return Number(v) > 0 ? Number(v) : 1;
  if (t === 'moeda') return v === 'BRL' ? 'BRL' : 'USD';
  return v;
}
function extraDe(doc, conhecidos) {
  const x = {};
  for (const k of Object.keys(doc)) if (!conhecidos.has(k) && doc[k] !== undefined) x[k] = doc[k];
  return Object.keys(x).length ? x : null;
}
function linhaFda(doc) {
  const r = {};
  for (const [k, c, t] of FDA) if (k in doc) r[c] = conv(doc[k], t);
  for (const [k, c, tipo] of FDA_REFS) if (k in doc) r[c] = mapa[tipo][doc[k]] || null;
  if (!r.company_id) r.company_id = empresaPadraoId();
  if ('copiedFrom' in doc) r.copied_from = doc.copiedFrom || null;
  // SDA (arquivo 07): só vai ao banco quando o documento traz o campo
  if ('kind' in doc) r.kind = doc.kind === 'sda' ? 'sda' : 'fda';
  if ('parentFdaId' in doc) r.parent_fda_id = doc.parentFdaId || null;
  r.extra = extraDe(doc, FDA_CONHECIDOS);
  return r;
}
function docFda(f, advs, exps, evs) {
  const d = { ...(f.extra || {}) };
  for (const [k, c, t] of FDA) {
    const v = f[c];
    d[k] = t === 'n' || t === 'i' ? (v == null ? 0 : Number(v)) : t === 'roe' ? Number(v) : txt(v);
  }
  for (const [k, c, tipo] of FDA_REFS) d[k] = rev[tipo][f[c]] || '';
  d.id = f.id; d.status = f.status; d.createdAt = f.created_at;
  if (f.copied_from) d.copiedFrom = f.copied_from;
  if (f.kind !== undefined) d.kind = f.kind || 'fda';   // sem o arquivo 07 a coluna não existe
  if (f.parent_fda_id) d.parentFdaId = f.parent_fda_id;
  const regAdv = (linhasAdv[f.id] = {});
  for (const a of advs) regAdv[a.legacy_id || a.id] = a.id;
  d.advances = advs.map((a) => ({ ...(a.extra || {}), id: a.legacy_id || a.id, label: txt(a.label), date: txt(a.credit_date),
    brl: Number(a.amount_brl), roe: Number(a.roe), ...(a.note ? { note: a.note } : {}) }));
  d.exports = {};
  for (const x of exps) d.exports[x.kind] = { at: x.generated_at, fp: x.fingerprint, by: x.generated_by, byName: nome(x.generated_by) };
  if (f.status === 'closed') {
    d.closedAt = f.closed_at;
    d.closing = { at: f.closed_at, by: f.closed_by, byName: nome(f.closed_by), fp: f.closing_fingerprint, vouchers: f.closing_vouchers,
      docs: f.closing_docs, totalBrl: num(f.closing_total_brl), totalUsd: num(f.closing_total_usd), advBrl: num(f.closing_adv_brl),
      advUsd: num(f.closing_adv_usd), saldoBrl: num(f.closing_balance_brl), saldoUsd: num(f.closing_balance_usd), note: txt(f.closing_note) };
  } else { d.closedAt = null; d.closing = null; }
  d.history = evs.map((e) => ({ at: e.at, by: e.by_user, byName: nome(e.by_user), action: e.action, note: txt(e.note),
    ...(e.total_usd != null ? { totalUsd: Number(e.total_usd) } : {}), ...(e.balance_usd != null ? { saldoUsd: Number(e.balance_usd) } : {}) }));
  return d;
}
async function lerFdas(id) {
  const filtro = (q, col) => (id ? q.eq(col, id) : q);
  const [f, a, x, e] = await Promise.all([
    filtro(supabase.from('fda').select('*'), 'id'),
    filtro(supabase.from('fda_advance').select('*').order('created_at'), 'fda_id'),
    filtro(supabase.from('fda_export').select('*').order('generated_at'), 'fda_id'),
    filtro(supabase.from('fda_event').select('*').order('at'), 'fda_id'),
  ]);
  for (const r of [f, a, x, e]) if (r.error) throw new Error('Leitura das prestações: ' + traduzirErro(r.error));
  return f.data.map((row) => docFda(row, a.data.filter((v) => v.fda_id === row.id),
    x.data.filter((v) => v.fda_id === row.id), e.data.filter((v) => v.fda_id === row.id)));
}
const linhaAdiantamento = (fdaId, a, roeFda) => {
  const { id, label, date, brl, roe, note, ...resto } = a;
  return { fda_id: fdaId, legacy_id: id, label: label || null, credit_date: conv(date, 'd'), amount_brl: Number(brl),
    roe: Number(roe) > 0 ? Number(roe) : Number(roeFda) || 1, note: note || null, extra: Object.keys(resto).length ? resto : null };
};
async function gravarFda(antes, depois) {
  const id = depois.id;
  const a = linhaFda(antes), b = linhaFda(depois), patch = {};
  for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) patch[k] = b[k];
  // adiantamentos
  const regAdv = linhasAdv[id] || (linhasAdv[id] = {});
  const advA = new Map((antes.advances || []).map((x) => [x.id, JSON.stringify(x)]));
  const advB = depois.advances || [];
  for (const adv of advB) {
    if (advA.get(adv.id) === JSON.stringify(adv) && regAdv[adv.id]) continue;
    const linha = linhaAdiantamento(id, adv, depois.roe);
    if (regAdv[adv.id]) await ok(supabase.from('fda_advance').update(linha).eq('id', regAdv[adv.id]), 'Adiantamento');
    else regAdv[adv.id] = (await ok(supabase.from('fda_advance').insert(linha).select('id').single(), 'Adiantamento')).id;
  }
  for (const k of advA.keys()) if (!advB.some((x) => x.id === k) && regAdv[k]) {
    await ok(supabase.from('fda_advance').delete().eq('id', regAdv[k]), 'Exclusão do adiantamento');
    delete regAdv[k];
  }
  // PDFs gerados
  for (const [kind, e] of Object.entries(depois.exports || {})) {
    const e0 = (antes.exports || {})[kind];
    if (e && (!e0 || e0.fp !== e.fp || e0.at !== e.at))
      await ok(supabase.from('fda_export').insert({ fda_id: id, kind, fingerprint: e.fp || '?' }), 'Registro do PDF');
  }
  // situação
  const st0 = antes.status || 'open', st1 = depois.status || 'open';
  if (st1 !== st0) {
    patch.status = st1;
    if (st1 === 'closed') {
      const c = depois.closing || {};
      Object.assign(patch, { closing_note: c.note || null, closing_fingerprint: c.fp || null, closing_vouchers: c.vouchers ?? null,
        closing_total_brl: c.totalBrl ?? null, closing_total_usd: c.totalUsd ?? null, closing_adv_brl: c.advBrl ?? null,
        closing_adv_usd: c.advUsd ?? null, closing_balance_brl: c.saldoBrl ?? null, closing_balance_usd: c.saldoUsd ?? null });
    } else if (st0 === 'closed' && st1 === 'open') {
      const h = (depois.history || []).filter((x) => x.action === 'reopened').pop();
      patch.reopen_reason = (h && h.note) || '';
    } else if (st1 === 'cancelled') {
      // o gatilho fn_fda_close_guard grava o evento 'cancelled' com closing_note como motivo
      const h = (depois.history || []).filter((x) => x.action === 'cancelled').pop();
      patch.closing_note = (h && h.note) || null;
    }
  }
  if (Object.keys(patch).length) await ok(supabase.from('fda').update(patch).eq('id', id), 'Prestação');
}
async function incluirFda(doc) {
  const linha = { ...linhaFda(doc), status: 'open' };
  if (doc.createdAt) linha.created_at = doc.createdAt;
  const r = await ok(supabase.from('fda').insert(linha).select('id').single(), 'Nova prestação');
  const advs = (doc.advances || []).map((adv) => linhaAdiantamento(r.id, adv, doc.roe));
  if (advs.length) await ok(supabase.from('fda_advance').insert(advs), 'Adiantamento');
  return r.id;
}

/* ---------- VOUCHER ---------- */
const V_CONHECIDOS = new Set(['id', 'fdaId', 'number', 'group', 'accountRef', 'accountName', 'source', 'status', 'estimatedUsd',
  'estimatedBrl', 'estimatedFrom', 'estimatedItems', 'validatedAt', 'validatedBy', 'expenses']);
const E_CONHECIDOS = new Set(['id', 'date', 'description', 'notes', 'brl', 'usd', 'fromPda', 'assetId', 'assetName', 'assetSize', 'assetType']);
const idFrente = (e) => (e.legacy_id && e.legacy_id.includes(':') ? e.legacy_id.split(':').pop() : e.legacy_id || e.id);
const linhasExp = {};   // voucher -> { idFrente: {uuid, anexo} }

function docVoucher(v, exps, anexos) {
  const extra = { ...(v.extra || {}) };
  const ref = v.account_ref ? (contas.refToCode[v.account_ref] ?? v.account_ref) : (extra.accountRef || '');
  delete extra.accountRef;
  const d = { ...extra, id: v.id, fdaId: v.fda_id, number: v.number, group: v.grp, accountRef: ref, accountName: v.account_name,
    source: v.source, status: v.status };
  if (v.estimated_usd != null) d.estimatedUsd = Number(v.estimated_usd);
  if (v.estimated_brl != null) d.estimatedBrl = Number(v.estimated_brl);
  if (v.estimated_from != null) d.estimatedFrom = v.estimated_from;
  if (v.estimated_items != null) d.estimatedItems = v.estimated_items;
  if (v.validated_at) d.validatedAt = v.validated_at;
  if (v.validated_by) d.validatedBy = v.validated_by;
  const reg = (linhasExp[v.id] = {});
  d.expenses = exps.map((e) => {
    const { usdBlank, ...ex } = e.extra || {};
    const o = { ...ex, id: idFrente(e), date: txt(e.expense_date), description: txt(e.description), notes: txt(e.notes),
      brl: Number(e.amount_brl), usd: usdBlank ? '' : Number(e.amount_usd) };
    if (e.from_pda) o.fromPda = true;
    const at = anexos.find((a) => a.expense_id === e.id);
    if (at) {
      const aid = at.legacy_id || at.storage_path;
      caminhos[aid] = at.storage_path;
      Object.assign(o, { assetId: aid, assetName: at.file_name, assetSize: at.size_bytes, assetType: at.content_type });
    }
    reg[o.id] = { uuid: e.id, anexo: at ? at.id : null };
    return o;
  });
  return d;
}
async function lerVouchers(id) {
  let v = supabase.from('voucher').select('*').order('number');
  if (id) v = v.eq('id', id);
  const rv = await v;
  if (rv.error) throw new Error('Leitura dos vouchers: ' + traduzirErro(rv.error));
  const ids = rv.data.map((x) => x.id);
  if (!ids.length) return [];
  let e = supabase.from('voucher_expense').select('*').order('sort_order', { nullsFirst: false }).order('created_at');
  e = id ? e.eq('voucher_id', id) : e;
  const re = await e;
  if (re.error) throw new Error('Leitura das despesas: ' + traduzirErro(re.error));
  const expIds = re.data.map((x) => x.id);
  let anexos = [];
  if (expIds.length) {
    let a = supabase.from('attachment').select('*').is('deleted_at', null);
    if (id) a = a.in('expense_id', expIds);
    const ra = await a;
    if (ra.error) throw new Error('Leitura dos comprovantes: ' + traduzirErro(ra.error));
    anexos = ra.data;
  }
  return rv.data.map((row) => docVoucher(row, re.data.filter((x) => x.voucher_id === row.id), anexos));
}
function linhaVoucher(d) {
  const code = d.accountRef || '';
  const ref = code ? contas.grupoCodigo[(d.group || 'port') + '|' + code] || contas.codeToRef[code] || null : null;
  const extra = extraDe(d, V_CONHECIDOS) || {};
  if (code && !ref) extra.accountRef = code;
  const r = { number: Math.round(Number(d.number) || 1), grp: d.group || 'port', account_ref: ref, account_name: d.accountName || '',
    source: d.source === 'pda' ? 'pda' : 'manual', estimated_usd: num(d.estimatedUsd), estimated_brl: num(d.estimatedBrl),
    estimated_from: d.estimatedFrom ?? null, estimated_items: d.estimatedItems ?? null, extra: Object.keys(extra).length ? extra : null };
  if (d.fdaId) r.fda_id = d.fdaId;
  return r;
}
function linhaDespesa(e, ordem) {
  const extra = extraDe(e, E_CONHECIDOS) || {};
  if (e.usd === '' || e.usd == null) extra.usdBlank = true;
  return { expense_date: conv(e.date, 'd'), description: e.description || '', notes: e.notes || null,
    amount_brl: Number(e.brl) || 0, amount_usd: Number(e.usd) || 0, from_pda: !!e.fromPda, sort_order: ordem,
    extra: Object.keys(extra).length ? extra : null };
}
async function gravarDespesas(voucherId, antes, depois) {
  const reg = linhasExp[voucherId] || (linhasExp[voucherId] = {});
  const mapaAntes = new Map((antes || []).map((e) => [e.id, e]));
  for (let i = 0; i < depois.length; i++) {
    const e = depois[i], e0 = mapaAntes.get(e.id), linha = linhaDespesa(e, i + 1);
    let uuid = reg[e.id] && reg[e.id].uuid;
    if (!e0 || !uuid) {
      const r = await ok(supabase.from('voucher_expense').insert({ ...linha, voucher_id: voucherId, legacy_id: `${voucherId}:${e.id}` }).select('id').single(), 'Despesa');
      uuid = r.id; reg[e.id] = { uuid, anexo: null };
    } else if (JSON.stringify(linhaDespesa(e0, mapaAntes.size && [...mapaAntes.keys()].indexOf(e.id) + 1)) !== JSON.stringify(linha)) {
      await ok(supabase.from('voucher_expense').update(linha).eq('id', uuid), 'Despesa');
    }
    const a0 = e0 && e0.assetId, a1 = e.assetId;
    if (a0 !== a1) {
      if (a0 && reg[e.id].anexo) {
        await ok(supabase.from('attachment').update({ deleted_at: new Date().toISOString() }).eq('id', reg[e.id].anexo), 'Remoção do comprovante');
        reg[e.id].anexo = null;
      }
      if (a1) {
        const r = await ok(supabase.from('attachment').insert({ expense_id: uuid, legacy_id: a1, file_name: e.assetName || 'comprovante',
          storage_path: caminhos[a1] || a1, content_type: e.assetType || null, size_bytes: e.assetSize ?? null }).select('id').single(), 'Comprovante');
        reg[e.id].anexo = r.id;
      }
    }
  }
  for (const [k] of mapaAntes) if (!depois.some((e) => e.id === k) && reg[k]) {
    await ok(supabase.from('voucher_expense').delete().eq('id', reg[k].uuid), 'Exclusão da despesa');
    delete reg[k];
  }
}
async function gravarVoucher(antes, depois) {
  const despesasMudaram = JSON.stringify(antes.expenses || []) !== JSON.stringify(depois.expenses || []);
  if (despesasMudaram) await gravarDespesas(depois.id, antes.expenses || [], depois.expenses || []);
  const a = linhaVoucher(antes), b = linhaVoucher(depois), patch = {};
  for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) patch[k] = b[k];
  if ((depois.status || 'pending') !== (antes.status || 'pending')) patch.status = depois.status || 'pending';
  // alterar despesa de voucher validado: o próprio banco reabre (trg_reopen_expense).
  // Pedir "pendente" de novo seria uma reabertura manual, que o perfil operacional não pode fazer.
  if (patch.status === 'pending' && antes.status === 'validated' && despesasMudaram) {
    const atual = await ok(supabase.from('voucher').select('status').eq('id', depois.id).single(), 'Voucher');
    if (atual.status === 'pending') delete patch.status;
  }
  if (Object.keys(patch).length) await ok(supabase.from('voucher').update(patch).eq('id', depois.id), 'Voucher');
}
async function incluirVoucher(doc) {
  const linha = { ...linhaVoucher(doc), status: 'pending' };
  const r = await ok(supabase.from('voucher').insert(linha).select('id').single(), 'Novo voucher');
  const reg = (linhasExp[r.id] = {});
  const exps = doc.expenses || [];
  if (exps.length && exps.every((e) => !e.assetId)) {
    const linhas = exps.map((e, i) => ({ ...linhaDespesa(e, i + 1), voucher_id: r.id, legacy_id: `${r.id}:${e.id}` }));
    const criadas = await ok(supabase.from('voucher_expense').insert(linhas).select('id, legacy_id'), 'Despesas');
    for (const c of criadas) reg[c.legacy_id.split(':').pop()] = { uuid: c.id, anexo: null };
  } else await gravarDespesas(r.id, [], exps);
  const podeValidar = window.__PDX__ && window.__PDX__.perms && window.__PDX__.perms.has('fda_validar');
  if (doc.status === 'validated' && podeValidar)
    await ok(supabase.from('voucher').update({ status: 'validated' }).eq('id', r.id), 'Validação');
  return r.id;
}

/* ---------- coleções com escuta e gravação ordenada ---------- */
function criarColecao(nomeCol, ler, incluir, gravar, excluir) {
  const docs = new Map();
  const ouvintes = new Set();
  const estado = new Map();   // id -> { desejado, esperando:[], rodando, timer }
  const avisarOuvintes = () => queueMicrotask(() => { for (const o of ouvintes) o(); });
  const snapshot = (filtro) => {
    const lista = [...docs.values()].filter((d) => !filtro || d[filtro[0]] === filtro[1]);
    return { docs: lista.map((d) => ({ id: d.id, exists: true, data: () => clone(d) })), empty: !lista.length, size: lista.length };
  };
  async function recarregar(id) {
    const novos = await ler(id);
    if (id) { if (novos[0]) docs.set(id, novos[0]); else docs.delete(id); }
    else { docs.clear(); novos.forEach((d) => docs.set(d.id, d)); }
    avisarOuvintes();
  }
  function agendar(id) {
    const s = estado.get(id);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => rodar(id), 350);
  }
  async function rodar(id) {
    const s = estado.get(id);
    if (!s || s.rodando) return;
    s.rodando = true;
    let erro = null;
    try {
      while (s.desejado) {
        const alvo = s.desejado, quem = s.esperando; s.esperando = [];
        try {
          await gravar(s.base, alvo);
          s.base = alvo;
          if (s.desejado === alvo) s.desejado = null;
          quem.forEach((w) => w.ok());
        } catch (e) { erro = e; s.desejado = null; quem.forEach((w) => w.falha(e)); s.esperando.forEach((w) => w.falha(e)); s.esperando = []; }
      }
    } finally {
      try { await recarregar(id); } catch (e) { erro = erro || e; }
      s.rodando = false;
      if (erro) avisar(erro.message);
      if (s.desejado && !erro) {
        // chegou alteração enquanto o banco confirmava: aplica sobre a versão gravada
        s.base = clone(docs.get(id) || s.base);
        docs.set(id, s.desejado); avisarOuvintes(); agendar(id);
      } else {
        s.esperando.forEach((w) => (erro ? w.falha(erro) : w.ok()));
        estado.delete(id);
      }
    }
  }
  const api = {
    ocupado: () => estado.size > 0,
    recarregar,
    collection: {
      add: async (dados) => {
        try {
          const id = await incluir(clone(dados));
          await recarregar(id);
          return { id };
        } catch (e) { avisar(e.message); throw e; }
      },
      get: async (filtro) => snapshot(filtro),
      onSnapshot: (filtro, cb, err) => {
        const f = () => { try { cb(snapshot(filtro)); } catch (e) { if (err) err(e); } };
        ouvintes.add(f); queueMicrotask(f);
        return () => ouvintes.delete(f);
      },
    },
    doc: (id) => ({
      get: async () => { const d = docs.get(id); return { id, exists: !!d, data: () => (d ? clone(d) : undefined) }; },
      onSnapshot: (cb) => {
        const f = () => { const d = docs.get(id); cb({ id, exists: !!d, data: () => (d ? clone(d) : undefined) }); };
        ouvintes.add(f); queueMicrotask(f);
        return () => ouvintes.delete(f);
      },
      update: (patch) => new Promise((resolve, reject) => {
        const atual = docs.get(id);
        if (!atual) return reject(new Error('Registro não encontrado'));
        let s = estado.get(id);
        if (!s) { s = { base: clone(atual), desejado: null, esperando: [], rodando: false }; estado.set(id, s); }
        const novo = { ...(s.desejado || atual), ...clone(patch) };
        s.desejado = novo; s.esperando.push({ ok: resolve, falha: reject });
        docs.set(id, novo); avisarOuvintes();
        agendar(id);
      }),
      set: (dados) => api.doc(id).update(dados),
      delete: async () => {
        try { await excluir(id); docs.delete(id); avisarOuvintes(); }
        catch (e) { avisar(e.message); throw e; }
      },
    }),
  };
  return api;
}

const fdas = criarColecao('fdas', lerFdas, incluirFda, gravarFda,
  async () => { throw new Error('Prestações não são excluídas: use o cancelamento'); });
const vouchers = criarColecao('vouchers', lerVouchers, incluirVoucher, gravarVoucher,
  async (id) => { await ok(supabase.from('voucher').delete().eq('id', id), 'Exclusão do voucher'); delete linhasExp[id]; });
const colecoes = { fdas, vouchers };

function colecao(n, filtro) {
  const c = colecoes[n];
  if (!c) {   // appusers/accessreq: substituídos pela tela de usuários nova
    const vaziaSnap = { docs: [], empty: true, size: 0 };
    return { add: async () => ({ id: null }), get: async () => vaziaSnap, onSnapshot: (cb) => { queueMicrotask(() => cb(vaziaSnap)); return () => {}; },
      where: () => colecao(n) };
  }
  return {
    add: (d) => c.collection.add(d),
    get: () => c.collection.get(filtro),
    onSnapshot: (cb, err) => c.collection.onSnapshot(filtro, cb, err),
    where: (campo, op, valor) => { if (op !== '==') throw new Error('Filtro não suportado'); return colecao(n, [campo, valor]); },
  };
}
const db = {
  collection: (n) => colecao(n),
  doc: (caminho) => {
    const [n, id] = caminho.split('/');
    const c = colecoes[n];
    if (!c) return { get: async () => ({ id, exists: false, data: () => undefined }), set: async () => {}, update: async () => {}, delete: async () => {}, onSnapshot: (cb) => { queueMicrotask(() => cb({ id, exists: false, data: () => undefined })); return () => {}; } };
    return c.doc(id);
  },
};

/* ---------- comprovantes, downloads e usuário ---------- */
const TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/xml', 'text/xml'];
const assets = {
  upload: async (arquivo) => {
    if (!TIPOS.includes(arquivo.type)) throw new Error('tipo de arquivo não aceito (use PDF, imagem PNG, JPEG ou WEBP, ou XML)');
    if (arquivo.size > 20 * 1024 * 1024) throw new Error('o arquivo excede 20 MB');
    const agora = new Date();
    const ext = (arquivo.name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
    const caminho = `fda/${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;
    const { error } = await supabase.storage.from('comprovantes').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (error) throw new Error(traduzirErro(error));
    caminhos[caminho] = caminho;
    return { id: caminho, url: '#', sizeBytes: arquivo.size, contentType: arquivo.type };
  },
  delete: async () => {},          // o arquivo fica no histórico; a despesa só deixa de apontar para ele
  list: async () => ({ assets: [], usage: {} }),
};
function baixar(filename, data) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { status: 'saved', ok: true };   // o sistema só registra o PDF gerado com status 'saved'
}
/* PDFs abrem numa janela de pré-visualização; só vão para o computador (e só
   contam como gerados, para o fechamento da FDA) se a pessoa clicar em Baixar. */
function previa(filename, data) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(data);
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const ov = el('div', 'pv-ov'), caixa = el('div', 'pv-box'), topo = el('div', 'pv-head');
    const titulo = el('strong', 'pv-title', filename);
    const botoes = el('div', 'pv-acts');
    const bBaixar = el('button', 'btn btn-primary btn-sm', 'Baixar');
    const bFechar = el('button', 'btn btn-line btn-sm', 'Fechar');
    bBaixar.type = 'button'; bFechar.type = 'button';
    const quadro = el('iframe', 'pv-frame'); quadro.title = 'Pré-visualização: ' + filename; quadro.src = url;
    botoes.appendChild(bBaixar); botoes.appendChild(bFechar);
    topo.appendChild(titulo); topo.appendChild(botoes);
    caixa.appendChild(topo); caixa.appendChild(quadro); ov.appendChild(caixa);
    let fim = false;
    const terminar = (resp) => {
      if (fim) return; fim = true;
      document.removeEventListener('keydown', tecla, true);
      ov.remove(); URL.revokeObjectURL(url);
      resolve(resp);
    };
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); terminar({ status: 'cancelled' }); } };
    bBaixar.onclick = () => terminar(baixar(filename, data));
    bFechar.onclick = () => terminar({ status: 'cancelled' });
    ov.onclick = (e) => { if (e.target === ov) terminar({ status: 'cancelled' }); };
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(ov);
    bBaixar.focus && bBaixar.focus();
  });
}
const downloads = {
  save: async ({ filename, data }) =>
    data && data.type === 'application/pdf' ? previa(filename, data) : baixar(filename, data),
};

export async function carregarColecoes(listaUsuarios) {
  usuarios = Object.fromEntries(listaUsuarios.map((u) => [u.id, u]));
  await Promise.all([fdas.recarregar(), vouchers.recarregar()]);
}
export function instalarCapacidades(me) {
  const user = {
    me: async () => ({ id: me.id, name: me.name, email: me.email }),
    id: async () => me.id, isOwner: async () => me.role === 'admin', canEdit: async () => me.role === 'admin', can: async () => true,
    profiles: async (ids) => Object.fromEntries((ids || []).map((i) => [i, { name: nome(i), email: (usuarios[i] || {}).email || '' }])),
    search: async () => [],
  };
  const caps = { db, assets, downloads, user };
  window.claude = { use: async (n) => caps[n] || null };
  // atualização periódica: o que outras pessoas gravaram aparece sem recarregar a página
  setInterval(() => {
    if (document.hidden || fdas.ocupado() || vouchers.ocupado()) return;
    Promise.all([fdas.recarregar(), vouchers.recarregar()]).catch(() => {});
  }, 30000);
}

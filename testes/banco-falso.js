// Banco falso em memória para testar src/plataforma/colecoes.js sem Supabase.
// Simula a regra "despesa alterada reabre o voucher" (trg_reopen_expense) e uma regra
// estrita: só quem tem fda_validar muda a situação do voucher. Só dados fictícios.
export const DB = { fda: [], fda_advance: [], fda_export: [], fda_event: [], voucher: [], voucher_expense: [], attachment: [] };
export const ctx = { perms: new Set(), log: [] };
let n = 0; const uuid = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
function trig(tab, row) { if (tab === 'voucher_expense') { const v = DB.voucher.find((x) => x.id === row.voucher_id); if (v && v.status === 'validated') v.status = 'pending'; } }
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; }
  select() { if (this.op === 'select') this.op = 'select'; this.ret = true; return this; }
  insert(r) { this.op = 'insert'; this.rows = Array.isArray(r) ? r : [r]; this.multi = Array.isArray(r); return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(r) { this.op = 'insert'; this.rows = [r]; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, v) { this.f.push((r) => v.includes(r[c])); return this; }
  is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  order() { return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  run() {
    const T = DB[this.t]; const m = (r) => this.f.every((f) => f(r));
    ctx.log.push(this.op + ' ' + this.t);
    if (this.op === 'select') { const d = T.filter(m).map((r) => ({ ...r })); return { data: this.one ? d[0] : d, error: null }; }
    if (this.op === 'insert') { const out = this.rows.map((r) => { const x = { id: uuid(), created_at: new Date().toISOString(), ...r }; if (this.t === 'voucher' && !x.status) x.status = 'pending'; T.push(x); trig(this.t, x); return { ...x }; }); return { data: this.one ? out[0] : out, error: null }; }
    if (this.op === 'update') {
      for (const r of T.filter(m)) {
        if (this.t === 'voucher' && 'status' in this.patch && this.patch.status !== r.status && !ctx.perms.has('fda_validar'))
          return { data: null, error: { message: 'permission denied: alterar situação do voucher' } };
        Object.assign(r, this.patch); trig(this.t, r);
      }
      return { data: null, error: null };
    }
    if (this.op === 'delete') { for (const r of T.filter(m)) { trig(this.t, r); T.splice(T.indexOf(r), 1); } return { data: null, error: null }; }
  }
}
export const supabase = { from: (t) => new Q(t), storage: { from: () => ({}) } };

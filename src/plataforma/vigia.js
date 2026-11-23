/* ============================================================
   VIGIA PORTUÁRIO (Watchmen) — modelo "tabela"
   Cada dia da estadia tem períodos diurnos e noturnos; o valor do período
   depende do tipo de dia: dia útil, domingo ou feriado (o feriado prevalece
   sobre o domingo). Sobre o total entra um acréscimo percentual, que não é
   mostrado no PDA. Os valores vêm do cadastro do porto; nada fixo aqui.
   Os feriados vêm do cadastro de Feriados (nacionais e do município do porto).
   ============================================================ */

const dia = (ano, mes, d) => new Date(Date.UTC(ano, mes - 1, d));
const iso = (dt) => dt.toISOString().slice(0, 10);

/* Lê a ETA escrita na cotação: dd/mm/aaaa (ou dd-mm-aaaa, dd.mm.aaaa) ou aaaa-mm-dd. */
export function lerData(texto) {
  const t = String(texto || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const a = Number(m[3]); return valida(a < 100 ? 2000 + a : a, Number(m[2]), Number(m[1])); }
  return null;
}
function valida(a, m, d) {
  const dt = dia(a, m, d);
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/* feriados que valem para o porto: nacionais + municipais desse porto */
export function feriadosDoPorto(feriados, portId) {
  const s = new Set();
  for (const f of feriados || []) {
    if (!f || !f.date) continue;
    if (f.scope === 'municipal' && f.portId && portId && f.portId !== portId) continue;
    s.add(String(f.date).slice(0, 10));
  }
  return s;
}

const num = (v) => Number(v) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

/* wm: cadastro do porto (model 'tabela'); eta: texto da cotação; dias: port stay (pode ser fracionado) */
export function calcularVigia(wm, { eta, dias, portId }, feriados) {
  const nd = num(wm.diurnos_dia), nn = num(wm.noturnos_dia);
  const valorDia = {
    util: nd * num(wm.util_diurno) + nn * num(wm.util_noturno),
    dom: nd * num(wm.dom_diurno) + nn * num(wm.dom_noturno),
    fer: nd * num(wm.fer_diurno) + nn * num(wm.fer_noturno),
  };
  const inicio = lerData(eta);
  const ferSet = feriadosDoPorto(feriados, portId);
  const qtd = { util: 0, dom: 0, fer: 0 };
  const total = Math.max(0, num(dias));
  let base = 0;
  for (let i = 0; i < Math.ceil(total); i++) {
    const fracao = Math.min(1, total - i);
    let tipo = 'util';
    if (inicio) {
      const d = new Date(inicio.getTime() + i * 86400000);
      if (ferSet.has(iso(d))) tipo = 'fer';
      else if (d.getUTCDay() === 0) tipo = 'dom';
    }
    qtd[tipo] += fracao;
    base += fracao * valorDia[tipo];
  }
  const valor = r2(base * (1 + num(wm.acrescimo_pct) / 100));
  return { valor, qtd, valorDia, semEta: !inicio };
}

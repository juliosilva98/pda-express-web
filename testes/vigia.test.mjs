// Testes do cálculo do vigia (src/plataforma/vigia.js). Valores fictícios — não são tarifas reais.
import { calcularVigia, lerData } from '../src/plataforma/vigia.js';

let falhas = 0; const conf = (nome, cond) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome); if (!cond) falhas++; };
const wm = { model: 'tabela', diurnos_dia: 2, noturnos_dia: 2, util_diurno: 100, util_noturno: 150,
  dom_diurno: 200, dom_noturno: 300, fer_diurno: 200, fer_noturno: 300, acrescimo_pct: 20 };
// dia útil = 2×100 + 2×150 = 500; domingo/feriado = 2×200 + 2×300 = 1000. Em 11/2026: dia 08 é domingo, 20 é sexta.

let r = calcularVigia(wm, { eta: '07/11/2026', dias: 3, portId: 'p1' }, []);
conf('sábado + domingo + segunda = 2 úteis e 1 domingo, +20%', r.valor === 2400 && r.qtd.util === 2 && r.qtd.dom === 1 && !r.semEta);

const feriados = [{ date: '2026-11-20', scope: 'nacional' }, { date: '2026-11-19', scope: 'municipal', portId: 'outro' }];
r = calcularVigia(wm, { eta: '19/11/2026', dias: 2.5, portId: 'p1' }, feriados);
conf('feriado nacional conta; municipal de outro porto não; meio dia proporcional', r.valor === 2100 && r.qtd.fer === 1 && r.qtd.util === 1.5);

r = calcularVigia(wm, { eta: '2026-11-19', dias: 1, portId: 'outro' }, feriados);
conf('feriado municipal vale no próprio porto', r.valor === 1200 && r.qtd.fer === 1);

r = calcularVigia(wm, { eta: 'To Inform', dias: 2, portId: 'p1' }, feriados);
conf('sem ETA: todos os dias como dia útil e aviso', r.valor === 1200 && r.semEta);

r = calcularVigia({ ...wm, acrescimo_pct: 0 }, { eta: '15/11/2026', dias: 1, portId: 'p1' }, [{ date: '2026-11-15', scope: 'nacional' }]);
conf('feriado no domingo conta uma vez só', r.valor === 1000 && r.qtd.fer === 1 && r.qtd.dom === 0);

conf('lê dd/mm/aaaa, aaaa-mm-dd e recusa data inválida',
  lerData('07/11/2026').toISOString().startsWith('2026-11-07') && lerData('2026-11-07').toISOString().startsWith('2026-11-07')
  && lerData('31/02/2026') === null && lerData('') === null);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes do vigia passaram');
process.exit(falhas ? 1 : 0);

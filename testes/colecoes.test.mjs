// Testes da camada de gravação (colecoes.js). Rodar com: npm test
globalThis.window = { __PDX__: { perms: new Set() } }; globalThis.document = { hidden: true };
const { DB, ctx } = await import('./banco-falso.js');
const C = await import('../src/plataforma/colecoes.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0; const conf = (nome, cond) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome); if (!cond) falhas++; };
const setPerfil = (p) => { ctx.perms = new Set(p); window.__PDX__.perms = ctx.perms; };
// dados: 1 prestação "Empresa Teste Ltda" com 1 adiantamento sem legacy_id e 1 voucher validado
DB.fda.push({ id: 'f1', status: 'open', vessel_name: 'NAVIO TESTE', client_name: 'Empresa Teste Ltda', roe: 5, currency: 'USD', company_id: 'c1', created_at: 'x' });
DB.fda_advance.push({ id: 'a-uuid-1', fda_id: 'f1', legacy_id: null, label: 'Adto 1', credit_date: '2026-10-01', amount_brl: 1000, roe: 5, created_at: 'x' });
DB.voucher.push({ id: 'v1', fda_id: 'f1', number: 1, grp: 'port', account_name: 'Praticagem', source: 'manual', status: 'validated' });
DB.voucher_expense.push({ id: 'e1', voucher_id: 'v1', legacy_id: 'v1:x1', expense_date: null, description: 'Linha', amount_brl: 100, amount_usd: 20, from_pda: false, sort_order: 1 });
await C.carregarColecoes([]); C.instalarCapacidades({ id: 'u', name: 'T', email: '', role: 'operacional' });
const db = (await window.claude.use('db'));

// 1) adiantamento carregado sem legacy_id: editar não pode duplicar
setPerfil(['fda_editar']);
let f = (await db.doc('fdas/f1').get()).data();
await db.doc('fdas/f1').update({ advances: [{ ...f.advances[0], brl: 1500 }] });
conf('editar adiantamento sem legacy_id não duplica', DB.fda_advance.length === 1 && DB.fda_advance[0].amount_brl === 1500);
f = (await db.doc('fdas/f1').get()).data();
await db.doc('fdas/f1').update({ advances: [...f.advances, { id: 'novo1', label: 'Adto 2', date: '2026-10-02', brl: 500, roe: 5 }] });
conf('incluir adiantamento novo', DB.fda_advance.length === 2);
f = (await db.doc('fdas/f1').get()).data();
await db.doc('fdas/f1').update({ advances: f.advances.filter((a) => a.id !== 'novo1') });
conf('excluir adiantamento', DB.fda_advance.length === 1 && DB.fda_advance[0].id === 'a-uuid-1');
// adiantamento informado em US$: grava o R$ convertido e guarda o US$ digitado (extra.usd), lido de volta
f = (await db.doc('fdas/f1').get()).data();
await db.doc('fdas/f1').update({ advances: [...f.advances, { id: 'usd1', label: 'Adto USD', date: '2026-10-03', usd: 31.37, brl: 159.99, roe: 5.1 }] });
const linhaUsd = DB.fda_advance.find((x) => x.legacy_id === 'usd1');
f = (await db.doc('fdas/f1').get()).data();
conf('adiantamento em US$ grava R$ e guarda o US$', linhaUsd && linhaUsd.amount_brl === 159.99 && linhaUsd.extra && linhaUsd.extra.usd === 31.37
  && f.advances.find((a) => a.id === 'usd1').usd === 31.37);
await db.doc('fdas/f1').update({ advances: f.advances.filter((a) => a.id !== 'usd1') });

// 2) operacional altera despesa de voucher validado: banco reabre, sem erro de permissão
let v = (await db.doc('vouchers/v1').get()).data();
let erro = null;
try { await db.doc('vouchers/v1').update({ expenses: [{ ...v.expenses[0], brl: 150 }], status: 'pending', validatedAt: null }); } catch (e) { erro = e; }
conf('operacional edita despesa de voucher validado sem erro', !erro);
conf('voucher reaberto pelo banco', DB.voucher[0].status === 'pending' && DB.voucher_expense[0].amount_brl === 150);
conf('despesa não duplicada', DB.voucher_expense.length === 1);

// 3) operacional não consegue validar (banco recusa) e a tela volta ao estado do banco
erro = null;
try { await db.doc('vouchers/v1').update({ status: 'validated' }); } catch (e) { erro = e; }
await espera(50);
conf('validação recusada para operacional', !!erro && DB.voucher[0].status === 'pending' && (await db.doc('vouchers/v1').get()).data().status === 'pending');

// 4) voucher manual: operacional cria sem erro (fica pendente); financeiro cria validado
let r = await db.collection('vouchers').add({ fdaId: 'f1', number: 2, group: 'port', accountName: 'Manual', expenses: [], source: 'manual', status: 'validated' });
conf('voucher manual do operacional criado pendente', DB.voucher.find((x) => x.id === r.id).status === 'pending');
setPerfil(['fda_editar', 'fda_validar']);
r = await db.collection('vouchers').add({ fdaId: 'f1', number: 3, group: 'port', accountName: 'Manual', expenses: [], source: 'manual', status: 'validated' });
conf('voucher manual do financeiro criado validado', DB.voucher.find((x) => x.id === r.id).status === 'validated');

// 5) gerar a partir de PDA: despesas num único envio, na ordem, editáveis depois
ctx.log = [];
r = await db.collection('vouchers').add({ fdaId: 'f1', number: 4, group: 'port', accountName: 'PDA', source: 'pda', status: 'pending',
  expenses: [1, 2, 3, 4, 5].map((i) => ({ id: 'p' + i, date: '', description: 'Item ' + i, notes: '', brl: i * 10, usd: i * 2, fromPda: true })) });
conf('5 despesas em 1 envio', ctx.log.filter((x) => x === 'insert voucher_expense').length === 1);
v = (await db.doc('vouchers/' + r.id).get()).data();
conf('ordem e marca do PDA preservadas', v.expenses.map((e) => e.description).join() === 'Item 1,Item 2,Item 3,Item 4,Item 5' && v.expenses.every((e) => e.fromPda));
const antes = DB.voucher_expense.length;
await db.doc('vouchers/' + r.id).update({ expenses: v.expenses.map((e) => (e.id === 'p3' ? { ...e, brl: 99 } : e)) });
conf('editar despesa gerada atualiza a linha certa', DB.voucher_expense.length === antes && DB.voucher_expense.find((e) => e.description === 'Item 3').amount_brl === 99);

// 6) alterar só o número do voucher não regrava despesas
ctx.log = [];
await db.doc('vouchers/' + r.id).update({ number: 9 });
conf('renumerar não toca nas despesas', !ctx.log.some((x) => /voucher_expense/.test(x) && !/select/.test(x)));
// 7) código 4129301 existe em dois grupos: o voucher do grupo misc aponta para a conta do misc
const Cad = await import('../src/plataforma/cadastros.js');
Object.assign(Cad.contas.codeToRef, { '4129301': '4129301' });
Object.assign(Cad.contas.grupoCodigo, { 'cargo_load|4129301': '4129301', 'misc|4129301': 'X-misc-01' });
r = await db.collection('vouchers').add({ fdaId: 'f1', number: 10, group: 'misc', accountRef: '4129301', accountName: 'Freight Tax (Cargo linked)', expenses: [], source: 'manual', status: 'pending' });
conf('4129301 no grupo misc grava a conta do misc', DB.voucher.find((x) => x.id === r.id).account_ref === 'X-misc-01');
r = await db.collection('vouchers').add({ fdaId: 'f1', number: 11, group: 'cargo_load', accountRef: '4129301', accountName: 'Freight Tax', expenses: [], source: 'manual', status: 'pending' });
conf('4129301 no grupo cargo_load grava a conta do cargo_load', DB.voucher.find((x) => x.id === r.id).account_ref === '4129301');
// 10) SDA: grava tipo e FDA de origem; FDA comum não envia as colunas novas (funciona sem o arquivo 07)
r = await db.collection('fdas').add({ vessel: 'NAVIO TESTE', to: 'Empresa Teste Ltda', roe: 5, kind: 'sda', parentFdaId: 'f1' });
const sdaRow = DB.fda.find((x) => x.id === r.id);
conf('SDA grava kind e parent_fda_id', sdaRow.kind === 'sda' && sdaRow.parent_fda_id === 'f1' && !(sdaRow.extra && ('kind' in sdaRow.extra)));
const sdaDoc = (await db.doc('fdas/' + r.id).get()).data();
conf('SDA lida de volta com kind e parentFdaId', sdaDoc.kind === 'sda' && sdaDoc.parentFdaId === 'f1');
r = await db.collection('fdas').add({ vessel: 'NAVIO TESTE', to: 'Empresa Teste Ltda', roe: 5 });
conf('FDA comum não envia kind nem parent_fda_id', !('kind' in DB.fda.find((x) => x.id === r.id)) && !('parent_fda_id' in DB.fda.find((x) => x.id === r.id)));
ctx.log.length = 0;
await db.doc('fdas/' + sdaRow.id).update({ remarks: 'teste' });
await espera(500);
conf('editar SDA não regrava o tipo', !('kind' in (DB.fda.find((x) => x.id === sdaRow.id).extra || {})) && DB.fda.find((x) => x.id === sdaRow.id).kind === 'sda');
// 11) cancelar prestação: grava status 'cancelled' e o motivo em closing_note (o banco registra o evento)
r = await db.collection('fdas').add({ vessel: 'NAVIO TESTE', to: 'Empresa Teste Ltda', roe: 5 });
f = (await db.doc('fdas/' + r.id).get()).data();
await db.doc('fdas/' + r.id).update({ status: 'cancelled', history: [...(f.history || []), { at: 'x', action: 'cancelled', note: 'Criada em duplicidade' }] });
await espera(500);
const linhaCanc = DB.fda.find((x) => x.id === r.id);
conf('cancelar grava status e motivo', linhaCanc.status === 'cancelled' && linhaCanc.closing_note === 'Criada em duplicidade');
// 8) download de PDF responde 'saved': sem isso o sistema não registra a geração e a FDA não finaliza
document.createElement = () => ({ click() {}, remove() {} }); document.body = { appendChild() {} };
URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
const dl = await window.claude.use('downloads');
const out = await dl.save({ filename: 'teste.pdf', data: new Blob(['x']) });
conf('download de PDF confirma status saved', out && out.status === 'saved');
// 9) PDF abre pré-visualização: só conta como gerado se a pessoa clicar em Baixar
const criados = [];
document.createElement = (tag) => { const e = { tag, children: [], appendChild(c) { this.children.push(c); }, click() { this.clicado = true; }, remove() { this.removido = true; } }; criados.push(e); return e; };
document.addEventListener = () => {}; document.removeEventListener = () => {};
const pdf = () => new Blob(['%PDF'], { type: 'application/pdf' });
const botao = (txt) => criados.find((e) => e.tag === 'button' && e.textContent === txt);
let p = dl.save({ filename: 'a.pdf', data: pdf() });
await new Promise((ok) => setTimeout(ok, 0));
conf('PDF abre a pré-visualização sem baixar', !!botao('Baixar') && !criados.some((e) => e.tag === 'a'));
botao('Fechar').onclick();
conf('fechar a pré-visualização não conta como gerado', (await p).status === 'cancelled' && !criados.some((e) => e.tag === 'a'));
criados.length = 0;
p = dl.save({ filename: 'b.pdf', data: pdf() });
await new Promise((ok) => setTimeout(ok, 0));
botao('Baixar').onclick();
const res = await p;
conf('Baixar na pré-visualização baixa e confirma saved', res.status === 'saved' && criados.some((e) => e.tag === 'a' && e.clicado));
console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);

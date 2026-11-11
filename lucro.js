/* Radar de Comissões · Lucro por projeto e Margem da operação (Visão geral)
   Lucro por projeto: das vendas do mês ou do ano, o que fica na empresa em cada projeto: a comissão menos o repasse
   ao corretor (o % de cada corretor em Ajustes, 50% por padrão; nas vendas dos gestores marcados como CEO, nada). Antes de impostos
   e despesas. Os números saem do mesmo motor das telas (RadarTelas.motor), pela data da venda; distratos ficam fora.
   Margem da operação: pelo extrato da tela Caixa (RadarCaixa.resumo), quanto da comissão que entrou foi para repasses,
   para custos e quanto sobrou, no mês, no ano e mês a mês.
   Só dono e sócios veem; corretor não. A Visão geral chama RadarLucro.desenhar() a cada render. */
(function(){
'use strict';
// o que fica na empresa: a comissão menos a parte do corretor (o % do cadastro dele; gestor 0%)
function parteEmpresa(m, s, com){ const pc = m.pctCorretor ? m.pctCorretor(s) : (m.isCeo(s.corretor) ? 0 : 50);
  return pc === 50 ? com / 2 : pc === 0 ? com : com * (100 - pc) / 100; }
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nz = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const nivel = () => (window.RadarApp && typeof window.RadarApp.nivel === 'function') ? window.RadarApp.nivel() : null;
const telas = () => window.RadarTelas || null;

const CSS_LUCRO = `
.ra-lucro{margin-bottom:18px}
.ra-lucro .card-head{align-items:center;margin-bottom:12px}
.ra-seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px;flex:none}
.ra-seg button{border:0;background:none;color:var(--ink-2);font-weight:700;font-size:12.5px;padding:0 12px;border-radius:8px;min-height:32px;white-space:nowrap}
.ra-seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(11,42,111,.16)}
.ra-seg button:focus-visible{outline:2px solid var(--blue);outline-offset:1px}
.ra-lucro .kpi-strip{margin:0 0 14px}
.ra-dest{font-size:13px;color:var(--ink-2);background:var(--blue-tint);border:1px solid var(--blue-soft);border-radius:10px;padding:9px 12px;margin-bottom:14px;line-height:1.5}
.ra-dest b{color:var(--ink)}
.ra-lb-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);margin:0 0 10px}
.ra-lb-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.ra-lb-leg .ra-cor-c{background:var(--chart-2);opacity:.5}
.ra-lbs{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}
.ra-lb{display:grid;grid-template-columns:minmax(130px,210px) minmax(0,1fr) minmax(170px,auto);gap:12px;align-items:center}
.ra-lb-nome{font-weight:700;font-size:13px;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ra-lb-nome small{display:block;font-weight:600;font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.ra-lb-trilho{display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--surface-2);min-width:0}
.ra-lb-trilho i{display:block;height:100%;flex:none}
.ra-lb-trilho .emp{background:var(--chart-1)}
.ra-lb-trilho .cor{background:var(--chart-2);opacity:.5}
.ra-lb-val{font-size:13px;color:var(--ink-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.ra-lb-val b{color:var(--ink);font-weight:800}
.ra-lb.topo .ra-lb-nome{color:var(--blue-ink)}
.ra-lucro table .r{font-variant-numeric:tabular-nums}
.ra-lucro td .sub{margin-left:4px}
.ra-lucro tfoot td{font-weight:800;border-top:1px solid var(--line-strong);border-bottom:0}
.ra-lucro .ra-lucro-nota{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5;text-align:left}
body.broker #raLucro{display:none!important}
@media (min-width:821px){ .ra-lucro .kpi-strip .ra-nw{white-space:nowrap} }
@media (max-width:820px){
  .ra-lb{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"nome val" "trilho trilho";gap:5px 10px}
  .ra-lb-nome{grid-area:nome} .ra-lb-val{grid-area:val;text-align:right} .ra-lb-trilho{grid-area:trilho;height:14px}
  .ra-lb-nome small{white-space:normal}
  /* tabela larga no celular: o nome do projeto fica parado enquanto o resto corre para o lado */
  .ra-lucro .tscroll th:first-child,.ra-lucro .tscroll td:first-child{position:sticky;left:0;z-index:1;background:var(--surface);box-shadow:1px 0 0 var(--line)}
  .ra-lucro .tscroll tbody tr:hover td:first-child{background:var(--surface-2)}
}
`;
const estiloLucro = document.createElement('style'); estiloLucro.textContent = CSS_LUCRO; document.head.appendChild(estiloLucro);

const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const lucro = { escopo: null, mes: null };
const pctL = (a, b) => b ? (a / b * 100).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '–';
function curtoL(v, fmt){
  const a = Math.abs(v);
  if(a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' mi';
  if(a >= 1e4) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return fmt(v);
}
// As vendas ativas do período, por projeto (o campo "Construtora / empreendimento" do Radar).
function dadosLucro(t, ano, mes){
  const m = t.motor, cfg = t.config() || {};
  const chave = mes ? `${ano}-${String(mes).padStart(2, '0')}` : String(ano);
  const doPeriodo = (t.vendas() || []).filter(s => s && !s.excluida && String(s.dataVenda || s.dataEntrada || '').startsWith(chave));
  const fora = doPeriodo.filter(s => !m.isActive(s));
  const nomes = new Map((cfg.construtoras || []).map(c => [nz(c.nome), c.nome]));
  const zero = () => ({vendas: 0, unid: 0, vgv: 0, com: 0, emp: 0, cor: 0});
  const grupos = new Map(), tot = zero();
  for(const s of doPeriodo){
    if(!m.isActive(s)) continue;
    const bruto = String(s.construtora || '').trim();
    const k = nz(bruto) || '-';
    const g = grupos.get(k) || Object.assign({nome: nomes.get(k) || bruto || 'Sem projeto'}, zero());
    const com = Number(m.schedule(s).total) || 0;
    const emp = parteEmpresa(m, s, com);
    const un = Number(m.nUnits(s)) || 1, vgv = Number(s.valorImovel) || 0;
    for(const o of [g, tot]){ o.vendas++; o.unid += un; o.vgv += vgv; o.com += com; o.emp += emp; o.cor += com - emp; }
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.emp - a.emp || b.vgv - a.vgv);
  return {lista, tot, fora: {n: fora.length, vgv: fora.reduce((a, s) => a + (Number(s.valorImovel) || 0), 0)}};
}
function desenharLucro(){
  const t = telas(); const sec = $('sec-overview');
  if(!t || !t.motor || !t.periodo || !sec) return;
  let el = $('raLucro');
  if(nivel() !== 'admin' && nivel() !== 'time'){ if(el) el.remove(); return; }   // corretor (ou antes de entrar) não vê
  if(!el){
    el = document.createElement('div'); el.id = 'raLucro'; el.className = 'card ra-lucro';
    const strip = $('kpiStrip'); if(strip && strip.parentNode === sec) strip.after(el); else sec.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-escopo]'); if(!b) return; lucro.escopo = b.dataset.escopo; desenharLucro(); const f = el.querySelector(`[data-escopo="${lucro.escopo}"]`); if(f) f.focus(); });
  }
  const fmt = t.fmt || (v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR'));
  const {ano, mes} = t.periodo();
  if(mes !== lucro.mes){ lucro.mes = mes; lucro.escopo = mes ? 'mes' : 'ano'; }
  const escopo = mes && lucro.escopo === 'mes' ? 'mes' : 'ano';
  const d = dadosLucro(t, ano, escopo === 'mes' ? mes : 0);
  const nomeMes = mes ? MESES_L[mes - 1] : '';
  const rot = escopo === 'mes' ? `${nomeMes} de ${ano}` : `${ano}`;
  const seg = mes ? `<div class="ra-seg" role="group" aria-label="Período do lucro"><button type="button" data-escopo="mes" aria-pressed="${escopo === 'mes'}">${nomeMes[0].toUpperCase() + nomeMes.slice(1)}</button><button type="button" data-escopo="ano" aria-pressed="${escopo === 'ano'}">Ano de ${ano}</button></div>` : '';
  const head = `<div class="card-head"><div><h2>Lucro por projeto</h2><p>Vendas de ${esc(rot)} · o que fica na empresa depois do repasse ao corretor</p></div><div class="spacer"></div>${seg}</div>`;
  const L = d.lista, T = d.tot;
  if(!L.length){
    el.innerHTML = head + `<div class="empty">Nenhuma venda ativa em ${esc(rot)}.${d.fora.n ? ` ${d.fora.n} distrato${d.fora.n === 1 ? '' : 's'} no período.` : ''}</div>`;
    return;
  }
  const s = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const topo = L[0];
  // maior margem só entre projetos com 2 vendas ou mais: uma venda solta com comissão fora do padrão não vira destaque
  const varias = L.filter(g => g.vgv > 0 && g.vendas >= 2);
  const melhor = varias.slice().sort((a, b) => b.emp / b.vgv - a.emp / a.vgv)[0];
  const margemTxt = !melhor ? ''
    : melhor !== topo ? ` Maior margem entre os projetos com 2 vendas ou mais: <b>${esc(melhor.nome)}</b>, ${pctL(melhor.emp, melhor.vgv)} do VGV.`
    : varias.length > 1 ? ` É também a maior margem entre os projetos com 2 vendas ou mais: ${pctL(topo.emp, topo.vgv)} do VGV.` : '';
  const dest = L.length === 1
    ? `Todo o lucro de ${esc(rot)} veio de <b>${esc(topo.nome)}</b>: ${fmt(topo.emp)} em ${s(topo.vendas, 'venda', 'vendas')}, ${pctL(topo.emp, topo.vgv)} do VGV.`
    : `Mais lucro em ${esc(rot)}: <b>${esc(topo.nome)}</b>, ${fmt(topo.emp)} (${pctL(topo.emp, T.emp)} do lucro) em ${s(topo.vendas, 'venda', 'vendas')}.` + margemTxt;
  // no computador cada pedaço da linha de baixo fica inteiro: quebra no "·", não no meio de "por venda"
  const nw = (...xs) => xs.map(x => `<span class="ra-nw">${x}</span>`).join(' · ');
  const strip = `<div class="kpi-strip">`
    + `<div class="item"><span class="lbl">Vendas</span><span class="val">${T.vendas}</span><span class="sub">${nw(s(T.unid, 'unidade', 'unidades'), d.fora.n ? `${s(d.fora.n, 'distrato', 'distratos')} fora da conta` : 'sem distratos')}</span></div>`
    + `<div class="item"><span class="lbl">VGV vendido</span><span class="val">${fmt(T.vgv)}</span><span class="sub">${nw(`ticket médio ${fmt(T.vgv / T.vendas)}`)}</span></div>`
    + `<div class="item"><span class="lbl">Comissão das vendas</span><span class="val">${fmt(T.com)}</span><span class="sub">${nw(`${pctL(T.com, T.vgv)} do VGV`, `corretores ${fmt(T.cor)}`)}</span></div>`
    + `<div class="item"><span class="lbl">Lucro da empresa</span><span class="val">${fmt(T.emp)}</span><span class="sub">${nw(`margem ${pctL(T.emp, T.vgv)} do VGV`, `${fmt(T.emp / T.vendas)} por venda`)}</span></div>`
    + `</div>`;
  // barras: até 8 projetos e o resto somado
  const zero = {vendas: 0, unid: 0, vgv: 0, com: 0, emp: 0, cor: 0};
  const resto = L.slice(8);
  const barras = resto.length ? L.slice(0, 8).concat([resto.reduce((a, g) => ({nome: a.nome, vendas: a.vendas + g.vendas, unid: a.unid + g.unid, vgv: a.vgv + g.vgv, com: a.com + g.com, emp: a.emp + g.emp, cor: a.cor + g.cor}), Object.assign({nome: `Outros ${resto.length} projetos`}, zero))]) : L;
  const maxCom = Math.max(...barras.map(g => g.com), 1);
  const lbs = `<div class="ra-lb-leg"><span><i style="background:var(--chart-1)"></i>Lucro da empresa</span><span><i class="ra-cor-c"></i>Repasse aos corretores</span><span>barra inteira: a comissão</span></div>`
    + `<div class="ra-lbs">` + barras.map((g, i) => `<div class="ra-lb${i === 0 ? ' topo' : ''}"><div class="ra-lb-nome" title="${esc(g.nome)}">${esc(g.nome)}<small>${s(g.vendas, 'venda', 'vendas')} · comissão de ${pctL(g.com, g.vgv)}</small></div>`
      + `<div class="ra-lb-trilho" role="img" aria-label="${esc(`${g.nome}: lucro ${fmt(g.emp)}, repasse ${fmt(g.cor)}`)}"><i class="emp" style="width:${(g.emp / maxCom * 100).toFixed(2)}%"></i><i class="cor" style="width:${(g.cor / maxCom * 100).toFixed(2)}%"></i></div>`
      + `<div class="ra-lb-val"><b>${curtoL(g.emp, fmt)}</b> · ${pctL(g.emp, g.vgv)} do VGV</div></div>`).join('') + `</div>`;
  const linha = g => `<tr><td class="name">${esc(g.nome)}</td><td class="r">${g.vendas}</td><td class="r">${fmt(g.vgv)}</td><td class="r">${fmt(g.com)}<span class="sub">${pctL(g.com, g.vgv)}</span></td><td class="r"><b>${fmt(g.emp)}</b></td><td class="r">${pctL(g.emp, g.vgv)}</td><td class="r">${fmt(g.emp / g.vendas)}</td><td class="r">${pctL(g.emp, T.emp)}</td></tr>`;
  const tabela = `<div class="tscroll"><table><thead><tr><th>Projeto</th><th class="r">Vendas</th><th class="r">VGV</th><th class="r">Comissão</th><th class="r">Lucro</th><th class="r">Margem s/ VGV</th><th class="r">Lucro por venda</th><th class="r">% do lucro</th></tr></thead>`
    + `<tbody>${L.map(linha).join('')}</tbody>`
    + `<tfoot><tr><td>Total</td><td class="r">${T.vendas}</td><td class="r">${fmt(T.vgv)}</td><td class="r">${fmt(T.com)}<span class="sub">${pctL(T.com, T.vgv)}</span></td><td class="r">${fmt(T.emp)}</td><td class="r">${pctL(T.emp, T.vgv)}</td><td class="r">${fmt(T.emp / T.vendas)}</td><td class="r">100%</td></tr></tfoot></table></div>`;
  const nota = `<div class="ra-lucro-nota">Lucro = comissão das vendas de ${esc(rot)} menos o repasse ao corretor (o % de cada um em Ajustes, 50% por padrão; nas vendas dos gestores, a comissão fica toda na empresa), antes de impostos e despesas. Conta pela data da venda; distratos ficam fora.</div>`;
  el.innerHTML = head + strip + `<div class="ra-dest">${dest}</div>` + lbs + tabela + nota;
}

/* ---------- Margem da operação (pelo extrato da tela Caixa) ----------
   De cada R$ 100 de comissão que entrou na conta: quanto foi para repasses (corretores, imobiliárias parceiras,
   pagadorias), para os custos da Fortal e quanto sobrou (resultado operacional). Os números vêm de
   RadarCaixa.resumo(), com os mesmos dados e regras da tela Caixa; sem retiradas dos sócios e sem caixinha. */
const CSS_OP = `
.ra-op{margin-bottom:18px}
.ra-op .card-head{align-items:center;margin-bottom:12px}
.ra-op-topo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 28px;margin-bottom:16px}
.ra-op-topo.so1{grid-template-columns:minmax(0,1fr)}
.ra-op-num{display:flex;flex-direction:column;gap:2px;min-width:0}
.ra-op-num .rot{font-size:12.5px;font-weight:700;color:var(--muted)}
.ra-op-num .pct{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:32px;font-weight:700;color:var(--ink);line-height:1.15;font-variant-numeric:tabular-nums}
.ra-op-num .pct.neg{color:var(--crit)}
.ra-op-num .sub{font-size:12.5px;color:var(--ink-2);line-height:1.45}
.ra-op-barra{margin:0 0 14px}
.ra-op-barra .rot{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--ink-2);margin-bottom:6px}
.ra-op-barra .rot b{color:var(--ink)}
.ra-op-trilho{display:flex;height:24px;border-radius:7px;overflow:hidden;background:var(--surface-2)}
.ra-op-trilho i{display:block;height:100%;flex:none}
.ra-op .rep{background:var(--chart-2);opacity:.5}
.ra-op .cus{background:var(--warn);opacity:.55}
.ra-op .res{background:var(--chart-1)}
.ra-op-leg{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--ink-2);margin-top:7px;font-variant-numeric:tabular-nums}
.ra-op-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.ra-op-leg .neg{color:var(--crit);font-weight:700}
.ra-op-baixo{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:18px 28px;margin-top:6px}
.ra-op-baixo h3{font-size:13px;font-weight:700;color:var(--ink);margin:0 0 10px}
.ra-op-cols{display:flex;align-items:flex-start;gap:6px;overflow-x:auto;padding-bottom:2px}
.ra-op-col{flex:1 1 0;min-width:30px;display:flex;flex-direction:column;align-items:center;gap:3px}
.ra-op-col .v{font-size:11px;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.ra-op-col .v.neg{color:var(--crit)}
.ra-op-col .pos{width:100%;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid var(--line-strong)}
.ra-op-col .negz{width:100%;display:flex;align-items:flex-start;justify-content:center}
.ra-op-col .pos i,.ra-op-col .negz i{display:block;width:70%;max-width:26px;border-radius:4px 4px 0 0;background:var(--chart-1);opacity:.4}
.ra-op-col .negz i{border-radius:0 0 4px 4px;background:var(--crit)}
.ra-op-col.sel .pos i,.ra-op-col.sel .negz i{opacity:1}
.ra-op-col .m{font-size:11px;color:var(--muted)}
.ra-op-col.sel .m{color:var(--ink);font-weight:800}
.ra-op-cus{display:grid;grid-template-columns:minmax(0,1fr) auto 52px;gap:8px;align-items:baseline;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)}
.ra-op-cus:last-child{border-bottom:0}
.ra-op-cus span{color:var(--ink-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ra-op-cus b{color:var(--ink);font-variant-numeric:tabular-nums}
.ra-op-cus small{color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.ra-op-aviso{font-size:12.5px;color:var(--warn);margin-top:8px}
.ra-op .ra-op-nota{font-size:12px;color:var(--muted);margin-top:12px;line-height:1.5;text-align:left}
body.broker #raOperacao{display:none!important}
@media (max-width:820px){
  .ra-op-topo{gap:10px 16px}
  .ra-op-num .pct{font-size:26px}
  .ra-op-baixo{grid-template-columns:minmax(0,1fr)}
  .ra-op-barra .rot{flex-direction:column;gap:2px}
  .ra-op-cols{gap:2px}
  .ra-op-col{min-width:20px}
  .ra-op-col .v{font-size:10px}
}
`;
const estiloOp = document.createElement('style'); estiloOp.textContent = CSS_OP; document.head.appendChild(estiloOp);

const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const op = { cache: new Map(), json: new Map(), pedindo: new Set(), erro: new Map(), quando: new Map(), semAcesso: false };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const temResumo = () => !!(window.RadarCaixa && typeof window.RadarCaixa.resumo === 'function');

async function lerOperacao(ano){
  const cl = window.claude;
  if(!cl || typeof cl.use !== 'function' || !temResumo()) return null;
  const ns = await cl.use('caixa');
  if(!ns) return null;
  return window.RadarCaixa.resumo(ns, hojeISO(), ano);
}
// comissão que entrou, repasses, custos e resultado de um mês (0 a 11) ou do ano (-1)
function contasOp(R, j){
  const L = rot => R.linhas.find(l => l.rot === rot);
  const rec = L('Receita de intermediação'), mi = L('Margem de intermediação'), ro = L('Resultado operacional');
  if(!rec || !mi || !ro) return null;
  const val = l => j < 0 ? l.total : l.v[j];
  const receita = val(rec), margem = val(mi), resultado = val(ro);
  const linhas = R.linhas.filter(l => !l.soma && l.pos > mi.pos && l.pos < ro.pos).map(l => ({rot: l.rot, v: -val(l)}));
  return {receita, repasses: receita - margem, custos: margem - resultado, resultado, linhas};
}

function pintarOperacao(el, t, ano, mes){
  const fmt = t.fmt || (v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR'));
  const R = op.cache.get(String(ano));
  const irCaixa = document.querySelector('#nav [data-v="caixa"]') ? '<button class="btn sm ghost" type="button" data-op="caixa">Ver o caixa</button>' : '';
  const head = `<div class="card-head"><div><h2>Margem da operação</h2><p>De cada R$ 100 de comissão que entrou na conta, quanto foi para os repasses, para os custos da Fortal e quanto sobrou</p></div><div class="spacer"></div>${irCaixa}</div>`;
  if(!R){
    const erro = op.erro.get(String(ano));
    el.innerHTML = head + `<div class="empty">${erro ? `Não foi possível ler o caixa: ${esc(erro)}` : 'Lendo o caixa…'}</div>`;
    return;
  }
  const meses = R.comMov.map((c, j) => c ? j : -1).filter(j => j >= 0);
  const A = contasOp(R, -1);
  if(!A){ el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  if(!meses.length){ el.innerHTML = head + `<div class="empty">O caixa não tem extrato de ${ano}.</div>`; return; }
  const ult = R.ultimoDia && R.ultimoDia.startsWith(`${ano}-`) ? R.ultimoDia : null;
  const ddmm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const rotAno = ult ? `${ano} até ${ddmm(ult)}` : `${ano}`;
  const j = mes ? mes - 1 : -1;
  const M = j >= 0 && R.comMov[j] ? contasOp(R, j) : null;
  const parcial = j >= 0 && ult && ult.slice(0, 7) === `${ano}-${String(mes).padStart(2, '0')}` && Number(ult.slice(8, 10)) < new Date(ano, mes, 0).getDate();
  const nomeMes = j >= 0 ? MESES_L[j][0].toUpperCase() + MESES_L[j].slice(1) : '';
  const rotMes = j >= 0 ? `${nomeMes} de ${ano}${parcial ? ` até ${ddmm(ult)}` : ''}` : '';

  const numero = (rot, c) => `<div class="ra-op-num"><span class="rot">${esc(rot)}</span>`
    + `<span class="pct${c && c.resultado < 0 ? ' neg' : ''}">${c && c.receita > 0 ? pctL(c.resultado, c.receita) : '–'}</span>`
    + `<span class="sub">${!c ? 'sem extrato desse mês no caixa' : c.receita > 0 ? `${fmt(c.resultado)} de resultado sobre ${fmt(c.receita)} de comissão` : 'nenhuma comissão entrou'}</span></div>`;
  const topo = `<div class="ra-op-topo${j >= 0 ? '' : ' so1'}">${j >= 0 ? numero(`Margem operacional · ${rotMes}`, M) : ''}${numero(`Margem operacional · ${rotAno}`, A)}</div>`;

  const barra = (rot, c) => {
    if(!c || c.receita <= 0) return '';
    const total = Math.max(c.receita, c.repasses + c.custos);
    const w = v => (Math.max(0, v) / total * 100).toFixed(2) + '%';
    const leg = `<span><i class="rep"></i>Repasses ${pctL(c.repasses, c.receita)} · ${curtoL(c.repasses, fmt)}</span>`
      + `<span><i class="cus"></i>Custos ${pctL(c.custos, c.receita)} · ${curtoL(c.custos, fmt)}</span>`
      + (c.resultado >= 0 ? `<span><i class="res"></i>Sobrou ${pctL(c.resultado, c.receita)} · ${curtoL(c.resultado, fmt)}</span>`
                          : `<span class="neg">Repasses e custos passaram a comissão em ${curtoL(-c.resultado, fmt)}</span>`);
    const aria = `${rot}: repasses ${pctL(c.repasses, c.receita)}, custos ${pctL(c.custos, c.receita)}, resultado ${pctL(c.resultado, c.receita)}`;
    return `<div class="ra-op-barra"><div class="rot"><b>${esc(rot)}</b><span>comissão que entrou: ${fmt(c.receita)}</span></div>`
      + `<div class="ra-op-trilho" role="img" aria-label="${esc(aria)}"><i class="rep" style="width:${w(c.repasses)}"></i><i class="cus" style="width:${w(c.custos)}"></i>${c.resultado > 0 ? `<i class="res" style="width:${w(c.resultado)}"></i>` : ''}</div>`
      + `<div class="ra-op-leg">${leg}</div></div>`;
  };
  const barras = (j >= 0 ? barra(rotMes, M) : '') + barra(rotAno, A);

  // mês a mês: a margem operacional de cada mês com extrato
  const cols = meses.map(k => { const c = contasOp(R, k); return {k, c, m: c && c.receita > 0 ? c.resultado / c.receita : null}; });
  const H = 72, minNeg = Math.min(0, ...cols.map(x => x.m == null ? 0 : x.m)), hNeg = Math.round(Math.min(1, -minNeg) * H);
  const grafico = `<div><h3>Margem operacional mês a mês · ${ano}</h3><div class="ra-op-cols">` + cols.map(x => {
    const v = x.m, pos = v != null && v > 0 ? Math.round(Math.min(v, 1) * H) : 0, neg = v != null && v < 0 ? Math.round(Math.min(-v, 1) * H) : 0;
    const lbl = v == null ? '–' : Math.round(v * 100) + '%';
    const tit = `${MESES_L[x.k]}: ${v == null ? 'nenhuma comissão entrou' : `${pctL(x.c.resultado, x.c.receita)} (${fmt(x.c.resultado)} sobre ${fmt(x.c.receita)})`}`;
    return `<div class="ra-op-col${x.k === j ? ' sel' : ''}" title="${esc(tit)}"><span class="v${v != null && v < 0 ? ' neg' : ''}">${lbl}</span>`
      + `<div class="pos" style="height:${H}px"><i style="height:${pos}px"></i></div>${hNeg ? `<div class="negz" style="height:${hNeg}px"><i style="height:${neg}px"></i></div>` : ''}`
      + `<span class="m">${MES3[x.k]}</span></div>`;
  }).join('') + `</div></div>`;

  // para onde foram os custos do período
  const base = M || A, rotBase = M ? nomeMes.toLowerCase() : rotAno;
  const lc = base.linhas.filter(l => Math.abs(l.v) >= 0.5).sort((a, b) => b.v - a.v);
  const mostra = lc.length <= 7 ? lc : lc.slice(0, 6), resto = lc.length <= 7 ? [] : lc.slice(6);
  const linhaC = (rot, v) => `<div class="ra-op-cus"><span title="${esc(rot)}">${esc(rot)}</span><b>${fmt(v)}</b><small>${pctL(v, base.receita)}</small></div>`;
  const custos = `<div><h3>Custos de ${esc(rotBase)} · ${fmt(base.custos)}</h3>`
    + (lc.length ? mostra.map(l => linhaC(l.rot, l.v)).join('') + (resto.length ? linhaC(`Outros ${resto.length} itens`, resto.reduce((a, l) => a + l.v, 0)) : '') : '<div class="empty">Nenhum custo no período.</div>')
    + `</div>`;
  const semCat = (base.linhas.find(l => l.rot === 'A classificar') || {v: 0}).v;
  const ruins = R.conferencia.map((v, k) => v != null && Math.abs(v) >= 0.01 ? MES3[k] : null).filter(Boolean);
  const avisos = (semCat >= 0.5 ? `<div class="ra-op-aviso">${fmt(semCat)} ainda sem categoria no caixa (conta como custo).</div>` : '')
    + (ruins.length ? `<div class="ra-op-aviso">Em ${ruins.join(', ')} o resultado não bate com o saldo do extrato: algum PDF pode ter ficado de fora.</div>` : '');
  const nota = `<div class="ra-op-nota">Números da tela Caixa: o extrato da conta PJ, conferido com o saldo. Comissão que entrou na conta no período, menos repasses (corretores, imobiliárias parceiras e pagadorias) e custos pagos. Não entram retiradas dos sócios nem caixinha. Conta pelo dia em que o dinheiro entrou ou saiu; por isso não bate com o lucro por projeto, que conta pela data da venda.</div>`;
  el.innerHTML = head + topo + barras + `<div class="ra-op-baixo">${grafico}${custos}</div>` + avisos + nota;
}

function desenharOperacao(){
  const t = telas(); const sec = $('sec-overview');
  if(!t || !t.periodo || !sec) return;
  let el = $('raOperacao');
  if((nivel() !== 'admin' && nivel() !== 'time') || op.semAcesso || !temResumo()){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id = 'raOperacao'; el.className = 'card ra-op';
    const antes = $('raLucro') || $('kpiStrip');
    if(antes && antes.parentNode === sec) antes.after(el); else sec.appendChild(el);
    el.addEventListener('click', e => { if(!e.target.closest('[data-op="caixa"]')) return; const b = document.querySelector('#nav [data-v="caixa"]'); if(b) b.click(); });
  }
  const {ano, mes} = t.periodo();
  const chave = String(ano);
  pintarOperacao(el, t, ano, mes);
  const erroEm = op.quando.get(chave);
  if(op.pedindo.has(chave) || (erroEm && Date.now() - erroEm < 60000)) return;
  op.pedindo.add(chave);
  const repintar = () => { const tt = telas(), p = tt && tt.periodo(); if(p && String(p.ano) === chave && el.isConnected) pintarOperacao(el, tt, p.ano, p.mes); };
  lerOperacao(ano).then(R => {
    op.pedindo.delete(chave); op.erro.delete(chave); op.quando.delete(chave);
    if(!R){ op.semAcesso = true; el.remove(); return; }
    const js = JSON.stringify(R);
    if(js === op.json.get(chave)) return;
    op.json.set(chave, js); op.cache.set(chave, R);
    repintar();
  }).catch(e => {
    op.pedindo.delete(chave); op.erro.set(chave, (e && e.message) || 'erro desconhecido'); op.quando.set(chave, Date.now());
    if(!op.cache.has(chave)) repintar();
  });
}

window.RadarLucro = { desenhar(){
  try{ desenharLucro(); }catch(e){ console.error(e); }
  try{ desenharOperacao(); }catch(e){ console.error(e); }
} };
})();

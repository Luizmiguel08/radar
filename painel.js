/* Radar de Comissões · Resumo no alto da Visão geral (painel inicial)
   1. O caminho do dinheiro do período: Vendemos (VGV) → Ganhamos (comissão e lucro da empresa), pela data da venda;
      Recebemos (comissão que entrou na conta) → Sobrou (resultado operacional), pelo extrato da tela Caixa.
      Cada número comparado com o mesmo trecho do período anterior (no mês corrente, do dia 1 até hoje).
   2. Está travado: o que já devia ter entrado e não entrou (construtora atrasada, cliente que não pagou a parcela,
      entrada vencida), com a dívida mais antiga.
   3. Vamos receber (próximos 30 dias e a próxima sexta) e Caixa (disponível agora e retiradas dos sócios no ano).
   4. Uma linha de avisos com o que pede ação hoje.
   Só dono e sócios veem. Os números saem do mesmo motor das telas (RadarTelas.motor) e do caixa (RadarCaixaNucleo). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nz = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const telas = () => window.RadarTelas || null;
const nivel = () => (window.RadarApp && typeof window.RadarApp.nivel === 'function') ? window.RadarApp.nivel() : null;

const BRL0 = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: 0});
const R0 = v => BRL0.format(Math.round(v || 0) || 0);
const curto = v => { const a = Math.abs(v || 0), sn = v < 0 ? '−' : ''; if(a >= 1e6) return sn + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' mi'; if(a >= 1e4) return sn + 'R$ ' + Math.round(a / 1e3).toLocaleString('pt-BR') + ' mil'; return sn + R0(a); };
const pct = (a, b, casas = 1) => b ? (a / b * 100).toLocaleString('pt-BR', {minimumFractionDigits: casas, maximumFractionDigits: casas}).replace('-', '−') + '%' : '–';
const pl = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const pd = s => { if(!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const dias = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—';
const ultimo = (y, m) => new Date(y, m, 0).getDate();
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// o mesmo dia um mês (ou um ano) antes, sem passar do fim do mês
const antes = (s, mes) => { const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10); const t = mes ? new Date(y, m - 2, 1) : new Date(y - 1, m - 1, 1); return iso(new Date(t.getFullYear(), t.getMonth(), Math.min(d, ultimo(t.getFullYear(), t.getMonth() + 1)))); };
const proxSexta = s => { const d = pd(s); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return iso(d); };

/* ---------- período e comparação ---------- */
function janela(t){
  const hoje = t.hoje(); const {ano, mes} = t.periodo();
  if(mes){
    const mm = String(mes).padStart(2, '0');
    const ini = `${ano}-${mm}-01`, fimMes = `${ano}-${mm}-${String(ultimo(ano, mes)).padStart(2, '0')}`;
    const atual = hoje.slice(0, 7) === `${ano}-${mm}`;
    const futuro = ini > hoje;
    const fim = atual ? hoje : fimMes;
    const pm = mes === 1 ? 12 : mes - 1, py = mes === 1 ? ano - 1 : ano;
    return {mes, ano, ini, fim, fimMes, atual, futuro, ini0: `${py}-${String(pm).padStart(2, '0')}-01`, fim0: atual ? antes(hoje, true) : `${py}-${String(pm).padStart(2, '0')}-${String(ultimo(py, pm)).padStart(2, '0')}`,
      nome: MESES[mes - 1], nome0: MESES[pm - 1], ano0: py};
  }
  const ini = `${ano}-01-01`, fimAno = `${ano}-12-31`, atual = hoje.slice(0, 4) === String(ano);
  return {mes: 0, ano, ini, fim: atual ? hoje : fimAno, fimMes: fimAno, atual, futuro: ini > hoje, ini0: `${ano - 1}-01-01`, fim0: atual ? antes(hoje, false) : `${ano - 1}-12-31`, nome: String(ano), nome0: String(ano - 1), ano0: ano - 1};
}

/* ---------- vendas do período (pela data da venda) ---------- */
function vendasDe(t, a, b){
  const m = t.motor; const r = {vgv: 0, n: 0, un: 0, com: 0, emp: 0, dn: 0, dvgv: 0};
  for(const s of (t.vendas() || [])){
    if(!s || s.excluida) continue;
    const d = String(s.dataVenda || s.dataEntrada || '');
    if(!d || d < a || d > b) continue;
    if(!m.isActive(s)){ r.dn++; r.dvgv += Number(s.valorImovel) || 0; continue; }
    const c = Number(m.schedule(s).total) || 0;
    r.n++; r.un += Number(m.nUnits(s)) || 1; r.vgv += Number(s.valorImovel) || 0; r.com += c; r.emp += m.isCeo(s.corretor) ? c : c / 2;
  }
  return r;
}

/* ---------- o que está em aberto agora ---------- */
const prazoEntrada = cfg => { const n = Math.round(Number(cfg && cfg.prazoEntrada)); return n >= 1 && n <= 60 ? n : 7; };
function agora(t){
  const hoje = t.hoje(), m = t.motor, P = prazoEntrada(t.config());
  const atr = [], cli = [], ent = [], prox = [], repasse = [];
  const sexta = proxSexta(hoje), d30 = addD(hoje, 30);
  for(const s of (t.vendas() || [])){
    if(!s || s.excluida) continue;
    const sc = m.schedule(s);
    if(s.entradaPaga === false && m.isActive(s) && sc.list.length && !((s.recebimentos || {})[0] && s.recebimentos[0].pago)){
      const venc = (s.entradaCombinada && s.entradaCombinada.data) || s.dataEntrada || addD(s.dataVenda || s.dataEntrada || hoje, P);
      if(venc < hoje) ent.push({s, sc, dias: dias(venc, hoje), venc, valor: sc.list[0].comissao, total: sc.list.reduce((a, p) => a + p.comissao, 0)});
    }
    for(const p of sc.list){
      if(p.pago){ if(p.corretor > 0 && !p.repassado) repasse.push({s, p}); continue; }
      if(p.status === 'atrasado') atr.push({s, p, dias: dias(p.dataRecebimento, hoje)});
      else if(p.status === 'cliente') cli.push({s, p, dias: dias(p.dataCliente, hoje)});
      else if(p.status !== 'aguardando' && p.dataRecebimento && p.dataRecebimento >= hoje && p.dataRecebimento <= d30) prox.push({s, p});
    }
  }
  const soma = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
  const velho = [...atr.map(x => ({...x, k: 'atr'})), ...cli.map(x => ({...x, k: 'cli'})), ...ent.map(x => ({...x, k: 'ent'}))].sort((a, b) => b.dias - a.dias)[0] || null;
  const sextaXs = prox.filter(x => x.p.dataRecebimento <= sexta);
  const vencidas30 = [...atr, ...cli].filter(x => x.dias > 30);
  return {
    hoje, sexta,
    atr: {n: atr.length, v: soma(atr, x => x.p.comissao), cons: new Set(atr.map(x => nz(x.s.construtora))).size, dias: Math.max(0, ...atr.map(x => x.dias))},
    cli: {n: cli.length, v: soma(cli, x => x.p.comissao), clientes: new Set(cli.map(x => x.s.id)).size, dias: Math.max(0, ...cli.map(x => x.dias))},
    ent: {n: ent.length, v: soma(ent, x => x.valor), total: soma(ent, x => x.total), dias: Math.max(0, ...ent.map(x => x.dias))},
    velho,
    prox: {n: prox.length, v: soma(prox, x => x.p.comissao), emp: soma(prox, x => x.p.empresa)},
    sextaV: {n: sextaXs.length, v: soma(sextaXs, x => x.p.comissao)},
    repasse: {n: repasse.length, v: soma(repasse, x => x.p.corretor), corretores: new Set(repasse.map(x => x.s.corretor)).size},
    vencidas30: {n: vencidas30.length, v: soma(vencidas30, x => x.p.comissao)}
  };
}

/* ---------- caixa (pelo extrato, mesmas regras da tela Caixa) ---------- */
const CX = {M: null, erro: '', pedindo: false, quando: 0, sem: false};
function posLinhas(){ const N = window.RadarCaixaNucleo; const P = {}; (N && N.LINHAS || []).forEach(([rot], i) => { P[rot] = i + 1; }); return P; }
function caixaEntre(M, a, b){
  const P = posLinhas(); let rec = 0, rep = 0, cus = 0, soc = 0;
  for(const x of M.lancs){
    if(x.data < a || x.data > b) continue;
    const p = P[x.linha] || 0;
    if(p >= 1 && p <= 5) rec += x.sinal; else if(p >= 7 && p <= 9) rep += x.sinal; else if(p >= 11 && p <= 21) cus += x.sinal; else if(p === 23) soc += x.sinal;
  }
  return {receita: rec, margem: rec + rep, resultado: rec + rep + cus, socios: -soc};
}
function lerCaixa(){
  if(CX.pedindo || CX.sem) return;
  if(CX.erro && Date.now() - CX.quando < 60e3) return;
  const cl = window.claude;
  if(!cl || typeof cl.use !== 'function' || !window.RadarCaixaNucleo){ CX.sem = true; return; }
  const t0 = telas(), hoje = t0 ? t0.hoje() : iso(new Date());
  const rc = window.RadarCaixa;
  if(rc && typeof rc.modelo === 'function'){
    // o mesmo modelo da tela Caixa: carrega uma vez e acompanha o que a tela atualizar
    CX.pedindo = true;
    Promise.resolve(cl.use('caixa')).then(f => f ? rc.modelo(f, hoje) : null).then(M => {
      CX.pedindo = false; CX.quando = Date.now();
      if(!M){ CX.sem = true; desenhar(); return; }
      CX.erro = '';
      if(M !== CX.M){ CX.M = M; desenhar(); }
    }).catch(e => { CX.pedindo = false; CX.quando = Date.now(); CX.erro = (e && e.message) || 'erro'; desenhar(); });
    return;
  }
  if(CX.M && Date.now() - CX.quando < 5 * 60e3) return;
  CX.pedindo = true;
  Promise.resolve(cl.use('caixa')).then(f => f ? f.carregar() : null).then(d => {
    CX.pedindo = false; CX.quando = Date.now();
    if(!d){ CX.sem = true; desenhar(); return; }
    CX.M = window.RadarCaixaNucleo.montar(d, hoje); CX.erro = '';
    desenhar();
  }).catch(e => { CX.pedindo = false; CX.quando = Date.now(); CX.erro = (e && e.message) || 'erro'; desenhar(); });
}

/* ---------- desenho ---------- */
const CSS_PAINEL = `
:root{--ra-mut:#5A6884;--rp-atr:var(--crit);--rp-cli:#C2410C;--rp-agu:#A16207}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ra-mut:var(--muted);--rp-cli:#FB923C;--rp-agu:#FACC15}}
:root[data-theme="dark"]{--ra-mut:var(--muted);--rp-cli:#FB923C;--rp-agu:#FACC15}
.rp{margin-bottom:18px;display:flex;flex-direction:column;gap:14px}
.rp-cab{display:flex;align-items:baseline;gap:6px 16px;flex-wrap:wrap}
.rp-cab h2{font-size:18px;margin:0}
.rp-cab p{margin:0;font-size:12.5px;color:var(--ra-mut)}
.rp-caminho{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.rp-meia{padding:14px 18px 16px;min-width:0}
.rp-meia + .rp-meia{border-left:1px solid var(--line)}
.rp-meia > small{display:block;font-size:12px;font-weight:700;color:var(--ra-mut);margin-bottom:8px}
.rp-passos{display:grid;grid-template-columns:minmax(0,1fr) 62px minmax(0,1fr);align-items:stretch}
.rp-p{border:0;background:none;padding:6px 8px;margin:-6px -8px;border-radius:10px;text-align:left;color:var(--ink);display:flex;flex-direction:column;gap:2px;min-width:0}
.rp-p[data-ir]:hover{background:var(--surface-2)}
.rp-p:focus-visible,.rp button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.rp-p .r{font-size:13px;font-weight:700;color:var(--ink-2)}
.rp-p .v{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:26px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-p .v.neg{color:var(--crit)}
.rp-p .s{font-size:12.5px;color:var(--ink-2);line-height:1.4}
.rp-p .c{font-size:12px;color:var(--ra-mut);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.rp-p .c .pill{font-size:11px;padding:1px 7px}
.rp-seta{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--ra-mut);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center;line-height:1.2}
.rp-seta small{font-size:11px;font-weight:600}
.rp-seta i{display:block;width:34px;height:2px;background:var(--line-strong);position:relative}
.rp-seta i::after{content:"";position:absolute;right:-1px;top:-4px;border-left:7px solid var(--line-strong);border-top:5px solid transparent;border-bottom:5px solid transparent}
.rp-meio{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:14px}
.rp-trav{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 18px;display:flex;flex-direction:column;gap:10px;min-width:0;position:relative;overflow:hidden}
.rp-trav::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--crit)}
.rp-trav.zero::before{background:var(--good)}
.rp-trav h3{font-size:14px;margin:0;color:var(--crit)}
.rp-trav.zero h3{color:var(--good)}
.rp-trav .tot{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.rp-trav .tot b{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:28px;font-weight:700;color:var(--crit);line-height:1.15;font-variant-numeric:tabular-nums}
.rp-trav.zero .tot b{color:var(--good)}
.rp-trav .tot span{font-size:12.5px;color:var(--ink-2)}
.rp-ls{display:flex;flex-direction:column}
.rp-li{border:0;background:none;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1.15fr);gap:4px 14px;align-items:center;padding:9px 4px;text-align:left;color:var(--ink);min-height:44px}
.rp-li:hover{background:var(--surface-2)}
.rp-li .n{font-weight:700;font-size:13px;display:flex;align-items:center;gap:8px;min-width:0}
.rp-li .n i{width:9px;height:9px;border-radius:99px;flex:none}
.rp-li .v{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.rp-li .d{font-size:12px;color:var(--ra-mut);line-height:1.35}
.rp-li.vazio{cursor:default;color:var(--ra-mut)} .rp-li.vazio:hover{background:none} .rp-li.vazio .v{color:var(--ra-mut);font-weight:700}
.rp-velho{font-size:12.5px;color:var(--ink-2);background:var(--crit-bg);border-radius:10px;padding:8px 10px;line-height:1.45}
.rp-velho b{color:var(--crit)}
.rp-bts{display:flex;gap:8px;flex-wrap:wrap}
.rp-lado{display:flex;flex-direction:column;gap:14px;min-width:0}
.rp-bloco{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 16px;display:flex;flex-direction:column;gap:2px;min-width:0}
.rp-bloco h3{font-size:14px;margin:0 0 6px}
.rp-kv{border:0;background:none;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 12px;align-items:baseline;padding:8px 4px;text-align:left;color:var(--ink);min-height:44px}
.rp-kv:first-of-type{border-top:0}
.rp-kv[data-ir]:hover{background:var(--surface-2)}
.rp-kv .k{font-size:13px;font-weight:700;color:var(--ink-2)}
.rp-kv .v{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.rp-kv .d{grid-column:1 / -1;font-size:12px;color:var(--ra-mut);line-height:1.35}
.rp-avisos{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.rp-avisos > span{font-size:12.5px;font-weight:700;color:var(--ra-mut);margin-right:2px}
.rp-av{border:1px solid var(--line-strong);background:var(--surface);border-radius:99px;padding:7px 13px;font-size:12.5px;font-weight:600;color:var(--ink);display:inline-flex;gap:7px;align-items:center;min-height:36px;text-align:left}
.rp-av:hover{background:var(--surface-2)}
.rp-av i{width:8px;height:8px;border-radius:99px;flex:none;background:var(--c, var(--blue))}
.rp-av b{font-variant-numeric:tabular-nums}
.rp-ok{font-size:12.5px;color:var(--good);font-weight:700}
body.broker #raResumo{display:none!important}
/* o resumo novo toma o lugar dos indicadores e das faixas de cobrança do alto (só depois de desenhado) */
body.rp-ativo #sec-overview > #cobranca,body.rp-ativo #sec-overview > #kpis,body.rp-ativo #sec-overview > #kpiStrip,body.rp-ativo #sec-overview > #raCrmCob{display:none!important}
@media (max-width:1100px){
  .rp-caminho{grid-template-columns:minmax(0,1fr)}
  .rp-meia + .rp-meia{border-left:0;border-top:1px solid var(--line)}
  .rp-meio{grid-template-columns:minmax(0,1fr)}
  .rp-lado{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
@media (max-width:820px){
  .rp-cab{flex-direction:column;gap:2px}
  .rp-meia{padding:12px 14px 14px}
  /* no celular os passos ficam um embaixo do outro, com a seta para baixo entre eles */
  .rp-passos{grid-template-columns:minmax(0,1fr)}
  .rp-p .v{font-size:24px}
  .rp-seta{flex-direction:row;justify-content:flex-start;gap:7px;padding:10px 0 8px 3px}
  .rp-seta i{order:-1;width:2px;height:14px;margin-right:4px}
  .rp-seta i::after{right:auto;left:-4px;top:auto;bottom:-3px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--line-strong);border-bottom:0}
  .rp-seta small{font-size:12px}
  .rp-lado{display:flex}
  .rp-trav{padding:12px 14px}
  .rp-trav .tot b{font-size:24px}
  .rp-li{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"n v" "d d"}
  .rp-li .n{grid-area:n} .rp-li .v{grid-area:v} .rp-li .d{grid-area:d}
  .rp-avisos{flex-direction:column;align-items:stretch}
  .rp-av{border-radius:12px;min-height:44px}
}
`;
const estilo = document.createElement('style'); estilo.textContent = CSS_PAINEL; document.head.appendChild(estilo);

function delta(cur, ant, fmt){
  if(!ant && !cur) return '<span class="pill">sem movimento</span>';
  if(!ant) return `<span>antes: nada</span>`;
  if(ant < 0 || cur < 0) return `<span>antes ${fmt(ant)}</span>`;
  const d = (cur - ant) / Math.abs(ant) * 100;
  return `<span class="pill ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toLocaleString('pt-BR', {maximumFractionDigits: 0})}%</span><span>antes ${fmt(ant)}</span>`;
}
function passo({rot, v, s, c, ir, neg, titulo}){
  const tag = ir ? 'button' : 'div';
  return `<${tag}${ir ? ` type="button" data-ir="${ir}"` : ''} class="rp-p"${titulo ? ` title="${esc(titulo)}"` : ''}><span class="r">${rot}</span><span class="v${neg ? ' neg' : ''}">${v}</span><span class="s">${s}</span>${c ? `<span class="c">${c}</span>` : ''}</${tag}>`;
}
const seta = (txt, leg) => `<div class="rp-seta" aria-hidden="true"><span>${txt || ''}</span><i></i>${txt && leg ? `<small>${leg}</small>` : ''}</div>`;

function desenhar(){
  const t = telas(); const sec = $('sec-overview');
  if(!t || !t.motor || !t.periodo || !sec) return;
  let el = $('raResumo');
  if(nivel() !== 'admin' && nivel() !== 'time'){ if(el) el.remove(); document.body.classList.remove('rp-ativo'); return; }
  if(!el){
    el = document.createElement('div'); el.id = 'raResumo'; el.className = 'rp';
    sec.insertBefore(el, sec.firstChild);
    el.addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if(b) ir(b.dataset.ir); });
  }
  lerCaixa();
  const J = janela(t);
  const V = vendasDe(t, J.ini, J.fim), V0 = vendasDe(t, J.ini0, J.fim0);
  const A = agora(t);
  const M = CX.M;
  const titulo = J.mes ? `Resumo de ${J.nome}${J.ano !== +J.ini0.slice(0, 4) || !J.atual ? ' de ' + J.ano : ''}` : `Resumo de ${J.ano}`;
  // caixa: até o último dia de extrato
  let K = null, K0 = null, fimCx = null;
  if(M && M.ultimoDia){
    fimCx = M.ultimoDia < J.fim ? M.ultimoDia : J.fim;
    if(fimCx >= J.ini){
      K = caixaEntre(M, J.ini, fimCx);
      const parcialCx = fimCx < J.fimMes;
      K0 = caixaEntre(M, J.ini0, parcialCx ? antes(fimCx, !!J.mes) : J.fim0);
    }
  }
  const ant = J.mes ? `${J.nome0}${J.ano0 !== J.ano ? ' de ' + J.ano0 : ''}` : J.nome0;
  const cab = `<div class="rp-cab"><h2>${esc(titulo)}</h2><p>${J.futuro ? 'Período ainda não começou.' : J.atual ? `Até ${dm(J.fim)}. Cada número comparado com o mesmo trecho de ${esc(ant)}.` : `${J.mes ? 'Mês inteiro' : 'Ano inteiro'}, comparado com ${esc(ant)}.`}</p></div>`;
  const ate = f => J.mes ? `1º a ${dm(f)}` : `1º/1 a ${dm(f)}`;

  // 1. caminho do dinheiro
  const vendasTxt = V.n ? `${pl(V.n, 'venda', 'vendas')}${V.un !== V.n ? ` (${pl(V.un, 'unidade', 'unidades')})` : ''}${V.dn ? ` · ${pl(V.dn, 'distrato', 'distratos')}` : ''}` : (V.dn ? pl(V.dn, 'distrato', 'distratos') : 'nenhuma venda');
  const p1 = passo({rot: 'Vendemos', v: curto(V.vgv), s: vendasTxt, c: delta(V.vgv, V0.vgv, curto), ir: 'vendas', titulo: `VGV ${R0(V.vgv)} · antes ${R0(V0.vgv)}`});
  const p2 = passo({rot: 'Ganhamos', v: curto(V.com), s: V.com ? `de comissão · ${curto(V.emp)} na empresa` : 'de comissão', c: delta(V.com, V0.com, curto), ir: 'lucro', titulo: `Comissão ${R0(V.com)} · lucro da empresa ${R0(V.emp)} (${pct(V.emp, V.vgv)} do VGV)`});
  let p3, p4, metaCx;
  if(K){
    p3 = passo({rot: 'Recebemos', v: curto(K.receita), s: 'de comissão na conta', c: delta(K.receita, K0.receita, curto), ir: 'caixa', titulo: `Comissão que entrou ${R0(K.receita)} · antes ${R0(K0.receita)}`});
    p4 = passo({rot: 'Sobrou', v: curto(K.resultado), neg: K.resultado < 0, s: K.resultado < 0 ? 'repasses e custos passaram o que entrou' : 'depois de repasses e custos', c: delta(K.resultado, K0.resultado, curto), ir: 'margem', titulo: `Resultado operacional ${R0(K.resultado)} · antes ${R0(K0.resultado)}`});
    metaCx = `Pelo extrato da conta${J.atual || fimCx < J.fimMes ? ' · ' + ate(fimCx) : ''}`;
  } else {
    const msg = CX.sem ? 'o caixa não está disponível' : CX.erro ? 'não foi possível ler o caixa' : M ? 'sem extrato do período' : 'lendo o caixa…';
    p3 = passo({rot: 'Recebemos', v: '–', s: msg}); p4 = passo({rot: 'Sobrou', v: '–', s: msg});
    metaCx = 'Pelo extrato da conta';
  }
  const caminho = `<div class="rp-caminho">`
    + `<div class="rp-meia"><small>Pela data da venda${J.atual ? ' · ' + ate(J.fim) : ''}</small><div class="rp-passos">${p1}${seta(V.vgv ? pct(V.com, V.vgv) : '', 'do VGV')}${p2}</div></div>`
    + `<div class="rp-meia"><small>${metaCx}</small><div class="rp-passos">${p3}${seta(K && K.receita > 0 ? pct(K.resultado, K.receita, 0) : '', 'margem')}${p4}</div></div>`
    + `</div>`;

  // 2. está travado
  const tot = A.atr.v + A.cli.v + A.ent.v;
  const li = (k, cor, rot, v, n, d) => n
    ? `<button type="button" class="rp-li" data-ir="${k}"><span class="n"><i style="background:${cor}"></i>${rot}</span><span class="v">${curto(v)}</span><span class="d">${d}</span></button>`
    : `<div class="rp-li vazio"><span class="n"><i style="background:${cor};opacity:.35"></i>${rot}</span><span class="v">nada</span><span class="d"></span></div>`;
  const vel = A.velho;
  const velTxt = !vel ? '' : vel.k === 'ent'
    ? `Mais antiga: <b>${pl(vel.dias, 'dia', 'dias')}</b> · entrada de ${esc(vel.s.cliente || 'cliente')} (${esc(vel.s.construtora || '')}), venceu em ${dm(vel.venc)}.`
    : `Mais antiga: <b>${pl(vel.dias, 'dia', 'dias')}</b> · ${esc(vel.p.idx === 0 && !vel.p.semEntrada ? 'entrada' : vel.p.tipo.toLowerCase())} de ${esc(vel.s.cliente || 'cliente')} (${esc(vel.s.construtora || '')}), ${vel.k === 'atr' ? `a construtora devia ter repassado em ${dm(vel.p.dataRecebimento)}` : `o cliente devia ter pago em ${dm(vel.p.dataCliente)}`}.`;
  const trav = `<div class="rp-trav${tot ? '' : ' zero'}"><h3>Está travado</h3>`
    + `<div class="tot"><b>${tot ? curto(tot) : 'Nada'}</b><span>${tot ? 'de comissão que já devia ter entrado' : 'Nenhuma comissão atrasada agora.'}</span></div>`
    + `<div class="rp-ls">`
    + li('atrasado', 'var(--rp-atr)', 'Construtora não repassou', A.atr.v, A.atr.n, `${pl(A.atr.n, 'lançamento', 'lançamentos')} · ${pl(A.atr.cons, 'construtora', 'construtoras')} · até ${pl(A.atr.dias, 'dia', 'dias')}`)
    + li('cliente', 'var(--rp-cli)', 'Cliente não pagou a parcela', A.cli.v, A.cli.n, `${pl(A.cli.n, 'parcela', 'parcelas')} · ${pl(A.cli.clientes, 'cliente', 'clientes')} · até ${pl(A.cli.dias, 'dia', 'dias')}`)
    + li('aguardando', 'var(--rp-agu)', 'Entrada vencida', A.ent.v, A.ent.n, `${pl(A.ent.n, 'venda', 'vendas')} · ${curto(A.ent.total)} de comissão esperando a entrada`)
    + `</div>`
    + (velTxt ? `<div class="rp-velho">${velTxt}</div>` : '')
    + `<div class="rp-bts"><button type="button" class="btn sm primary" data-ir="cobrancas">Abrir cobranças</button><button type="button" class="btn sm" data-ir="${A.atr.n ? 'atrasado' : A.cli.n ? 'cliente' : 'areceber'}">Ver no cronograma</button></div>`
    + `</div>`;

  // 3. vamos receber e caixa
  const receber = `<div class="rp-bloco"><h3>Vamos receber</h3>`
    + `<button type="button" class="rp-kv" data-ir="sexta"><span class="k">Até a sexta, ${dm(A.sexta)}</span><span class="v">${curto(A.sextaV.v)}</span><span class="d">${A.sextaV.n ? pl(A.sextaV.n, 'lançamento previsto', 'lançamentos previstos') : 'nada previsto até lá'}</span></button>`
    + `<button type="button" class="rp-kv" data-ir="areceber"><span class="k">Próximos 30 dias</span><span class="v">${curto(A.prox.v)}</span><span class="d">${pl(A.prox.n, 'lançamento', 'lançamentos')} · ${curto(A.prox.emp)} ficam na empresa</span></button>`
    + `</div>`;
  let caixa = '';
  if(M){
    const disp = (M.saldoConta || 0) + (M.caixinha ? M.caixinha.estimada : 0);
    const anoS = String(J.ano);
    const fimAno = M.ultimoDia && M.ultimoDia.startsWith(anoS) ? M.ultimoDia : `${anoS}-12-31`;
    const KA = caixaEntre(M, `${anoS}-01-01`, fimAno);
    caixa = `<div class="rp-bloco"><h3>Caixa</h3>`
      + `<button type="button" class="rp-kv" data-ir="caixa"><span class="k">Disponível agora</span><span class="v">${M.saldoConta == null ? '–' : curto(disp)}</span><span class="d">${M.saldoConta == null ? 'importe um extrato para ver o saldo' : `conta ${curto(M.saldoConta)} em ${dm(M.ultimoDia)}${M.caixinha ? ` · caixinha ${curto(M.caixinha.estimada)}` : ''}`}</span></button>`
      + `<button type="button" class="rp-kv" data-ir="caixa"><span class="k">Retiradas dos sócios em ${anoS}</span><span class="v">${curto(KA.socios)}</span><span class="d">${KA.resultado > 0 ? `${pct(KA.socios, KA.resultado, 0)} do resultado operacional do ano (${curto(KA.resultado)})` : 'retiradas menos aportes'}</span></button>`
      + `</div>`;
  }
  const meio = `<div class="rp-meio">${trav}<div class="rp-lado">${receber}${caixa}</div></div>`;

  // 4. avisos do dia
  const av = [];
  if(A.repasse.n) av.push(`<button type="button" class="rp-av" data-ir="repasses" style="--c:var(--blue)"><i></i><span><b>${curto(A.repasse.v)}</b> para repassar a ${pl(A.repasse.corretores, 'corretor', 'corretores')}: já recebemos e ainda não pagamos</span></button>`);
  if(A.vencidas30.n) av.push(`<button type="button" class="rp-av" data-ir="cobrancas" style="--c:var(--crit)"><i></i><span><b>${pl(A.vencidas30.n, 'cobrança vencida', 'cobranças vencidas')}</b> há mais de 30 dias (${curto(A.vencidas30.v)})</span></button>`);
  const crmN = nivel() === 'admin' ? (() => { const b = $('raCrmN'); return b && !b.hidden ? parseInt(b.textContent, 10) || 0 : 0; })() : 0;
  if(crmN) av.push(`<button type="button" class="rp-av" data-ir="crm" style="--c:var(--warn)"><i></i><span><b>${pl(crmN, 'venda do CRM', 'vendas do CRM')}</b> ${crmN === 1 ? 'esperando' : 'esperando'} revisão</span></button>`);
  const avisos = `<div class="rp-avisos"><span>Pede ação hoje</span>${av.length ? av.join('') : '<span class="rp-ok">Nada pendente.</span>'}</div>`;

  el.innerHTML = cab + caminho + meio + avisos;
  document.body.classList.add('rp-ativo');
}

/* ---------- atalhos ---------- */
function ir(k){
  const nav = v => { const b = document.querySelector(`#nav [data-v="${v}"]`); if(b){ b.click(); return true; } return false; };
  const rolar = id => { const x = $(id); if(x){ x.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); const h = x.querySelector('h2'); if(h){ h.tabIndex = -1; h.focus({preventScroll: true}); } } };
  const cr = window.RadarCronograma;
  if(k === 'vendas') return nav('sales');
  if(k === 'lucro') return rolar('raLucro');
  if(k === 'margem') return rolar('raOperacao');
  if(k === 'caixa') return nav('caixa');
  if(k === 'cobrancas') return nav('cobrancas');
  if(k === 'repasses') return nav('repasses');
  if(k === 'crm'){ if(window.RadarApp && window.RadarApp.abrirCrm) window.RadarApp.abrirCrm(); return; }
  if(['atrasado', 'cliente', 'aguardando', 'areceber', 'sexta'].includes(k)){
    if(cr && cr.abrir) return cr.abrir(k === 'sexta' ? 'areceber' : k);
    return nav('installments');
  }
}

window.RadarPainel = { desenhar(){ try{ desenhar(); }catch(e){ console.error(e); document.body.classList.remove('rp-ativo'); } } };
})();

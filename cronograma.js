/* Radar de Comissões · Cronograma de recebimentos, organizado por situação
   - Uma faixa com as seis situações. Cada lançamento está em uma só, então a soma da faixa é o total:
     Atrasado (a construtora não repassou), Sem confirmação (parcela vencida sem confirmação do cliente),
     Aguardando entrada, Cliente já pagou (só falta a construtora), Parcela a vencer (depende do cliente) e Recebido.
     "A receber" (atalhos antigos e do resumo) mostra Cliente já pagou e Parcela a vencer juntos.
   - Em Sem confirmação e Parcela a vencer dá para marcar várias parcelas como pagas pelo cliente de uma vez
     (por exemplo, a lista do mês de uma construtora), cada uma na data de vencimento ou todas numa data.
   - No detalhe da venda, "Cronograma da construtora" grava as datas e os valores que a construtora programou
     no portal (campo programado da venda); o motor usa esse cronograma no lugar da entrada e das parcelas.
   - Período só pelo "Período rápido" (com datas livres dentro dele).
   - Três jeitos de ver: lista, por cliente e por construtora.
   - Nos atrasos, a idade da dívida em faixas (até 7, 8 a 30, 31 a 60 e mais de 60 dias).
   - Clicar no cliente abre a venda ao lado: todas as parcelas, cobranças, histórico e as ações.
   - Uma ação principal por linha; as outras ficam no detalhe.
   Os números saem do mesmo motor da tela (RadarTelas.motor.schedule). As ações usam RadarTelas.acoes quando
   existir; sem ele (ou com window.RADAR_PREVIA) os botões só avisam o que fariam e nada é gravado. */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nz = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const telas = () => window.RadarTelas || null;
const nivel = () => (window.RadarApp && typeof window.RadarApp.nivel === 'function') ? window.RadarApp.nivel() : null;
const emPrevia = () => !!window.RADAR_PREVIA || !(telas() && telas().acoes);
// quem entra com o código de sócio (só leitura) não vê os botões que gravam
const podeAgir = () => emPrevia() || !!(telas().acoes.pode && telas().acoes.pode());
const podeExportar = () => emPrevia() || !!(telas().acoes.podeExportar && telas().acoes.podeExportar());
// o filtro da tela antiga (avisos e atalhos que ainda mandam um filtro) vira a situação equivalente
const FILTRO_ANTIGO = {pendente: {balde: 'areceber'}, semana: {balde: 'areceber', periodo: 'semana'}, atrasado: {balde: 'atrasado'}, cliente: {balde: 'cliente'}, parcelas: {balde: 'cliente', modo: 'cliente'}, aguardando: {balde: 'aguardando'}, pago: {balde: 'recebido'}, todos: {balde: 'tudo'}};

const BRL0 = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: 0});
const BRL2 = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2});
const R0 = v => BRL0.format(Math.round(v || 0) || 0);
const R2 = v => BRL2.format(Math.round((v || 0) * 100) / 100 || 0);
const curto = v => { const a = Math.abs(v || 0); if(a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' mi'; if(a >= 1e4) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil'; return R0(v); };
const pl = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

/* ---------- datas (texto AAAA-MM-DD, como no resto do Radar) ---------- */
const pd = s => { if(!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const dias = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—';
const dmy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesNome = k => { const m = MESES[Number(k.slice(5, 7)) - 1]; return m[0].toUpperCase() + m.slice(1) + ' de ' + k.slice(0, 4); };
const segunda = s => { const d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const ultimoDia = (y, m) => new Date(y, m, 0).getDate();

/* ---------- situações e faixas de atraso ---------- */
const BALDES = [
  {id: 'atrasado', rot: 'Atrasado', dica: 'a construtora não repassou', um: 'lançamento', varios: 'lançamentos'},
  {id: 'cliente', rot: 'Sem confirmação', dica: 'parcela vencida, ninguém confirmou se o cliente pagou', um: 'parcela', varios: 'parcelas'},
  {id: 'aguardando', rot: 'Aguardando entrada', dica: 'começa quando o cliente pagar a entrada', um: 'venda', varios: 'vendas'},
  {id: 'pago', rot: 'Cliente já pagou', dica: 'só falta a construtora repassar', um: 'lançamento', varios: 'lançamentos'},
  {id: 'avencer', rot: 'Parcela a vencer', dica: 'depende do cliente pagar', um: 'parcela', varios: 'parcelas'},
  {id: 'recebido', rot: 'Recebido', dica: 'já caiu na conta', um: 'lançamento', varios: 'lançamentos'}
];
const BALDE = Object.fromEntries(BALDES.map(b => [b.id, b]));
// "A receber" (atalhos antigos e do resumo): as duas situações do que ainda vai entrar no prazo
const ARECEBER = new Set(['pago', 'avencer']);
BALDE.areceber = {id: 'areceber', rot: 'A receber', dica: 'cliente já pagou e parcelas a vencer', um: 'lançamento', varios: 'lançamentos'};
// marcar várias: só parcela de cliente ainda sem confirmação
const MARCAVEL = new Set(['cliente', 'avencer']);
const marcavel = it => MARCAVEL.has(it.b) && it.p.idx > 0 && !it.p.pago && !it.p.clientePagou;
const chave = it => it.s.id + '|' + it.p.idx;
const FAIXAS = [
  {id: 'a', rot: 'até 7 dias', de: -Infinity, ate: 7},
  {id: 'b', rot: '8 a 30 dias', de: 8, ate: 30},
  {id: 'c', rot: '31 a 60 dias', de: 31, ate: 60},
  {id: 'd', rot: 'mais de 60 dias', de: 61, ate: Infinity}
];
const faixaDe = d => (FAIXAS.find(f => d >= f.de && d <= f.ate) || FAIXAS[0]).id;
const ATRASO = new Set(['atrasado', 'cliente', 'aguardando']);
const baldeDe = p => p.pago ? 'recebido' : p.status === 'atrasado' ? 'atrasado' : p.status === 'cliente' ? 'cliente' : p.status === 'aguardando' ? 'aguardando' : p.clientePagou ? 'pago' : 'avencer';
const prazoEntrada = cfg => { const n = Math.round(Number(cfg && cfg.prazoEntrada)); return n >= 1 && n <= 60 ? n : 7; };
// a mesma régua da tela Entradas: data combinada, ou a data da entrada, ou a venda mais o prazo
const vencEntrada = (s, hoje, P) => (s.entradaCombinada && s.entradaCombinada.data) || s.dataEntrada || addD(s.dataVenda || s.dataEntrada || hoje, P);

const PERIODOS = [['', 'Qualquer data'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Esta semana'], ['semana-1', 'Semana passada'], ['prox7', 'Próximos 7 dias'], ['prox30', 'Próximos 30 dias'], ['mes', 'Este mês'], ['mes-1', 'Mês passado'], ['prox-mes', 'Próximo mês'], ['datas', 'Escolher datas…']];
function intervalo(p, hoje, de, ate){
  const y = +hoje.slice(0, 4), m = +hoje.slice(5, 7), seg = segunda(hoje);
  const mes = (yy, mm) => { const d = new Date(yy, mm - 1, 1); return [iso(d), iso(new Date(d.getFullYear(), d.getMonth(), ultimoDia(d.getFullYear(), d.getMonth() + 1)))]; };
  switch(p){
    case 'hoje': return [hoje, hoje];
    case 'ontem': return [addD(hoje, -1), addD(hoje, -1)];
    case 'semana': return [seg, addD(seg, 6)];
    case 'semana-1': return [addD(seg, -7), addD(seg, -1)];
    case 'prox7': return [hoje, addD(hoje, 7)];
    case 'prox30': return [hoje, addD(hoje, 30)];
    case 'mes': return mes(y, m);
    case 'mes-1': return mes(y, m - 1);
    case 'prox-mes': return mes(y, m + 1);
    case 'datas': return [de || '', ate || ''];
    default: return ['', ''];
  }
}

/* ---------- estado da tela ---------- */
const C = {balde: null, modo: 'lista', faixa: null, q: '', corretor: '', construtora: '', tipo: '', periodo: '', de: '', ate: '', aberto: null, limite: 80, abertos: new Set(), fechados: new Set(), marcar: false, sel: new Set()};

/* ---------- dados ---------- */
function montar(t){
  const hoje = t.hoje(), m = t.motor, P = prazoEntrada(t.config());
  const itens = [], vendas = new Map();
  for(const s of (t.vendas() || [])){
    if(!s || s.excluida) continue;
    const sc = m.schedule(s);
    const v = {s, sc, itens: [], ceo: m.isCeo ? m.isCeo(s.corretor) : false};
    vendas.set(s.id, v);
    const venc = s.entradaPaga === false ? vencEntrada(s, hoje, P) : null;
    const nParc = sc.list.length - (sc.list[0] && sc.list[0].semEntrada ? 0 : 1);
    for(const p of sc.list){
      const b = baldeDe(p);
      let idade = 0;
      if(b === 'atrasado') idade = dias(p.dataRecebimento, hoje);
      else if(b === 'cliente') idade = dias(p.dataCliente, hoje);
      else if(b === 'aguardando') idade = venc ? dias(venc, hoje) : 0;
      const dref = p.pago ? (p.dataPago || p.dataCaixa || p.dataRecebimento || '') : (p.dataRecebimento || '');
      const it = {p, s, sc, v, b, idade, venc, dref, nParc, rotulo: p.idx === 0 && !p.semEntrada ? 'Entrada' : `${p.tipo} de ${nParc}`};
      itens.push(it); v.itens.push(it);
    }
  }
  return {hoje, itens, vendas};
}
function filtrar(D){
  const [de, ate] = intervalo(C.periodo, D.hoje, C.de, C.ate);
  const q = C.q.trim(); const qn = nz(q);
  const cmp = q.match(/^([<>])\s*([\d.,]+)$/); const cmpV = cmp ? parseFloat(cmp[2].replace(/\./g, '').replace(',', '.')) : null;
  const qnum = parseFloat(q.replace(/\./g, '').replace(',', '.'));
  return D.itens.filter(it => {
    const {p, s} = it;
    if(C.corretor && s.corretor !== C.corretor) return false;
    if(C.construtora && nz(s.construtora) !== nz(C.construtora)) return false;
    if(C.tipo === 'entrada' && !(p.idx === 0 && !p.semEntrada)) return false;
    if(C.tipo === 'parcela' && (p.idx === 0 && !p.semEntrada)) return false;
    if(de && !(it.dref && it.dref >= de)) return false;
    if(ate && !(it.dref && it.dref <= ate)) return false;
    if(q){
      if(cmp) return cmp[1] === '>' ? p.comissao > cmpV : p.comissao < cmpV;
      const hay = nz([s.cliente, s.corretor, s.construtora, s.empreendimento, s.unidade, it.rotulo, dmy(p.dataRecebimento), dmy(p.dataCliente), p.dataPago ? dmy(p.dataPago) : '', BALDE[it.b].rot].join(' | '));
      if(hay.includes(qn)) return true;
      if(!isNaN(qnum) && qnum > 0 && (Math.abs(p.comissao - qnum) < 0.5 || Math.abs((p.valorCliente || 0) - qnum) < 0.5 || Math.abs(p.empresa - qnum) < 0.5)) return true;
      return false;
    }
    return true;
  });
}
// totais de cada situação; "Aguardando entrada" conta vendas e soma toda a comissão delas (nada entra antes da entrada)
function contar(F){
  const z = () => ({n: 0, vendas: new Set(), valor: 0, empresa: 0, corretor: 0, entrada: 0});
  const T = Object.fromEntries(BALDES.map(b => [b.id, z()]));
  for(const it of F){
    const t = T[it.b]; t.n++; t.vendas.add(it.s.id); t.valor += it.p.comissao; t.empresa += it.p.empresa; t.corretor += it.p.corretor;
    if(it.b === 'aguardando' && it.p.idx === 0) t.entrada += it.p.comissao;
  }
  T.aguardando.n = T.aguardando.vendas.size;
  return T;
}

/* ---------- desenho ---------- */
const CSS_CRONO = `
:root{--ra-mut:#5A6884;--ra-atr:var(--crit);--ra-atr-bg:var(--crit-bg);--ra-cli:#C2410C;--ra-cli-bg:#FFF1E6;--ra-agu:#A16207;--ra-agu-bg:#FEF6D8;--ra-rec:var(--blue);--ra-rec-bg:var(--blue-tint);--ra-ok:var(--good);--ra-ok-bg:var(--good-bg)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ra-mut:var(--muted);--ra-cli:#FB923C;--ra-cli-bg:#3A2114;--ra-agu:#FACC15;--ra-agu-bg:#33290A}}
:root[data-theme="dark"]{--ra-mut:var(--muted);--ra-cli:#FB923C;--ra-cli-bg:#3A2114;--ra-agu:#FACC15;--ra-agu-bg:#33290A}
.rc{padding:18px 20px 14px}
.rc .card-head{align-items:center;margin-bottom:14px}
.rc-cab-acoes{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rc-seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px}
.rc-seg button{border:0;background:none;color:var(--ink-2);font-weight:700;font-size:12.5px;padding:0 12px;border-radius:8px;min-height:32px;white-space:nowrap}
.rc-seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(11,42,111,.16)}
.rc button:focus-visible,.rc select:focus-visible,.rc input:focus-visible,.rc-pn button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.rc-faixa{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) auto;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:14px;background:var(--surface)}
.rc-b{--c:var(--ink-2);--cb:var(--surface-2);position:relative;border:0;border-right:1px solid var(--line);background:var(--surface);text-align:left;padding:12px 14px 11px;display:flex;flex-direction:column;gap:2px;min-width:0;color:var(--ink);transition:background .15s}
.rc-b::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--c);opacity:.85}
.rc-b:hover{background:var(--surface-2)}
.rc-b[aria-pressed="true"]{background:var(--cb)}
.rc-b[aria-pressed="true"]::before{height:5px;opacity:1}
.rc-b .r{font-size:12.5px;font-weight:700;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-b .v{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:20px;font-weight:700;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-b .s{font-size:12px;color:var(--ra-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-b.atrasado{--c:var(--ra-atr);--cb:var(--ra-atr-bg)} .rc-b.atrasado .v{color:var(--ra-atr)}
.rc-b.cliente{--c:var(--ra-cli);--cb:var(--ra-cli-bg)} .rc-b.cliente .v{color:var(--ra-cli)}
.rc-b.aguardando{--c:var(--ra-agu);--cb:var(--ra-agu-bg)}
.rc-b.areceber{--c:var(--ra-rec);--cb:var(--ra-rec-bg)}
.rc-b.recebido{--c:var(--ra-ok);--cb:var(--ra-ok-bg)}
.rc-b.zero .v{color:var(--ra-mut)}
.rc-b.tudo{border-right:0;justify-content:center;align-items:center;padding:10px 16px;min-width:84px}
.rc-b.tudo::before{display:none}
.rc-b.tudo .r{color:var(--blue-ink)}
.rc-barra{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.rc-barra input[type=search]{flex:1 1 240px;min-width:0}
.rc-barra select,.rc-barra input{min-height:36px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:9px;padding:7px 10px}
.rc-barra .rc-datas{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)}
.rc-idade{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.rc-idade button{border:1px solid var(--line-strong);background:var(--surface);border-radius:10px;padding:6px 12px;display:flex;flex-direction:column;align-items:flex-start;gap:0;min-width:150px;color:var(--ink);min-height:44px}
.rc-idade button .r{font-size:12px;font-weight:700;color:var(--ra-mut)}
.rc-idade button .v{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
.rc-idade button .v small{font-size:12px;font-weight:600;color:var(--ra-mut);margin-left:6px}
.rc-idade button.velho .v{color:var(--crit)}
.rc-idade button[aria-pressed="true"]{border-color:var(--blue);background:var(--blue-tint)}
.rc-idade button:disabled{opacity:.5;cursor:default}
.rc-resumo{font-size:12.5px;color:var(--ra-mut);margin:0 0 8px}
.rc-resumo b{color:var(--ink);font-variant-numeric:tabular-nums}
.rc-lista{list-style:none;margin:0;padding:0}
.rc-l{display:grid;grid-template-columns:112px minmax(0,1.25fr) minmax(170px,1fr) 170px 118px;gap:4px 14px;align-items:center;padding:10px 8px;border-top:1px solid var(--line);cursor:pointer}
.rc-lista.tudo .rc-l{grid-template-columns:112px minmax(0,1.25fr) minmax(150px,1fr) 150px 170px 118px}
.rc-l:hover{background:var(--surface-2)}
.rc-l.sel{background:var(--blue-tint)}
.rc-l .q b{display:block;font-size:13.5px;font-variant-numeric:tabular-nums}
.rc-l .q small,.rc-l .tp small,.rc-l .vl small,.rc-l .cl small{display:block;font-size:12px;color:var(--ra-mut);line-height:1.35}
.rc-l .q small.atr{color:var(--crit);font-weight:700}
.rc-l .q small.cli{color:var(--ra-cli);font-weight:700}
.rc-l .q small.ok{color:var(--good)}
.rc-l .cl{min-width:0}
.rc-nome{border:0;background:none;padding:0;font-weight:700;color:var(--ink);font-size:13.5px;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.rc-nome:hover{color:var(--blue-ink);text-decoration:underline}
.rc-l .cl small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-l .tp{font-size:13px;color:var(--ink-2)}
.rc-l .vl{text-align:right;font-variant-numeric:tabular-nums}
.rc-l .vl b{font-size:13.5px}
.rc-l .ac{text-align:right}
.rc-l .ac .btn{white-space:nowrap}
.rc-g{display:flex;align-items:baseline;gap:4px 10px;padding:16px 8px 6px;border-top:0;flex-wrap:wrap}
.rc-g button{border:0;background:none;padding:0;font-weight:800;font-size:13px;color:var(--ink);display:inline-flex;gap:6px;align-items:center;text-align:left}
.rc-g button .seta{display:inline-block;transition:transform .15s;color:var(--ra-mut)}
.rc-g button[aria-expanded="false"] .seta{transform:rotate(-90deg)}
.rc-g .t{margin-left:auto;font-size:12.5px;color:var(--ra-mut);font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-g .t b{color:var(--ink)}
.rc-g.atr button{color:var(--crit)}
.rc-mais{display:flex;justify-content:center;padding:12px 0 2px}
.rc-cl-l{grid-template-columns:minmax(0,1.4fr) minmax(0,.9fr) minmax(0,1.2fr) 180px}
.rc-prog{display:flex;flex-direction:column;gap:4px;min-width:0}
.rc-prog .tr{height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden;border:1px solid var(--line)}
.rc-prog .tr i{display:block;height:100%;background:var(--ra-ok)}
.rc-prog small{font-size:12px;color:var(--ra-mut)}
.rc-co-l{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 180px 150px}
.rc-co-l .tr{height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden;margin-top:6px}
.rc-co-l .tr i{display:block;height:100%;background:var(--c, var(--blue));opacity:.7}
.rc-vazio{padding:28px 12px;text-align:center;color:var(--ra-mut);font-size:13px;border:1px dashed var(--line-strong);border-radius:12px;margin-top:6px}
.rc-lista .rc-cab-lista{cursor:default;border-top:0;background:none;padding:0 8px 6px;font-size:12px;color:var(--ra-mut);font-weight:700}
.rc-lista .rc-cab-lista:hover{background:none}
.rc-tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap}
.rc-tag i{width:6px;height:6px;border-radius:99px;background:currentColor;display:inline-block}
.rc-tag.atrasado{background:var(--ra-atr-bg);color:var(--ra-atr)} .rc-tag.cliente{background:var(--ra-cli-bg);color:var(--ra-cli)}
.rc-tag.aguardando{background:var(--ra-agu-bg);color:var(--ra-agu)} .rc-tag.areceber{background:var(--ra-rec-bg);color:var(--blue-ink)}
.rc-tag.recebido{background:var(--ra-ok-bg);color:var(--ra-ok)}
/* detalhe da venda */
.rc-fundo{position:fixed;inset:0;background:rgba(6,17,44,.42);z-index:44;opacity:0;transition:opacity .2s}
.rc-fundo.on{opacity:1}
.rc-pn{position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);background:var(--surface);z-index:45;box-shadow:-18px 0 50px rgba(6,17,44,.25);display:flex;flex-direction:column;transform:translateX(24px);opacity:0;transition:transform .28s cubic-bezier(.2,.7,.2,1),opacity .2s}
.rc-pn.on{transform:none;opacity:1}
.rc-pn-cab{padding:18px 20px 12px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:flex-start}
.rc-pn-cab h2{font-size:18px;margin:0 0 2px}
.rc-pn-cab p{margin:0;font-size:12.5px;color:var(--ra-mut);line-height:1.45}
.rc-x{margin-left:auto;flex:none;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);display:grid;place-items:center;font-size:20px;line-height:1}
.rc-pn-corpo{overflow:auto;padding:14px 20px 22px;display:flex;flex-direction:column;gap:18px}
.rc-pn h3{font-size:13px;margin:0 0 8px;color:var(--ink)}
.rc-tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.rc-tres div{display:flex;flex-direction:column;gap:1px;min-width:0}
.rc-tres span{font-size:12px;color:var(--ra-mut);font-weight:700}
.rc-tres b{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-tres small{font-size:12px;color:var(--ra-mut)}
.rc-foco{border:1px solid var(--line-strong);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.rc-foco .l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rc-foco .l1 b{font-size:14px}
.rc-foco .l1 .v{margin-left:auto;font-family:"Sora","Manrope",system-ui,sans-serif;font-weight:700;font-size:16px;font-variant-numeric:tabular-nums}
.rc-foco dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0;font-size:12.5px}
.rc-foco dt{color:var(--ra-mut)} .rc-foco dd{margin:0;color:var(--ink);font-variant-numeric:tabular-nums}
.rc-foco .bts{display:flex;gap:6px;flex-wrap:wrap}
.rc-parc{width:100%;border-collapse:collapse;font-size:12.5px}
.rc-parc th{font-size:11px;padding:6px 6px;text-align:left;letter-spacing:.02em}
.rc-parc td{padding:6px 6px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-parc td.r,.rc-parc th.r{text-align:right}
.rc-parc tr.sel td{background:var(--blue-tint);font-weight:700}
.rc-parc tr[data-idx]{cursor:pointer}
.rc-parc tr[data-idx]:hover td{background:var(--surface-2)}
.rc-hist{list-style:none;margin:0;padding:0;font-size:12.5px}
.rc-hist li{padding:6px 0;border-bottom:1px solid var(--line);color:var(--ink-2);line-height:1.4}
.rc-hist li:last-child{border-bottom:0}
.rc-hist small{display:block;color:var(--ra-mut);font-size:12px}
.rc-pn-pe{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:space-between;align-items:center}
.rc-pn-pe small{font-size:12px;color:var(--ra-mut)}
body.broker #raCrono{display:none!important}
/* a tela nova toma o lugar dos indicadores, das abas e da tabela antiga (só depois de desenhada) */
body.rc-ativo #sec-installments > :not(#raCrono){display:none!important}
@media (prefers-reduced-motion: reduce){.rc-pn,.rc-fundo,.rc-dlg{transition:none}.rc-pn{transform:none}}
@media (max-width:1100px){
  .rc-l{grid-template-columns:100px minmax(0,1fr) minmax(140px,.9fr) 150px 112px}
  .rc-lista.tudo .rc-l{grid-template-columns:100px minmax(0,1fr) 140px 130px 150px 112px}
}
@media (max-width:820px){
  .rc{padding:14px 14px 10px}
  .rc .card-head{flex-direction:column;align-items:stretch;gap:10px}
  .rc-cab-acoes .rc-seg{flex:1}
  .rc-cab-acoes .rc-seg button{flex:1;padding:0 6px}
  .rc-faixa{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rc-b{border-bottom:1px solid var(--line);padding:11px 12px 10px}
  .rc-b:nth-child(2n){border-right:0}
  .rc-b .v{font-size:17px}
  .rc-b.tudo{flex-direction:row;gap:8px;justify-content:center;border-bottom:0;min-height:44px}
  .rc-b.recebido{border-bottom:0}
  .rc-barra{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .rc-barra input[type=search]{grid-column:1 / -1}
  .rc-barra select,.rc-barra input{width:100%;min-width:0;min-height:44px}
  .rc-barra .rc-datas{grid-column:1 / -1}
  .rc-barra .rc-limpar{grid-column:1 / -1}
  .rc-idade{display:grid;grid-template-columns:1fr 1fr}
  .rc-idade button{min-width:0}
  .rc-cab-lista{display:none}
  .rc-l,.rc-lista.tudo .rc-l{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"cl vl" "tp tp" "q ac";gap:4px 12px;padding:12px 4px}
  .rc-l .tp small{display:inline;margin-left:6px}
  .rc-g{padding:16px 4px 6px}
  .rc-g .t{margin-left:22px;width:100%}
  .rc-l .cl{grid-area:cl} .rc-l .vl{grid-area:vl} .rc-l .q{grid-area:q} .rc-l .ac{grid-area:ac;align-self:end} .rc-l .tp{grid-area:tp;font-size:12px;color:var(--muted)}
  .rc-l .st{display:none}
  .rc-l .q b{display:inline;font-size:13px} .rc-l .q small{display:inline;margin-left:6px}
  .rc-l .ac .btn{min-height:40px}
  .rc-cl-l,.rc-co-l{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"cl vl" "a b";}
  .rc-cl-l > :nth-child(1),.rc-co-l > :nth-child(1){grid-area:cl} .rc-cl-l > :nth-child(4),.rc-co-l > :nth-child(4){grid-area:vl}
  .rc-cl-l > :nth-child(2),.rc-co-l > :nth-child(2){grid-area:a} .rc-cl-l > :nth-child(3),.rc-co-l > :nth-child(3){grid-area:b}
  .rc-co-l > :nth-child(5){grid-column:1 / -1}
  .rc-pn{width:100vw}
  .rc-tres b{font-size:15px}
  .rc-pn-corpo{padding:14px 16px 22px}
  .rc-parc th,.rc-parc td{padding:6px 4px;font-size:12px}
  .rc-parc .rc-tag{padding:2px 7px;font-size:11px}
}
/* seis situações: as linhas da faixa saem do vão entre os cartões */
.rc-faixa{grid-template-columns:repeat(6,minmax(0,1fr)) auto;gap:1px;background:var(--line)}
.rc-b{border-right:0}
.rc-b.pago{--c:var(--ra-rec);--cb:var(--ra-rec-bg)}
.rc-b.avencer{--c:var(--ra-mut);--cb:var(--surface-2)}
.rc-tag.pago{background:var(--ra-rec-bg);color:var(--blue-ink)} .rc-tag.avencer{background:var(--surface-2);color:var(--ink-2)}
/* marcar várias */
.rc-marcar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:-2px 0 10px}
.rc-marcar small{font-size:12px;color:var(--ra-mut)}
.rc-l .q.ck{display:flex;gap:10px;align-items:flex-start}
.rc-ck{display:inline-grid;place-items:center;min-width:24px;min-height:24px;flex:none;cursor:pointer}
.rc-ck input{width:18px;height:18px;margin:0;accent-color:var(--blue);cursor:pointer}
.rc-l.marcada{background:var(--blue-tint)}
.rc-g .gsel{border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);font-size:12px;font-weight:700;padding:4px 9px;color:var(--blue-ink);min-height:30px}
.rc-sel{position:sticky;bottom:10px;z-index:3;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0 2px;padding:10px 12px;background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:0 8px 24px rgba(6,17,44,.16)}
.rc-sel .txt{font-size:13px;color:var(--ink-2)}
.rc-sel .txt b{color:var(--ink);font-variant-numeric:tabular-nums}
.rc-sel .sp{flex:1}
.rc-dlg{position:fixed;left:50%;top:50%;transform:translate(-50%,-46%);opacity:0;width:min(440px,calc(100vw - 32px));background:var(--surface);border-radius:14px;z-index:47;box-shadow:0 24px 60px rgba(6,17,44,.3);padding:18px 18px 14px;transition:opacity .2s,transform .25s cubic-bezier(.2,.8,.2,1)}
.rc-dlg.on{opacity:1;transform:translate(-50%,-50%)}
.rc-dlg h2{font-size:16px;margin:0 0 4px}
.rc-dlg p{font-size:12.5px;color:var(--ra-mut);margin:0 0 12px;line-height:1.45}
.rc-dlg label.op{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line-strong);border-radius:10px;margin-bottom:8px;font-size:13px;cursor:pointer}
.rc-dlg label.op small{display:block;font-size:12px;color:var(--ra-mut)}
.rc-dlg input[type=date]{margin-top:6px;min-height:36px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:9px;padding:6px 10px}
.rc-dlg .bts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.rc-fundo.dlg{z-index:46}
.rc-h3{display:flex;align-items:center;gap:8px;justify-content:space-between;margin:0 0 8px;flex-wrap:wrap}
.rc-h3 h3{margin:0}
.rc-prog-nota{font-size:12px;color:var(--ra-mut);margin:-2px 0 8px}
.rc-dlg.larga{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 40px);display:flex;flex-direction:column}
.rc-dlg .rc-linhas{overflow:auto;display:flex;flex-direction:column;gap:6px;padding:2px;margin:0 -2px}
.rc-dlg .rc-lin{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(0,1fr) 40px;gap:8px;align-items:center}
.rc-dlg .rc-lin .n{font-size:12px;font-weight:700;color:var(--ra-mut);text-align:right}
.rc-dlg .rc-lin input{width:100%;min-width:0;min-height:38px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:9px;padding:6px 9px;font-variant-numeric:tabular-nums}
.rc-dlg .rc-lin .x{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);font-size:18px;line-height:1}
.rc-dlg .rc-cab-lin{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(0,1fr) 40px;gap:8px;font-size:12px;font-weight:700;color:var(--ra-mut)}
.rc-dlg .rc-tot{font-size:12.5px;color:var(--ink-2);margin:10px 0 0}
.rc-dlg .rc-tot b{font-variant-numeric:tabular-nums}
.rc-dlg .rc-tot.dif b{color:var(--ra-cli)}
.rc-dlg .bts .esq{margin-right:auto}
.rc-lista.marcando .rc-l{grid-template-columns:150px minmax(0,1.25fr) minmax(170px,1fr) 170px 40px}
.rc-lista.marcando .rc-cab-lista span:first-child{padding-left:34px}
@media (max-width:1180px){
  .rc-faixa{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rc-b.tudo{grid-column:1 / -1;flex-direction:row;gap:8px;min-height:44px}
}
@media (max-width:820px){
  .rc-faixa{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rc-b,.rc-b.recebido{border-bottom:0}
  .rc-sel{bottom:8px}
  .rc-sel .btn{min-height:40px}
  .rc-lista.marcando .rc-l{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"q vl" "cl cl" "tp tp"}
  .rc-lista.marcando .rc-l .ac{display:none}
  .rc-g .t{order:1}
  .rc-g .gsel{order:2;margin-left:22px}
}
@media (max-width:520px){
  .rc-dlg .rc-lin,.rc-dlg .rc-cab-lin{grid-template-columns:16px minmax(0,1fr) 88px 44px;gap:6px}
  .rc-dlg .rc-lin input{min-height:44px;padding:6px 8px;font-size:16px}
  .rc-dlg .rc-lin .x{width:44px;height:44px}
  .rc-dlg [data-add]{min-height:44px}
  .rc-dlg .bts{flex-wrap:wrap}
  .rc-dlg .bts .btn{white-space:nowrap;min-height:44px}
  .rc-dlg .bts .esq{order:3;flex:1 0 100%;margin:2px 0 0}
}
`;
const estilo = document.createElement('style'); estilo.textContent = CSS_CRONO; document.head.appendChild(estilo);

const tag = b => `<span class="rc-tag ${b}"><i></i>${esc(BALDE[b].rot)}</span>`;
function aviso(msg){
  const t = $('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show'); clearTimeout(aviso.tm); aviso.tm = setTimeout(() => t.classList.remove('show'), 3200);
}
const ROT_ACAO = {recebido: 'Recebido', clientePagou: 'Cliente pagou', entradaPaga: 'Entrada paga', adiar: 'Adiar', ajustarData: 'Ajustar data', cobrado: 'Cobrado', copiarMensagem: 'Copiar mensagem', desfazer: 'Desfazer recebimento', abrirVenda: 'Abrir a venda', exportar: 'Exportar'};
function agir(acao, id, idx){
  const a = telas() && telas().acoes;
  if(emPrevia() || !a || typeof a[acao] !== 'function'){ aviso(`Prévia: aqui o botão "${ROT_ACAO[acao] || acao}" faria a ação de sempre. Nada foi gravado.`); return; }
  a[acao](id, idx);
}
// a ação principal de cada linha: o próximo passo daquele lançamento
function principal(it, hoje){
  const {p, b} = it;
  if(b === 'atrasado') return {acao: 'recebido', rot: 'Recebido'};
  if(b === 'cliente') return {acao: 'clientePagou', rot: 'Cliente pagou'};
  if(b === 'aguardando') return {acao: 'entradaPaga', rot: 'Entrada paga'};
  if(b === 'pago' && p.dataRecebimento && p.dataRecebimento <= addD(segunda(hoje), 6)) return {acao: 'recebido', rot: 'Recebido'};
  if(b === 'avencer' && p.idx > 0 && p.dataCliente && p.dataCliente <= addD(hoje, 7)) return {acao: 'clientePagou', rot: 'Cliente pagou'};
  return null;
}
function quando(it, hoje){
  const {p, b} = it;
  if(b === 'atrasado') return `<b>${dm(p.dataRecebimento)}</b><small class="atr">há ${pl(it.idade, 'dia', 'dias')}</small>`;
  if(b === 'cliente') return `<b>${dm(p.dataCliente)}</b><small class="cli">venceu há ${pl(it.idade, 'dia', 'dias')}</small>`;
  if(b === 'aguardando') return `<b>${dm(it.venc)}</b>${it.idade > 0 ? `<small class="atr">entrada venceu há ${pl(it.idade, 'dia', 'dias')}</small>` : it.idade === 0 ? '<small>entrada vence hoje</small>' : `<small>entrada vence em ${pl(-it.idade, 'dia', 'dias')}</small>`}`;
  if(b === 'recebido') return `<b>${dm(p.dataPago || p.dataCaixa)}</b><small class="ok">recebido</small>`;
  if(b === 'pago') return `<b>${p.dataRecebimento ? dm(p.dataRecebimento) : 'sem data'}</b><small class="ok">${p.programado ? 'programado pela construtora' : (p.idx === 0 && !p.semEntrada ? 'entrada paga ' : 'cliente pagou ') + dm(p.dataClientePagou || p.dataCliente)}</small>`;
  if(b === 'avencer') return `<b>${p.dataCliente ? dm(p.dataCliente) : 'sem data'}</b><small>${p.estimada ? 'previsão: +30 dias' : p.manual ? 'data ajustada' : p.dataRecebimento ? 'repasse ' + dm(p.dataRecebimento) : ''}</small>`;
  const sub = p.idx > 0 && p.clientePagou ? `<small class="ok">cliente pagou ${dm(p.dataClientePagou || p.dataCliente)}</small>`
    : p.estimada ? '<small>previsão: +30 dias</small>' : p.manual ? '<small>data ajustada</small>' : p.idx > 0 && p.dataCliente ? `<small>cliente paga ${dm(p.dataCliente)}</small>` : '';
  return `<b>${p.dataRecebimento ? dm(p.dataRecebimento) : 'sem data'}</b>${sub}`;
}
const quem = s => [s.corretor, s.construtora, s.unidade ? 'un. ' + s.unidade : ''].filter(Boolean).map(esc).join(' · ');
function linha(it, hoje, tudo){
  const {p, s, b} = it;
  const a = podeAgir() ? principal(it, hoje) : null;
  const agu = b === 'aguardando';
  const valor = agu ? it.v.itens.filter(x => x.b === 'aguardando').reduce((x, y) => x + y.p.comissao, 0) : p.comissao;
  const sub = agu ? `entrada ${R2(p.comissao)}` : it.v.ceo || !p.corretor ? 'fica toda na empresa' : `empresa ${R2(p.empresa)}`;
  const tp = agu ? `Entrada + ${pl(Math.max(0, it.sc.list.length - 1), 'parcela', 'parcelas')}` : esc(it.rotulo);
  const sel = C.aberto && C.aberto.id === s.id && C.aberto.idx === p.idx ? ' sel' : '';
  const ck = C.marcar && marcavel(it);
  const marcada = ck && C.sel.has(chave(it));
  return `<li class="rc-l${sel}${marcada ? ' marcada' : ''}" data-id="${esc(s.id)}" data-idx="${p.idx}"${ck ? ' data-ck="1"' : ''}>`
    + (ck ? `<div class="q ck"><label class="rc-ck"><input type="checkbox" data-ck${marcada ? ' checked' : ''} aria-label="${esc(`Marcar ${it.rotulo} de ${s.cliente || 'cliente'}`)}"></label><div>${quando(it, hoje)}</div></div>` : `<div class="q">${quando(it, hoje)}</div>`)
    + `<div class="cl"><button type="button" class="rc-nome" data-abrir>${esc(s.cliente || 'Sem nome')}</button><small>${quem(s)}</small></div>`
    + `<div class="tp">${tp}${agu ? `<small>comissão toda da venda</small>` : p.valorCliente ? `<small>${p.clientePagou ? 'cliente pagou' : 'cliente paga'} ${R2(p.valorCliente)}</small>` : ''}</div>`
    + (tudo ? `<div class="st">${tag(b)}</div>` : '')
    + `<div class="vl"><b>${R2(valor)}</b><small>${sub}</small></div>`
    + `<div class="ac">${a && !C.marcar ? `<button type="button" class="btn sm" data-acao="${a.acao}">${a.rot}</button>` : ''}</div>`
    + `</li>`;
}

// grupos da lista, conforme a situação
function grupos(L, hoje){
  const G = new Map();
  const add = (k, rot, ord, cls, fechado) => { if(!G.has(k)) G.set(k, {k, rot, ord, cls, fechado, itens: []}); return G.get(k); };
  const seg0 = segunda(hoje);
  for(const it of L){
    let g;
    if(it.b === 'atrasado' || it.b === 'cliente'){ const f = FAIXAS.find(x => x.id === faixaDe(it.idade)); g = add(it.b + f.id, {a: 'Até 7 dias de atraso', b: 'De 8 a 30 dias de atraso', c: 'De 31 a 60 dias de atraso', d: 'Mais de 60 dias de atraso'}[f.id], 10 - FAIXAS.indexOf(f), 'atr'); }
    else if(it.b === 'aguardando') g = it.idade > 0 ? add('ag1', 'Entrada vencida', 1, 'atr') : add('ag2', 'Entrada no prazo', 2, '');
    else if(it.b === 'recebido'){ const k = (it.dref || '0000-00').slice(0, 7); g = add('r' + k, k === '0000-00' ? 'Sem data' : mesNome(k), -Number(k.replace('-', '')), '', true); }
    else if(it.b === 'avencer'){ const d = it.p.dataCliente; if(!d) g = add('vz', 'Sem data', 9e9, ''); else { const k = d.slice(0, 7); g = add('v' + k, `Cliente paga em ${MESES[Number(k.slice(5, 7)) - 1]} de ${k.slice(0, 4)}`, Number(k.replace('-', '')), '', true); } }
    else {
      const d = it.p.dataRecebimento;
      if(!d) g = add('zz', 'Sem data', 9e9, '');
      else {
        const w = dias(seg0, segunda(d)) / 7;
        if(w < 6){ const ini = segunda(d), fim = addD(ini, 6); const faixa = `${+ini.slice(8, 10)} a ${dm(fim)}`; g = add('w' + w, w === 0 ? `Esta semana · ${faixa}` : w === 1 ? `Próxima semana · ${faixa}` : `Semana de ${faixa}`, w, ''); }
        else { const k = d.slice(0, 7); g = add('m' + k, mesNome(k), 100 + Number(k.replace('-', '')), '', true); }
      }
    }
    g.itens.push(it);
  }
  const lista = [...G.values()].sort((a, b) => a.ord - b.ord);
  // recebidos: os dois meses mais recentes ficam abertos
  lista.filter(g => g.k[0] === 'r').forEach((g, i) => { if(i < 2) g.fechado = false; });
  // parcelas a vencer: os dois próximos meses ficam abertos
  lista.filter(g => g.k[0] === 'v' && g.k !== 'vz').forEach((g, i) => { if(i < 2) g.fechado = false; });
  lista.forEach(g => {
    if(g.cls === 'atr' || g.k === 'ag1') g.itens.sort((a, b) => b.idade - a.idade || b.p.comissao - a.p.comissao);
    else if(g.k[0] === 'r') g.itens.sort((a, b) => (b.dref || '').localeCompare(a.dref || ''));
    else if(g.k[0] === 'v') g.itens.sort((a, b) => (a.p.dataCliente || '9').localeCompare(b.p.dataCliente || '9') || (a.s.cliente || '').localeCompare(b.s.cliente || ''));
    else g.itens.sort((a, b) => (a.p.dataRecebimento || '9').localeCompare(b.p.dataRecebimento || '9') || (a.s.cliente || '').localeCompare(b.s.cliente || ''));
  });
  return lista;
}
const aberto = g => C.abertos.has(g.k) || (!g.fechado && !C.fechados.has(g.k));

function htmlLista(L, hoje, tudo){
  // aguardando: uma linha por venda (a entrada); o resto das parcelas vai junto
  const vistos = new Set();
  L = L.filter(it => { if(it.b !== 'aguardando') return true; if(vistos.has(it.s.id)) return false; vistos.add(it.s.id); return true; });
  if(!L.length) return `<div class="rc-vazio">Nenhum lançamento nesta situação${C.q || C.corretor || C.construtora || C.tipo || C.periodo || C.faixa ? ' com esses filtros' : ''}.</div>`;
  let G;
  if(tudo){
    G = BALDES.map(b => ({k: 't' + b.id, rot: b.rot, cls: b.id === 'atrasado' ? 'atr' : '', fechado: b.id === 'recebido' || (b.id === 'avencer' && C.balde !== 'areceber'), itens: L.filter(it => it.b === b.id)})).filter(g => g.itens.length);
    G.forEach(g => g.itens.sort((a, b) => a.b === 'recebido' ? (b.dref || '').localeCompare(a.dref || '') : ATRASO.has(a.b) ? b.idade - a.idade : (a.p.dataRecebimento || '9').localeCompare(b.p.dataRecebimento || '9')));
  } else G = grupos(L, hoje);
  C.grupos = G;
  let feitas = 0, cortou = false;
  const cab = `<li class="rc-cab-lista rc-l" aria-hidden="true"><span>${C.balde === 'recebido' ? 'Recebido em' : C.balde === 'cliente' ? 'Venceu' : C.balde === 'aguardando' ? 'Entrada' : C.balde === 'avencer' ? 'Cliente paga' : 'Repasse'}</span><span>Cliente</span><span>Lançamento</span>${tudo ? '<span>Situação</span>' : ''}<span style="text-align:right">Comissão</span><span></span></li>`;
  const corpo = G.map(g => {
    const soma = g.itens.reduce((a, it) => a + (it.b === 'aguardando' ? it.v.itens.filter(x => x.b === 'aguardando').reduce((x, y) => x + y.p.comissao, 0) : it.p.comissao), 0);
    const ab = aberto(g);
    let linhas = '';
    if(ab){
      const resto = Math.max(0, C.limite - feitas);
      const parte = g.itens.slice(0, resto); feitas += parte.length;
      if(parte.length < g.itens.length) cortou = true;
      linhas = parte.map(it => linha(it, hoje, tudo)).join('');
    }
    const gm = C.marcar ? g.itens.filter(marcavel) : [];
    const gTodas = gm.length && gm.every(it => C.sel.has(chave(it)));
    const gsel = gm.length ? `<button type="button" class="gsel" data-gsel="${esc(g.k)}">${gTodas ? 'Tirar as ' + gm.length : gm.length === 1 ? 'Selecionar a parcela' : 'Selecionar as ' + gm.length}</button>` : '';
    return `<li class="rc-g ${g.cls}"><button type="button" data-grupo="${esc(g.k)}" aria-expanded="${ab}"><span class="seta" aria-hidden="true">▾</span>${esc(g.rot)}</button>${gsel}<span class="t">${pl(g.itens.length, g.itens[0].b === 'aguardando' ? 'venda' : 'lançamento', g.itens[0].b === 'aguardando' ? 'vendas' : 'lançamentos')} · <b>${R2(soma)}</b></span></li>` + linhas;
  }).join('');
  return `<ul class="rc-lista${tudo ? ' tudo' : ''}${C.marcar ? ' marcando' : ''}">${cab}${corpo}</ul>` + (cortou ? `<div class="rc-mais"><button type="button" class="btn sm" data-mais>Mostrar mais lançamentos</button></div>` : '');
}

function htmlPorCliente(L, hoje){
  const M = new Map();
  for(const it of L){ const g = M.get(it.s.id) || {v: it.v, s: it.s, itens: []}; g.itens.push(it); M.set(it.s.id, g); }
  const lista = [...M.values()];
  if(!lista.length) return `<div class="rc-vazio">Nenhum cliente nesta situação.</div>`;
  const b = C.balde;
  lista.forEach(g => {
    g.soma = g.itens.reduce((a, it) => a + it.p.comissao, 0);
    g.idade = Math.max(...g.itens.map(it => it.idade));
    g.prox = g.itens.map(it => it.p.dataRecebimento).filter(Boolean).sort()[0] || '';
    g.ult = g.itens.map(it => it.dref).filter(Boolean).sort().pop() || '';
    g.recebido = g.v.itens.filter(x => x.p.pago).reduce((a, x) => a + x.p.comissao, 0);
    g.total = g.v.sc.total || 0;
    g.nPago = g.v.itens.filter(x => x.p.pago).length;
  });
  if(ATRASO.has(b)) lista.sort((x, y) => y.idade - x.idade || y.soma - x.soma);
  else if(b === 'recebido') lista.sort((x, y) => y.ult.localeCompare(x.ult));
  else if(b === 'areceber' || b === 'pago' || b === 'avencer') lista.sort((x, y) => (x.prox || '9').localeCompare(y.prox || '9'));
  else lista.sort((x, y) => y.soma - x.soma);
  const un = BALDE[b] || {um: 'lançamento', varios: 'lançamentos'};
  const desde = (g, n) => ATRASO.has(b) && g.idade > 0 ? `<b style="color:var(--crit)">há ${pl(g.idade, 'dia', 'dias')}</b><small>${n}${n.startsWith('1 ') ? ' em atraso' : ' em atraso, a mais antiga'}</small>` : b === 'recebido' ? `<b>${dm(g.ult)}</b><small>${n}, o último</small>` : `<b>${g.prox ? dm(g.prox) : '—'}</b><small>${n}, o próximo</small>`;
  const max = Math.min(lista.length, C.limite);
  const cab = `<li class="rc-cab-lista rc-l rc-cl-l" aria-hidden="true"><span>Cliente</span><span>Nesta situação</span><span>A venda toda</span><span style="text-align:right">Comissão</span></li>`;
  return `<ul class="rc-lista">${cab}` + lista.slice(0, max).map(g => {
    const pct = g.total > 0 ? Math.min(100, g.recebido / g.total * 100) : 0;
    const n = b === 'aguardando' ? g.itens.length : g.itens.length;
    return `<li class="rc-l rc-cl-l" data-id="${esc(g.s.id)}" data-idx="${g.itens[0].p.idx}">`
      + `<div class="cl"><button type="button" class="rc-nome" data-abrir>${esc(g.s.cliente || 'Sem nome')}</button><small>${quem(g.s)}</small></div>`
      + `<div class="q">${desde(g, pl(n, b === 'aguardando' ? 'lançamento' : un.um, b === 'aguardando' ? 'lançamentos' : un.varios))}</div>`
      + `<div class="rc-prog"><div class="tr" role="img" aria-label="${esc(`recebido ${R0(g.recebido)} de ${R0(g.total)}`)}"><i style="width:${pct.toFixed(1)}%"></i></div><small>${pl(g.nPago, 'recebido', 'recebidos')} de ${g.v.itens.length} · ${R0(g.recebido)} de ${R0(g.total)}</small></div>`
      + `<div class="vl"><b>${R2(g.soma)}</b><small>${g.v.ceo ? 'fica toda na empresa' : 'empresa ' + R2(g.itens.reduce((a, it) => a + it.p.empresa, 0))}</small></div>`
      + `</li>`;
  }).join('') + `</ul>` + (lista.length > max ? `<div class="rc-mais"><button type="button" class="btn sm" data-mais>Mostrar mais clientes</button></div>` : '');
}

function htmlPorConstrutora(L){
  const M = new Map();
  for(const it of L){ const k = nz(it.s.construtora) || '-'; const g = M.get(k) || {nome: it.s.construtora || 'Sem construtora', itens: [], clientes: new Set()}; g.itens.push(it); g.clientes.add(it.s.id); M.set(k, g); }
  const lista = [...M.values()];
  if(!lista.length) return `<div class="rc-vazio">Nada nesta situação.</div>`;
  const b = C.balde;
  lista.forEach(g => { g.soma = g.itens.reduce((a, it) => a + it.p.comissao, 0); g.idade = Math.max(...g.itens.map(it => it.idade)); g.prox = g.itens.map(it => it.p.dataRecebimento).filter(Boolean).sort()[0] || ''; g.ult = g.itens.map(it => it.dref).filter(Boolean).sort().pop() || ''; });
  lista.sort((x, y) => y.soma - x.soma);
  const maxV = Math.max(...lista.map(g => g.soma), 1);
  const cor = {atrasado: 'var(--ra-atr)', cliente: 'var(--ra-cli)', aguardando: 'var(--ra-agu)', areceber: 'var(--ra-rec)', pago: 'var(--ra-rec)', avencer: 'var(--ra-mut)', recebido: 'var(--ra-ok)'}[b] || 'var(--blue)';
  const cab = `<li class="rc-cab-lista rc-l rc-co-l" aria-hidden="true"><span>Construtora / projeto</span><span>Lançamentos</span><span>${ATRASO.has(b) ? 'Mais antigo' : b === 'recebido' ? 'Último' : 'Próximo'}</span><span style="text-align:right">Comissão</span><span></span></li>`;
  return `<ul class="rc-lista">${cab}` + lista.map(g => `<li class="rc-l rc-co-l" data-construtora="${esc(g.nome)}" style="--c:${cor}">`
    + `<div class="cl"><b style="font-size:13.5px">${esc(g.nome)}</b><div class="tr"><i style="width:${(g.soma / maxV * 100).toFixed(1)}%"></i></div></div>`
    + `<div class="q"><b>${pl(g.itens.length, 'lançamento', 'lançamentos')}</b><small>${pl(g.clientes.size, 'cliente', 'clientes')}</small></div>`
    + `<div class="q">${ATRASO.has(b) && g.idade > 0 ? `<b style="color:var(--crit)">${pl(g.idade, 'dia', 'dias')}</b><small>em atraso</small>` : `<b>${dm(b === 'recebido' ? g.ult : g.prox)}</b><small>${b === 'recebido' ? 'último recebido' : 'próximo repasse'}</small>`}</div>`
    + `<div class="vl"><b>${R2(g.soma)}</b><small>empresa ${R2(g.itens.reduce((a, it) => a + it.p.empresa, 0))}</small></div>`
    + `<div class="ac"><button type="button" class="btn sm" data-verco>Ver lançamentos</button></div>`
    + `</li>`).join('') + `</ul>`;
}

function htmlIdade(L){
  const b = C.balde;
  if(!ATRASO.has(b)) return '';
  const base = b === 'aguardando' ? (() => { const vs = new Set(); return L.filter(it => { if(vs.has(it.s.id)) return false; vs.add(it.s.id); return it.idade > 0; }); })() : L;
  const val = it => b === 'aguardando' ? it.v.itens.filter(x => x.b === 'aguardando').reduce((x, y) => x + y.p.comissao, 0) : it.p.comissao;
  if(!base.length) return '';
  return `<div class="rc-idade" role="group" aria-label="Há quanto tempo está em atraso">` + FAIXAS.map(f => {
    const xs = base.filter(it => faixaDe(it.idade) === f.id);
    return `<button type="button" data-f="${f.id}" class="${xs.length && (f.id === 'c' || f.id === 'd') ? 'velho' : ''}" aria-pressed="${C.faixa === f.id}"${xs.length ? '' : ' disabled'} aria-label="${esc(`${f.rot}: ${R0(xs.reduce((a, it) => a + val(it), 0))} em ${pl(xs.length, b === 'aguardando' ? 'venda' : 'lançamento', b === 'aguardando' ? 'vendas' : 'lançamentos')}`)}"><span class="r">${f.rot}</span><span class="v">${R0(xs.reduce((a, it) => a + val(it), 0))}<small>${xs.length}</small></span></button>`;
  }).join('') + `</div>`;
}

function htmlFaixa(T){
  return `<div class="rc-faixa" role="group" aria-label="Situação dos lançamentos">` + BALDES.map(b => {
    const t = T[b.id];
    const sub = t.n ? pl(t.n, b.um, b.varios) : b.id === 'aguardando' ? 'nenhuma venda' : b.dica;
    return `<button type="button" class="rc-b ${b.id}${t.n ? '' : ' zero'}" data-balde="${b.id}" aria-pressed="${C.balde === b.id || (C.balde === 'areceber' && ARECEBER.has(b.id))}" title="${esc(b.rot + ': ' + b.dica)}"><span class="r">${esc(b.rot)}</span><span class="v">${R0(t.valor)}</span><span class="s">${esc(sub)}</span></button>`;
  }).join('') + `<button type="button" class="rc-b tudo" data-balde="tudo" aria-pressed="${C.balde === 'tudo'}"><span class="r">Ver tudo</span></button></div>`;
}

function htmlBarra(t){
  const cfg = t.config() || {};
  const corr = (cfg.corretores || []).map(c => c.nome).filter(Boolean);
  const cons = [...new Set([...(cfg.construtoras || []).map(c => c.nome), ...(t.vendas() || []).map(s => s.construtora)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const op = (v, r, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(r)}</option>`;
  const algum = C.q || C.corretor || C.construtora || C.tipo || C.periodo;
  return `<div class="rc-barra">`
    + `<input type="search" data-campo="q" value="${esc(C.q)}" placeholder="Buscar cliente, corretor, unidade, data ou valor" aria-label="Buscar lançamentos">`
    + `<select data-campo="corretor" aria-label="Corretor">${op('', 'Todos os corretores', !C.corretor)}${corr.map(n => op(n, n, n === C.corretor)).join('')}</select>`
    + `<select data-campo="construtora" aria-label="Construtora">${op('', 'Todas as construtoras', !C.construtora)}${cons.map(n => op(n, n, nz(n) === nz(C.construtora))).join('')}</select>`
    + `<select data-campo="tipo" aria-label="Entrada ou parcelas">${op('', 'Entrada e parcelas', !C.tipo)}${op('entrada', 'Só entradas', C.tipo === 'entrada')}${op('parcela', 'Só parcelas', C.tipo === 'parcela')}</select>`
    + `<select data-campo="periodo" aria-label="Período">${PERIODOS.map(([v, r]) => op(v, r, v === C.periodo)).join('')}</select>`
    + (C.periodo === 'datas' ? `<span class="rc-datas">de <input type="date" data-campo="de" value="${esc(C.de)}" aria-label="De"> até <input type="date" data-campo="ate" value="${esc(C.ate)}" aria-label="Até"></span>` : '')
    + (algum ? `<button type="button" class="btn sm ghost rc-limpar" data-limpar>Limpar filtros</button>` : '')
    + `</div>`;
}

function desenhar(){
  const t = telas(); const sec = $('sec-installments');
  if(!t || !t.motor || !sec) return;
  if(nivel() !== 'admin' && nivel() !== 'time'){ const el = $('raCrono'); if(el) el.remove(); document.body.classList.remove('rc-ativo'); return; }
  let el = $('raCrono');
  if(!el){
    el = document.createElement('div'); el.id = 'raCrono'; el.className = 'card rc';
    sec.insertBefore(el, sec.firstChild);
    ligar(el);
  }
  const D = montar(t);
  const F = filtrar(D);
  const T = contar(F);
  const fa = t.instFiltro ? t.instFiltro() : null;
  if(C.filtroApp === undefined) C.filtroApp = fa;
  else if(fa !== C.filtroApp){ C.filtroApp = fa; const m = FILTRO_ANTIGO[fa]; if(m) Object.assign(C, {balde: m.balde, periodo: m.periodo || '', modo: m.modo || 'lista', faixa: null, limite: 80}); }
  if(!C.balde) C.balde = T.atrasado.n ? 'atrasado' : T.cliente.n ? 'cliente' : 'pago';
  if(!MARCAVEL.has(C.balde) || !podeAgir()){ C.marcar = false; C.sel.clear(); }
  const tudo = C.balde === 'tudo' || C.balde === 'areceber';
  let L = C.balde === 'tudo' ? F : C.balde === 'areceber' ? F.filter(it => ARECEBER.has(it.b)) : F.filter(it => it.b === C.balde);
  if(C.faixa && ATRASO.has(C.balde)) L = L.filter(it => (C.balde !== 'aguardando' || it.idade > 0) && faixaDe(it.idade) === C.faixa);
  const nL = C.balde === 'aguardando' ? new Set(L.map(it => it.s.id)).size : L.length;
  const soma = L.reduce((a, it) => a + it.p.comissao, 0), emp = L.reduce((a, it) => a + it.p.empresa, 0);
  const rotB = C.balde === 'tudo' ? 'Todos os lançamentos' : BALDE[C.balde].rot;
  const resumo = `<div class="rc-resumo" aria-live="polite"><b>${rotB}</b>${C.faixa ? ' · ' + esc(FAIXAS.find(f => f.id === C.faixa).rot) : ''}: <b>${pl(nL, C.balde === 'aguardando' ? 'venda' : 'lançamento', C.balde === 'aguardando' ? 'vendas' : 'lançamentos')}</b> · comissão <b>${R2(soma)}</b> · empresa <b>${R2(emp)}</b> · corretores <b>${R2(soma - emp)}</b></div>`;
  const modoBtn = (m, r) => `<button type="button" data-modo="${m}" aria-pressed="${C.modo === m}">${r}</button>`;
  const head = `<div class="card-head"><div><h2>Cronograma de recebimentos</h2><p>Cada lançamento está em uma situação só. Clique numa delas para ver a lista.</p></div><div class="spacer"></div>`
    + `<div class="rc-cab-acoes"><div class="rc-seg" role="group" aria-label="Como ver">${modoBtn('lista', 'Lista')}${modoBtn('cliente', 'Por cliente')}${modoBtn('construtora', 'Por construtora')}</div>${podeExportar() ? '<button type="button" class="btn sm ghost" data-acao="exportar">Exportar</button>' : ''}</div></div>`;
  const corpo = C.modo === 'cliente' ? htmlPorCliente(L, D.hoje) : C.modo === 'construtora' ? htmlPorConstrutora(L) : htmlLista(L, D.hoje, tudo);
  const foco = document.activeElement && el.contains(document.activeElement) ? (document.activeElement.dataset.campo || null) : null;
  const cur = foco && document.activeElement.selectionStart;
  C.lista = L;
  el.innerHTML = head + htmlFaixa(T) + htmlBarra(t) + htmlIdade(tudo ? [] : F.filter(it => it.b === C.balde)) + resumo + htmlMarcar(L) + corpo + htmlSel(D);
  document.body.classList.add('rc-ativo');
  if(foco){ const f = el.querySelector(`[data-campo="${foco}"]`); if(f){ f.focus(); if(cur != null && f.setSelectionRange) try{ f.setSelectionRange(cur, cur); }catch(e){} } }
  if(C.aberto) painel(D);
}

/* ---------- marcar várias parcelas como pagas pelo cliente ---------- */
function htmlMarcar(L){
  if(C.modo !== 'lista' || !MARCAVEL.has(C.balde) || !podeAgir()) return '';
  const m = L.filter(marcavel);
  if(!m.length) return '';
  if(!C.marcar) return `<div class="rc-marcar"><button type="button" class="btn sm" data-marcar>Marcar várias como pagas</button><small>Para a lista do mês da construtora: filtre a construtora, selecione as parcelas e confirme de uma vez.</small></div>`;
  const todas = m.every(it => C.sel.has(chave(it)));
  return `<div class="rc-marcar"><button type="button" class="btn sm" data-sel-todas>${todas ? 'Tirar todas' : `Selecionar as ${m.length} da lista`}</button><small>Clique nas linhas ou use "Selecionar" em cada grupo.</small></div>`;
}
function selecionados(D){
  const out = [];
  for(const it of D.itens) if(marcavel(it) && C.sel.has(chave(it))) out.push(it);
  return out;
}
function htmlSel(D){
  if(!C.marcar) return '';
  const S = selecionados(D);
  const soma = S.reduce((a, it) => a + it.p.comissao, 0);
  const vendas = new Set(S.map(it => it.s.id)).size;
  return `<div class="rc-sel" role="region" aria-label="Parcelas selecionadas"><span class="txt" aria-live="polite">${S.length ? `<b>${pl(S.length, 'parcela', 'parcelas')}</b> de ${pl(vendas, 'venda', 'vendas')} · comissão <b>${R2(soma)}</b>` : 'Nenhuma parcela selecionada'}</span><span class="sp"></span>`
    + `<button type="button" class="btn sm ghost" data-sel-cancelar>Cancelar</button><button type="button" class="btn sm primary" data-sel-ok${S.length ? '' : ' disabled'}>Cliente pagou</button></div>`;
}
function alternar(k){ if(C.sel.has(k)) C.sel.delete(k); else C.sel.add(k); }
function confirmarLote(){
  const t = telas(); if(!t) return;
  const D = montar(t);
  const S = selecionados(D);
  if(!S.length) return;
  const hoje = D.hoje;
  const soma = S.reduce((a, it) => a + it.p.comissao, 0);
  const vendas = new Set(S.map(it => it.s.id)).size;
  const fundo = document.createElement('div'); fundo.className = 'rc-fundo dlg';
  const dlg = document.createElement('div'); dlg.className = 'rc-dlg rc'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'rcDlgTit');
  dlg.innerHTML = `<h2 id="rcDlgTit">${S.length === 1 ? 'O cliente pagou esta parcela?' : `Os clientes pagaram estas ${S.length} parcelas?`}</h2>`
    + `<p>${pl(S.length, 'parcela', 'parcelas')} de ${pl(vendas, 'venda', 'vendas')}, com ${R2(soma)} de comissão. Cada uma passa para "Cliente já pagou", com o repasse previsto pela regra da construtora, e fica no histórico da venda.</p>`
    + `<label class="op"><input type="radio" name="rcQuando" value="venc" checked><span>Na data de vencimento de cada parcela<small>Parcela que ainda não venceu fica com a data de hoje.</small></span></label>`
    + `<label class="op"><input type="radio" name="rcQuando" value="dia"><span>Todas na mesma data<small>Para quando a construtora mandou a lista com uma data só.</small><input type="date" data-dia value="${hoje}" max="${hoje}" aria-label="Data do pagamento"></span></label>`
    + `<div class="bts"><button type="button" class="btn sm ghost" data-dlg-nao>Cancelar</button><button type="button" class="btn sm primary" data-dlg-sim>Confirmar ${pl(S.length, 'parcela', 'parcelas')}</button></div>`;
  document.body.appendChild(fundo); document.body.appendChild(dlg);
  const volta = document.activeElement;
  const fechar = () => { document.removeEventListener('keydown', tecla, true); fundo.remove(); dlg.remove(); if(volta && volta.isConnected) volta.focus(); else { const b = document.querySelector('#raCrono [data-sel-ok]'); if(b) b.focus(); } };
  const tecla = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); fechar(); } };
  document.addEventListener('keydown', tecla, true);
  fundo.addEventListener('click', fechar);
  dlg.addEventListener('click', e => {
    if(e.target.closest('[data-dlg-nao]')){ fechar(); return; }
    if(e.target.closest('[data-dia]')){ const r = dlg.querySelector('input[value="dia"]'); if(r) r.checked = true; return; }
    if(!e.target.closest('[data-dlg-sim]')) return;
    const modo = (dlg.querySelector('input[name="rcQuando"]:checked') || {}).value;
    const dia = (dlg.querySelector('[data-dia]') || {}).value || hoje;
    const itens = S.map(it => ({id: it.s.id, idx: it.p.idx, data: modo === 'dia' ? dia : (it.p.dataCliente && it.p.dataCliente <= hoje ? it.p.dataCliente : hoje)}));
    fechar();
    const a = t.acoes;
    if(emPrevia() || !a || typeof a.clientePagouLote !== 'function'){ aviso(`Prévia: ${pl(itens.length, 'parcela ficaria marcada como paga', 'parcelas ficariam marcadas como pagas')} pelo cliente. Nada foi gravado.`); }
    else a.clientePagouLote(itens);
    C.marcar = false; C.sel.clear(); desenhar();
  });
  requestAnimationFrame(() => { fundo.classList.add('on'); dlg.classList.add('on'); const r = dlg.querySelector('input[name="rcQuando"]:checked'); if(r) r.focus(); });
}

/* ---------- cronograma programado pela construtora (portal) ---------- */
function cronogramaConstrutora(id){
  const t = telas(); if(!t) return;
  const D = montar(t); const v = D.vendas.get(id); if(!v) return;
  const {s, sc} = v;
  const tem = Array.isArray(s.programado) && s.programado.length;
  // começa pelo que já está programado; sem isso, pelo cronograma calculado de hoje
  let L = (tem ? s.programado : sc.list.map(p => ({data: p.dataRecebimento || '', valor: Math.round(p.comissao * 100) / 100}))).map(x => ({data: x.data || '', valor: x.valor}));
  if(!L.length) L = [{data: '', valor: ''}];
  const fundo = document.createElement('div'); fundo.className = 'rc-fundo dlg';
  const dlg = document.createElement('div'); dlg.className = 'rc-dlg rc larga'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'rcProgTit');
  document.body.appendChild(fundo); document.body.appendChild(dlg);
  const volta = document.activeElement;
  const ler = () => [...dlg.querySelectorAll('.rc-lin')].map(r => ({data: r.querySelector('[data-d]').value, valor: r.querySelector('[data-v]').value}));
  const total = () => ler().reduce((a, x) => a + (parseFloat(String(x.valor).replace(',', '.')) || 0), 0);
  const pintarTot = () => { const tot = total(); const dif = Math.abs(tot - sc.total) > 0.005; const el = dlg.querySelector('.rc-tot'); el.className = 'rc-tot' + (dif ? ' dif' : ''); el.innerHTML = `Programado <b>${R2(tot)}</b> de ${R2(sc.total)} de comissão${dif ? `. ${tot < sc.total ? 'Faltam' : 'Passou'} <b>${R2(Math.abs(sc.total - tot))}</b>.` : ''}`; };
  const linha = (x, k) => `<div class="rc-lin"><span class="n">${k + 1}</span><input type="date" data-d value="${esc(x.data)}" aria-label="Data do pagamento ${k + 1}"><input type="number" step="0.01" min="0" data-v value="${esc(x.valor)}" aria-label="Valor do pagamento ${k + 1}" inputmode="decimal"><button type="button" class="x" data-rm aria-label="Tirar o pagamento ${k + 1}">×</button></div>`;
  const pintar = lista => {
    dlg.innerHTML = `<h2 id="rcProgTit">Cronograma da construtora</h2>`
      + `<p>${esc(s.cliente || 'Venda')} · ${esc(s.construtora || '')}${s.unidade ? ' · un. ' + esc(s.unidade) : ''}. Copie do portal as datas e os valores que a construtora programou. Eles passam a valer no lugar do cálculo pela entrada e pelas parcelas, e aparecem em "Cliente já pagou".</p>`
      + `<div class="rc-cab-lin" aria-hidden="true"><span></span><span>Data do pagamento</span><span>Valor (R$)</span><span></span></div>`
      + `<div class="rc-linhas">${lista.map(linha).join('')}</div>`
      + `<div style="margin-top:8px"><button type="button" class="btn sm ghost" data-add>Adicionar pagamento</button></div>`
      + `<p class="rc-tot"></p>`
      + `<div class="bts">${tem ? '<button type="button" class="btn sm ghost esq" data-tirar>Tirar o cronograma</button>' : ''}<button type="button" class="btn sm ghost" data-nao>Cancelar</button><button type="button" class="btn sm primary" data-sim>Salvar cronograma</button></div>`;
    pintarTot();
  };
  pintar(L);
  const fechar = () => { document.removeEventListener('keydown', tecla, true); fundo.remove(); dlg.remove(); if(volta && volta.isConnected) volta.focus(); };
  const tecla = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); fechar(); } };
  document.addEventListener('keydown', tecla, true);
  fundo.addEventListener('click', fechar);
  dlg.addEventListener('input', pintarTot);
  dlg.addEventListener('click', e => {
    if(e.target.closest('[data-nao]')){ fechar(); return; }
    if(e.target.closest('[data-add]')){ const at = ler(); const ult = at[at.length - 1]; at.push({data: ult && ult.data ? (() => { const d = pd(ult.data); d.setMonth(d.getMonth() + 1); return iso(d); })() : '', valor: ult ? ult.valor : ''}); pintar(at); const ins = dlg.querySelectorAll('[data-d]'); if(ins.length) ins[ins.length - 1].focus(); return; }
    const rm = e.target.closest('[data-rm]');
    if(rm){ const at = ler(); const k = [...dlg.querySelectorAll('[data-rm]')].indexOf(rm); at.splice(k, 1); pintar(at.length ? at : [{data: '', valor: ''}]); return; }
    const a = t.acoes;
    if(e.target.closest('[data-tirar]')){ fechar(); if(emPrevia() || !a || typeof a.salvarProgramado !== 'function') aviso('Prévia: o cronograma da construtora sairia e a venda voltaria ao cálculo de sempre. Nada foi gravado.'); else a.salvarProgramado(id, []); return; }
    if(!e.target.closest('[data-sim]')) return;
    const lista = ler().map(x => ({data: x.data, valor: parseFloat(String(x.valor).replace(',', '.'))})).filter(x => x.data || x.valor);
    const ruim = lista.find(x => !/^\d{4}-\d{2}-\d{2}$/.test(x.data) || !(x.valor > 0));
    if(!lista.length || ruim){ aviso('Preencha a data e o valor de cada pagamento.'); return; }
    fechar();
    if(emPrevia() || !a || typeof a.salvarProgramado !== 'function') aviso(`Prévia: ${pl(lista.length, 'pagamento programado', 'pagamentos programados')} pela construtora, ${R2(lista.reduce((x, y) => x + y.valor, 0))}. Nada foi gravado.`);
    else a.salvarProgramado(id, lista);
  });
  requestAnimationFrame(() => { fundo.classList.add('on'); dlg.classList.add('on'); const f = dlg.querySelector('[data-d]'); if(f) f.focus(); });
}

/* ---------- detalhe da venda ---------- */
function painel(D){
  const v = D.vendas.get(C.aberto.id);
  if(!v){ fecharPainel(); return; }
  let fundo = $('raCronoFundo'), pn = $('raCronoPainel');
  const novo = !pn;
  if(novo){
    fundo = document.createElement('div'); fundo.id = 'raCronoFundo'; fundo.className = 'rc-fundo';
    pn = document.createElement('aside'); pn.id = 'raCronoPainel'; pn.className = 'rc-pn rc'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-modal', 'true'); pn.setAttribute('aria-labelledby', 'raCronoTit');
    document.body.appendChild(fundo); document.body.appendChild(pn);
    fundo.addEventListener('click', fecharPainel);
    pn.addEventListener('click', e => {
      if(e.target.closest('[data-fechar]')){ fecharPainel(); return; }
      if(e.target.closest('[data-prog]')){ cronogramaConstrutora(C.aberto.id); return; }
      const ac = e.target.closest('[data-acao]'); if(ac){ agir(ac.dataset.acao, C.aberto.id, ac.dataset.idx != null ? Number(ac.dataset.idx) : C.aberto.idx); return; }
      const tr = e.target.closest('tr[data-idx]'); if(tr){ C.aberto.idx = Number(tr.dataset.idx); desenhar(); }
    });
    document.addEventListener('keydown', escPainel);
  }
  const {s, sc} = v; const hoje = D.hoje;
  const it = v.itens.find(x => x.p.idx === C.aberto.idx) || v.itens[0];
  if(it) C.aberto.idx = it.p.idx;
  const recebido = v.itens.filter(x => x.p.pago), aberto = v.itens.filter(x => !x.p.pago);
  const travado = v.itens.filter(x => x.b === 'atrasado' || x.b === 'cliente');
  const vgv = Number(s.valorImovel) || 0;
  const cab = `<div class="rc-pn-cab"><div style="min-width:0"><h2 id="raCronoTit">${esc(s.cliente || 'Venda')}</h2><p>${quem(s)}${s.empreendimento && nz(s.empreendimento) !== nz(s.construtora) ? ' · ' + esc(s.empreendimento) : ''}<br>Imóvel ${R0(vgv)} · comissão de ${String(s.pct || '').replace('.', ',')}%${v.ceo ? ' · venda de gestor: a comissão fica toda na empresa' : ''}</p></div><button type="button" class="rc-x" data-fechar aria-label="Fechar">×</button></div>`;
  const tres = `<div class="rc-tres"><div><span>Comissão total</span><b>${R0(sc.total)}</b><small>${pl(v.itens.length, 'lançamento', 'lançamentos')}</small></div><div><span>Recebido</span><b style="color:var(--good)">${R0(recebido.reduce((a, x) => a + x.p.comissao, 0))}</b><small>${recebido.length} de ${v.itens.length}</small></div><div><span>${travado.length ? 'Travado' : 'Falta'}</span><b style="${travado.length ? 'color:var(--crit)' : ''}">${R0((travado.length ? travado : aberto).reduce((a, x) => a + x.p.comissao, 0) + (travado.length ? 0 : (sc.restante || 0)))}</b><small>${travado.length ? `${pl(travado.length, 'lançamento', 'lançamentos')} em atraso` : `${pl(aberto.length, 'lançamento', 'lançamentos')} a receber`}</small></div></div>`;
  let foco = '';
  if(it){
    const p = it.p; const a = principal(it, hoje);
    const bts = [];
    const pode = podeAgir();
    if(a) bts.push(`<button type="button" class="btn sm primary" data-acao="${a.acao}">${a.rot}</button>`);
    if(!p.pago){
      if(p.idx > 0 && !p.clientePagou && (!a || a.acao !== 'clientePagou')) bts.push(`<button type="button" class="btn sm" data-acao="clientePagou">Cliente pagou</button>`);
      if(it.b !== 'aguardando' && (!a || a.acao !== 'recebido')) bts.push(`<button type="button" class="btn sm" data-acao="recebido">Recebido</button>`);
      if(it.b === 'cliente') bts.push(`<button type="button" class="btn sm" data-acao="cobrado">Cobrado</button>`, `<button type="button" class="btn sm" data-acao="copiarMensagem">Copiar mensagem</button>`, `<button type="button" class="btn sm ghost" data-acao="adiar">Adiar</button>`);
      if(p.idx > 0) bts.push(`<button type="button" class="btn sm ghost" data-acao="ajustarData">Ajustar data</button>`);
    } else bts.push(`<button type="button" class="btn sm ghost" data-acao="desfazer">Desfazer recebimento</button>`);
    const dl = [];
    if(p.idx > 0 || p.semEntrada) dl.push(['Cliente paga', `${dmy(p.dataCliente)}${p.clientePagou ? ` · pagou ${dmy(p.dataClientePagou || p.dataCliente)}` : it.b === 'cliente' ? ` · venceu há ${pl(it.idade, 'dia', 'dias')}` : ''}`]);
    else dl.push(['Entrada do cliente', `${R2(p.valorCliente)} · ${it.b === 'aguardando' ? (it.idade > 0 ? `venceu ${dmy(it.venc)}, há ${pl(it.idade, 'dia', 'dias')}` : `vence ${dmy(it.venc)}`) : 'paga'}`]);
    dl.push(['Repasse previsto', `${p.dataRecebimento ? dmy(p.dataRecebimento) : 'sem data'}${it.b === 'atrasado' ? ` · atrasado há ${pl(it.idade, 'dia', 'dias')}` : ''}`]);
    if(p.pago) dl.push(['Recebido em', dmy(p.dataPago || p.dataCaixa)]);
    dl.push(['Divisão', v.ceo || !p.corretor ? 'fica toda na empresa' : `empresa ${R2(p.empresa)} · corretor ${R2(p.corretor)}${p.pago ? (p.repassado ? ' (repassado)' : ' (falta repassar)') : ''}`]);
    const cb = (s.cobrancas || {})[p.idx];
    if(cb) dl.push(['Cobrança', `cobrado em ${dmy(cb.data)}${cb.quem ? ' por ' + esc(cb.quem) : ''}`]);
    foco = `<div><h3>Lançamento selecionado</h3><div class="rc-foco"><div class="l1"><b>${esc(it.rotulo)}</b>${tag(it.b)}<span class="v">${R2(p.comissao)}</span></div><dl>${dl.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>${pode ? `<div class="bts">${bts.join('')}</div>` : ''}</div></div>`;
  }
  const curtoB = {atrasado: 'Atrasado', cliente: 'Sem confirm.', aguardando: 'Aguarda', pago: 'Já pagou', avencer: 'A vencer', recebido: 'Recebido'};
  const temProg = sc.list.some(x => x.programado);
  const btProg = podeAgir() && !sc.distrato ? `<button type="button" class="btn sm ghost" data-prog>${temProg ? 'Editar cronograma da construtora' : 'Cronograma da construtora'}</button>` : '';
  const parc = `<div><div class="rc-h3"><h3>Todas as parcelas</h3>${btProg}</div>${temProg ? '<p class="rc-prog-nota">Datas e valores programados pela construtora (portal).</p>' : ''}<div class="tscroll"><table class="rc-parc"><thead><tr><th>Lançamento</th><th>Cliente</th><th>Repasse</th><th class="r">Comissão</th><th>Situação</th></tr></thead><tbody>`
    + v.itens.map(x => `<tr data-idx="${x.p.idx}" class="${x === it ? 'sel' : ''}"><td>${x.p.idx === 0 && !x.p.semEntrada ? 'Entrada' : esc(x.p.tipo)}</td><td>${dm(x.p.dataCliente)}</td><td>${x.p.pago ? dm(x.p.dataPago || x.p.dataCaixa) : dm(x.p.dataRecebimento)}</td><td class="r">${R2(x.p.comissao)}</td><td><span class="rc-tag ${x.b}"><i></i>${curtoB[x.b]}</span></td></tr>`).join('')
    + `</tbody></table></div>${sc.restante > 0.005 && sc.semParcela ? `<p class="rc-resumo" style="margin-top:8px">Faltam ${R2(sc.restante)} sem parcela definida.</p>` : ''}</div>`;
  const cobr = Object.entries(s.cobrancas || {}).map(([i, c]) => ({data: c.data || '', txt: `Cobrou o cliente pela ${i === '0' ? 'entrada' : 'parcela ' + i}`, quem: c.quem || ''}));
  const cont = (Array.isArray(s.entradaContatos) ? s.entradaContatos : []).map(c => ({data: c.data || '', txt: 'Contato sobre a entrada', quem: c.quem || ''}));
  const hist = (Array.isArray(s.historico) ? s.historico : []).slice(-4).map(h => ({data: String(h.data || '').slice(0, 10), txt: h.acao || '', quem: h.quem || ''}));
  const ev = [...cobr, ...cont, ...hist].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 8);
  const hh = `<div><h3>Cobranças e histórico</h3>${ev.length ? `<ul class="rc-hist">${ev.map(e => `<li>${esc(e.txt)}<small>${dmy(e.data)}${e.quem ? ' · ' + esc(e.quem) : ''}</small></li>`).join('')}</ul>` : '<p class="rc-resumo">Nenhuma cobrança registrada nesta venda.</p>'}</div>`;
  const pe = `<div class="rc-pn-pe"><small>${emPrevia() ? 'Prévia: os botões não gravam nada.' : podeAgir() ? 'Tudo o que você marcar fica no histórico da venda.' : 'Só leitura: quem entra com o código de dono marca os recebimentos.'}</small><button type="button" class="btn sm" data-acao="abrirVenda">${podeAgir() ? 'Abrir a venda' : 'Ver a venda'}</button></div>`;
  const rol = pn.querySelector('.rc-pn-corpo'); const topo = rol ? rol.scrollTop : 0;
  const tinhaFoco = !novo && pn.contains(document.activeElement);
  pn.innerHTML = cab + `<div class="rc-pn-corpo">${foco}${tres}${parc}${hh}</div>` + pe;
  if(!novo){ const r = pn.querySelector('.rc-pn-corpo'); if(r) r.scrollTop = topo; if(tinhaFoco){ const x = pn.querySelector('tr.sel') || pn.querySelector('[data-fechar]'); if(x){ if(x.tagName === 'TR') x.tabIndex = -1; x.focus({preventScroll: true}); } } }
  if(novo){ requestAnimationFrame(() => { fundo.classList.add('on'); pn.classList.add('on'); const x = pn.querySelector('[data-fechar]'); if(x) x.focus(); }); }
}
function escPainel(e){ if(e.key === 'Escape' && C.aberto){ e.preventDefault(); fecharPainel(); } }
function fecharPainel(){
  const ab = C.aberto; C.aberto = null;
  document.removeEventListener('keydown', escPainel);
  const f = $('raCronoFundo'), p = $('raCronoPainel');
  if(f) f.remove(); if(p) p.remove();
  const el = $('raCrono'); if(!el) return;
  el.querySelectorAll('.rc-l.sel').forEach(x => x.classList.remove('sel'));
  // o foco volta para o nome do cliente que abriu o detalhe
  const li = ab && [...el.querySelectorAll('li[data-id]')].find(x => x.dataset.id === ab.id);
  const b = li && li.querySelector('[data-abrir]'); if(b) b.focus();
}

/* ---------- exportar a lista da tela (o mesmo CSV de antes) ---------- */
function exportar(){
  const L = (C.lista || []).slice().sort((a, b) => (a.p.dataRecebimento || '9').localeCompare(b.p.dataRecebimento || '9'));
  const nome = C.balde === 'tudo' ? 'todos' : C.balde;
  const a = telas() && telas().acoes;
  if(emPrevia() || !a || typeof a.exportar !== 'function'){ agir('exportar'); return; }
  a.exportar(L.map(it => Object.assign({}, it.p, {venda: it.s})), nome);
}

/* ---------- eventos (um ouvinte só, no cartão) ---------- */
function ligar(el){
  el.addEventListener('click', e => {
    const bb = e.target.closest('[data-balde]');
    if(bb){ const b = bb.dataset.balde; C.balde = b; C.faixa = null; C.limite = 80; C.marcar = false; C.sel.clear(); desenhar(); const f = el.querySelector(`[data-balde="${b}"]`); if(f) f.focus(); return; }
    const md = e.target.closest('[data-modo]'); if(md){ C.modo = md.dataset.modo; C.limite = 80; C.marcar = false; C.sel.clear(); desenhar(); const f = el.querySelector(`[data-modo="${C.modo}"]`); if(f) f.focus(); return; }
    const fx = e.target.closest('.rc-idade [data-f]'); if(fx){ C.faixa = C.faixa === fx.dataset.f ? null : fx.dataset.f; C.limite = 80; desenhar(); const f = el.querySelector(`.rc-idade [data-f="${fx.dataset.f}"]`); if(f) f.focus(); return; }
    const gr = e.target.closest('[data-grupo]');
    if(gr){ const k = gr.dataset.grupo; const ab = gr.getAttribute('aria-expanded') === 'true'; if(ab){ C.abertos.delete(k); C.fechados.add(k); } else { C.fechados.delete(k); C.abertos.add(k); } desenhar(); const f = el.querySelector(`[data-grupo="${CSS.escape(k)}"]`); if(f) f.focus(); return; }
    if(e.target.closest('[data-mais]')){ C.limite += 80; desenhar(); return; }
    if(e.target.closest('[data-limpar]')){ Object.assign(C, {q: '', corretor: '', construtora: '', tipo: '', periodo: '', de: '', ate: '', faixa: null, limite: 80}); desenhar(); return; }
    if(e.target.closest('[data-marcar]')){ C.marcar = true; C.sel.clear(); desenhar(); const f = el.querySelector('[data-sel-todas]'); if(f) f.focus(); return; }
    if(e.target.closest('[data-sel-cancelar]')){ C.marcar = false; C.sel.clear(); desenhar(); const f = el.querySelector('[data-marcar]'); if(f) f.focus(); return; }
    if(e.target.closest('[data-sel-ok]')){ confirmarLote(); return; }
    if(e.target.closest('[data-sel-todas]')){ const m = (C.lista || []).filter(marcavel); const todas = m.every(it => C.sel.has(chave(it))); m.forEach(it => todas ? C.sel.delete(chave(it)) : C.sel.add(chave(it))); desenhar(); const f = el.querySelector('[data-sel-todas]'); if(f) f.focus(); return; }
    const gs = e.target.closest('[data-gsel]');
    if(gs){ const g = (C.grupos || []).find(x => x.k === gs.dataset.gsel); if(g){ const m = g.itens.filter(marcavel); const todas = m.every(it => C.sel.has(chave(it))); m.forEach(it => todas ? C.sel.delete(chave(it)) : C.sel.add(chave(it))); C.fechados.delete(g.k); C.abertos.add(g.k); } desenhar(); const f = el.querySelector(`[data-gsel="${CSS.escape(gs.dataset.gsel)}"]`); if(f) f.focus(); return; }
    const lck = e.target.closest('li[data-ck]');
    // o clique no rótulo da caixa chega de novo como clique na própria caixa: conta uma vez só
    if(lck && C.marcar && e.target.closest('label.rc-ck') && e.target.tagName !== 'INPUT') return;
    if(lck && C.marcar && !e.target.closest('[data-abrir]')){ alternar(lck.dataset.id + '|' + lck.dataset.idx); const foco = e.target.closest('input[data-ck]') ? lck.dataset.id + '|' + lck.dataset.idx : null; desenhar(); if(foco){ const li2 = [...el.querySelectorAll('li[data-ck]')].find(x => x.dataset.id + '|' + x.dataset.idx === foco); const i2 = li2 && li2.querySelector('input[data-ck]'); if(i2) i2.focus(); } return; }
    const vc = e.target.closest('[data-verco]'); if(vc){ const li = vc.closest('[data-construtora]'); C.construtora = li.dataset.construtora; C.modo = 'lista'; desenhar(); return; }
    const li = e.target.closest('li[data-id]');
    const ac = e.target.closest('[data-acao]');
    if(ac && ac.dataset.acao === 'exportar'){ exportar(); return; }
    if(ac && li){ agir(ac.dataset.acao, li.dataset.id, Number(li.dataset.idx)); return; }
    if(li && !e.target.closest('a,select,input')){ C.aberto = {id: li.dataset.id, idx: Number(li.dataset.idx)}; desenhar(); return; }
    const lc = e.target.closest('li[data-construtora]'); if(lc){ C.construtora = lc.dataset.construtora; C.modo = 'lista'; desenhar(); }
  });
  let tm;
  el.addEventListener('input', e => {
    const c = e.target.dataset.campo; if(!c) return;
    if(c === 'q'){ C.q = e.target.value; clearTimeout(tm); tm = setTimeout(() => { C.limite = 80; desenhar(); }, 180); return; }
  });
  el.addEventListener('change', e => {
    const c = e.target.dataset.campo; if(!c || c === 'q') return;
    C[c] = e.target.value; C.limite = 80; desenhar();
  });
}

window.RadarCronograma = {
  desenhar(){ try{ desenhar(); }catch(e){ console.error(e); document.body.classList.remove('rc-ativo'); } },
  // abre a tela já numa situação (atalhos do painel inicial)
  abrir(balde, extra){ Object.assign(C, {balde: balde || null, faixa: (extra && extra.faixa) || null, modo: (extra && extra.modo) || 'lista', limite: 80, q: '', corretor: '', construtora: '', tipo: '', periodo: (extra && extra.periodo) || '', de: '', ate: ''}); const b = document.querySelector('#nav [data-v="installments"]'); if(b) b.click(); else desenhar(); },
  abrirVenda(id, idx){ C.aberto = {id, idx: idx || 0}; desenhar(); },
  estado: C
};
})();

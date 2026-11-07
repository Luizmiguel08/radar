/* Radar de Comissões · Caixa (só sócios)
   Lê o extrato da conta PJ do Nubank (PDF), confere com os totais do próprio extrato, separa por
   categoria e mostra o resultado por mês e as contas fixas. Os dados e as regras ficam no banco do app;
   este arquivo não guarda nenhum nome nem valor da Fortal. */
(function(raiz){
'use strict';

/* =================== núcleo: categorias, leitura do extrato e regras =================== */

// [categoria, linha do resultado, para que serve]
const CATEGORIAS = [
  ['Comissão de construtora', 'Comissão de construtoras', 'Pix e pagamentos de construtoras e incorporadoras'],
  ['Comissão via pagadoria', 'Comissão via pagadorias', 'Comissão paga por pagadorias'],
  ['Comissão via parceiro', 'Comissão via parceiros', 'Comissão que veio por outra imobiliária, assessoria ou correspondente'],
  ['Comissão paga pelo cliente', 'Comissão paga por clientes', 'Comissão que o comprador pagou direto à Fortal'],
  ['Repasse de cliente à construtora', 'Repassado à construtora', 'Dinheiro do comprador que só passou pela conta e foi para a construtora'],
  ['Repasse a corretor', 'Corretores (repasses menos devoluções)', 'Comissão paga ao corretor'],
  ['Devolução de corretor', 'Corretores (repasses menos devoluções)', 'Dinheiro que o corretor devolveu ou Pix estornado'],
  ['Repasse a imobiliária parceira', 'Imobiliárias parceiras', 'Divisão de comissão com outra imobiliária'],
  ['Comissão paga via pagadoria', 'Comissão paga via pagadorias', 'Boletos de pagadoria para pagar comissão'],
  ['Marketing (Meta Ads)', 'Marketing', 'Anúncios'],
  ['Equipe e prestadores', 'Equipe e prestadores', 'Pagamento a pessoas que não são corretores nem sócios'],
  ['Recrutamento', 'Equipe e prestadores', 'Anúncio de vaga e seleção'],
  ['Aluguel', 'Aluguel', 'Aluguel pago pela Fortal'],
  ['Tecnologia', 'Administrativo e tecnologia', 'Sistemas e desenvolvimento'],
  ['Contabilidade', 'Administrativo e tecnologia', 'Escritório de contabilidade'],
  ['Energia, água e telefone', 'Administrativo e tecnologia', 'Contas do escritório'],
  ['Escritório e copa', 'Administrativo e tecnologia', 'Água, mercado e material do escritório'],
  ['Taxas, registros e tarifas', 'Administrativo e tecnologia', 'CRECI, cartório, maquininha, locações'],
  ['Educação e consultoria', 'Educação e consultoria', 'Cursos, programas e consultorias'],
  ['Alimentação e eventos do time', 'Time, alimentação e eventos', 'Refeições, confraternizações e passeios'],
  ['Impostos', 'Impostos', 'DAS, ISS e outros tributos'],
  ['Fatura do cartão', 'Fatura do cartão', 'Pagamento da fatura do cartão PJ (o detalhe está na fatura)'],
  ['Despesas diversas', 'Despesas diversas', 'Compras da empresa sem categoria própria'],
  ['A classificar', 'A classificar', 'Ainda sem categoria'],
  ['Reembolso e estorno', 'Outros', 'Dinheiro devolvido à Fortal'],
  ['Pix no crédito', 'Outros', 'Dinheiro colocado na conta usando o cartão de crédito'],
  ['Sócios', 'Sócios (retiradas menos aportes)', 'Dinheiro que foi para os sócios ou veio deles'],
  ['Caixinha', 'Caixinha (aplicações menos resgates)', 'Dinheiro guardado ou tirado da caixinha (RDB)'],
  ['Entre contas da Fortal', 'Entre contas da Fortal', 'Transferência de outra conta da própria Fortal']
];
const LINHA_DA = Object.fromEntries(CATEGORIAS.map(c => [c[0], c[1]]));

// linhas do resultado: 'l' soma as categorias da linha; 's:a-b,c' soma outras linhas (posição a partir de 1)
const LINHAS = [
  ['Comissão de construtoras', 'l'], ['Comissão via pagadorias', 'l'], ['Comissão via parceiros', 'l'], ['Comissão paga por clientes', 'l'], ['Repassado à construtora', 'l'],
  ['Receita de intermediação', 's:1-5'],
  ['Corretores (repasses menos devoluções)', 'l'], ['Imobiliárias parceiras', 'l'], ['Comissão paga via pagadorias', 'l'],
  ['Margem de intermediação', 's:6,7,8,9'],
  ['Marketing', 'l'], ['Equipe e prestadores', 'l'], ['Aluguel', 'l'], ['Administrativo e tecnologia', 'l'], ['Educação e consultoria', 'l'],
  ['Time, alimentação e eventos', 'l'], ['Impostos', 'l'], ['Fatura do cartão', 'l'], ['Despesas diversas', 'l'], ['A classificar', 'l'], ['Outros', 'l'],
  ['Resultado operacional', 's:10,11-21'],
  ['Sócios (retiradas menos aportes)', 'l'],
  ['Sobra depois dos sócios', 's:22,23'],
  ['Caixinha (aplicações menos resgates)', 'l'], ['Entre contas da Fortal', 'l'],
  ['Variação do saldo da conta', 's:24,25,26']
];

const MESES_ABREV = {JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12};
const MESES_NOME = {JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12};
// do mais longo para o mais curto quando um começa igual ao outro
const TIPOS = [
  'Transferência enviada pelo Pix', 'Transferência recebida pelo Pix', 'Estorno - Transferência enviada',
  'Pagamento de boleto efetuado', 'Pagamento de boleto devolvido', 'Reembolso recebido pelo Pix',
  'Valor adicionado na conta por cartão', 'Valor adicionado na conta por', 'Transferência Recebida',
  'Transferência enviada', 'Pagamento de fatura', 'Pagamento Recebido', 'Compra no débito', 'Resgate RDB', 'Aplicação RDB'
];
const VALOR = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
const DATA = /^(\d{2}) ([A-Z]{3}) (\d{4})\b/;
const RUIDO = [
  /^CNPJ [\d./-]+ Agência \d+ Conta( [\d-]+)?$/, /^VALORES EM R\$$/,
  /^\d{2} DE \S+ DE \d{4} a \d{2} DE \S+ DE \d{4}( VALORES EM R\$)?$/,
  /^Movimentações$/, /^\d+ de \d+$/, /Tem alguma dúvida\?/, /^metropolitanas\)/, /Caso a solução fornecida/,
  /disponíveis em nubank\.com\.br/, /Extrato gerado dia/, /^O saldo líquido corresponde/, /^Não nos responsabilizamos/,
  /^Asseguramos a autenticidade/, /Nu Financeira S\.A\./, /Nu Pagamentos S\.A\./, /^e Investimento$/, /^CNPJ: \d/
];

const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
const cent = v => Math.round(Number(v || 0) * 100);
const pad2 = n => String(n).padStart(2, '0');

function erroLeitura(msg){ const e = new Error(msg); e.leitura = true; return e; }

/* Texto do PDF → linhas, na ordem de leitura. Agrupa os pedaços pela altura na página. */
async function linhasDoPdf(pdfjs, dados){
  const doc = await pdfjs.getDocument({data: dados, isEvalSupported: false}).promise;
  const linhas = [];
  for(let p = 1; p <= doc.numPages; p++){
    const pag = await doc.getPage(p);
    const tc = await pag.getTextContent();
    const itens = tc.items.filter(i => i.str && i.str.trim()).map(i => ({x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str}));
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos = [];
    for(const it of itens){
      let g = null;
      for(let k = grupos.length - 1; k >= 0 && k >= grupos.length - 3; k--){ if(Math.abs(grupos[k].y - it.y) <= 2.5){ g = grupos[k]; break; } }
      if(g) g.itens.push(it); else grupos.push({y: it.y, itens: [it]});
    }
    for(const g of grupos){
      g.itens.sort((a, b) => a.x - b.x);
      let s = '', fim = null;
      for(const it of g.itens){ if(fim !== null && it.x - fim > 0.8) s += ' '; s += it.s; fim = it.x + it.w; }
      linhas.push(s);
    }
    linhas.push('');
    if(pag.cleanup) pag.cleanup();
  }
  if(doc.destroy) await doc.destroy();
  return linhas;
}

function separar(texto){
  let t = String(texto || '').replace(/(\d{4}-)\s+(\d{2})/g, '$1$2').replace(/\s+/g, ' ').trim();
  const doc = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|•••\.\d{3}\.\d{3}-••)/.exec(t);
  let nome = doc ? t.slice(0, doc.index).replace(/[ -]+$/, '') : t.split(' - ')[0];
  let banco = '';
  if(doc){ const resto = t.slice(doc.index + doc[0].length).replace(/^[ -]+|[ -]+$/g, ''); banco = resto.split(/\s+Agência/)[0].trim(); }
  nome = nome.replace('Valor adicionado para Pix no Crédito', '').trim() || t;
  return {nome: nome.trim(), documento: doc ? doc[1] : '', banco, texto: t};
}

/* Linhas do extrato → lançamentos, saldos do dia e a conferência com os totais impressos. */
function lerLinhas(entrada){
  const L = entrada.map(l => String(l || '').replace(/\s+/g, ' ').trim());
  const i0 = L.findIndex(l => DATA.test(l) && /Total de (entradas|saídas)/.test(l));
  if(i0 < 0) throw erroLeitura('Não achei movimentações neste PDF. Ele precisa ser o extrato da conta PJ do Nubank.');
  const cab = L.slice(0, i0).filter(Boolean);
  const titular = cab[0] || '';
  const iConta = cab.findIndex(x => /^CNPJ [\d./-]+ Agência \d+ Conta$/.test(x));
  const contaTitular = iConta >= 0 && /^\d{4,14}-\d$/.test(cab[iConta + 1] || '') ? cab[iConta + 1] : null;
  const valorDe = rot => { const l = cab.find(x => x.startsWith(rot) && VALOR.test(x)); if(!l) return null; const v = num(VALOR.exec(l)[1]); return /-\s*[\d.]+,\d{2}$/.test(l) ? -v : v; };
  const per = /(\d{2}) DE (\S+) DE (\d{4}) a (\d{2}) DE (\S+) DE (\d{4})/.exec(cab.join(' '));
  const iso = (d, m, a) => `${a}-${pad2(m)}-${pad2(d)}`;
  const periodo = per && MESES_NOME[per[2]] && MESES_NOME[per[5]] ? {de: iso(per[1], MESES_NOME[per[2]], per[3]), ate: iso(per[4], MESES_NOME[per[5]], per[6])} : null;
  const cabecalho = {titular, periodo, saldoInicial: valorDe('Saldo inicial'), saldoFinal: valorDe('Saldo final do período'), totalEntradas: valorDe('Total de entradas'), totalSaidas: valorDe('Total de saídas')};

  let data = null, direcao = null, atual = null;
  const lanc = [], totais = {}, saldos = {}, estranhas = [], novosTipos = new Set();
  for(let i = i0; i < L.length; i++){
    let l = L[i];
    if(!l || l === titular || l === contaTitular || RUIDO.some(r => r.test(l))) continue;
    const m = DATA.exec(l);
    if(m){
      if(!MESES_ABREV[m[2]]) throw erroLeitura('Data que o Radar não entendeu no extrato: ' + m[0]);
      data = `${m[3]}-${pad2(MESES_ABREV[m[2]])}-${m[1]}`;
      l = l.slice(m[0].length).trim();
      if(!l) continue;
    }
    if(/^Total de (entradas|saídas)/.test(l)){
      direcao = /^Total de entradas/.test(l) ? 'entrada' : 'saida';
      const v = VALOR.exec(l); if(!v) throw erroLeitura('Total do dia sem valor em ' + data);
      totais[data + '|' + direcao] = num(v[1]); atual = null; continue;
    }
    if(/^Saldo do dia/.test(l)){
      const v = VALOR.exec(l); if(v) saldos[data] = /-\s*[\d.]+,\d{2}$/.test(l) ? -num(v[1]) : num(v[1]);
      atual = null; continue;
    }
    const v = VALOR.exec(l);
    const tipo = TIPOS.find(t => l.startsWith(t));
    if(v && data && direcao && (tipo || !/^(Total|Saldo)\b/.test(l))){
      const t = tipo || 'Outro lançamento';
      if(!tipo) novosTipos.add(l.slice(0, v.index).trim().slice(0, 60));
      const resto = l.slice(tipo ? tipo.length : 0, v.index).trim();
      atual = {data, direcao, tipo: t === 'Valor adicionado na conta por' ? 'Valor adicionado na conta por cartão' : t, primeira: resto, texto: resto, valor: num(v[1])};
      lanc.push(atual);
      continue;
    }
    if(atual){ atual.texto = (atual.texto + ' ' + l).trim(); continue; }
    estranhas.push(l);
  }
  lanc.forEach((x, k) => { Object.assign(x, separar(x.texto)); x.ordem = k; });

  // conferência: dia a dia, saldo do dia e saldo final
  const div = [];
  const soma = {};
  lanc.forEach(x => { const k = x.data + '|' + x.direcao; soma[k] = (soma[k] || 0) + cent(x.valor); });
  Object.keys(totais).forEach(k => { if((soma[k] || 0) !== cent(totais[k])) div.push(`${k.replace('|', ' ')}: extrato ${totais[k].toFixed(2)}, lido ${((soma[k] || 0) / 100).toFixed(2)}`); });
  Object.keys(soma).forEach(k => { if(!(k in totais)) div.push(`${k.replace('|', ' ')}: lançamentos sem o total do dia`); });
  const dias = [...new Set(lanc.map(x => x.data).concat(Object.keys(saldos)))].sort();
  let saldo = cent(cabecalho.saldoInicial == null ? 0 : cabecalho.saldoInicial);
  const confereSaldo = cabecalho.saldoInicial != null;
  for(const d of dias){
    saldo += (soma[d + '|entrada'] || 0) - (soma[d + '|saida'] || 0);
    if(confereSaldo && d in saldos && cent(saldos[d]) !== saldo) div.push(`${d}: saldo do dia ${saldos[d].toFixed(2)}, calculado ${(saldo / 100).toFixed(2)}`);
  }
  const ent = lanc.filter(x => x.direcao === 'entrada').reduce((a, x) => a + cent(x.valor), 0);
  const sai = lanc.filter(x => x.direcao === 'saida').reduce((a, x) => a + cent(x.valor), 0);
  if(cabecalho.totalEntradas != null && cent(cabecalho.totalEntradas) !== ent) div.push(`total de entradas: extrato ${cabecalho.totalEntradas.toFixed(2)}, lido ${(ent / 100).toFixed(2)}`);
  if(cabecalho.totalSaidas != null && cent(Math.abs(cabecalho.totalSaidas)) !== sai) div.push(`total de saídas: extrato ${Math.abs(cabecalho.totalSaidas).toFixed(2)}, lido ${(sai / 100).toFixed(2)}`);
  if(confereSaldo && cabecalho.saldoFinal != null && cent(cabecalho.saldoFinal) !== saldo) div.push(`saldo final: extrato ${cabecalho.saldoFinal.toFixed(2)}, calculado ${(saldo / 100).toFixed(2)}`);
  if(estranhas.length) div.push(`${estranhas.length} linha(s) que o Radar não reconheceu, a primeira: "${estranhas[0].slice(0, 80)}"`);
  return {
    cabecalho, lancamentos: lanc, saldos, totais,
    conferencia: {ok: div.length === 0, dias: Object.keys(totais).length, divergencias: div, entradas: ent / 100, saidas: sai / 100, saldoCalculado: saldo / 100},
    novosTipos: [...novosTipos]
  };
}

/* Identificador estável: o mesmo lançamento vindo de dois PDFs diferentes vira um só no banco. */
function norm(s){
  return String(s || '').normalize('NFD').replace(/[^\x00-\x7F]/g, '').toUpperCase().replace(/\.\.\./g, '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
}
async function sha256(txt){
  const b = await raiz.crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}
async function comIds(lancs){
  const vistos = {};
  for(const x of lancs){
    const base = [x.data, x.direcao, x.tipo, Number(x.valor).toFixed(2), norm(x.primeira).replace(/[^A-Z0-9]/g, '')].join('|');
    const n = vistos[base] = (vistos[base] || 0) + 1;
    x.id = (await sha256(base + '|' + (n - 1))).slice(0, 32);
  }
  return lancs;
}

function titulo(nome){
  const pequenas = new Set(['DA', 'DE', 'DO', 'DOS', 'DAS', 'E']);
  return norm(nome).split(' ').filter(Boolean).map(p => pequenas.has(p) ? p.toLowerCase() : p[0] + p.slice(1).toLowerCase()).join(' ');
}

/* Regra: {p: começo do nome (sem acento, maiúsculo), n: nome da contraparte, e: categoria se entrar, s: categoria se sair, o: observação} */
function classificar(x, regras){
  let r;
  if(x.tipo === 'Aplicação RDB' || x.tipo === 'Resgate RDB') r = {contraparte: 'Caixinha (RDB)', categoria: 'Caixinha', obs: '', regra: null, fixa: true};
  else if(x.tipo === 'Pagamento de fatura') r = {contraparte: 'Cartão de crédito Nubank PJ', categoria: 'Fatura do cartão', obs: 'O detalhe está na fatura do cartão', regra: null, fixa: true};
  else if(x.tipo === 'Valor adicionado na conta por cartão') r = {contraparte: 'Pix no crédito', categoria: 'Pix no crédito', obs: 'Dinheiro colocado na conta usando o cartão de crédito', regra: null, fixa: true};
  else {
    const n = norm(x.nome);
    const i = (regras || []).findIndex(g => g && g.p && (n.startsWith(g.p) || (g.p.length > 6 && n.includes(g.p))));
    if(i >= 0){
      const g = regras[i], cat = x.direcao === 'entrada' ? g.e : g.s;
      r = cat ? {contraparte: g.n, categoria: cat, obs: g.o || '', regra: i} : {contraparte: g.n, categoria: 'A classificar', obs: 'Movimento fora do padrão para esta contraparte', regra: i};
    } else r = {contraparte: titulo(x.nome) || x.nome || 'Sem nome', categoria: 'A classificar', obs: 'Sem regra', regra: null};
  }
  if(x.ajuste && LINHA_DA[x.ajuste]){ r.categoriaRegra = r.categoria; r.categoria = x.ajuste; r.ajustado = true; }
  r.linha = LINHA_DA[r.categoria] || 'A classificar';
  return r;
}

/* Regra nova ou alterada para uma contraparte, a partir de um lançamento. */
function regraPara(regras, x, cl, categoria){
  const lista = (regras || []).map(g => Object.assign({}, g));
  const lado = x.direcao === 'entrada' ? 'e' : 's';
  if(cl.regra != null && lista[cl.regra]){ lista[cl.regra][lado] = categoria; return lista; }
  const p = norm(x.nome);
  if(!p) return lista;
  const g = {p, n: cl.contraparte, e: null, s: null, o: ''}; g[lado] = categoria;
  lista.push(g);
  return lista;
}

const addMeses = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + n, 1);
  const ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${pad2(alvo.getMonth() + 1)}-${pad2(Math.min(d, ult))}`;
};
const diasEntre = (a, b) => Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 864e5);

/* Tudo o que a tela precisa, calculado de uma vez. */
function montar(dados, hoje){
  const cfg = dados.config || {};
  const regras = Array.isArray(cfg.regras) ? cfg.regras : [];
  const lancs = (dados.lancamentos || []).map(x => { const c = classificar(x, regras); return Object.assign({}, x, {valor: Number(x.valor), sinal: x.direcao === 'entrada' ? Number(x.valor) : -Number(x.valor)}, c); })
    .sort((a, b) => a.data.localeCompare(b.data) || (a.ordem || 0) - (b.ordem || 0));
  const anos = [...new Set(lancs.map(x => +x.data.slice(0, 4)))].sort();
  const saldos = dados.saldos || cfg.saldos || {};
  const diasSaldo = Object.keys(saldos).sort();
  const ultimoDia = diasSaldo[diasSaldo.length - 1] || null;
  const saldoConta = ultimoDia ? Number(saldos[ultimoDia]) : null;
  const cx = cfg.caixinha && cfg.caixinha.data ? cfg.caixinha : null;
  let caixinha = null;
  if(cx){
    const depois = lancs.filter(x => x.categoria === 'Caixinha' && x.data > cx.data);
    caixinha = {base: Number(cx.saldo) || 0, data: cx.data, fonte: cx.fonte || '', aplicado: depois.filter(x => x.direcao === 'saida').reduce((a, x) => a + x.valor, 0), resgatado: depois.filter(x => x.direcao === 'entrada').reduce((a, x) => a + x.valor, 0)};
    caixinha.estimada = caixinha.base + caixinha.aplicado - caixinha.resgatado;
  }
  return {lancs, regras, anos, saldos, ultimoDia, saldoConta, caixinha, fixos: contasFixas(lancs, cfg.fixos || [], hoje), cfg};
}

function resultado(lancs, ano, saldos, inicio){
  const meses = Array.from({length: 12}, (_, i) => `${ano}-${pad2(i + 1)}`);
  const porLinha = {};
  lancs.forEach(x => { if(!x.data.startsWith(ano + '-')) return; const m = +x.data.slice(5, 7) - 1; (porLinha[x.linha] = porLinha[x.linha] || Array(12).fill(0))[m] += cent(x.sinal); });
  const linhas = [];
  LINHAS.forEach(([rot, tipo], i) => {
    let v;
    if(tipo === 'l') v = (porLinha[rot] || Array(12).fill(0)).slice();
    else {
      v = Array(12).fill(0);
      tipo.slice(2).split(',').forEach(p => {
        const [a, b] = p.split('-').map(Number);
        for(let k = a; k <= (b || a); k++) linhas[k - 1].v.forEach((x, j) => { v[j] += x; });
      });
    }
    linhas.push({rot, soma: tipo !== 'l', v, total: v.reduce((a, x) => a + x, 0), pos: i + 1});
  });
  const comMov = meses.map(m => lancs.some(x => x.data.startsWith(m)));
  // conferência: saldo do fim do mês menos o do começo tem que ser a variação calculada
  const dias = Object.keys(saldos || {}).sort();
  const fimDe = m => { const d = dias.filter(x => x <= m + '-31'); return d.length ? cent(saldos[d[d.length - 1]]) : null; };
  const variacao = linhas[linhas.length - 1].v;
  const conferencia = meses.map((m, j) => {
    if(!comMov[j]) return null;
    const antes = j ? fimDe(meses[j - 1]) : (inicio && inicio.data <= m + '-01' && inicio.data.startsWith(String(ano)) ? cent(inicio.saldo) : fimDe(`${ano - 1}-12`));
    const fim = fimDe(m);
    if(antes == null || fim == null) return null;
    return fim - antes - variacao[j];
  });
  return {ano, meses, linhas: linhas.map(l => Object.assign(l, {v: l.v.map(x => x / 100), total: l.total / 100})), comMov, conferencia: conferencia.map(x => x == null ? null : x / 100)};
}

function contasFixas(lancs, fixos, hoje){
  return fixos.map(f => {
    const pagos = lancs.filter(x => x.direcao === 'saida' && x.contraparte === f.n);
    const datas = pagos.map(x => x.data).sort();
    const ultimo = datas[datas.length - 1] || null;
    const total = pagos.reduce((a, x) => a + x.valor, 0);
    const valorUltimo = ultimo ? pagos.filter(x => x.data === ultimo).reduce((a, x) => a + x.valor, 0) : 0;
    const passo = Number(f.passo) || 1;
    const proximo = ultimo ? addMeses(ultimo, passo) : null;
    let situacao, nivel;
    if(f.fim){ situacao = 'Encerrada'; nivel = 'neutral'; }
    else if(!ultimo){ situacao = 'Ainda sem pagamento'; nivel = 'info'; }
    else if(proximo < hoje){ situacao = 'Venceu e não apareceu'; nivel = 'crit'; }
    else if(diasEntre(hoje, proximo) <= 7){ situacao = 'Vence em até 7 dias'; nivel = 'warn'; }
    else { situacao = 'No prazo'; nivel = 'ok'; }
    return {n: f.n, como: f.como || '', passo, o: f.o || '', fim: !!f.fim, pagamentos: pagos.length, total, media: pagos.length ? total / pagos.length : 0, ultimo, valorUltimo, proximo, seguinte: ultimo ? addMeses(ultimo, 2 * passo) : null, situacao, nivel};
  }).sort((a, b) => (a.fim - b.fim) || String(a.proximo || '9').localeCompare(String(b.proximo || '9')));
}

const Nucleo = {CATEGORIAS, LINHAS, LINHA_DA, TIPOS, linhasDoPdf, lerLinhas, separar, comIds, norm, titulo, classificar, regraPara, montar, resultado, contasFixas, addMeses};
if(typeof module === 'object' && module.exports){ module.exports = Nucleo; return; }
raiz.RadarCaixaNucleo = Nucleo;

/* =================== tela (só no navegador) =================== */
const CSS = `
#sec-caixa .cx-tab{min-width:760px;font-size:12.5px}
#sec-caixa .cx-tab th,#sec-caixa .cx-tab td{padding:8px 7px}
#sec-caixa .cx-tab th:first-child,#sec-caixa .cx-tab td:first-child{position:sticky;left:0;background:var(--surface);z-index:1;min-width:250px;white-space:nowrap}
#sec-caixa .cx-tab td{white-space:nowrap}
#sec-caixa .cx-tab tr.cx-soma td{font-weight:800;background:var(--surface-2)}
#sec-caixa .cx-tab tr[data-cx-linha]{cursor:pointer}
#sec-caixa .cx-tab tr[data-cx-linha]:hover td{background:var(--blue-tint)}
#sec-caixa .cx-tab tr[data-cx-linha] td:first-child{padding-left:18px}
#sec-caixa .cx-tab td.cx-zero{color:var(--faint)}
#sec-caixa .cx-tab .cx-sel{background:var(--blue-tint)}
#sec-caixa .cx-conf{margin:10px 0 0;font-size:12.5px;color:var(--muted)}
#sec-caixa .cx-conf.ruim{color:var(--crit);font-weight:600}
#sec-caixa button.cx-cat{border:0;cursor:pointer;font-family:inherit}
#sec-caixa button.cx-cat[disabled]{cursor:default}
#sec-caixa .cx-mais{display:flex;margin:12px auto 0}
#sec-caixa .cx-resumo{font-size:12.5px;color:var(--muted);margin:0 0 4px}
#sec-caixa .cx-arquivo{cursor:pointer}
#sec-caixa .cx-prev{border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;font-size:13px}
#sec-caixa .cx-prev ul{margin:0;padding-left:18px;font-size:12.5px;color:var(--crit)}
#sec-caixa .cx-hist{margin-top:14px}
#sec-caixa .cx-hist h3{font-size:13px;margin:0 0 2px}
#sec-caixa .cx-kbtn{margin:6px 0 -6px -10px}
#sec-caixa .cx-ent{color:var(--good)}
#sec-caixa .cobrow .tag{flex:none}
#sec-caixa .cx-lista .cobrow:first-child{border-top:0}
#sec-caixa .cx-lista .iconbtn{flex:none}
#sec-caixa .cx-ver{margin-top:6px}
.cx-campo{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--ink-2);margin-top:12px}
.cx-campo select,.cx-campo input{border:1px solid var(--line-strong);border-radius:9px;padding:9px 11px;background:var(--surface);color:var(--ink);font:inherit;font-size:14px;min-height:42px}
.cx-escopo{border:0;padding:0;margin:14px 0 0;display:flex;flex-direction:column;gap:10px}
.cx-escopo label{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ink);line-height:1.4}
.cx-escopo input{margin-top:3px}
@media (max-width:820px){#sec-caixa .cx-tab th:first-child,#sec-caixa .cx-tab td:first-child{min-width:150px;max-width:150px;white-space:normal}
#sec-caixa .cx-lanc .cobrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px}#sec-caixa .cx-lanc .cobrow .who{grid-column:1/-1;min-width:0}
#sec-caixa .cx-lanc .cobrow .tag{justify-self:start;max-width:100%;overflow:hidden;text-overflow:ellipsis}#sec-caixa .cx-lanc .cobrow .val{min-width:0}
#sec-caixa .cx-fixos .cobrow .val{min-width:0;margin-left:auto}#sec-caixa .cx-fixos .cobrow .who{min-width:100%}}
`;
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NUM = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0});
const E = {ctx: null, fonte: null, dados: null, M: null, carregando: false, erro: '', versao: 0, pintado: null, limite: 80, f: {cat: '', linha: '', q: ''}, previa: null, ocupado: false, pdfjs: null, todosFixos: false};
const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const secao = () => document.getElementById('sec-caixa');
const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const R2 = v => E.ctx.fmt2(v);
const R0 = v => E.ctx.fmt(v);
const dBR = s => E.ctx.fmtD(s);
const toast = m => E.ctx.toast(m);
const pode = () => !!(E.fonte && E.fonte.podeEditar && E.fonte.podeEditar());
const chaveAtual = () => [E.ctx.ano, E.ctx.mes, E.versao, pode()].join('|');
const quando = t => { const d = new Date(t); return isNaN(d) ? '' : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const fimMesAnterior = iso => { const [a, m] = iso.split('-').map(Number); const d = new Date(a, m - 1, 0); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/* Chamado pelo Radar a cada render() com a tela Caixa aberta. */
function abrir(ctx){
  E.ctx = ctx;
  if(!document.getElementById('cx-estilo')){ const st = document.createElement('style'); st.id = 'cx-estilo'; st.textContent = CSS; document.head.appendChild(st); }
  const s = secao(); if(!s) return;
  if(!E.fonte) E.fonte = ctx.fonte || (ctx.local ? fonteDemo() : null);
  if(!E.fonte){ s.innerHTML = '<div class="card"><div class="empty">O caixa é só para os sócios.</div></div>'; return; }
  ligar(s);
  if(!E.dados && !E.carregando && !E.erro) carregar();
  if(E.M && E.pintado === chaveAtual() && s.firstElementChild) return;
  pintar();
}

async function carregar(){
  E.carregando = true;
  try{ const d = await E.fonte.carregar(); E.dados = d; E.M = montar(d, E.ctx.hoje); E.erro = ''; E.versao++; }
  catch(e){ E.erro = (e && e.message) || 'erro desconhecido'; }
  finally{ E.carregando = false; }
  const s = secao(); if(s && s.classList.contains('active')) pintar();
}
async function recarregar(){ E.dados = null; await carregar(); }

function pintar(){
  const s = secao(); if(!s) return;
  if(E.erro){ s.innerHTML = `<div class="card"><div class="empty">Não foi possível abrir o caixa: ${h(E.erro)}<div style="margin-top:10px"><button class="btn sm" type="button" data-cx="recarregar">Tentar de novo</button></div></div></div>`; E.pintado = null; return; }
  if(!E.M){ s.innerHTML = '<div class="card"><div class="empty">Carregando o caixa…</div></div>'; E.pintado = null; return; }
  const ano = Number(E.ctx.ano) || Number(E.ctx.hoje.slice(0, 4));
  const p = pode();
  if(!E.M.lancs.length){
    s.innerHTML = p ? importarHtml(true) : '<div class="card"><div class="empty">O caixa ainda não tem extrato. Quem entra com o código de dono importa o PDF do Nubank.</div></div>';
    E.pintado = chaveAtual(); return;
  }
  const R = resultado(E.M.lancs, ano, E.M.saldos, E.M.cfg.inicio);
  s.innerHTML = kpisHtml(R, ano, p) + fixosHtml(p) + resultadoHtml(R) + lancHtml(ano, p) + (p ? importarHtml() : '');
  pintarLista();
  E.pintado = chaveAtual();
}

/* ---------- blocos ---------- */
function kpisHtml(R, ano, p){
  const L = rot => (R.linhas.find(l => l.rot === rot) || {total: 0}).total;
  const M = E.M, cx = M.caixinha;
  const res = L('Resultado operacional'), rec = L('Receita de intermediação'), soc = -L('Sócios (retiradas menos aportes)');
  const disp = (M.saldoConta || 0) + (cx ? cx.estimada : 0);
  const venc = M.fixos.filter(f => f.nivel === 'crit');
  return `<div class="kpis">
    <div class="kpi"><div class="label">Disponível agora</div><div class="kpi-value tn">${M.saldoConta == null ? '—' : R0(disp)}</div><div class="delta">${M.saldoConta == null ? 'Importe um extrato para ver o saldo.' : `Conta ${R2(M.saldoConta)} em ${dBR(M.ultimoDia)} · ${cx ? `caixinha ${R0(cx.estimada)}, estimada a partir de ${dBR(cx.data)}` : 'caixinha não informada'}`}</div>${p ? '<button class="btn sm ghost cx-kbtn" type="button" data-cx="caixinha">Atualizar a caixinha</button>' : ''}</div>
    <div class="kpi"><div class="label">Resultado operacional ${ano}</div><div class="kpi-value tn">${R0(res)}</div><div class="delta">Receita de intermediação ${R0(rec)}${rec > 0 ? ` · margem de ${(res / rec * 100).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%` : ''}</div></div>
    <div class="kpi"><div class="label">Retiradas dos sócios ${ano}</div><div class="kpi-value tn">${R0(soc)}</div><div class="delta">${res > 0 ? `${Math.round(soc / res * 100)}% do resultado operacional` : 'Retiradas menos aportes'}</div></div>
    <div class="kpi ${venc.length ? 'crit' : ''}"><div class="label">Contas que não apareceram</div><div class="kpi-value tn" style="${venc.length ? 'color:var(--crit)' : ''}">${venc.length}</div><div class="delta">${venc.length ? h(venc.slice(0, 3).map(f => f.n).join(', ')) + (venc.length > 3 ? '…' : '') : 'As contas fixas estão em dia.'}</div></div>
  </div>`;
}

function fixosHtml(p){
  const F = E.M.fixos;
  const passoTxt = n => n === 1 ? 'todo mês' : n === 12 ? 'uma vez por ano' : `a cada ${n} meses`;
  const linha = f => `<div class="cobrow"><div class="who"><b>${h(f.n)}</b><small>${f.como ? h(f.como) + ' · ' : ''}${passoTxt(f.passo)}${f.ultimo ? ` · último em ${dBR(f.ultimo)}: ${R2(f.valorUltimo)}` : ''}</small>${f.o ? `<span class="ent-ultimo">${h(f.o)}</span>` : ''}</div><div class="val tn">${!f.fim && f.proximo ? dBR(f.proximo) : '—'}</div><span class="tag ${f.nivel}"><span class="dot"></span>${f.situacao}</span>${p ? `<button class="iconbtn" type="button" data-cx-fixo-rm="${h(f.n)}" title="Tirar ${h(f.n)} da lista" aria-label="Tirar ${h(f.n)} da lista">${X}</button>` : ''}</div>`;
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h2>Contas fixas e próximos pagamentos</h2><p>Próximo = último pagamento no extrato mais o intervalo da conta. Se passar da data e o pagamento não aparecer, fica em vermelho.</p></div><span class="spacer"></span>${p ? '<button class="btn sm" type="button" data-cx="fixo-novo">Acompanhar outra conta</button>' : ''}</div>
    ${F.length ? `<div class="cx-lista cx-fixos">${(E.todosFixos ? F : F.slice(0, 6)).map(linha).join('')}</div>${F.length > 6 ? `<button class="btn sm ghost cx-ver" type="button" data-cx="todos-fixos">${E.todosFixos ? 'Mostrar menos' : `Ver as outras ${F.length - 6}`}</button>` : ''}` : '<div class="empty">Nenhuma conta fixa na lista.</div>'}
  </div>`;
}

function resultadoHtml(R){
  const idx = R.meses.map((_, j) => j).filter(j => R.comMov[j]);
  const p0 = idx.length ? idx[0] : 0, p1 = idx.length ? idx[idx.length - 1] : -1;
  const cols = []; for(let j = p0; j <= p1; j++) cols.push(j);
  const sel = Number(E.ctx.mes) ? Number(E.ctx.mes) - 1 : -1;
  if(!cols.length) return `<div class="card" style="margin-bottom:14px"><div class="card-head"><div><h2>Resultado por mês</h2><p>Sem lançamentos em ${R.ano}. Troque o ano no alto da tela.</p></div></div></div>`;
  const cel = (v, j) => { const z = Math.abs(v) < 0.5; return `<td class="r tn${z ? ' cx-zero' : ''}${j === sel ? ' cx-sel' : ''}">${z ? '—' : NUM.format(v)}</td>`; };
  const corpo = R.linhas.map(l => `<tr class="${l.soma ? 'cx-soma' : ''}" ${l.soma ? '' : `data-cx-linha="${h(l.rot)}" title="Ver os lançamentos de ${h(l.rot)}"`}><td>${h(l.rot)}</td>${cols.map(j => cel(l.v[j], j)).join('')}<td class="r tn">${Math.abs(l.total) < 0.5 ? '—' : NUM.format(l.total)}</td></tr>`).join('');
  const conf = cols.map(j => [j, R.conferencia[j]]).filter(([, v]) => v != null);
  const ruins = conf.filter(([, v]) => Math.abs(v) >= 0.01);
  const txtConf = !conf.length ? 'Sem saldo do extrato para conferir os meses deste ano.'
    : ruins.length ? `O resultado não bate com o saldo do extrato em ${ruins.map(([j, v]) => `${MES3[j]} (${R2(v)})`).join(', ')}. Algum PDF do período pode ter ficado de fora.`
    : `Conferido: a variação de cada mês bate com o saldo do extrato (${MES3[conf[0][0]]} a ${MES3[conf[conf.length - 1][0]]}).`;
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h2>Resultado por mês · ${R.ano}</h2><p>O que entrou e saiu da conta em cada mês, em reais. Toque numa linha para ver os lançamentos dela.</p></div></div>
    <div class="tscroll"><table class="cx-tab"><thead><tr><th>Linha</th>${cols.map(j => `<th class="r${j === sel ? ' cx-sel' : ''}">${MES3[j]}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>${corpo}</tbody></table></div>
    <p class="cx-conf ${ruins.length ? 'ruim' : ''}">${txtConf}</p>
  </div>`;
}

function filtrosHtml(){
  const semCat = E.M.lancs.filter(x => x.categoria === 'A classificar' && x.data.startsWith(String(E.ctx.ano))).length;
  return `<select data-cx="cat" aria-label="Categoria"><option value="">Todas as categorias</option>${CATEGORIAS.map(c => `<option value="${h(c[0])}" ${E.f.cat === c[0] ? 'selected' : ''}>${h(c[0])}</option>`).join('')}</select>
    <input type="search" data-cx="q" placeholder="Buscar nome ou valor" aria-label="Buscar" value="${h(E.f.q)}" style="min-width:180px;flex:1;max-width:320px">
    ${E.f.linha ? `<button class="chip active" type="button" data-cx="limpar-linha" title="Tirar o filtro">${h(E.f.linha)} ✕</button>` : ''}
    ${semCat ? `<button class="chip ${E.f.cat === 'A classificar' ? 'active' : ''}" type="button" data-cx="sem-cat">${plural(semCat, 'sem categoria', 'sem categoria')}</button>` : ''}`;
}
function lancHtml(ano, p){
  const mes = Number(E.ctx.mes);
  return `<div class="card" style="margin-bottom:14px" id="cxCardLanc">
    <div class="card-head"><div><h2>Lançamentos · ${mes ? MES3[mes - 1] + '/' + ano : ano}</h2><p>${p ? 'Toque na categoria para trocar. Dá para trocar só aquele lançamento ou todos da mesma pessoa ou empresa.' : 'Cada lançamento do extrato com a categoria usada no resultado.'}</p></div></div>
    <div class="filters" id="cxFiltros">${filtrosHtml()}</div>
    <div id="cxLista"></div>
  </div>`;
}
function listaFiltrada(){
  const ano = E.ctx.ano, mes = Number(E.ctx.mes);
  const pre = mes ? `${ano}-${pad2(mes)}` : `${ano}-`;
  const q = norm(E.f.q), qd = E.f.q.replace(/\D/g, '');
  return E.M.lancs.filter(x => x.data.startsWith(pre) && (!E.f.cat || x.categoria === E.f.cat) && (!E.f.linha || x.linha === E.f.linha)
    && (!q || norm(`${x.contraparte} ${x.nome} ${x.texto} ${x.categoria} ${x.tipo}`).includes(q) || (qd.length >= 3 && Math.round(x.valor * 100).toString().includes(qd))))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.ordem || 0) - (a.ordem || 0));
}
function pintarLista(){
  const el = document.getElementById('cxLista'); if(!el || !E.M) return;
  const lista = listaFiltrada(), p = pode();
  const ent = lista.filter(x => x.direcao === 'entrada').reduce((a, x) => a + x.valor, 0);
  const sai = lista.filter(x => x.direcao === 'saida').reduce((a, x) => a + x.valor, 0);
  const linha = x => { const e = x.direcao === 'entrada';
    return `<div class="cobrow"><div class="who"><b>${h(x.contraparte)}</b><small>${dBR(x.data)} · ${h(x.tipo)}${x.obs && x.obs !== 'Sem regra' ? ' · ' + h(x.obs) : ''}</small></div><button class="tag ${x.categoria === 'A classificar' ? 'warn' : 'info'} cx-cat" type="button" data-cx-cat="${h(x.id)}" ${p ? `title="Trocar a categoria"` : 'disabled'}>${h(x.categoria)}${x.ajustado ? ' · só este' : ''}</button><div class="val tn ${e ? 'cx-ent' : ''}">${e ? '+' : '−'} ${R2(x.valor)}</div></div>`; };
  el.innerHTML = lista.length
    ? `<p class="cx-resumo">${plural(lista.length, 'lançamento', 'lançamentos')} · entradas ${R2(ent)} · saídas ${R2(sai)}</p><div class="cx-lista cx-lanc">${lista.slice(0, E.limite).map(linha).join('')}</div>${lista.length > E.limite ? `<button class="btn sm cx-mais" type="button" data-cx="mais">Mostrar mais ${Math.min(80, lista.length - E.limite)}</button>` : ''}`
    : '<div class="empty">Nenhum lançamento com esses filtros.</div>';
}
function atualizarFiltros(){ const f = document.getElementById('cxFiltros'); if(f) f.innerHTML = filtrosHtml(); E.limite = 80; pintarLista(); }

function importarHtml(primeiro){
  const ult = E.M.ultimoDia;
  const texto = primeiro
    ? `As ${plural(E.M.regras.length, 'regra', 'regras')} de categoria e as ${plural(E.M.cfg.fixos ? E.M.cfg.fixos.length : 0, 'conta fixa', 'contas fixas')} já estão aqui. Falta o extrato: escolha o PDF da conta PJ do Nubank, de 01/01 até hoje. Antes de salvar, o Radar confere com os totais do próprio extrato.`
    : `No app do Nubank PJ, baixe o extrato em PDF${ult ? ` a partir de ${dBR(ult)}, o último dia que já está aqui` : ''}. Pode repetir dias: o que já está no Radar não entra de novo. Antes de salvar, o Radar confere com os totais do próprio extrato.`;
  return `<div class="card" id="cxCardImp">
    <div class="card-head"><div><h2>${primeiro ? 'Comece pelo extrato' : 'Importar extrato do Nubank'}</h2><p>${texto}</p></div><span class="spacer"></span><label class="btn sm primary cx-arquivo">Escolher o PDF<input type="file" accept="application/pdf,.pdf" data-cx="arquivo" hidden></label></div>
    <div id="cxPrevia">${previaHtml()}</div>
    ${historicoHtml()}
  </div>`;
}
function previaHtml(){
  const p = E.previa; if(!p) return '';
  if(p.lendo) return `<div class="cx-prev"><b>Lendo ${h(p.arquivo)}…</b><span class="sub">Num extrato de muitos meses leva alguns segundos.</span></div>`;
  if(p.erro) return `<div class="cx-prev"><span class="tag crit"><span class="dot"></span>Não deu para importar</span><span>${h(p.erro)}</span><button class="btn sm" type="button" data-cx="previa-cancelar">Fechar</button></div>`;
  const r = p.r, c = r.conferencia, per = r.cabecalho.periodo;
  const n = p.novos.length;
  return `<div class="cx-prev">
    <b>${h(p.arquivo)}</b>
    <span>${per ? `Extrato de ${dBR(per.de)} a ${dBR(per.ate)}` : 'Extrato'} · ${plural(r.lancamentos.length, 'lançamento', 'lançamentos')} · entradas ${R2(c.entradas)} · saídas ${R2(c.saidas)}</span>
    ${c.ok ? `<span class="tag ok"><span class="dot"></span>Bate com os totais do extrato nos ${c.dias} dias com movimento</span>` : `<span class="tag crit"><span class="dot"></span>Não bate com os totais do extrato</span><ul>${c.divergencias.slice(0, 5).map(d => `<li>${h(d)}</li>`).join('')}</ul><span class="sub">Nada foi salvo. Mande este PDF para o Claude ver o que mudou no formato do extrato.</span>`}
    ${c.ok ? `<span>${n ? `${plural(n, 'lançamento novo', 'lançamentos novos')}` : 'Nada novo: tudo deste PDF já está no Radar'}${r.lancamentos.length - n ? ` · ${r.lancamentos.length - n} já estavam aqui` : ''}${p.semRegra.length ? ` · ${plural(p.semRegra.length, 'nome novo vai', 'nomes novos vão')} para "A classificar": ${h(p.semRegra.slice(0, 4).join(', '))}${p.semRegra.length > 4 ? '…' : ''}` : ''}</span>` : ''}
    ${r.novosTipos.length ? `<span class="sub">Tipo de lançamento que o Radar ainda não conhecia: ${h(r.novosTipos.join(', '))}. Entrou como "Outro lançamento".</span>` : ''}
    <div class="rowbtns" style="justify-content:flex-start"><button class="btn sm" type="button" data-cx="previa-cancelar">Cancelar</button>${c.ok && n ? `<button class="btn sm primary" type="button" data-cx="previa-salvar" ${E.ocupado ? 'disabled' : ''}>${E.ocupado ? 'Salvando…' : `Salvar ${n === 1 ? 'o lançamento novo' : `os ${n} lançamentos novos`}`}</button>` : ''}</div>
  </div>`;
}
function pintarPrevia(){ const el = document.getElementById('cxPrevia'); if(el) el.innerHTML = previaHtml(); }
function historicoHtml(){
  const imps = (E.M.cfg.importacoes || []).slice(0, 5);
  if(!imps.length) return '';
  return `<div class="cx-hist"><h3>Últimas importações</h3>${imps.map((i, k) => `<div class="cobrow"><div class="who"><small>${quando(i.em)}${i.quem ? ' · ' + h(i.quem) : ''} · ${i.de ? `extrato de ${dBR(i.de)} a ${dBR(i.ate)}` : h(i.arquivo || '')} · ${plural(Number(i.novos) || 0, 'novo', 'novos')} de ${Number(i.total) || 0}</small></div>${k === 0 && i.id && Number(i.novos) ? `<div class="rowbtns"><button class="btn sm ghost" type="button" data-cx-desfazer="${h(i.id)}">Desfazer</button></div>` : ''}</div>`).join('')}</div>`;
}

/* ---------- ações ---------- */
function ligar(s){
  if(s.dataset.cxLigado) return;
  s.dataset.cxLigado = '1';
  s.addEventListener('click', e => {
    const b = e.target.closest('[data-cx],[data-cx-linha],[data-cx-cat],[data-cx-fixo-rm],[data-cx-desfazer]');
    if(!b || !s.contains(b)) return;
    if(b.dataset.cxLinha){ E.f.linha = b.dataset.cxLinha; E.f.cat = ''; atualizarFiltros(); const c = document.getElementById('cxCardLanc'); if(c) c.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
    if(b.dataset.cxCat){ abrirCategoria(b.dataset.cxCat); return; }
    if(b.dataset.cxFixoRm){ tirarFixo(b.dataset.cxFixoRm); return; }
    if(b.dataset.cxDesfazer){ desfazer(b.dataset.cxDesfazer); return; }
    const a = b.dataset.cx;
    if(a === 'recarregar'){ E.erro = ''; pintar(); recarregar(); }
    else if(a === 'caixinha') abrirCaixinha();
    else if(a === 'fixo-novo') abrirFixoNovo();
    else if(a === 'limpar-linha'){ E.f.linha = ''; atualizarFiltros(); }
    else if(a === 'sem-cat'){ E.f.cat = E.f.cat === 'A classificar' ? '' : 'A classificar'; E.f.linha = ''; atualizarFiltros(); }
    else if(a === 'mais'){ E.limite += 80; pintarLista(); }
    else if(a === 'todos-fixos'){ E.todosFixos = !E.todosFixos; pintar(); }
    else if(a === 'previa-cancelar'){ E.previa = null; pintarPrevia(); }
    else if(a === 'previa-salvar') salvarImportacao();
  });
  s.addEventListener('change', e => {
    const t = e.target; if(!t.dataset) return;
    if(t.dataset.cx === 'cat'){ E.f.cat = t.value; E.f.linha = ''; atualizarFiltros(); }
    else if(t.dataset.cx === 'arquivo'){ const f = t.files && t.files[0]; t.value = ''; if(f) lerArquivo(f); }
  });
  let qT = null;
  s.addEventListener('input', e => {
    if(e.target.dataset && e.target.dataset.cx === 'q'){ E.f.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { E.limite = 80; pintarLista(); }, 150); }
  });
}

function modal(html, aoAbrir){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-bg" id="cxBg"><div class="modal" role="dialog" aria-modal="true" style="width:min(480px,100%)">${html}</div></div>`;
  const fechar = () => { root.innerHTML = ''; };
  document.getElementById('cxBg').addEventListener('click', e => { if(e.target.id === 'cxBg') fechar(); });
  root.querySelectorAll('[data-cx-fechar]').forEach(b => b.addEventListener('click', fechar));
  if(aoAbrir) aoAbrir(root, fechar);
}
async function executar(btn, fn, okMsg){
  if(E.ocupado) return;
  E.ocupado = true; if(btn){ btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = 'Salvando…'; }
  try{ await fn(); if(okMsg) toast(okMsg); await recarregar(); return true; }
  catch(e){ toast((e && e.message) || 'Não foi possível salvar'); if(btn){ btn.disabled = false; btn.textContent = btn.dataset.txt; } return false; }
  finally{ E.ocupado = false; }
}

function abrirCategoria(id){
  if(!pode()) return;
  const x = E.M.lancs.find(l => l.id === id); if(!x) return;
  const entra = x.direcao === 'entrada';
  const mesmos = E.M.lancs.filter(l => l.contraparte === x.contraparte && l.direcao === x.direcao && !l.fixa).length;
  const atual = x.categoria;
  modal(`<h2 style="font-size:16px">Categoria do lançamento</h2>
    <p class="hint">${h(x.contraparte)} · ${h(x.tipo)} · ${dBR(x.data)} · ${entra ? '+' : '−'} ${R2(x.valor)}</p>
    <label class="cx-campo">Categoria<select id="cxCatSel">${CATEGORIAS.map(c => `<option value="${h(c[0])}" ${c[0] === atual ? 'selected' : ''}>${h(c[0])}</option>`).join('')}</select></label>
    <p class="hint" id="cxCatDesc" style="margin-top:6px"></p>
    ${x.fixa ? '<p class="hint">Este tipo de lançamento tem categoria fixa; a troca vale só para ele.</p>' : `<fieldset class="cx-escopo"><legend class="sub" style="margin-bottom:6px">Vale para</legend><label><input type="radio" name="cxEsc" value="regra" checked><span>Todos os lançamentos de ${h(x.contraparte)} que ${entra ? 'entram' : 'saem'} (${mesmos} hoje) e os dos próximos extratos</span></label><label><input type="radio" name="cxEsc" value="um"><span>Só este lançamento</span></label></fieldset>`}
    <div class="actions"><button class="btn" type="button" data-cx-fechar>Cancelar</button><button class="btn primary" type="button" id="cxCatOk">Salvar</button></div>`, (root, fechar) => {
    const sel = root.querySelector('#cxCatSel'), desc = root.querySelector('#cxCatDesc');
    const mostrar = () => { const c = CATEGORIAS.find(c => c[0] === sel.value); desc.textContent = c ? `${c[2]}. Entra na linha "${c[1]}".` : ''; };
    sel.addEventListener('change', mostrar); mostrar();
    root.querySelector('#cxCatOk').addEventListener('click', async ev => {
      const cat = sel.value;
      const escopo = x.fixa ? 'um' : root.querySelector('input[name="cxEsc"]:checked').value;
      const ok = await executar(ev.currentTarget, async () => {
        if(escopo === 'regra'){
          await E.fonte.salvar('regras', regraPara(E.M.regras, x, x, cat));
          if(x.ajuste) await E.fonte.ajustar(x.id, null);
        } else await E.fonte.ajustar(x.id, cat === (x.ajustado ? x.categoriaRegra : x.categoria) ? null : cat);
      }, escopo === 'regra' ? `Categoria de ${x.contraparte} trocada` : 'Categoria do lançamento trocada');
      if(ok) fechar();
    });
  });
}

function abrirFixoNovo(){
  if(!pode()) return;
  const ja = new Set((E.M.cfg.fixos || []).map(f => f.n));
  const mapa = {};
  const fora = new Set(['Sócios', 'Caixinha', 'Entre contas da Fortal', 'Repasse a corretor', 'Devolução de corretor', 'Repasse de cliente à construtora', 'A classificar']);
  E.M.lancs.filter(x => x.direcao === 'saida' && !ja.has(x.contraparte) && !fora.has(x.categoria)).forEach(x => { const m = mapa[x.contraparte] = mapa[x.contraparte] || {n: x.contraparte, q: 0, t: 0}; m.q++; m.t += x.valor; });
  const lista = Object.values(mapa).sort((a, b) => b.q - a.q || b.t - a.t).slice(0, 200);
  if(!lista.length){ toast('Não há outra conta para acompanhar'); return; }
  modal(`<h2 style="font-size:16px">Acompanhar uma conta fixa</h2>
    <p class="hint">O Radar avisa quando o pagamento não aparecer no extrato dentro do intervalo.</p>
    <label class="cx-campo">Para quem a Fortal paga<select id="cxFxN">${lista.map(m => `<option value="${h(m.n)}">${h(m.n)} · ${plural(m.q, 'pagamento', 'pagamentos')}</option>`).join('')}</select></label>
    <label class="cx-campo">De quanto em quanto tempo<select id="cxFxP"><option value="1">Todo mês</option><option value="2">A cada 2 meses</option><option value="3">A cada 3 meses</option><option value="6">A cada 6 meses</option><option value="12">Uma vez por ano</option></select></label>
    <label class="cx-campo">Como paga<select id="cxFxC"><option>Boleto</option><option>Pix</option><option>Débito automático</option><option>Cartão</option></select></label>
    <label class="cx-campo">Observação<input id="cxFxO" maxlength="140" placeholder="Opcional"></label>
    <div class="actions"><button class="btn" type="button" data-cx-fechar>Cancelar</button><button class="btn primary" type="button" id="cxFxOk">Acompanhar</button></div>`, (root, fechar) => {
    root.querySelector('#cxFxOk').addEventListener('click', async ev => {
      const novo = {n: root.querySelector('#cxFxN').value, como: root.querySelector('#cxFxC').value, passo: Number(root.querySelector('#cxFxP').value) || 1, o: root.querySelector('#cxFxO').value.trim()};
      const ok = await executar(ev.currentTarget, () => E.fonte.salvar('fixos', (E.M.cfg.fixos || []).concat([novo])), `${novo.n} entrou nas contas fixas`);
      if(ok) fechar();
    });
  });
}
function tirarFixo(n){
  if(!pode()) return;
  modal(`<h2 style="font-size:16px">Tirar ${h(n)} das contas fixas?</h2><p class="hint">Os pagamentos continuam no caixa. Só para de aparecer nesta lista e nos avisos.</p>
    <div class="actions"><button class="btn" type="button" data-cx-fechar>Cancelar</button><button class="btn primary" type="button" id="cxRmOk">Tirar da lista</button></div>`, (root, fechar) => {
    root.querySelector('#cxRmOk').addEventListener('click', async ev => {
      const ok = await executar(ev.currentTarget, () => E.fonte.salvar('fixos', (E.M.cfg.fixos || []).filter(f => f.n !== n)), 'Conta tirada da lista');
      if(ok) fechar();
    });
  });
}
function abrirCaixinha(){
  if(!pode()) return;
  const cx = E.M.cfg.caixinha || {};
  modal(`<h2 style="font-size:16px">Saldo da caixinha</h2>
    <p class="hint">Use o saldo do Extrato de Rendimentos das Caixinhas PJ, no app do Nubank. O Radar soma as aplicações e desconta os resgates feitos depois dessa data.</p>
    <label class="cx-campo">Data do saldo<input type="date" id="cxCxD" value="${h(cx.data || fimMesAnterior(E.ctx.hoje))}" max="${h(E.ctx.hoje)}"></label>
    <label class="cx-campo">Saldo (R$)<input type="number" inputmode="decimal" step="0.01" min="0" id="cxCxV" value="${cx.saldo != null ? Number(cx.saldo).toFixed(2) : ''}"></label>
    <div class="actions"><button class="btn" type="button" data-cx-fechar>Cancelar</button><button class="btn primary" type="button" id="cxCxOk">Salvar</button></div>`, (root, fechar) => {
    root.querySelector('#cxCxOk').addEventListener('click', async ev => {
      const data = root.querySelector('#cxCxD').value, saldo = Number(root.querySelector('#cxCxV').value);
      if(!data || !(saldo >= 0) || root.querySelector('#cxCxV').value === ''){ toast('Informe a data e o saldo'); return; }
      const ok = await executar(ev.currentTarget, () => E.fonte.salvar('caixinha', {saldo: Math.round(saldo * 100) / 100, data, fonte: `Informado por ${E.ctx.operador() || 'sócio'} em ${dBR(E.ctx.hoje)}`}), 'Caixinha atualizada');
      if(ok) fechar();
    });
  });
}
function desfazer(id){
  if(!pode()) return;
  const imp = (E.M.cfg.importacoes || []).find(i => i.id === id); if(!imp) return;
  modal(`<h2 style="font-size:16px">Desfazer a última importação?</h2><p class="hint">Saem do caixa os ${Number(imp.novos) || 0} lançamentos que ela trouxe${imp.de ? ` (extrato de ${dBR(imp.de)} a ${dBR(imp.ate)})` : ''}. Dá para importar o PDF de novo depois.</p>
    <div class="actions"><button class="btn" type="button" data-cx-fechar>Cancelar</button><button class="btn primary" type="button" id="cxDfOk" style="background:var(--crit);border-color:var(--crit)">Desfazer</button></div>`, (root, fechar) => {
    root.querySelector('#cxDfOk').addEventListener('click', async ev => {
      const ok = await executar(ev.currentTarget, () => E.fonte.desfazer(id), 'Importação desfeita');
      if(ok) fechar();
    });
  });
}

/* ---------- importação do PDF ---------- */
function carregarPdfjs(){
  if(E.pdfjs) return E.pdfjs;
  E.pdfjs = new Promise((ok, falha) => {
    const fim = () => { const p = raiz.pdfjsLib || raiz['pdfjs-dist/build/pdf']; if(!p){ E.pdfjs = null; falha(new Error('O leitor de PDF não carregou.')); return; } p.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(p); };
    if(raiz.pdfjsLib){ fim(); return; }
    const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js'; s.onload = fim;
    s.onerror = () => { E.pdfjs = null; falha(new Error('Sem internet para abrir o leitor de PDF.')); };
    document.head.appendChild(s);
  });
  return E.pdfjs;
}
async function lerArquivo(file){
  E.previa = {lendo: true, arquivo: file.name}; pintarPrevia();
  try{
    if(file.size > 40e6) throw erroLeitura('Este PDF passa de 40 MB. Baixe o extrato em períodos menores.');
    const pdfjs = await carregarPdfjs();
    let linhas;
    try{ linhas = await linhasDoPdf(pdfjs, new Uint8Array(await file.arrayBuffer())); }
    catch(e){ throw erroLeitura(e && e.name === 'PasswordException' ? 'Este PDF tem senha. Baixe o extrato de novo, sem senha.' : 'Não consegui abrir este arquivo como PDF.'); }
    const r = lerLinhas(linhas);
    await comIds(r.lancamentos);
    const ja = new Set(E.M.lancs.map(x => x.id));
    const novos = r.lancamentos.filter(x => !ja.has(x.id));
    const semRegra = [...new Set(novos.map(x => classificar(x, E.M.regras)).filter(c => c.categoria === 'A classificar').map(c => c.contraparte))];
    E.previa = {arquivo: file.name, r, novos, semRegra};
  }catch(e){ E.previa = {arquivo: file.name, erro: e && e.leitura ? e.message : 'Não consegui ler este PDF: ' + ((e && e.message) || e)}; }
  pintarPrevia();
}
async function salvarImportacao(){
  const p = E.previa; if(!p || !p.r || E.ocupado || !pode()) return;
  E.ocupado = true; pintarPrevia();
  try{
    const r = p.r, per = r.cabecalho.periodo;
    const lancamentos = p.novos.map(x => ({id: x.id, data: x.data, direcao: x.direcao, tipo: x.tipo, nome: x.nome, documento: x.documento, banco: x.banco, texto: x.texto, valor: x.valor, ordem: x.ordem}));
    const info = {de: per ? per.de : null, ate: per ? per.ate : null, arquivo: String(p.arquivo).slice(0, 120), total: r.lancamentos.length,
      inicio: per && r.cabecalho.saldoInicial != null ? {data: per.de, saldo: r.cabecalho.saldoInicial} : null};
    const res = await E.fonte.importar({lancamentos, saldos: r.saldos, info});
    E.previa = null;
    toast(`${plural(Number(res && res.novos) || 0, 'lançamento novo salvo', 'lançamentos novos salvos')} no caixa`);
    E.ocupado = false;
    await recarregar();
  }catch(e){ E.ocupado = false; toast((e && e.message) || 'Não foi possível salvar'); pintarPrevia(); }
}

/* ---------- modo demonstração (sem banco): dados inventados, guardados só neste navegador ---------- */
function exemplo(){
  const L = []; let k = 0;
  const add = (data, direcao, tipo, nome, valor) => { k++; L.push({id: 'demo' + String(k).padStart(4, '0'), data, direcao, tipo, nome, documento: '', banco: '', texto: nome, valor, ordem: k}); };
  ['2026-08', '2026-09', '2026-10'].forEach((m, i) => {
    add(`${m}-03`, 'entrada', 'Transferência recebida pelo Pix', 'Construtora Horizonte SPE', 48000 + i * 6000);
    add(`${m}-05`, 'saida', 'Transferência enviada pelo Pix', 'Ana Lima Corretora', 14000 + i * 1500);
    add(`${m}-05`, 'saida', 'Transferência enviada pelo Pix', 'Bruno Souza Corretor', 9000);
    add(`${m}-08`, 'saida', 'Transferência enviada pelo Pix', 'Meta Anuncios Exemplo', 9500 + i * 800);
    add(`${m}-10`, 'saida', 'Pagamento de boleto efetuado', 'Escritorio Contabil Exemplo', 650);
    add(`${m}-12`, 'saida', 'Pagamento de boleto efetuado', 'Energia Exemplo', 420 + i * 30);
    add(`${m}-15`, 'entrada', 'Transferência recebida pelo Pix', 'Pagadoria Exemplo', 15000);
    add(`${m}-20`, 'saida', 'Transferência enviada pelo Pix', 'Socio Exemplo', 20000);
    add(`${m}-25`, 'saida', 'Aplicação RDB', '', 10000);
    add(`${m}-27`, 'saida', 'Compra no débito', 'Mercado Exemplo', 380);
  });
  add('2026-10-29', 'saida', 'Transferência enviada pelo Pix', 'Pessoa Sem Cadastro', 300);
  const saldos = {}; let s = 12000 * 100;
  [...new Set(L.map(x => x.data))].sort().forEach(d => { L.filter(x => x.data === d).forEach(x => { s += (x.direcao === 'entrada' ? 1 : -1) * Math.round(x.valor * 100); }); saldos[d] = s / 100; });
  const r = (p, n, e, sa) => ({p, n, e, s: sa, o: ''});
  return {lancamentos: L, saldos, config: {
    regras: [r('CONSTRUTORA HORIZONTE', 'Construtora Horizonte', 'Comissão de construtora', null), r('ANA LIMA', 'Ana Lima (corretora)', 'Devolução de corretor', 'Repasse a corretor'),
      r('BRUNO SOUZA', 'Bruno Souza (corretor)', 'Devolução de corretor', 'Repasse a corretor'), r('META ANUNCIOS', 'Meta Ads', null, 'Marketing (Meta Ads)'),
      r('ESCRITORIO CONTABIL', 'Escritório Contábil Exemplo', null, 'Contabilidade'), r('ENERGIA EXEMPLO', 'Energia Exemplo', null, 'Energia, água e telefone'),
      r('PAGADORIA EXEMPLO', 'Pagadoria Exemplo', 'Comissão via pagadoria', null), r('SOCIO EXEMPLO', 'Sócio Exemplo', 'Sócios', 'Sócios'), r('MERCADO EXEMPLO', 'Mercado Exemplo', null, 'Escritório e copa')],
    fixos: [{n: 'Meta Ads', como: 'Pix', passo: 1, o: ''}, {n: 'Escritório Contábil Exemplo', como: 'Boleto', passo: 1, o: ''}, {n: 'Energia Exemplo', como: 'Boleto', passo: 1, o: ''}],
    caixinha: {saldo: 30000, data: '2026-09-30', fonte: 'Exemplo'}, inicio: {data: '2026-08-01', saldo: 12000}, importacoes: []
  }};
}
function fonteDemo(){
  const K = 'radar-caixa-demo';
  const ler = () => { try{ return JSON.parse(localStorage.getItem(K) || 'null'); }catch(e){ return null; } };
  const gravar = d => { try{ localStorage.setItem(K, JSON.stringify(d)); }catch(e){} };
  const base = () => { let d = ler(); if(!d || !Array.isArray(d.lancamentos)){ d = exemplo(); gravar(d); } d.config = d.config || {}; return d; };
  return {
    demo: true,
    podeEditar: () => true,
    async carregar(){ return JSON.parse(JSON.stringify(base())); },
    async importar({lancamentos, saldos, info}){
      const d = base(), ids = new Set(d.lancamentos.map(x => x.id)), imp = 'demo' + Date.now().toString(36);
      let novos = 0;
      lancamentos.forEach(x => { if(!ids.has(x.id)){ d.lancamentos.push(Object.assign({}, x, {importacao: imp})); ids.add(x.id); novos++; } });
      d.saldos = Object.assign({}, d.saldos || {}, saldos || {});
      if(info && info.inicio && (!d.config.inicio || info.inicio.data < d.config.inicio.data)) d.config.inicio = info.inicio;
      d.config.importacoes = [{id: imp, em: new Date().toISOString(), quem: E.ctx.operador() || '', de: info && info.de, ate: info && info.ate, arquivo: info && info.arquivo, total: lancamentos.length, novos}].concat(d.config.importacoes || []).slice(0, 50);
      gravar(d); return {ok: true, novos, repetidos: lancamentos.length - novos};
    },
    async salvar(id, dados){ const d = base(); d.config[id] = dados; gravar(d); return {ok: true}; },
    async ajustar(id, cat){ const d = base(); const x = d.lancamentos.find(l => l.id === id); if(x) x.ajuste = cat || null; gravar(d); return {ok: true}; },
    async desfazer(imp){ const d = base(); const n = d.lancamentos.length; d.lancamentos = d.lancamentos.filter(x => x.importacao !== imp); d.config.importacoes = (d.config.importacoes || []).filter(i => i.id !== imp); gravar(d); return {ok: true, removidos: n - d.lancamentos.length}; }
  };
}

/* Resumo de um ano para a Visão geral (cartão "Margem da operação", lucro.js): as linhas do resultado com os
   mesmos dados e regras desta tela. Carrega o caixa uma vez; a tela aproveita o que já veio. */
async function resumo(fonte, hoje, ano){
  if(!E.fonte) E.fonte = fonte || null;
  if(!E.fonte) return null;
  if(!E.M){
    if(!E.espera) E.espera = Promise.resolve(E.fonte.carregar()).then(d => { if(!E.M){ E.dados = d; E.M = montar(d, hoje); E.versao++; } }).finally(() => { E.espera = null; });
    await E.espera;
  }
  const R = resultado(E.M.lancs, Number(ano), E.M.saldos, E.M.cfg.inicio);
  return {ano: R.ano, ultimoDia: E.M.ultimoDia, comMov: R.comMov.slice(), conferencia: R.conferencia.slice(),
    linhas: R.linhas.map(l => ({rot: l.rot, soma: l.soma, pos: l.pos, v: l.v.slice(), total: l.total}))};
}

raiz.RadarCaixa = {abrir, resumo};

})(typeof window !== 'undefined' ? window : globalThis);

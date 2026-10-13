/* Radar de Comissões · app (PWA)
   Liga o Radar ao banco do app: entrada por código (dono, sócios) ou nome + PIN (corretor),
   dados com atualização automática, uso sem internet com os últimos dados e avisos no celular.
   O código das telas é o mesmo do Radar; aqui fica só o que troca o ambiente do artifact pelo app. */
(function(){
'use strict';

const CFG = {
  url: 'https://rhgdztlhlqyhbbmioarm.supabase.co',
  chave: 'sb_publishable_ceb29zcFJiWznxyJ10k-tg_orA-Ht2d',
  versao: '202610122003',
  intervalo: 20000,          // atualização com o app aberto
  completaCada: 15 * 60000   // recarga completa de tempos em tempos
};

const K = {
  codigo: 'radar-app-codigo',
  nivel: 'radar-app-nivel',
  cache: 'radar-app-cache-v1',
  vapid: 'radar-app-vapid',
  operador: 'radar-operador',      // nome usado pelo Radar no histórico
  corretor: 'radar-corretor'       // marca o modo corretor no Radar
};
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const $ = id => document.getElementById(id);
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hora = t => new Date(t).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
function quando(t){ const d = new Date(t), h = new Date(); return (d.toDateString() === h.toDateString() ? 'hoje' : d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})) + ' às ' + hora(t); }
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const suportaPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* ---------- servidor ---------- */
async function rpc(fn, args, ms){
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms || 25000) : null;
  try{
    const r = await fetch(CFG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      headers: {'apikey': CFG.chave, 'Content-Type': 'application/json'},
      body: JSON.stringify(args || {})
    });
    const txt = await r.text();
    if(!r.ok){ const e = new Error(txt || ('HTTP ' + r.status)); e.status = r.status; e.body = txt; throw e; }
    return txt ? JSON.parse(txt) : null;
  }catch(e){
    if(!e.status){ const n = new Error('Sem conexão com a internet.'); n.rede = true; throw n; }
    throw e;
  }finally{ if(t) clearTimeout(t); }
}
function erroDoServidor(r){
  const m = {
    codigo_invalido: 'O acesso deste aparelho não vale mais. Entre de novo.',
    bloqueado: 'Acesso travado por tentativas erradas. Espere 15 minutos.',
    somente_leitura: 'Este acesso é só de leitura.',
    nao_encontrada: 'Essa venda não existe mais no banco.',
    dados_invalidos: 'Dados recusados pelo servidor.',
    id_invalido: 'Identificador de venda inválido.',
    pin_invalido: 'O PIN precisa ter de 4 a 8 números.',
    corretor_nao_encontrado: 'Salve o corretor antes de definir o PIN.'
  };
  const e = new Error(m[r && r.erro] || 'O servidor recusou a operação.');
  e.code = r && r.erro; return e;
}

/* ---------- estado ---------- */
let codigo = LS.get(K.codigo);
let sessao = null; try{ sessao = JSON.parse(LS.get(K.nivel) || 'null'); }catch(e){}
const est = { vendas: new Map(), logs: new Map(), acessos: new Map(), geral: null, rev: 0, carregado: false, atualizadoEm: 0, online: true };
const ouvintes = { vendas: new Set(), logs: new Set(), acessos: new Set(), geral: new Set() };
const pendentes = new Map();   // id da venda → escritas em andamento (não deixa a leitura antiga desfazer a tela)
let pendGeral = 0;
const nivel = () => sessao && sessao.nivel;

function snapDoc(id, dados){ return { id, exists: dados != null, data: () => dados == null ? undefined : clone(dados) }; }
function snapCol(nome){
  const docs = [...est[nome].values()].map(d => { const c = Object.assign({}, d); delete c.id; return snapDoc(d.id, c); });
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
}
function snapGeral(){ return snapDoc('geral', est.geral ? clone(est.geral) : null); }
function emitir(nome){
  const snap = nome === 'geral' ? snapGeral() : snapCol(nome);
  ouvintes[nome].forEach(o => { try{ o.cb(snap); }catch(e){ console.error(e); } });
}
function emitirTudo(){ ['geral', 'vendas', 'logs', 'acessos'].forEach(emitir); }

let cacheT = null;
function salvarCache(){
  clearTimeout(cacheT);
  cacheT = setTimeout(() => {
    LS.set(K.cache, JSON.stringify({ rev: est.rev, geral: est.geral, salvoEm: est.atualizadoEm || Date.now(),
      vendas: [...est.vendas.values()], logs: [...est.logs.values()], acessos: [...est.acessos.values()] }));
  }, 1500);
}
function lerCache(){
  try{
    const c = JSON.parse(LS.get(K.cache) || 'null'); if(!c || !Array.isArray(c.vendas)) return false;
    est.vendas = new Map(c.vendas.map(v => [v.id, v]));
    est.logs = new Map((c.logs || []).map(v => [v.id, v]));
    est.acessos = new Map((c.acessos || []).map(v => [v.id, v]));
    est.geral = c.geral || null; est.rev = Number(c.rev) || 0; est.atualizadoEm = c.salvoEm || 0; est.carregado = true;
    return true;
  }catch(e){ return false; }
}

function aplicar(r){
  const mud = new Set();
  const pend = id => (pendentes.get(id) || 0) > 0;
  if(r.completo){
    const novo = new Map();
    (r.vendas || []).forEach(v => { if(!pend(v.id)) novo.set(v.id, v); });
    pendentes.forEach((n, id) => { if(n > 0 && est.vendas.has(id)) novo.set(id, est.vendas.get(id)); });
    est.vendas = novo;
    est.logs = new Map((r.logs || []).map(v => [v.id, v]));
    est.acessos = new Map((r.acessos || []).map(v => [v.id, v]));
    ['vendas', 'logs', 'acessos'].forEach(n => mud.add(n));
  }else{
    (r.vendas || []).forEach(v => { if(!pend(v.id)){ est.vendas.set(v.id, v); mud.add('vendas'); } });
    (r.removidas || []).forEach(id => { if(!pend(id) && est.vendas.delete(id)) mud.add('vendas'); });
    (r.logs || []).forEach(v => { est.logs.set(v.id, v); mud.add('logs'); });
    (r.acessos || []).forEach(v => { est.acessos.set(v.id, v); mud.add('acessos'); });
  }
  if(r.geral && !pendGeral){ est.geral = r.geral; mud.add('geral'); }
  const primeira = !est.carregado;
  est.rev = Number(r.rev) || 0; est.carregado = true; est.atualizadoEm = Date.now();
  if(primeira){ emitirTudo(); setTimeout(irParaHash, 300); } else ['geral', 'vendas', 'logs', 'acessos'].forEach(n => { if(mud.has(n)) emitir(n); });
  if(mud.size || primeira) salvarCache();
}

/* ---------- abrir direto numa tela (toque no aviso) ---------- */
const TELAS = { cobrancas: 'cobrancas', extrato: 'brokers', repasses: 'repasses', receber: 'installments' };
function irParaHash(){
  const alvo = TELAS[(location.hash || '').slice(1)];
  if(!alvo || !est.carregado) return;
  const b = document.querySelector('#nav [data-v="' + alvo + '"]');
  if(!b) return;
  b.click();
  history.replaceState(null, '', location.pathname + location.search);
}
window.addEventListener('hashchange', irParaHash);

/* ---------- atualização automática ---------- */
let rodando = null, deNovo = false, ultimaCompleta = 0, timer = null;
async function atualizar(forcar){
  if(!codigo) return;
  if(rodando){ deNovo = true; return rodando; }
  rodando = (async () => {
    const completa = forcar || !est.carregado || Date.now() - ultimaCompleta > CFG.completaCada;
    try{
      const r = await rpc('radar_dados', {p_codigo: codigo, p_desde: completa ? 0 : est.rev});
      if(r && r.ok === false){ acessoRecusado(r); return; }
      if(r.nivel && sessao && (r.nivel !== sessao.nivel || (r.corretor || null) !== (sessao.corretor || null))){ trocouNivel(); return; }
      aplicar(r);
      if(r.completo) ultimaCompleta = Date.now();
      estadoConexao(true);
    }catch(e){ estadoConexao(false); }
  })();
  try{ await rodando; }finally{ rodando = null; if(deNovo){ deNovo = false; setTimeout(() => atualizar(), 60); } }
}
let atualizarT = null;
function atualizarLogo(ms){ clearTimeout(atualizarT); atualizarT = setTimeout(() => atualizar(), ms || 400); }
function ciclo(){
  clearInterval(timer);
  timer = setInterval(() => { if(!document.hidden) atualizar(); }, CFG.intervalo);
}
document.addEventListener('visibilitychange', () => { if(!document.hidden && codigo) atualizar(); });
window.addEventListener('online', () => { if(codigo) atualizar(); });
window.addEventListener('focus', () => { if(codigo && Date.now() - est.atualizadoEm > 5000) atualizar(); });

function estadoConexao(ok){
  est.online = ok;
  const b = $('banner');
  if(b){
    if(ok){ if(b.dataset.ra){ b.classList.remove('show'); b.textContent = ''; delete b.dataset.ra; } }
    else if(est.carregado){ b.textContent = 'Sem internet. Mostrando os dados de ' + quando(est.atualizadoEm) + '; as alterações ficam bloqueadas até a conexão voltar.'; b.classList.add('show'); b.dataset.ra = '1'; }
  }
  const fd = $('footDetail');
  if(fd && est.carregado) fd.textContent = (ok ? 'Atualizado ' : 'Sem internet · dados de ') + quando(est.atualizadoEm);
  pintarPainel();
}

/* ---------- escrita ---------- */
let fila = Promise.resolve();
function enfileirar(fn){ const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; }
function operador(){ return LS.get(K.operador) || (sessao && sessao.corretor) || ''; }
async function escrever(fn, args){
  if(nivel() !== 'admin') throw erroDoServidor({erro: 'somente_leitura'});
  let r;
  try{ r = await enfileirar(() => rpc(fn, Object.assign({p_codigo: codigo}, args))); }
  catch(e){ if(e.rede){ estadoConexao(false); throw new Error('Sem internet: a alteração não foi salva.'); } throw e; }
  if(r && r.ok === false){ if(r.erro === 'codigo_invalido'){ acessoRecusado(r); } throw erroDoServidor(r); }
  atualizarLogo(500);
  return r;
}
function marcar(id, d){ pendentes.set(id, (pendentes.get(id) || 0) + d); if(pendentes.get(id) <= 0) pendentes.delete(id); }
function escritaVenda(id, mudar, fn, args){
  const antes = est.vendas.has(id) ? est.vendas.get(id) : undefined;
  mudar();
  emitir('vendas');
  marcar(id, 1);
  return escrever(fn, args).then(r => { marcar(id, -1); return r; }, e => {
    marcar(id, -1);
    if(antes === undefined) est.vendas.delete(id); else est.vendas.set(id, antes);
    emitir('vendas'); throw e;
  });
}
const novoId = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join('');

/* ---------- a mesma interface de banco que o Radar usa ---------- */
function ouvir(nome, cb, erro){
  const o = {cb, erro};
  ouvintes[nome].add(o);
  if(est.carregado) setTimeout(() => { if(ouvintes[nome].has(o)) cb(nome === 'geral' ? snapGeral() : snapCol(nome)); }, 0);
  return () => ouvintes[nome].delete(o);
}
function refDoc(col, id){
  return {
    id,
    onSnapshot(cb, erro){ if(col === 'config' && id === 'geral') return ouvir('geral', cb, erro); return () => {}; },
    async get(){ if(col === 'config' && id === 'geral') return snapGeral(); if(col === 'vendas'){ const v = est.vendas.get(id); if(!v) return snapDoc(id, null); const c = Object.assign({}, v); delete c.id; return snapDoc(id, c); } return snapDoc(id, null); },
    set(dados){
      dados = clone(dados) || {};
      if(col === 'vendas') return escritaVenda(id, () => est.vendas.set(id, Object.assign({}, dados, {id})), 'radar_venda_salvar', {p_id: id, p_dados: dados, p_quem: operador()});
      if(col === 'config' && id === 'geral'){
        const antes = est.geral; est.geral = dados; emitir('geral'); pendGeral++;
        return escrever('radar_ajustes_salvar', {p_geral: dados, p_quem: operador()})
          .then(r => { pendGeral--; return r; }, e => { pendGeral--; est.geral = antes; emitir('geral'); throw e; });
      }
      if(col === 'resumo') return escrever('radar_resumo_salvar', {p_dados: dados});
      return Promise.reject(new Error('Coleção não usada pelo app: ' + col));
    },
    update(campos){
      campos = clone(campos) || {};
      if(col !== 'vendas') return this.set(Object.assign({}, col === 'config' ? est.geral : {}, campos));
      return escritaVenda(id, () => { const v = est.vendas.get(id); if(v) est.vendas.set(id, Object.assign({}, v, campos)); }, 'radar_venda_atualizar', {p_id: id, p_campos: campos, p_quem: operador()});
    },
    delete(){
      if(col !== 'vendas') return Promise.reject(new Error('Exclusão não usada pelo app: ' + col));
      return escritaVenda(id, () => est.vendas.delete(id), 'radar_venda_apagar', {p_id: id, p_quem: operador()});
    }
  };
}
function refCol(nome){
  return {
    onSnapshot(cb, erro){ return ouvintes[nome] ? ouvir(nome, cb, erro) : () => {}; },
    doc(id){ return refDoc(nome, id || novoId()); },
    async add(dados){
      dados = clone(dados) || {};
      if(nome === 'acessos'){
        const disp = dados.dispositivo === 'celular' ? 'celular' : 'computador';
        const r = await rpc('radar_acesso', {p_codigo: codigo, p_dados: {quem: dados.quem || operador(), dispositivo: disp}}).catch(() => null);
        atualizarLogo(800); return {id: null, ok: !!(r && r.ok)};
      }
      if(nome === 'logs'){
        const id = novoId();
        est.logs.set(id, Object.assign({}, dados, {id})); emitir('logs');
        try{ await escrever('radar_log', {p_id: id, p_dados: dados}); }
        catch(e){ est.logs.delete(id); emitir('logs'); throw e; }
        return {id};
      }
      throw new Error('Coleção não usada pelo app: ' + nome);
    }
  };
}
const banco = {
  collection: nome => refCol(nome),
  doc: caminho => { const p = String(caminho).split('/'); return refDoc(p[0], p[1]); }
};

/* ---------- arquivos (planilha, PDF, backup) ---------- */
const TIPOS = {csv: 'text/csv;charset=utf-8', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', json: 'application/json'};
const arquivos = {
  async save(o){
    const nome = (o && (o.filename || o.name)) || 'arquivo';
    const ext = (nome.split('.').pop() || '').toLowerCase();
    const data = o && o.data;
    const blob = data instanceof Blob ? data : new Blob([data], {type: (o && o.mimeType) || TIPOS[ext] || 'application/octet-stream'});
    const toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if(toque && navigator.canShare && typeof File === 'function'){
      const f = new File([blob], nome, {type: blob.type});
      if(navigator.canShare({files: [f]})){
        try{ await navigator.share({files: [f], title: nome}); return {ok: true}; }
        catch(e){ if(e && e.name === 'AbortError'){ const d = new Error('declined'); d.code = 'declined'; throw d; } }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return {ok: true};
  }
};

/* ---------- quem está usando ---------- */
const usuario = {
  async me(){ return {id: null, name: operador(), isOwner: nivel() === 'admin', canEdit: nivel() === 'admin'}; },
  async can(){ return nivel() === 'admin'; },
  async isOwner(){ return nivel() === 'admin'; },
  async canEdit(){ return nivel() === 'admin'; }
};

let liberar; const pronto = new Promise(r => { liberar = r; });
window.claude = {
  async use(nome){
    if(nome === 'downloads') return arquivos;
    await pronto;
    if(nome === 'db') return banco;
    if(nome === 'user') return usuario;
    return null;
  }
};

/* ---------- entrada ---------- */
const CSS = `
.ra-gate{position:fixed;inset:0;z-index:80;display:flex;padding:24px 16px calc(24px + env(safe-area-inset-bottom,0px));background:var(--ground);overflow:auto}
.ra-card{margin:auto;width:100%;max-width:400px;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:26px 22px 22px;display:flex;flex-direction:column;gap:14px}
.ra-card .ra-logo{width:132px;height:auto;margin:0 auto 2px;display:block}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .ra-card .ra-logo{filter:drop-shadow(0 0 1px rgba(255,255,255,.25))}}
.ra-card h2{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:22px;font-weight:600;text-align:center;color:var(--ink);margin:0}
.ra-card p{margin:0;color:var(--ink-2);font-size:14px;line-height:1.5}
.ra-abas{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line-strong);border-radius:11px;padding:3px;gap:3px;background:var(--surface-2)}
.ra-abas button{min-height:40px;border:0;border-radius:8px;background:none;color:var(--ink-2);font-weight:700;font-size:13.5px}
.ra-abas button[aria-selected="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(11,42,111,.12)}
.ra-campo{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--ink-2)}
.ra-campo input,.ra-campo select{width:100%;max-width:100%;min-width:0;min-height:48px;border:1px solid var(--line-strong);border-radius:10px;padding:0 14px;background:var(--surface);color:var(--ink);font:inherit;font-size:16px}
.ra-campo input.ra-codigo{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:19px;letter-spacing:.1em;text-align:center;text-transform:uppercase}
.ra-campo input.ra-pin{font-size:22px;letter-spacing:.35em;text-align:center}
.ra-campo input:focus,.ra-campo select:focus,.ra-abas button:focus-visible,.ra-btn:focus-visible,.ra-link:focus-visible,.ra-x:focus-visible,.ra-sino:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.ra-erro{min-height:20px;margin:-4px 0 -6px;color:var(--crit);font-size:13px;font-weight:600}
.ra-btn{min-height:48px;border-radius:11px;border:1px solid var(--blue);background:var(--blue);color:#fff;font-weight:700;font-size:15px;transition:transform .12s ease-out,opacity .12s}
.ra-btn:active{transform:scale(.98)}
.ra-btn[disabled]{opacity:.6;cursor:progress}
.ra-btn.sec{background:var(--surface);color:var(--ink);border-color:var(--line-strong)}
.ra-link{background:none;border:0;color:var(--blue);font-weight:700;font-size:13.5px;min-height:44px}
.ra-nota{font-size:12.5px;color:var(--muted);text-align:center}
.ra-sino{width:40px;height:40px;flex:none;border-radius:11px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-2);display:grid;place-items:center;position:relative}
.ra-sino svg{width:19px;height:19px}
.ra-sino .ra-ponto{position:absolute;top:7px;right:8px;width:8px;height:8px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 2px var(--surface)}
.ra-fundo{position:fixed;inset:0;z-index:70;background:rgba(9,18,38,.42);display:flex;justify-content:flex-end;animation:ra-entra .2s ease-out}
.ra-painel{width:min(420px,100%);height:100%;overflow:auto;background:var(--surface);border-left:1px solid var(--line);padding:18px 18px calc(22px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:4px;animation:ra-lado .26s cubic-bezier(.2,.7,.3,1)}
.ra-painel header{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.ra-painel header h2{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:18px;font-weight:600;color:var(--ink);margin:0;flex:1}
.ra-x{width:40px;height:40px;border-radius:50%;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-2);font-size:20px;line-height:1}
.ra-sec{border-top:1px solid var(--line);padding:16px 0 14px;display:flex;flex-direction:column;gap:10px}
.ra-sec:first-of-type{border-top:0}
.ra-sec h3{font-family:"Sora","Manrope",system-ui,sans-serif;font-size:15px;font-weight:600;color:var(--ink);margin:0}
.ra-sec p,.ra-sec li{font-size:13.5px;color:var(--ink-2);line-height:1.55;margin:0}
.ra-sec ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
.ra-linha{display:flex;gap:8px;flex-wrap:wrap}
.ra-linha .ra-btn{flex:1;min-width:140px;min-height:44px;font-size:14px}
.ra-msg{font-size:13px;border-radius:10px;padding:9px 11px;background:var(--surface-2);color:var(--ink-2)}
.ra-msg.bom{background:var(--good-bg);color:var(--good)}
.ra-msg.ruim{background:var(--crit-bg);color:var(--crit)}
.ra-dado{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;color:var(--ink-2)}
.ra-dado b{color:var(--ink);font-weight:700;text-align:right}
.ra-nova{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:65;display:flex;gap:10px;align-items:center;background:var(--ink);color:var(--surface);border-radius:12px;padding:10px 12px 10px 16px;font-size:13.5px;box-shadow:var(--shadow)}
.ra-nova button{min-height:36px;border:0;border-radius:9px;background:var(--blue);color:#fff;font-weight:700;padding:0 12px}
@media (min-width: 821px){.ra-nova{bottom:24px}}
@media (max-width: 820px){.ra-fundo{align-items:flex-end}.ra-painel{height:auto;max-height:92vh;border-left:0;border-radius:18px 18px 0 0;animation:ra-sobe .26s cubic-bezier(.2,.7,.3,1)}}
@keyframes ra-entra{from{opacity:0}to{opacity:1}}
@keyframes ra-lado{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes ra-sobe{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion: reduce){.ra-fundo,.ra-painel{animation:none}.ra-btn{transition:none}}
`;
const estilo = document.createElement('style'); estilo.textContent = CSS; document.head.appendChild(estilo);

let gateModo = 'time', gateVoltar = false, nomesCorretores = null;
function montarGate(){
  if($('raGate')) return $('raGate');
  const g = document.createElement('div');
  g.className = 'ra-gate'; g.id = 'raGate'; g.hidden = true;
  g.innerHTML = `
  <form class="ra-card" id="raForm" autocomplete="off" novalidate>
    <img class="ra-logo" src="logo.png" alt="Fortal Inteligência Imobiliária">
    <h2>Radar de Comissões</h2>
    <div class="ra-abas" role="tablist" aria-label="Tipo de acesso">
      <button type="button" role="tab" id="raAbaTime" aria-selected="true" data-modo="time">Código da equipe</button>
      <button type="button" role="tab" id="raAbaCor" aria-selected="false" data-modo="corretor">Sou corretor</button>
    </div>
    <div id="raPTime">
      <p>Digite o código que a Fortal te passou. Ele fica salvo neste aparelho.</p>
      <label class="ra-campo" style="margin-top:12px">Código<input id="raCod" class="ra-codigo" name="codigo" inputmode="text" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="XXXX-XXXX-XXXX" maxlength="40"></label>
    </div>
    <div id="raPCor" hidden>
      <p>Escolha o seu nome e digite o seu PIN. Você vê só as suas vendas, comissões e repasses.</p>
      <label class="ra-campo" style="margin-top:12px">Corretor<select id="raNome"><option value="">Carregando…</option></select></label>
      <label class="ra-campo" style="margin-top:10px">PIN<input id="raPin" class="ra-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="••••"></label>
    </div>
    <div id="raPNome" hidden>
      <p>Como a gente te chama? O nome aparece no histórico de acessos e nas alterações feitas por este aparelho.</p>
      <label class="ra-campo" style="margin-top:12px">Seu nome<input id="raNomeOp" maxlength="40" autocomplete="name" placeholder="Ex.: Luiz"></label>
    </div>
    <div class="ra-erro" id="raErro" role="alert"></div>
    <button class="ra-btn" type="submit" id="raOk">Entrar</button>
    <button class="ra-link" type="button" id="raVoltar" hidden>Voltar sem trocar</button>
    <p class="ra-nota" id="raNota"></p>
  </form>`;
  document.body.appendChild(g);
  g.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => modoGate(b.dataset.modo)));
  $('raForm').addEventListener('submit', e => { e.preventDefault(); enviarGate(); });
  $('raVoltar').addEventListener('click', () => { g.hidden = true; gateVoltar = false; });
  $('raCod').addEventListener('input', e => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const f = v.replace(/(.{4})(?=.)/g, '$1-');
    if(f !== e.target.value) e.target.value = f;
  });
  return g;
}
function modoGate(m){
  gateModo = m;
  $('raAbaTime').setAttribute('aria-selected', String(m === 'time'));
  $('raAbaCor').setAttribute('aria-selected', String(m === 'corretor'));
  $('raPTime').hidden = m !== 'time'; $('raPCor').hidden = m !== 'corretor'; $('raPNome').hidden = m !== 'nome';
  document.querySelector('.ra-abas').hidden = m === 'nome';
  $('raOk').textContent = m === 'nome' ? 'Continuar' : 'Entrar';
  $('raErro').textContent = '';
  if(m === 'corretor') carregarNomes();
  setTimeout(() => { const f = m === 'time' ? $('raCod') : m === 'nome' ? $('raNomeOp') : ($('raNome').value ? $('raPin') : $('raNome')); if(f) f.focus(); }, 60);
}
async function carregarNomes(){
  const s = $('raNome');
  if(nomesCorretores){ preencher(); return; }
  s.innerHTML = '<option value="">Carregando…</option>';
  try{ nomesCorretores = await rpc('radar_corretores_acesso', {}); preencher(); }
  catch(e){ s.innerHTML = '<option value="">Sem conexão</option>'; $('raErro').textContent = 'Sem conexão. Confira a internet e toque em "Sou corretor" de novo.'; }
  function preencher(){
    if(!nomesCorretores || !nomesCorretores.length){ s.innerHTML = '<option value="">Nenhum corretor com PIN</option>'; $('raErro').textContent = 'Ainda não há corretor com PIN. Peça o seu à Fortal.'; return; }
    const ult = LS.get('radar-app-ultimo-corretor');
    s.innerHTML = '<option value="">Escolha o seu nome</option>' + nomesCorretores.map(n => `<option${n === ult ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
}
async function enviarGate(){
  const ok = $('raOk'), err = $('raErro');
  err.textContent = '';
  if(gateModo === 'nome'){
    const n = $('raNomeOp').value.trim();
    if(!n){ err.textContent = 'Digite o seu nome.'; $('raNomeOp').focus(); return; }
    LS.set(K.operador, n);
    if(iniciado){ location.reload(); return; }
    $('raGate').hidden = true; iniciar(); return;
  }
  let cod;
  if(gateModo === 'time'){
    cod = $('raCod').value.trim().toUpperCase();
    if(cod.replace(/-/g, '').length < 8){ err.textContent = 'Digite o código completo.'; $('raCod').focus(); return; }
  }else{
    const nome = $('raNome').value, pin = $('raPin').value.trim();
    if(!nome){ err.textContent = 'Escolha o seu nome.'; $('raNome').focus(); return; }
    if(!/^\d{4,8}$/.test(pin)){ err.textContent = 'O PIN tem de 4 a 8 números.'; $('raPin').focus(); return; }
    cod = 'C:' + nome + '|' + pin;
  }
  ok.disabled = true; ok.textContent = 'Conferindo…';
  try{
    const r = await rpc('radar_entrar', {p_codigo: cod});
    if(!r || !r.ok){
      err.textContent = r && r.erro === 'bloqueado' ? 'Muitas tentativas erradas. Espere 15 minutos ou peça um PIN novo à Fortal.'
        : gateModo === 'time' ? 'Código incorreto. Confira com a Fortal.' : 'PIN incorreto. Confira com a Fortal.';
      return;
    }
    const trocando = !!codigo;
    LS.set(K.codigo, cod);
    LS.set(K.nivel, JSON.stringify({nivel: r.nivel, corretor: r.corretor || null}));
    if(r.vapid) LS.set(K.vapid, r.vapid);
    LS.del(K.cache);
    if(r.nivel === 'corretor'){ LS.set(K.corretor, JSON.stringify({nome: r.corretor})); LS.set(K.operador, r.corretor); LS.set('radar-app-ultimo-corretor', r.corretor); }
    else LS.del(K.corretor);
    if(trocando){ location.reload(); return; }
    codigo = cod; sessao = {nivel: r.nivel, corretor: r.corretor || null};
    if(r.nivel !== 'corretor' && !LS.get(K.operador)){ modoGate('nome'); return; }
    $('raGate').hidden = true;
    iniciar();
  }catch(e){
    err.textContent = e && e.rede ? 'Sem conexão. Confira a internet e tente de novo.' : 'Não deu para entrar agora. Tente de novo em instantes.';
  }finally{ ok.disabled = false; ok.textContent = gateModo === 'nome' ? 'Continuar' : 'Entrar'; }
}
function mostrarGate(modo, opts){
  const g = montarGate(); const o = opts || {};
  gateVoltar = !!o.voltar;
  $('raVoltar').hidden = !gateVoltar;
  $('raNota').textContent = o.nota || '';
  g.hidden = false;
  modoGate(modo || 'time');
}

/* ---------- saída e troca de acesso ---------- */
function limparSessao(){
  [K.codigo, K.nivel, K.cache, K.corretor, 'radar-last-access'].forEach(k => LS.del(k));
}
function acessoRecusado(r){
  if(r && r.erro === 'bloqueado'){ estadoConexao(false); return; }
  limparSessao();
  location.replace(location.pathname + '?saiu=codigo');
}
function trocouNivel(){ LS.del(K.cache); location.reload(); }
function confirmar(titulo, texto, sim){
  return new Promise(res => {
    const f = document.createElement('div');
    f.className = 'ra-fundo'; f.style.justifyContent = 'center'; f.style.alignItems = 'center'; f.style.padding = '16px';
    f.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" style="width:min(380px,100%)"><h2 style="font-size:18px;text-align:left">${esc(titulo)}</h2><p>${esc(texto)}</p><div class="ra-linha"><button class="ra-btn sec" type="button" data-r="0">Cancelar</button><button class="ra-btn" type="button" data-r="1">${esc(sim)}</button></div></div>`;
    document.body.appendChild(f);
    const fim = v => { f.remove(); res(v); };
    f.addEventListener('click', e => { if(e.target === f) fim(false); const b = e.target.closest('[data-r]'); if(b) fim(b.dataset.r === '1'); });
    setTimeout(() => f.querySelector('[data-r="1"]').focus(), 50);
  });
}
async function sair(){
  const c = nivel() === 'corretor';
  const ok = await confirmar('Sair deste aparelho?', c ? 'Para entrar de novo você vai precisar do seu PIN.' : 'Para entrar de novo você vai precisar do código da equipe.', 'Sair');
  if(!ok) return;
  try{ const s = await assinatura(); if(s){ await rpc('radar_desinscrever', {p_endpoint: s.endpoint}).catch(() => {}); await s.unsubscribe().catch(() => {}); } }catch(e){}
  limparSessao();
  location.replace(location.pathname);
}

/* ---------- avisos no celular ---------- */
function b64u(s){ const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
let swReg = null;
async function reg(){ if(swReg) return swReg; if(!('serviceWorker' in navigator)) return null; swReg = await navigator.serviceWorker.ready; return swReg; }
async function assinatura(){ try{ const r = await reg(); return r && r.pushManager ? await r.pushManager.getSubscription() : null; }catch(e){ return null; } }
async function chaveVapid(){
  let v = LS.get(K.vapid);
  if(v) return v;
  try{ const r = await rpc('radar_entrar', {p_codigo: codigo}); if(r && r.ok && r.vapid){ LS.set(K.vapid, r.vapid); return r.vapid; } }catch(e){}
  return null;
}
function mesmaChave(sub, vapid){
  try{ const a = new Uint8Array(sub.options.applicationServerKey), b = b64u(vapid); return a.length === b.length && a.every((x, i) => x === b[i]); }catch(e){ return true; }
}
function apelidoAparelho(){
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Navegador';
  return (operador() ? operador() + ' · ' : '') + so;
}
async function ativarAvisos(){
  if(!suportaPush) throw new Error(isIOS && !standalone() ? 'No iPhone, primeiro coloque o app na Tela de Início (passo a passo logo abaixo) e abra por lá.' : 'Este navegador não recebe avisos. No Android use o Chrome; no iPhone, o app instalado na Tela de Início.');
  const vapid = await chaveVapid();
  if(!vapid) throw new Error('Os avisos ainda não foram ligados no servidor. A Fortal avisa quando estiverem prontos.');
  const perm = await Notification.requestPermission();
  if(perm !== 'granted') throw new Error('Os avisos ficaram bloqueados para este site. Libere nas configurações do navegador e tente de novo.');
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if(sub && !mesmaChave(sub, vapid)){ await sub.unsubscribe().catch(() => {}); sub = null; }
  if(!sub) sub = await r.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64u(vapid)});
  const j = sub.toJSON();
  const res = await rpc('radar_inscrever', {p_codigo: codigo, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_apelido: apelidoAparelho()});
  if(res && res.ok === false) throw erroDoServidor(res);
  return sub;
}

/* ---------- painel "Avisos e app" ---------- */
let instalarEvt = null, novaVersao = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; pintarPainel(); });
window.addEventListener('appinstalled', () => { instalarEvt = null; pintarPainel(); });
const SINO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>';
function botaoSino(){
  const tb = document.querySelector('.topbar');
  if(!tb || $('raSino')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'raSino'; b.className = 'ra-sino'; b.title = 'Avisos e app'; b.setAttribute('aria-label', 'Avisos no celular e dados do app');
  b.innerHTML = SINO + '<span class="ra-ponto" id="raPonto" hidden></span>';
  const ref = tb.querySelector('.period');
  if(ref) tb.insertBefore(b, ref); else tb.appendChild(b);
  b.addEventListener('click', abrirPainel);
  assinatura().then(s => { const p = $('raPonto'); if(p) p.hidden = !!s || !suportaPush && !isIOS; });
}
function textoNivel(){
  const n = nivel();
  if(n === 'admin') return 'Dono, pode alterar tudo';
  if(n === 'time') return 'Sócio, só leitura';
  if(n === 'corretor') return 'Corretor: ' + (sessao.corretor || '');
  return '—';
}
function passosInstalar(){
  if(standalone()) return '<p>Você já está usando o app instalado.</p>';
  if(isIOS) return '<ol><li>Abra este endereço no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li><li>Abra o Radar pelo ícone novo. Os avisos só funcionam no iPhone a partir dele.</li></ol>';
  if(isAndroid) return (instalarEvt ? '<div class="ra-linha"><button class="ra-btn" type="button" id="raInstalar">Instalar o app</button></div>' : '') + '<ol><li>No <b>Chrome</b>, toque nos três pontinhos no canto de cima.</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Abra o Radar pelo ícone novo.</li></ol>';
  return (instalarEvt ? '<div class="ra-linha"><button class="ra-btn" type="button" id="raInstalar">Instalar no computador</button></div>' : '') + '<p>No celular, abra este mesmo endereço e siga o passo a passo que aparece aqui.</p>';
}
function textoAvisos(){
  return nivel() === 'corretor'
    ? 'Avisa quando a Fortal registrar um repasse para você.'
    : 'Todo dia às 8h: o que está previsto para cair, clientes com parcela vencida e construtoras atrasadas.';
}
async function pintarPainel(){
  const p = $('raPainel'); if(!p) return;
  const s = await assinatura();
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  $('raAvSt').textContent = !suportaPush ? (isIOS && !standalone() ? 'No iPhone, os avisos funcionam depois de colocar o app na Tela de Início.' : 'Este navegador não recebe avisos.')
    : s ? 'Ligados neste aparelho.' : perm === 'denied' ? 'Bloqueados nas configurações do navegador.' : 'Desligados neste aparelho.';
  $('raAvOn').hidden = !!s || !suportaPush; $('raAvTeste').hidden = !s; $('raAvOff').hidden = !s;
  $('raInst').innerHTML = passosInstalar();
  const bi = $('raInstalar'); if(bi) bi.addEventListener('click', async () => { if(!instalarEvt) return; instalarEvt.prompt(); try{ await instalarEvt.userChoice; }catch(e){} instalarEvt = null; pintarPainel(); });
  $('raAtual').textContent = est.atualizadoEm ? (est.online ? quando(est.atualizadoEm) : 'sem internet, dados de ' + quando(est.atualizadoEm)) : 'carregando…';
  $('raNovaLinha').hidden = !novaVersao;
  const ponto = $('raPonto'); if(ponto) ponto.hidden = !!s || (!suportaPush && !isIOS);
}
function msgAv(t, tipo){ const m = $('raAvMsg'); m.textContent = t || ''; m.className = 'ra-msg' + (tipo ? ' ' + tipo : ''); m.hidden = !t; }
function abrirPainel(){
  if($('raPainel')) return;
  const f = document.createElement('div');
  f.className = 'ra-fundo'; f.id = 'raPainelFundo';
  const op = operador();
  f.innerHTML = `<aside class="ra-painel" id="raPainel" role="dialog" aria-modal="true" aria-labelledby="raPainelT">
    <header><h2 id="raPainelT">Avisos e app</h2><button class="ra-x" type="button" id="raFechar" aria-label="Fechar">×</button></header>
    <section class="ra-sec">
      <h3>Avisos no celular</h3>
      <p>${esc(textoAvisos())}</p>
      <p id="raAvSt">…</p>
      <div class="ra-linha"><button class="ra-btn" type="button" id="raAvOn">Ligar avisos</button><button class="ra-btn sec" type="button" id="raAvTeste" hidden>Mandar um teste</button><button class="ra-btn sec" type="button" id="raAvOff" hidden>Desligar</button></div>
      <div class="ra-msg" id="raAvMsg" hidden></div>
    </section>
    <section class="ra-sec">
      <h3>Ícone na tela do celular</h3>
      <div id="raInst"></div>
    </section>
    <section class="ra-sec">
      <h3>Este aparelho</h3>
      <div class="ra-dado"><span>Acesso</span><b>${esc(textoNivel())}</b></div>
      ${nivel() !== 'corretor' ? `<div class="ra-dado"><span>Nome no histórico</span><b>${esc(op || 'sem nome')}</b></div>` : ''}
      <div class="ra-dado"><span>Dados atualizados</span><b id="raAtual">…</b></div>
      <div class="ra-linha" id="raNovaLinha" hidden><button class="ra-btn" type="button" id="raRecarregar">Abrir a versão nova do app</button></div>
      <div class="ra-linha">${nivel() !== 'corretor' ? '<button class="ra-btn sec" type="button" id="raTrocaNome">Trocar o nome</button>' : ''}<button class="ra-btn sec" type="button" id="raSair">Sair deste aparelho</button></div>
      <p class="ra-nota" style="text-align:left">Versão ${esc(CFG.versao)}</p>
    </section>
  </aside>`;
  document.body.appendChild(f);
  const fechar = () => { f.remove(); document.removeEventListener('keydown', tecla); const b = $('raSino'); if(b) b.focus(); };
  const tecla = e => { if(e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  f.addEventListener('click', e => { if(e.target === f) fechar(); });
  $('raFechar').addEventListener('click', fechar);
  $('raSair').addEventListener('click', () => { fechar(); sair(); });
  const tn = $('raTrocaNome'); if(tn) tn.addEventListener('click', () => { fechar(); mostrarGate('nome', {voltar: true}); $('raNomeOp').value = operador(); });
  $('raRecarregar').addEventListener('click', () => location.reload());
  $('raAvOn').addEventListener('click', async () => {
    const b = $('raAvOn'); b.disabled = true; msgAv('');
    try{
      const sub = await ativarAvisos();
      await rpc('radar_testar_aviso', {p_codigo: codigo, p_endpoint: sub.endpoint}).catch(() => {});
      msgAv('Avisos ligados. Mandamos um aviso de teste para este aparelho.', 'bom');
    }catch(e){ msgAv(e && e.message ? e.message : 'Não deu certo agora.', 'ruim'); }
    finally{ b.disabled = false; pintarPainel(); }
  });
  $('raAvTeste').addEventListener('click', async () => {
    const s = await assinatura(); if(!s) return;
    try{ const r = await rpc('radar_testar_aviso', {p_codigo: codigo, p_endpoint: s.endpoint}); msgAv(r && r.ok === false ? 'Este aparelho não está mais cadastrado. Desligue e ligue os avisos de novo.' : 'Teste enviado. Deve chegar em alguns segundos.', r && r.ok === false ? 'ruim' : 'bom'); }
    catch(e){ msgAv('Sem conexão para mandar o teste.', 'ruim'); }
  });
  $('raAvOff').addEventListener('click', async () => {
    const s = await assinatura(); if(!s) return;
    await rpc('radar_desinscrever', {p_endpoint: s.endpoint}).catch(() => {});
    await s.unsubscribe().catch(() => {});
    msgAv('Avisos desligados neste aparelho.'); pintarPainel();
  });
  pintarPainel();
  setTimeout(() => $('raFechar').focus(), 60);
}

/* ---------- versão nova e trabalho em segundo plano ---------- */
function avisoNovaVersao(){
  novaVersao = true; pintarPainel();
  if($('raNova')) return;
  const d = document.createElement('div'); d.className = 'ra-nova'; d.id = 'raNova'; d.setAttribute('role', 'status');
  d.innerHTML = '<span>Há uma versão nova do app.</span><button type="button">Atualizar</button>';
  d.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(d);
}
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
  const tinha = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if(tinha) avisoNovaVersao(); });
  navigator.serviceWorker.addEventListener('message', ev => {
    const m = ev.data || {};
    if(m.tipo === 'atualizar') atualizar();
    if(m.tipo === 'abrir' && m.url){ try{ const u = new URL(m.url); if(u.hash) location.hash = u.hash; }catch(e){} atualizar(); }
  });
}

/* ---------- partida ---------- */
let iniciado = false;
function iniciar(){
  if(iniciado) return; iniciado = true;
  liberar();
  botaoSino();
  if(est.carregado){ estadoConexao(true); setTimeout(irParaHash, 700); }
  atualizar(!est.carregado).then(() => ciclo());
  // mantém o cadastro dos avisos deste aparelho em dia (nível, nome e chaves)
  setTimeout(async () => {
    const s = await assinatura(); const v = LS.get(K.vapid);
    if(!s || !v || !mesmaChave(s, v)) return;
    const j = s.toJSON();
    rpc('radar_inscrever', {p_codigo: codigo, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_apelido: apelidoAparelho()}).catch(() => {});
  }, 4000);
}
window.RadarApp = {
  sair,
  entrarComoCorretor(){ mostrarGate('corretor', {voltar: true, nota: 'O acesso atual continua até o PIN ser aceito.'}); },
  async definirPin(nome, pin){
    try{ await escrever('radar_definir_pin', {p_nome: nome, p_pin: pin, p_quem: operador()}); atualizarLogo(200); return true; }
    catch(e){ alerta(e.message); return false; }
  },
  nivel,
  atualizar: () => atualizar(true),
  abrirPainel
};
function alerta(t){ const el = $('toast'); if(!el) return; el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }

const saiu = /[?&]saiu=codigo/.test(location.search);
if(saiu) history.replaceState(null, '', location.pathname + location.hash);
if(codigo && sessao && sessao.nivel){
  if(sessao.nivel === 'corretor'){ LS.set(K.corretor, JSON.stringify({nome: sessao.corretor})); } else LS.del(K.corretor);
  lerCache();
  iniciar();
}else{
  limparSessao(); codigo = null; sessao = null;
  mostrarGate('time', {nota: saiu ? 'O acesso deste aparelho mudou. Digite o código ou o PIN de novo.' : ''});
}
})();

(function(){
if(typeof module!=='undefined') return;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=(d)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmt=(n,d=0)=>n==null||isNaN(n)?'—':nf(d).format(n);
const pct=(p)=>p==null?'—':(p<0.005?'<1%':fmt(p*100)+'%');
const pct1=(p)=>p==null?'—':fmt(p*100,1)+'%';
const eur=(v)=>v==null?'—':'€ '+fmt(v,2);
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesNome=k=>{ if(k==null||k===''||k<0) return '—'; const [a,m]=String(k).split('-'); return MESES[+m-1]+'/'+a; };
const EPOCH=Date.UTC(2025,0,1);
const dataDe=dia=>{ const d=new Date(EPOCH+dia*864e5); return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear(); };

const mesNomeX=k=>{ const [a,m]=String(k).split('-'); return MESES[+m-1]+'/'+a; };
const APP=window.APP={mods:{},ui:{$,$$,esc,fmt,pct,pct1,eur,mesNome,dataDe,nf}};
const estado=APP.estado={excl:false};
APP.escopo=()=>estado.excl?'sem':'com';
APP.semG=c=>estado.excl&&c==='G057';

async function carregar(){
  if(window.MODELO) return window.MODELO;
  try{ const r=await fetch('modelo.json'); return await r.json(); }catch(e){ return null; }
}

APP.iniciar=async function(){
  const M=await carregar();
  if(!M){ const e=$('#erro'); e.hidden=false; e.innerHTML='<b class="t">Não consegui carregar o modelo.</b> O arquivo <code>modelo.js</code> precisa estar na mesma pasta de <code>site.html</code>. Se você abriu o site de dentro de um zip, <b>extraia todos os arquivos</b> antes. Ou use o arquivo único <code>Transformation_Qualidade.html</code>, que não precisa de mais nada.'; return; }
  APP.M=M; APP.L=M.lst; APP.V=window.VINS||null; APP.motor=criarMotor(M); window.QUAL={M,motor:APP.motor};
  const L=APP.L;
  APP.pesos={}; L.dem.forEach(k=>APP.pesos[k]=L.pesos[k]);
  APP.famN=f=>M.fam_nomes[f]||f;
  APP.nome={
    elem:i=>L.elem[i]?`${L.elem[i][0]} · ${L.elem[i][1]}`:'?', inc:i=>L.inc[i]?`${L.inc[i][0]} · ${L.inc[i][1]}`:'?',
    def:i=>L.def[i]?L.def[i][0]:'?', tipo:i=>L.tipo[i]?L.tipo[i][0]:'?',
    cod:i=>i<0||!L.codes[i]?'(sem código)':L.codes[i][0], sint:i=>i<0||!L.codes[i]?'':L.codes[i][1],
    codsint:i=>i<0||!L.codes[i]?'(sem código)':`${L.codes[i][0]} · ${L.codes[i][1]||'(sem descrição)'}`,
    cmp:i=>i<0?'—':L.cmp[i], mod:i=>L.modelos[i]??'—'};
  APP.codIdx=new Map(L.codes.map((c,i)=>[c[0],i]));
  APP.evid=(n,p,q)=>(n>=30&&q!=null&&q<0.05)?'alto':((n>=10&&p!=null&&p<0.05)||(n>=5&&q!=null&&q<0.10))?'medio':'baixo';
  APP.badgeEvid=e=>`<span class="badge ${e}" title="${e==='alto'?'30+ carros e diferença confirmada após correção para muitos testes':e==='medio'?'diferença provável, mas poucos carros':'pode ser acaso'}">evidência ${{alto:'alta',medio:'média',baixo:'baixa'}[e]}</span>`;
  APP.demNome={'V1+':'V1+ crítico','V1':'V1','V2':'V2','V3':'V3','sem':'sem demérito (teste de função)'};
  APP.badgeDem=i=>{ const k=L.dem[i]; return `<span class="badge dem ${k==='V1+'?'d0':k==='V1'?'d1':''}" title="${esc(APP.demNome[k])}">${esc(k==='sem'?'sem demérito':k)}</span>`; };
  APP.nMes={}; L.meses.forEach(m=>APP.nMes[m]={dphu:0,gmf:0});
  for(const [e,mo,me,de,n] of M.cubos.dphu_elem) if(me>=0) APP.nMes[L.meses[me]].dphu+=n;
  for(const [cd,mo,me,n] of M.cubos.gmf) if(me>=0) APP.nMes[L.meses[me]].gmf+=n;
  APP.mesPouco=m=>(APP.nMes[m]?APP.nMes[m].dphu+APP.nMes[m].gmf:0)<30;
  APP.rotMes=m=>mesNomeX(m)+(APP.mesPouco(m)?' · poucos dados':'');
  APP.peso=k=>APP.pesos[k]??1;
  APP.badgeFonte=t=>`<span class="badge fonte">${esc(t)}</span>`;
  APP.sevElem=()=>{ // gravidade média de cada elemento do DPHU (pesos atuais)
    const acc=new Map(); for(const [e,mo,me,de,n] of M.cubos.dphu_elem){ const a=acc.get(e)||[0,0]; a[0]+=n*APP.peso(L.dem[de]); a[1]+=n; acc.set(e,a); }
    const o={}; acc.forEach((a,e)=>o[e]=a[0]/a[1]); return o; };
  APP.ordenar=(rows,qtd,grav,modo)=>rows.slice().sort((a,b)=>modo==='grav'?(grav(b)-grav(a))||(qtd(b)-qtd(a)):(qtd(b)-qtd(a))||(grav(b)-grav(a)));
  APP.segOrdem=(id,modo)=>`<span class="seg" role="group" aria-label="Ordenar por" id="${id}"><button type="button" data-o="qtd" aria-pressed="${modo==='qtd'}">quantidade</button><button type="button" data-o="grav" aria-pressed="${modo==='grav'}">gravidade</button></span>`;

  // post-it "o que é uma família?"
  let postitAberto=false;
  APP.postit=()=>{
    const S=M.stats[APP.escopo()], ncod={}; Object.keys(M.dic).forEach(c=>{ ncod[c[0]]=(ncod[c[0]]||0)+1; });
    const linhas=Object.entries(S.share).filter(([f])=>M.fam_nomes[f]&&S.n_fam[f]>=5).sort((a,b)=>b[1]-a[1])
      .map(([f,p])=>`<tr><td><b>${esc(f)}</b></td><td>${esc(M.fam_nomes[f])}</td><td class="n">${ncod[f]||0}</td><td class="n">${pct(p)}</td></tr>`).join('');
    return `<div class="postit" role="note" ${postitAberto?'':'hidden'}><button type="button" class="fechar" aria-label="Fechar nota">×</button>
      <h4>O que é uma "família"?</h4>
      <p>Todo código de sintoma começa com uma <b>letra</b> (G057, R187, B235…). Essa letra junta códigos parecidos numa mesma área do carro: é a <b>família</b>.</p>
      <table><thead><tr><th></th><th>Família</th><th class="n">Códigos</th><th class="n">% dos casos</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  };
  APP.btnAjuda='<button type="button" class="ajuda" aria-label="O que é uma família?" title="O que é uma família?">?</button>';
  APP.ligaPostit=raiz=>{
    const p=raiz.querySelector('.postit'), b=raiz.querySelector('.ajuda'); if(!p||!b) return;
    p.querySelector('.fechar').onclick=()=>{ postitAberto=false; p.hidden=true; b.setAttribute('aria-expanded','false'); };
    b.onclick=ev=>{ ev.preventDefault(); postitAberto=!postitAberto; p.hidden=!postitAberto; b.setAttribute('aria-expanded',postitAberto); };
    b.setAttribute('aria-expanded',postitAberto);
  };
  // seta que abre/fecha (reaproveitada)
  APP.seta=(ctl,alvo,aberto=false)=>`<button type="button" class="seta" data-alvo="${alvo}" aria-expanded="${aberto}" aria-controls="${alvo}" aria-label="${esc(ctl)}"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  APP.ligaSetas=raiz=>raiz.querySelectorAll('.seta[data-alvo]').forEach(b=>b.onclick=()=>{ const abre=b.getAttribute('aria-expanded')!=='true'; b.setAttribute('aria-expanded',abre); const el=document.getElementById(b.dataset.alvo); if(el){ el.hidden=!abre; if(abre&&b.dataset.lazy&&APP.lazy[b.dataset.lazy]) APP.lazy[b.dataset.lazy](el,b); } });
  APP.lazy={};

  // tema
  const temas=['auto','claro','escuro']; let ti=0;
  try{ const t=localStorage.getItem('qual_tema'); if(temas.includes(t)) ti=temas.indexOf(t); }catch(e){}
  const aplicaTema=()=>{ const t=temas[ti]; if(t==='auto') document.documentElement.removeAttribute('data-tema'); else document.documentElement.setAttribute('data-tema',t); $('#btnTema').textContent='Tema: '+t; try{localStorage.setItem('qual_tema',t)}catch(e){} };
  $('#btnTema').onclick=()=>{ ti=(ti+1)%3; aplicaTema(); }; aplicaTema();

  // nota do filtro G057: pode ser fechada
  try{ if(localStorage.getItem('qual_faixaG')==='fechada') $('#faixaG').hidden=true; }catch(e){}
  $('#fechaFaixa').onclick=()=>{ $('#faixaG').hidden=true; try{localStorage.setItem('qual_faixaG','fechada')}catch(e){} };

  // ---------- botão "?" com post-it (conteúdo vem de APP.textos[id], calculado na hora de abrir)
  const abertas=new Set(); APP.textos=APP.textos||{};
  APP.btnAj=(id,onde)=>`<button type="button" class="ajuda" data-aj="${id}"${onde?` data-onde="${onde}"`:''} aria-label="Mais informações" title="Mais informações" aria-expanded="false">?</button>`;
  const fechaAj=id=>{ const el=document.getElementById('aj_'+id); if(el) el.remove(); abertas.delete(id); document.querySelectorAll(`.ajuda[data-aj="${id}"]`).forEach(x=>x.setAttribute('aria-expanded','false')); };
  const abreAj=b=>{
    const id=b.dataset.aj; if(document.getElementById('aj_'+id)) return;
    const el=document.createElement('div'); el.className='postit'; el.id='aj_'+id; el.setAttribute('role','note');
    el.innerHTML=`<button type="button" class="fechar" aria-label="Fechar nota">×</button>${APP.textos[id]?APP.textos[id]():''}`;
    const sm=b.closest('summary');
    if(b.dataset.onde==='topo') document.querySelector('main').prepend(el);
    else if(sm){ sm.parentElement.open=true; sm.insertAdjacentElement('afterend',el); }
    else (b.closest('.grupo-tit,h3,h4,label')||b.parentElement).insertAdjacentElement('afterend',el);
    el.querySelector('.fechar').onclick=()=>fechaAj(id); b.setAttribute('aria-expanded','true'); abertas.add(id);
  };
  APP.ligaAjudas=raiz=>(raiz||document).querySelectorAll('.ajuda[data-aj]').forEach(b=>{
    b.onclick=ev=>{ ev.preventDefault(); ev.stopPropagation(); document.getElementById('aj_'+b.dataset.aj)?fechaAj(b.dataset.aj):abreAj(b); };
    if(abertas.has(b.dataset.aj)&&!document.getElementById('aj_'+b.dataset.aj)) abreAj(b);
  });

  // abas e interruptor
  APP.aoAbrirAba={};
  APP.irPara=id=>{ $$('.aba').forEach(a=>a.classList.toggle('ativa',a.id===id)); $$('.aba-btn').forEach(b=>b.setAttribute('aria-selected',b.dataset.aba===id)); window.scrollTo(0,0); if(APP.aoAbrirAba[id]) APP.aoAbrirAba[id](); };
  $$('.aba-btn').forEach(b=>b.onclick=()=>APP.irPara(b.dataset.aba));
  APP.redesenhar=()=>Object.values(APP.mods).forEach(m=>m.desenhar&&m.desenhar());
  $('#swG057').onchange=e=>{ estado.excl=e.target.checked; $('#swEstado').textContent=estado.excl?'G057 excluído':'G057 incluído'; APP.redesenhar(); };

  Object.values(APP.mods).forEach(m=>m.init&&m.init(APP));
  APP.redesenhar();
  APP.ligaAjudas(document);
};
})();

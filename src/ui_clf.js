(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {$,$$,esc,fmt,pct,pct1,eur}=A.ui;
const EXEMPLOS=[['Revisão de 10.000 km','REVISAO DE 10.000 KM'],['Luz de injeção','cliente alega luz de injecao acesa no painel'],['Barulho','cliente relata barulho na suspensao dianteira ao passar em buraco'],['Ar condicionado','AR CONDICIONADO NAO GELA'],['Vazamento','cliente alega vazamento de oleo no motor'],['Espanhol','SE CAE LA ANTENA DE RADIO SOBRE EL TECHO']];
let feito=false;

A.mods.clf={
  init(){
    const L=A.L; $('#a2modelo').innerHTML=L.modelos.map(m=>`<option>${esc(m)}</option>`).join('');
    $('#a2ex').innerHTML=EXEMPLOS.map(([n,t])=>`<button type="button" class="chip ex" data-t="${esc(t)}">${esc(n)}</button>`).join('');
    $$('#a2ex .chip').forEach(b=>b.onclick=()=>{ $('#a2texto').value=b.dataset.t; analisar(); });
    $('#a2go').onclick=analisar;
    $('#a2texto').addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) analisar(); });
    $('#a2saida').innerHTML='<div class="cartao vazio">Escreva (ou escolha um exemplo) a reclamação do cliente e clique em <b>Analisar</b>.</div>';
  },
  desenhar(){ if(feito) analisar(); }
};

function entrada(){ const km=$('#a2km').value.trim(), mis=$('#a2mis').value.trim(); return {modelo:$('#a2modelo').value,texto:$('#a2texto').value,km:km===''?null:+km,mis:mis===''?null:+mis}; }

function analisar(){
  const e=entrada(), box=$('#a2saida');
  if(!e.texto.trim()){ feito=false; box.innerHTML='<div class="cartao vazio">Escreva a reclamação do cliente e clique em <b>Analisar</b>.</div>'; return; }
  feito=true;
  const M=A.M, r=A.motor.prever(e,A.escopo());
  const conf=[]; if(r.toks.length<2) conf.push('o texto é muito curto'); if(r.toks.length&&r.reconhecidas/r.toks.length<0.5) conf.push('poucas palavras são reconhecidas'); if(r.cod[0].p<0.30) conf.push('nenhuma resposta passa de 30%');
  const cods=r.cod.filter(x=>x.c!=='OUTROS'), outros=r.cod.find(x=>x.c==='OUTROS'), top=cods.slice(0,3);
  let h='';
  if(conf.length) h+=`<div class="aviso bordo"><b class="t">Confiança baixa:</b> ${esc(conf.join('; '))}. Trate como pista.</div>`;
  if(A.escopo()==='com'&&top.some(x=>x.c==='G057')){ const pf=M.sobre.perfil;
    h+=`<div class="aviso azul"><b>G057 (consumo de óleo alto) apareceu.</b> Pelos dados, ele se concentra em revisões de 10.000 km (${pct(pf.g057_revisao)} dos casos citam "revisão"; ${pct(pf.g057_km_9_11k)} entre 9 e 11 mil km), então pode não ser um defeito. Ligue "Excluir G057" para ver sem ele.</div>`; }
  const ex0=top.length?r.explic[top[0].c].porToken:new Map(), maxd=Math.max(1e-9,...ex0.values());
  h+=`<div class="cartao"><h3>Problemas mais prováveis ${A.btnAj('problemas')}</h3>`;
  top.forEach((x,i)=>{
    const ex=r.explic[x.c]; const pal=[...ex.porToken.entries()].filter(([,v])=>v>0.02).sort((a,b)=>b[1]-a[1]).slice(0,4); const nomes=[], vistos=new Set();
    pal.forEach(([t])=>{ const w=r.toks[t]; if(!vistos.has(w)){vistos.add(w);nomes.push(w);} }); if(ex.km10k>0.3) nomes.push('km perto de 10 mil');
    h+=`<div class="cod-item"><div class="linha-barra"><div class="nome"><span class="titulo"><span class="cod">${esc(x.c)}</span> · ${esc(M.dic[x.c]?M.dic[x.c][0]:'(sem descrição)')}</span></div>
      <div><div class="pct">${pct(x.p)}</div><div class="trilho ${x.c==='G057'?'b':''}"><i style="width:${(x.p*100).toFixed(1)}%"></i></div></div></div>
      <div class="pq" style="margin:0 0 6px 4px">${nomes.length?'Pesaram: '+nomes.map(n=>`<mark>${esc(n)}</mark>`).join(' '):'Nenhuma palavra se destacou (veio do modelo, km e meses).'}</div>
      <div style="margin:0 0 8px 4px"><button type="button" class="chip ex" data-i="${i}" data-c="${esc(x.c)}" aria-expanded="false">Ver como cada tabela traz esse problema ▾</button></div>
      <div id="cart${i}" hidden></div></div>`;
  });
  if(outros&&outros.p>=0.005) h+=`<p class="suave mini">Mais ${pct(outros.p)} ficam espalhados em códigos raros que o modelo não nomeia.</p>`;
  h+=`</div><div class="cartao"><h3>Palavras que o modelo leu ${A.btnAj('palavras')}</h3><div class="tokens">${r.toks.length?r.toks.map((t,i)=>{ const d=ex0.get(i)||0, a=d>0?Math.min(1,d/maxd):0; return `<span class="tok ${a>0.15?'f':''}" style="${a>0.05?`background:color-mix(in srgb,var(--azul) ${Math.round(18+a*60)}%,transparent);color:var(--texto)`:''}">${esc(t)}</span>`; }).join(''):'<span class="suave">nenhuma palavra útil</span>'}</div></div>`;
  box.innerHTML=h; A.ligaAjudas(box);
  box.querySelectorAll('button[data-i]').forEach(b=>b.onclick=()=>{
    const el=document.getElementById('cart'+b.dataset.i), abre=el.hidden; el.hidden=!abre; b.setAttribute('aria-expanded',abre);
    b.textContent=abre?'Esconder as tabelas ▴':'Ver como cada tabela traz esse problema ▾'; if(abre&&!el.innerHTML) { el.innerHTML=cartoes(b.dataset.c,e.modelo); A.ligaAjudas(el); }
  });
}

// ---------------------------------------------------------------- três cartões + faixa de correlação
function cartoes(code,modelo){
  const M=A.M, L=A.L, fam=code[0]; let c=M.cartoes['c:'+code], nivel='código';
  if(!c){ c=M.cartoes['f:'+fam]; nivel='família '+fam+' (o código tem menos de 10 casos)'; }
  if(!c) return '<div class="aviso bordo"><b class="t">Sem dados suficientes.</b></div>';
  const sev=A._sev||(A._sev=A.sevElem()), g=c.garantia, f=c.fabrica, au=c.auditoria;
  const aviso=nivel!=='código'?`<p class="suave mini">Mostrando a ${esc(nivel)}.</p>`:'';
  // FÁBRICA
  let fab=`<div class="cartao"><h4>${A.badgeFonte('FÁBRICA')} DPHU</h4>`;
  if(f.carros_com_dphu){
    fab+=`<p><b>${f.carros_com_dphu}</b> de ${c.carros} carros (${pct1(f.pct_com_dphu)}) com este problema têm defeito de fábrica registrado.</p><p class="mini suave" style="margin-bottom:2px">Defeitos mais ligados (por VIN):</p><ul>`+
      f.elem.map(([e,n,p])=>`<li>${esc(A.nome.elem(e))}<br><small>${n} carros · ${pct1(p)} · gravidade ${fmt(sev[e]||0,1)}</small></li>`).join('')+'</ul>'+
      `<p class="mini suave" style="margin:6px 0 2px">Incidentes:</p><ul>${f.inc.map(([i,n,p])=>`<li>${esc(A.nome.inc(i))} <small>(${n} · ${pct1(p)})</small></li>`).join('')}</ul>`+
      `<p class="mini">Demérito: ${Object.entries(f.dem).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${A.badgeDem(L.dem.indexOf(k))} ${n}`).join(' ')}</p>`;
  } else fab+='<p class="suave">Nenhum carro com este problema aparece no DPHU.</p>';
  fab+='</div>';
  // AUDITORIA
  let aud=`<div class="cartao"><h4>${A.badgeFonte('AUDITORIA')} AVES</h4>`;
  if(au.carros_com_aves){ aud+=`<p><b>${au.carros_com_aves}</b> carro(s) com este problema aparece(m) no AVES <span class="badge baixo">amostra pequena</span></p><ul>${(au.def||[]).map(([d,n])=>`<li>${esc(A.nome.def(d))} <small>(${n})</small></li>`).join('')}</ul>`; }
  else aud+='<p class="suave">Nenhum carro com este problema aparece no AVES.</p>';
  au.coorte=(au.coorte||[]).filter(x=>x[1]>=0.005); if(au.coorte.length) aud+=`<p class="mini suave" style="margin:8px 0 2px">Pela coorte do modelo (defeitos da mesma família):</p><ul>${au.coorte.map(([d,p])=>`<li>${esc(A.nome.def(d))} <small>(${pct1(p)} das auditorias do modelo)</small></li>`).join('')}</ul>`;
  aud+='</div>';
  // GARANTIA
  const q=v=>fmt(v[1])+` <small class="suave">(${fmt(v[0])}–${fmt(v[2])})</small>`;
  const gar=`<div class="cartao"><h4>${A.badgeFonte('GARANTIA')} GMF</h4><p><b>${fmt(c.n)}</b> casos em <b>${fmt(c.carros)}</b> carros.</p>
    <p class="mini suave" style="margin-bottom:2px">Reclamações (categoria):</p><ul>${g.cmp.map(([i,p])=>`<li>${esc(A.nome.cmp(i))} <small>(${pct(p)})</small></li>`).join('')}</ul>
    <p class="mini suave" style="margin:6px 0 2px">Sintomas da mesma família:</p><ul>${g.irmaos.map(([i,p])=>`<li>${esc(A.nome.codsint(i))} <small>(${pct(p)})</small></li>`).join('')}</ul>
    <p>Km típico: ${q(g.km)}<br>Meses de uso típicos: ${q(g.mis.map(Number))}<br>Custo médio: <b>${g.custo?eur(g.custo[0]):'—'}</b> ${g.custo?`<small class="suave">(mediana ${eur(g.custo[1])}, ${g.custo[2]} casos)</small>`:''}</p></div>`;
  // FAIXA DE CORRELAÇÃO
  let faixa=`<div class="faixa-corr"><h4 style="margin:0">Correlação entre elas ${A.btnAj('correlacao')}</h4><div class="linhas">`;
  const co=f.corresp;
  faixa+=`<div class="l"><span class="badge base-vin">BASE: VIN</span><div>`+(co?`Dos <b>${f.carros_com_dphu}</b> carros que estão no DPHU e na garantia com este problema, <b>${co.n}</b> (${pct1(co.pct)}) tiveram defeito de fábrica da <b>mesma família</b> (${esc(fam)}); o normal seria ${pct1(co.base)} (${co.pct>=co.base*1.15?'acima do normal':co.pct<=co.base*0.85?'abaixo do normal':'igual ao normal'}). ${A.badgeEvid(A.evid(co.n,co.p,co.p!=null?Math.min(1,co.p*2):null))} <small class="suave">(família do defeito estimada pelas palavras do nome)</small>`:'Sem carros em comum para calcular.')+`</div></div>`;
  const ct=f.coorte;
  faixa+=`<div class="l"><span class="badge base-coorte">BASE: COORTE</span><div>`+(ct?`Para os outros <b>${fmt(ct.carros)}</b> carros (sem registro no DPHU), a ligação é só por <b>modelo × mês de fabricação</b>: nessas coortes, ${pct1(ct.fam_pct)} dos defeitos de fábrica são da família ${esc(fam)}, contra ${pct1(ct.fam_base)} no total. <b>Não é o mesmo carro.</b><br><small class="suave">Defeitos mais presentes nessas coortes: ${ct.elem.slice(0,3).map(([e,p])=>`${esc(A.nome.elem(e))} (${pct1(p)})`).join('; ')}</small>`:'Sem carros fora do DPHU.')+`</div></div>`;
  faixa+='</div><p class="suave mini" style="margin:8px 0 0">Associação estatística, não prova de causa. A família do defeito de fábrica é estimada pelas palavras do nome do defeito.</p></div>';
  return aviso+`<div class="tres">${fab}${aud}${gar}</div>`+faixa;
}
})();

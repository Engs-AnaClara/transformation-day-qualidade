(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {$,$$,esc,fmt,pct,pct1,eur,mesNome,dataDe}=A.ui;
let mapa=null, ids=null, pad=null, atual=null;
const idTxt=id=>'VIN-'+String(id).padStart(6,'0');
const parseVin=t=>{ const d=String(t||'').replace(/\D/g,''); return d?parseInt(d,10):null; };
const STOPX=new Set(['para','sobre','entre','como','esta','esse','mais','muito','lado','parte','sistema','message','warning','light','from','with','that','this']);

A.mods.vin={
  init(){
    const inp=$('#vinq'), sug=$('#vinsug');
    if(!A.V){ inp.disabled=true; inp.placeholder='Versão sem busca por VIN'; $('#vinGo').disabled=true; return; }
    mapa=new Map(A.V.map(r=>[r[0],r])); ids=A.V.map(r=>r[0]); pad=ids.map(i=>String(i).padStart(6,'0'));
    let sel=-1;
    const mostra=()=>{
      const d=inp.value.replace(/\D/g,''); if(!d){ sug.hidden=true; return; }
      const exato=String(parseInt(d,10)).padStart(6,'0'); const achados=[];
      for(let i=0;i<pad.length&&achados.length<8;i++){ if(pad[i].startsWith(d)||pad[i]===exato) achados.push(i); }
      sug.innerHTML=achados.map((i,k)=>{ const r=A.V[i]; const f=[r[3]?'fábrica':'',r[4].length?'auditoria':'',r[5].length?'garantia':''].filter(Boolean).join(' · '); return `<button type="button" role="option" data-id="${r[0]}" class="${k===sel?'sel':''}"><span>${idTxt(r[0])}</span><span class="suave">${esc(A.nome.mod(r[1]))} · ${f}</span></button>`; }).join('');
      sug.hidden=!achados.length;
      sug.querySelectorAll('button').forEach(b=>b.onclick=()=>{ inp.value=idTxt(+b.dataset.id); sug.hidden=true; buscar(+b.dataset.id); });
    };
    inp.addEventListener('input',()=>{ sel=-1; mostra(); });
    inp.addEventListener('keydown',e=>{
      const bs=[...sug.querySelectorAll('button')];
      if(e.key==='ArrowDown'&&bs.length){ sel=(sel+1)%bs.length; bs.forEach((b,k)=>b.classList.toggle('sel',k===sel)); e.preventDefault(); }
      else if(e.key==='ArrowUp'&&bs.length){ sel=(sel-1+bs.length)%bs.length; bs.forEach((b,k)=>b.classList.toggle('sel',k===sel)); e.preventDefault(); }
      else if(e.key==='Enter'){ e.preventDefault(); sug.hidden=true; if(sel>=0&&bs[sel]) bs[sel].click(); else buscar(parseVin(inp.value)); }
      else if(e.key==='Escape') sug.hidden=true;
    });
    document.addEventListener('click',e=>{ if(!e.target.closest('.busca')) sug.hidden=true; });
    $('#vinGo').onclick=()=>{ sug.hidden=true; buscar(parseVin(inp.value)); };
  },
  desenhar(){ render(); }
};

function buscar(id){
  if(id==null){ atual=null; render(); return; }
  const r=mapa.get(id);
  atual=r||{naoAchou:id}; render();
}

// ------------------------------------------------------------------ utilidades de comparação
const palavras=txt=>new Set(A.motor.tokens(txt).filter(t=>t.length>=4&&!/^\d+$/.test(t)&&!STOPX.has(t)));
const comuns=(a,b)=>[...a].filter(x=>b.has(x));
const famDphu=dp=>{ const L=A.L; return L.elem_fam[dp[0]]||L.inc_fam[dp[1]]||''; };
const mesDe=i=>i>=0?mesNome(A.L.meses[i]):'—';
const sim=(ok,txt)=>`<li class="cmp ${ok?'ok':'nao'}"><span class="marca" aria-hidden="true">${ok?'✓':'—'}</span><div>${txt}</div></li>`;
const dem=i=>A.badgeDem(i);
const fmtDias=d=>{ const a=Math.abs(d); return a<1?'no mesmo dia':a<60?`${a} dia${a===1?'':'s'}`:`${fmt(a/30.4,1)} meses (${fmt(a)} dias)`; };
const textoDphu=dp=>A.nome.elem(dp[0])+' '+A.nome.inc(dp[1]);
const textoGmf=g=>A.nome.sint(g[0])+' '+A.nome.cmp(g[1])+' '+(g[6]||'');
const chipsPal=cm=>cm.map(w=>`<mark>${esc(w)}</mark>`).join(' ');
const linhaFam=(fa,fb,na,nb)=>{
  if(!fa||!fb) return sim(false,`<b>Família:</b> não foi possível estimar a família de ${!fa&&!fb?'nenhum dos dois':!fa?na:nb}.`);
  return fa===fb?sim(true,`<b>Mesma família:</b> ${esc(fa)} · ${esc(A.famN(fa))} <small class="suave">(família estimada pelo nome do defeito)</small>`)
    :sim(false,`<b>Famílias diferentes:</b> ${na} ${esc(fa)} · ${esc(A.famN(fa))}; ${nb} ${esc(fb)} · ${esc(A.famN(fb))} <small class="suave">(família estimada pelo nome do defeito)</small>`);
};

// ------------------------------------------------------------------ o que há em comum (só dados deste carro)
function emComum(r){
  const [id,mo,me,dp,av,gm,gme]=r, L=A.L;
  const gmf=gm.filter(e=>!A.semG(A.nome.cod(e[0]))).sort((a,b)=>a[5]-b[5]);
  if((dp?1:0)+(av.length?1:0)+(gmf.length?1:0)<2) return '';
  const itens=[sim(true,`<b>Mesmo carro:</b> ${esc(A.nome.mod(mo))}. O modelo é o mesmo em todas as tabelas.`)];
  if(dp&&gmf.length){ const igual=me===gme; itens.push(sim(igual,igual?`<b>Mesmo mês de fabricação:</b> ${esc(mesDe(me))} na fábrica e na garantia.`:`<b>Mês de fabricação diferente:</b> ${esc(mesDe(me))} na fábrica e ${esc(mesDe(gme))} na garantia (pequena divergência entre as bases).`)); }
  if(dp&&av.length){ const d=av[0][2]-dp[3]; itens.push(sim(true,`<b>Fábrica e auditoria:</b> o carro foi auditado ${fmtDias(d)} ${d>=0?'depois':'antes'} do defeito de fábrica.`)); }
  // visão rápida de cada par de tabelas
  const conta=(lista,fam,pal)=>{ const f=lista.filter(fam).length, p=lista.filter(pal).length; return {f,p,n:lista.length}; };
  const txtPar=(c,quem,alvo)=>sim(c.f>0||c.p>0,`<b>${quem}:</b> ${c.f} de ${c.n} ${alvo} estão na mesma família${c.f?'':' (nenhum)'}; ${c.p} de ${c.n} têm palavras em comum${c.p?'':' (nenhum)'}.`);
  if(dp&&av.length){ const pd=palavras(textoDphu(dp)), fd=famDphu(dp);
    itens.push(txtPar(conta(av,a=>fd&&fd===(L.def_fam[a[0]]||''),a=>comuns(pd,palavras(A.nome.def(a[0]))).length>0),'Fábrica × auditoria',av.length>1?'defeitos da auditoria':'defeito da auditoria')); }
  if(dp&&gmf.length){ const pd=palavras(textoDphu(dp)), fd=famDphu(dp);
    itens.push(txtPar(conta(gmf,g=>fd&&g[0]>=0&&fd===A.nome.cod(g[0])[0],g=>comuns(pd,palavras(textoGmf(g))).length>0),'Fábrica × garantia',gmf.length>1?'casos de garantia':'caso de garantia')); }
  if(av.length&&gmf.length){ const g0=gmf[0], pg=palavras(textoGmf(g0));
    itens.push(txtPar(conta(av,a=>g0[0]>=0&&(L.def_fam[a[0]]||'')===A.nome.cod(g0[0])[0],a=>comuns(palavras(A.nome.def(a[0])),pg).length>0),'Auditoria × garantia',(av.length>1?'defeitos da auditoria':'defeito da auditoria')+' (contra o 1º caso de garantia)')); }
  let h=`<div class="cartao"><h3>O que as tabelas têm em comum neste carro ${A.btnAj('comum')}</h3><ul class="cmp-lista">${itens.join('')}</ul><p class="mini suave" style="margin:8px 0 0">A família do defeito de fábrica e de auditoria é estimada pelas palavras do nome do defeito. Os detalhes de cada par estão logo abaixo.</p></div>`;
  if(dp&&av.length){
    const pd=palavras(textoDphu(dp)), fd=famDphu(dp);
    h+=`<div class="cartao"><h4>${A.badgeFonte('FÁBRICA')} × ${A.badgeFonte('AUDITORIA')}</h4><p class="mini suave" style="margin-top:0">Defeito de fábrica: <b>${esc(A.nome.elem(dp[0]))}</b> · ${esc(A.nome.inc(dp[1]))} ${dem(dp[2])}</p>`;
    av.slice(0,6).forEach(a=>{
      const cm=comuns(pd,palavras(A.nome.def(a[0]))), mesmoDem=a[1]===dp[2];
      h+=`<div class="par"><div class="par-t">${A.badgeFonte('AVES')} ${esc(A.nome.def(a[0]))}</div><ul class="cmp-lista">
        ${sim(cm.length>0,cm.length?`<b>Palavras em comum:</b> ${chipsPal(cm)}`:'<b>Palavras em comum:</b> nenhuma (falam de peças ou falhas diferentes).')}
        ${linhaFam(fd,L.def_fam[a[0]]||'','fábrica','auditoria')}
        ${sim(mesmoDem,`<b>Demérito:</b> fábrica ${dem(dp[2])} · auditoria ${dem(a[1])} ${mesmoDem?'(igual)':'(diferente)'}`)}</ul></div>`; });
    if(av.length>6) h+=`<p class="suave mini">+ ${av.length-6} defeito(s) da auditoria não mostrados.</p>`;
    h+='</div>';
  }
  if(dp&&gmf.length){
    const pd=palavras(textoDphu(dp)), fd=famDphu(dp);
    h+=`<div class="cartao"><h4>${A.badgeFonte('FÁBRICA')} × ${A.badgeFonte('GARANTIA')}</h4><p class="mini suave" style="margin-top:0">Defeito de fábrica: <b>${esc(A.nome.elem(dp[0]))}</b> · ${esc(A.nome.inc(dp[1]))} ${dem(dp[2])}</p>`;
    gmf.slice(0,4).forEach(g=>{
      const cm=comuns(pd,palavras(textoGmf(g))), d=g[5]-dp[3];
      h+=`<div class="par"><div class="par-t">${A.badgeFonte('GMF')} ${esc(A.nome.codsint(g[0]))}</div><ul class="cmp-lista">
        ${sim(true,`<b>Tempo:</b> a reclamação veio ${fmtDias(d)} depois do defeito de fábrica (${dataDe(dp[3])} → ${dataDe(g[5])}), com ${fmt(g[2])} km e ${g[3]} meses de uso.`)}
        ${linhaFam(fd,g[0]>=0?A.nome.cod(g[0])[0]:'','fábrica','garantia')}
        ${sim(cm.length>0,cm.length?`<b>Palavras em comum:</b> ${chipsPal(cm)}`:'<b>Palavras em comum:</b> nenhuma.')}</ul></div>`; });
    if(gmf.length>4) h+=`<p class="suave mini">+ ${gmf.length-4} caso(s) de garantia não mostrados.</p>`;
    h+='</div>';
  }
  if(av.length&&gmf.length){
    const g=gmf[0], pg=palavras(textoGmf(g));
    h+=`<div class="cartao"><h4>${A.badgeFonte('AUDITORIA')} × ${A.badgeFonte('GARANTIA')}</h4><p class="mini suave" style="margin-top:0">Primeiro caso de garantia: <b>${esc(A.nome.codsint(g[0]))}</b></p>`;
    av.slice(0,6).forEach(a=>{
      const cm=comuns(palavras(A.nome.def(a[0])),pg), d=g[5]-a[2];
      h+=`<div class="par"><div class="par-t">${A.badgeFonte('AVES')} ${esc(A.nome.def(a[0]))}</div><ul class="cmp-lista">
        ${sim(true,`<b>Tempo:</b> o primeiro caso de garantia veio ${fmtDias(d)} depois da auditoria.`)}
        ${linhaFam(L.def_fam[a[0]]||'',g[0]>=0?A.nome.cod(g[0])[0]:'','auditoria','garantia')}
        ${sim(cm.length>0,cm.length?`<b>Palavras em comum:</b> ${chipsPal(cm)}`:'<b>Palavras em comum:</b> nenhuma.')}</ul></div>`; });
    h+='</div>';
  }
  return h;
}

// ------------------------------------------------------------------ resumo (só dados deste carro)
function resumo(r){
  const [id,mo,me,dp,av,gm]=r;
  const gmf=gm.filter(e=>!A.semG(A.nome.cod(e[0]))).sort((a,b)=>a[5]-b[5]), f=[];
  if(dp) f.push(`teve <b>«${esc(A.nome.elem(dp[0]))}»</b> na fábrica (${dataDe(dp[3])})`);
  if(av.length) f.push(`foi auditado com ${av.length} defeito${av.length>1?'s':''}${dp?'':` (${dataDe(av[0][2])})`}`);
  if(gmf.length){ const g=gmf[0]; f.push(`reclamou na garantia de <b>«${esc(A.nome.codsint(g[0]))}»</b> ${dp?`${fmtDias(g[5]-dp[3])} depois`:`(${dataDe(g[5])})`}, com ${fmt(g[2])} km`); }
  if(!f.length) return '';
  const c=new Map(); gmf.forEach(g=>c.set(g[0],(c.get(g[0])||0)+1)); const rep=[...c.values()].some(n=>n>1);
  return `<div class="cartao"><h3>Resumo deste carro</h3><div class="frase">${esc(idTxt(id))} é um ${esc(A.nome.mod(mo))} fabricado em ${esc(mesNome(A.L.meses[me]))}. Ele ${f.join('; ')}.${rep?' <b>Voltou mais de uma vez com o mesmo código na garantia.</b>':''}</div></div>`;
}

// ------------------------------------------------------------------ tela
function render(){
  const box=$('#vinSaida');
  if(!A.V){ box.innerHTML='<div class="aviso azul"><b>Esta é a versão sem busca por VIN.</b> Use o arquivo com busca por VIN para ver a linha do tempo de um carro.</div>'; return; }
  if(!atual){ box.innerHTML='<div class="cartao vazio">Digite um VIN para ver tudo o que as tabelas sabem sobre aquele carro.</div>'; return; }
  if(atual.naoAchou!=null){ box.innerHTML=`<div class="aviso bordo"><b class="t">${idTxt(atual.naoAchou)} não foi encontrado.</b> Ele não aparece em nenhuma das três tabelas. Tente VIN-000001.</div>`; return; }
  const r=atual, [id,mo,me,dp,av,gm]=r;
  const gmf=gm.filter(e=>!A.semG(A.nome.cod(e[0]))), ocultos=gm.length-gmf.length;
  const fontes=(dp?1:0)+(av.length?1:0)+(gm.length?1:0);
  let h=`<div class="cartao"><h3 style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">${idTxt(id)} <span class="badge fonte">${esc(A.nome.mod(mo))}</span> ${me>=0?`<span class="badge dem">fabricado em ${esc(mesNome(A.L.meses[me]))}</span>`:''}</h3>
    <div class="presenca">
      <div class="pres ${dp?'sim':'nao'}"><b>FÁBRICA (DPHU)</b>${dp?'1 defeito registrado':'não aparece'}</div>
      <div class="pres ${av.length?'sim':'nao'}"><b>AUDITORIA (AVES)</b>${av.length?av.length+(av.length>1?' defeitos':' defeito'):'não aparece'}</div>
      <div class="pres ${gm.length?'sim':'nao'}"><b>GARANTIA (GMF)</b>${gm.length?gm.length+(gm.length>1?' casos':' caso'):'não aparece'}</div></div>`;
  if(fontes===1){ const so=dp?'na fábrica (DPHU)':av.length?'na auditoria (AVES)':'na garantia (GMF)'; h+=`<div class="aviso bordo" style="margin:0"><b class="t">Sem correlação possível por VIN.</b> Este carro só aparece ${so}, então não há o que comparar entre tabelas.</div>`; }
  else h+=`<div class="aviso azul" style="margin:0">Este carro aparece em <b>${fontes} das 3 tabelas</b>: abaixo estão os pontos em comum entre elas.</div>`;
  h+='</div>'+resumo(r)+emComum(r);
  const ev=[];
  if(dp) ev.push({dia:dp[3],o:0,h:`<div class="evento"><h4>${A.badgeFonte('FÁBRICA · DPHU')} defeito de montagem <span class="data">${dataDe(dp[3])}</span></h4><div class="campos"><div><span>Elemento</span>${esc(A.nome.elem(dp[0]))}</div><div><span>Incidente</span>${esc(A.nome.inc(dp[1]))}</div><div><span>Demérito</span>${A.badgeDem(dp[2])} <small>${esc(A.demNome[A.L.dem[dp[2]]])}</small></div></div></div>`});
  av.forEach(a=>ev.push({dia:a[2],o:1,h:`<div class="evento aves"><h4>${A.badgeFonte('AUDITORIA · AVES')} defeito de detalhe <span class="data">${dataDe(a[2])}</span></h4><div class="campos"><div><span>Defeito</span>${esc(A.nome.def(a[0]))}</div><div><span>Demérito</span>${A.badgeDem(a[1])}</div></div></div>`}));
  gmf.forEach(g=>ev.push({dia:g[5],o:2,h:`<div class="evento gmf"><h4>${A.badgeFonte('GARANTIA · GMF')} reclamação do cliente <span class="data">${dataDe(g[5])}</span></h4><div class="campos">
      <div><span>Reclamação</span>${esc(A.nome.cmp(g[1]))}</div><div><span>Código · sintoma</span>${esc(A.nome.codsint(g[0]))}</div>
      <div><span>Km · meses de uso</span>${fmt(g[2])} km · ${g[3]} meses</div><div><span>Custo do reparo</span>${g[4]<0?'—':eur(g[4])}</div>
      ${g[6]?`<div style="grid-column:1/-1"><span>Diagnóstico do reparo (trecho)</span>${esc(g[6])}</div>`:''}</div></div>`}));
  ev.sort((a,b)=>a.dia-b.dia||a.o-b.o);
  h+=`<div class="cartao"><h3>Linha do tempo do carro</h3>${ev.length?`<div class="linha-tempo">${ev.map(e=>e.h).join('')}</div>`:'<p class="suave">Sem eventos para mostrar neste modo.</p>'}${ocultos?`<p class="suave mini">${ocultos} caso(s) de G057 ocultado(s) pelo interruptor "Excluir G057".</p>`:''}<p class="suave mini" style="margin-bottom:0">Os pontos em comum usam só o que está registrado para este carro. A família do defeito é estimada pelas palavras do nome.</p></div>`;
  box.innerHTML=h; A.ligaAjudas(box);
}
})();

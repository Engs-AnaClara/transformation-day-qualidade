(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {$,$$,esc,fmt,pct,pct1,eur,mesNome}=A.ui;
const st={fonte:'dphu',dim:'elem',mod:'',mes:'',ord:'qtd',mais:false};
const DIMS={dphu:[['elem','Elemento final'],['inc','Incidente'],['fam','Família do defeito (estimada)'],['mod','Modelo'],['mes','Mês de fabricação']],
  aves:[['def','Defeito'],['tipo','Tipo de falha'],['fam','Família do defeito (estimada)'],['mod','Modelo'],['mes','Mês da auditoria']],
  gmf:[['cod','Código · sintoma'],['fam','Família de sintoma'],['mod','Modelo'],['mes','Mês de fabricação']]};

A.mods.prior={ init(){}, desenhar(){ montar(); } };

function nomeItem(f,d,k){
  const L=A.L;
  if(d==='mod') return A.nome.mod(k); if(d==='mes') return typeof k==='string'?mesNome(k):mesNome(L.meses[k]);
  if(d==='fam') return k?`${k} · ${A.famN(k)}`:'(família não identificada)';
  if(d==='elem') return A.nome.elem(k); if(d==='inc') return A.nome.inc(k); if(d==='def') return A.nome.def(k); if(d==='tipo') return A.nome.tipo(k); if(d==='cod') return A.nome.codsint(k);
  return String(k);
}
function agrega(){
  const M=A.M, L=A.L, C=M.cubos, f=st.fonte, d=st.dim, g=new Map();
  const mesOk=me=>st.mes===''||(typeof me==='string'?me===st.mes:L.meses[me]===st.mes), modOk=mo=>st.mod===''||String(mo)===String(st.mod);
  const add=(k,n,sev,extra)=>{ const o=g.get(k)||{n:0,sev:0,cs:0,cn:0,dem:{}}; o.n+=n; o.sev+=sev; if(extra){ o.cs+=extra.cs; o.cn+=extra.cn; if(extra.de!=null) o.dem[extra.de]=(o.dem[extra.de]||0)+n; } g.set(k,o); };
  if(f==='dphu'){
    const cube=d==='inc'?C.dphu_inc:C.dphu_elem;
    for(const [it,mo,me,de,n] of cube){ if(!modOk(mo)||!mesOk(me)) continue; const k=d==='mod'?mo:d==='mes'?me:d==='fam'?(L.elem_fam[it]||''):it; add(k,n,n*A.peso(L.dem[de]),{cs:0,cn:0,de}); }
  } else if(f==='aves'){
    for(const [it,mo,me,de,n] of C.aves){ if(!modOk(mo)||!mesOk(me)) continue; const k=d==='mod'?mo:d==='mes'?me:d==='fam'?(L.def_fam[it]||''):d==='tipo'?L.def2tipo[it]:it; add(k,n,n*A.peso(L.dem[de]),{cs:0,cn:0,de}); }
  } else {
    for(const [c,mo,me,n,cs,cn] of C.gmf){ if(!modOk(mo)||!mesOk(me)) continue; const code=L.codes[c][0]; if(A.semG(code)) continue; const k=d==='mod'?mo:d==='mes'?me:d==='fam'?code[0].toUpperCase():c; add(k,n,0,{cs,cn,de:null}); }
  }
  return g;
}

function montar(){
  const box=$('#a4saida'), M=A.M, L=A.L, f=st.fonte;
  if(!DIMS[f].some(x=>x[0]===st.dim)) st.dim=DIMS[f][0][0];
  const g=agrega(); const gmf=f==='gmf';
  const linhas=[...g.entries()].map(([k,o])=>({k,o,grav:gmf?o.cs:o.sev,med:gmf?(o.cn?o.cs/o.cn:0):(o.n?o.sev/o.n:0)}));
  const ord=A.ordenar(linhas,x=>x.o.n,x=>x.grav,st.ord); const tot=linhas.reduce((s,x)=>s+x.o.n,0)||1, mxq=Math.max(1,...linhas.map(x=>x.o.n)), mxg=Math.max(1,...linhas.map(x=>x.grav));
  const mostra=ord.slice(0,st.mais?60:15);
  const optMod=`<option value="">todos</option>`+L.modelos.map((m,i)=>`<option value="${i}" ${String(i)===String(st.mod)?'selected':''}>${esc(m)}</option>`).join('');
  const optMes=`<option value="">todos</option>`+L.meses.map(m=>`<option value="${m}" ${m===st.mes?'selected':''}>${esc(A.rotMes(m))}</option>`).join('');
  let h=`<div class="cartao"><h3>Prioridades ${A.btnAj('prior')}</h3>
    <p class="suave mini" style="margin-top:0">Ranking por <b>quantidade de defeitos</b> (padrão), com a <b>gravidade</b> (demérito ponderado) como critério secundário e desempate. Você pode trocar a ordenação.</p>
    <div class="ctrl"><div><label>Fonte</label><span class="seg" role="group" aria-label="Fonte">${[['dphu','Fábrica (DPHU)'],['aves','Auditoria (AVES)'],['gmf','Garantia (GMF)']].map(([k,t])=>`<button type="button" data-f="${k}" aria-pressed="${f===k}">${t}</button>`).join('')}</span></div>
      <div><label for="pDim">Agrupar por</label><select id="pDim">${DIMS[f].map(([k,t])=>`<option value="${k}" ${k===st.dim?'selected':''}>${esc(t)}</option>`).join('')}</select></div>
      <div><label for="pMod">Modelo</label><select id="pMod">${optMod}</select></div>
      <div><label for="pMes">${f==='aves'?'Mês da auditoria':'Mês de fabricação'}</label><select id="pMes">${optMes}</select></div>
      <div><label>Ordenar por</label>${A.segOrdem('pOrd',st.ord)}</div></div>`;
  if(gmf) h+=`<div class="aviso azul" style="margin:0 0 10px"><b>Gravidade no GMF:</b> o GMF não tem demérito. Aqui a gravidade é o <b>custo do reparo</b> (total e médio), como indicador aproximado.${A.estado.excl?' G057 excluído.':''}</div>`;
  if(f==='aves'&&st.dim==='mes') h+=`<div class="aviso azul" style="margin:0 0 10px">O AVES não traz mês de fabricação; o mês mostrado é o da auditoria.</div>`;
  if(st.dim==='fam'&&f!=='gmf') h+=`<div class="aviso bordo" style="margin:0 0 10px"><b class="t">Família estimada:</b> vem das palavras do nome do defeito.</div>`;
  h+=`<div class="rolagem"><table><thead><tr><th>#</th><th>${esc(DIMS[f].find(x=>x[0]===st.dim)[1].replace(' (estimada)',''))}</th><th class="n">Quantidade</th><th class="n">% do total</th><th class="n" title="${gmf?'Custo total do reparo':'Soma dos pesos do demérito'}">${gmf?'Custo total (€)':'Gravidade (ponderada)'}</th><th class="n" title="${gmf?'Custo médio por caso':'Peso médio por defeito'}">${gmf?'Custo médio (€)':'Gravidade média'}</th>${gmf?'':L.dem.map((k,i)=>`<th class="n" title="${esc(A.demNome[k])}">${A.badgeDem(i)}</th>`).join('')}</tr></thead><tbody>
    ${mostra.map(({k,o,grav,med},i)=>`<tr><td>${i+1}</td><td>${esc(nomeItem(f,st.dim,k))}</td>
      <td class="n"><b>${fmt(o.n)}</b><div class="trilho" style="margin-top:3px"><i style="width:${(o.n/mxq*100).toFixed(0)}%"></i></div></td><td class="n">${pct1(o.n/tot)}</td>
      <td class="n"><b>${fmt(grav,gmf?0:0)}</b><div class="trilho b" style="margin-top:3px"><i style="width:${(grav/mxg*100).toFixed(0)}%"></i></div></td><td class="n">${fmt(med,gmf?2:1)}</td>
      ${gmf?'':L.dem.map((k,i)=>`<td class="n ${o.dem[i]?'':'dim'}">${o.dem[i]?fmt(o.dem[i]):'—'}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${gmf?6:11}" class="suave">Nada para mostrar com estes filtros.</td></tr>`}
    ${gmf||!linhas.length?'':`<tr style="font-weight:600;background:var(--cinza-fundo)"><td></td><td>Total (${fmt(linhas.length)} grupos)</td><td class="n">${fmt(tot)}</td><td class="n">100%</td><td class="n">${fmt(linhas.reduce((s,x)=>s+x.grav,0))}</td><td class="n">${fmt(linhas.reduce((s,x)=>s+x.grav,0)/tot,1)}</td>${L.dem.map((k,i)=>`<td class="n">${fmt(linhas.reduce((s,x)=>s+(x.o.dem[i]||0),0))}</td>`).join('')}</tr>`}</tbody></table></div>
    <p class="mini suave" style="margin:6px 0 0">${fmt(ord.length)} grupos · ${fmt(tot)} ocorrências ${ord.length>15?`<button type="button" class="chip ex" id="pMais">${st.mais?'ver menos':'ver mais'}</button>`:''}</p>
    <details class="mais" style="margin-top:12px"><summary>Pesos do demérito (editáveis)</summary>
      <p class="mini suave">Usados para calcular a gravidade ponderada. Os valores iniciais são uma <b>suposição</b> (você pode mudar); "sem demérito" são os testes de função (anti-partida, injeção, ABS, airbag…).</p>
      <div class="pesos">${L.dem.map(k=>`<div><label for="pw_${k}">${esc(A.demNome[k])}</label><input type="number" min="0" step="1" id="pw_${k}" value="${A.pesos[k]}"></div>`).join('')}<button type="button" class="btn sec" id="pwReset">restaurar</button></div></details></div>`;
  box.innerHTML=h; liga(box); A.ligaAjudas(box);
}
function liga(box){
  $$('[data-f]',box).forEach(b=>b.onclick=()=>{ st.fonte=b.dataset.f; st.mais=false; montar(); });
  $('#pDim').onchange=e=>{ st.dim=e.target.value; montar(); }; $('#pMod').onchange=e=>{ st.mod=e.target.value; montar(); }; $('#pMes').onchange=e=>{ st.mes=e.target.value; montar(); };
  $$('#pOrd button').forEach(b=>b.onclick=()=>{ st.ord=b.dataset.o; montar(); });
  const m=$('#pMais'); if(m) m.onclick=()=>{ st.mais=!st.mais; montar(); };
  A.L.dem.forEach(k=>{ document.getElementById('pw_'+k).onchange=e=>{ A.pesos[k]=Math.max(0,+e.target.value||0); A._sev=null; A.redesenhar(); }; });
  $('#pwReset').onclick=()=>{ A.L.dem.forEach(k=>A.pesos[k]=A.L.pesos[k]); A._sev=null; A.redesenhar(); };
}
})();

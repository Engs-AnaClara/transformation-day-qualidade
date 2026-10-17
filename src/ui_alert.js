(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {$,$$,esc,fmt,pct,pct1,eur,mesNome}=A.ui;
const st={mod:null,mes:null,fam:'G',ordT:'qtd',lim:5,domNivel:'fam',domFraca:false,lotMod:'',novos:null};
const mediana=a=>{ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y),m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };

// ---- apoio da recorrência
let _cubo=null;
const cuboDphu=()=>{ if(_cubo) return _cubo; _cubo=new Map(); const L=A.L;
  for(const [e,mo,me,de,n] of A.M.cubos.dphu_elem){ const k=L.modelos[mo]+'|'+L.meses[me]; let m=_cubo.get(k); if(!m){ m=new Map(); _cubo.set(k,m); } let a=m.get(e); if(!a){ a=[0,0,0,0,0]; m.set(e,a); } a[de]+=n; }
  return _cubo; };
const mesesAntes=(mes,k=3)=>{ const L=A.L, i=L.meses.indexOf(mes); return L.meses.slice(Math.max(0,i-k),i); };   // do mais antigo ao mais recente
const sequencia=(valores,lim,atual)=>`<span class="rec" title="Casos por mês (os 3 anteriores e o mês escolhido)">${valores.map((v,i)=>`<i class="${v==null?'sd':v>=lim?'on':'off'}${i===valores.length-1?' hoje':''}">${v==null?'—':v}</i>`).join('')}</span>`;
function recorrencia(valoresAntes,atual,lim){
  const ant=valoresAntes.filter(v=>v!=null), k=ant.filter(v=>v>=lim).length, n=ant.length;
  if(atual<lim) return '';
  const curto=n<3?` <span class="badge baixo" title="Há menos de 3 meses anteriores com dados">histórico curto</span>`:'';
  if(n>0&&k===n) return `<span class="badge" style="background:var(--bordo);color:#fff">Recorrente</span> <span class="mini suave">em ${k} de ${n} meses antes</span>${curto}`;
  if(k>0) return `<span class="badge medio">Voltou</span> <span class="mini suave">em ${k} de ${n} meses antes</span>${curto}`;
  return `<span class="badge baixo">Novo neste mês</span>${curto}`;
}

A.mods.alert={
  init(){ const L=A.L; st.mod=L.modelos[0]; st.mes=L.meses.find(m=>A.M.tend.dphu[st.mod+'|'+m])||L.meses[0]; },
  desenhar(){
    const box=$('#a3saida'); const abertos=[...box.querySelectorAll('details.sec')].map(d=>d.open);
    box.innerHTML=secTend()+secLotes()+secDomino()+secNovos();
    const ds=[...box.querySelectorAll('details.sec')]; ds.forEach((d,i)=>{ d.open=abertos.length?abertos[i]:i===0; });
    liga(box); A.ligaAjudas(box);
  }
};

// ------------------------------------------------------------------ 1. tendências por data
function secTend(){
  const M=A.M, L=A.L, esc_=A.escopo(), T=M.tend, key=st.mod+'|'+st.mes, dc=T.dphu[key], gc=T[esc_].coortes[key];
  const sev=A._sev||(A._sev=A.sevElem());
  const optMod=L.modelos.map(m=>`<option ${m===st.mod?'selected':''}>${esc(m)}</option>`).join('');
  const optMes=L.meses.map(m=>`<option value="${m}" ${m===st.mes?'selected':''}>${esc(A.rotMes(m))}</option>`).join('');
  const optFam=Object.keys(T[esc_].serie).filter(f=>M.fam_nomes[f]&&M.stats[esc_].n_fam[f]>=30).map(f=>`<option value="${f}" ${f===st.fam?'selected':''}>${f} · ${esc(M.fam_nomes[f])}</option>`).join('');
  let h=`<details class="sec cartao"><summary>Tendências por data de fabricação ${A.btnAj('tend')}</summary>
    <p class="suave mini">Para cada mês de fabricação: o que a fábrica registrou e o que os clientes reclamaram depois (comparado ao normal do GMF inteiro), com a idade típica do carro na reclamação.</p>
    <div class="ctrl"><div><label for="tMod">Modelo</label><select id="tMod">${optMod}</select></div><div><label for="tMes">Mês de fabricação</label><select id="tMes">${optMes}</select></div><div>${A.segOrdem('ordT',st.ordT)}</div><div><label for="tLim" title="Um problema conta como \"ocorreu\" no mês quando tem pelo menos esta quantidade de casos">Conta como ocorrido com pelo menos</label><input type="number" id="tLim" min="1" step="1" value="${st.lim}" style="width:80px"> <span class="mini suave">casos no mês</span></div></div>`;
  const antes=mesesAntes(st.mes,3);
  h+=`<p class="mini suave" style="margin:0 0 8px">As colunas de meses mostram os <b>casos em cada mês de fabricação</b>: primeiro o <b>mês escolhido (${esc(mesNome(st.mes))})</b>, em rosa${antes.length?', depois os anteriores: '+antes.slice().reverse().map(m=>`<b>${esc(mesNome(m))}</b>`).join(', '):''}. <span class="mes-on">Azul</span> = o problema ocorreu naquele mês (pelo menos ${st.lim} casos).</p><div>`;
  // cabeçalho dos meses e células de recorrência
  // colunas de meses: o mês escolhido vem primeiro, depois os anteriores do mais novo ao mais antigo
  const ordemMeses=()=>[st.mes,...antes.slice().reverse()];
  const thMeses=()=>ordemMeses().map((m,i)=>`<th class="n mes-h${i===0?' atual':''}" title="Mês de fabricação ${esc(mesNome(m))}${i===0?' (mês escolhido)':''}">${esc(mesNome(m))}</th>`).join('');
  const tdMeses=(ant,atual)=>[atual,...ant.slice().reverse()].map((v,i)=>`<td class="n mes-c${v==null?' sd':v>=st.lim?' on':''}${i===0?' atual':''}">${v==null?'—':fmt(v)}</td>`).join('');
  // fábrica: cada demérito em sua coluna + meses + situação
  h+=`<div class="cartao" style="box-shadow:none"><h4>${A.badgeFonte('FÁBRICA')} Defeitos registrados em ${esc(mesNome(st.mes))} <span class="suave" style="font-weight:400">(${esc(st.mod)})</span></h4>`;
  const mapa=cuboDphu().get(st.mod+'|'+st.mes);
  if(mapa){
    const lista=[...mapa.entries()].map(([e,a])=>({e,a,tot:a.reduce((x,y)=>x+y,0),grav:a.reduce((x,n,i)=>x+n*A.peso(L.dem[i]),0)}));
    const rows=A.ordenar(lista,x=>x.tot,x=>x.grav,st.ordT).slice(0,10);
    const tot=lista.reduce((x,y)=>x+y.tot,0);
    h+=`<p class="mini suave">${fmt(tot)} defeitos no mês para este modelo (10 maiores abaixo).</p><div class="rolagem"><table class="tab-rec"><thead><tr><th rowspan="2">Elemento</th><th colspan="5" class="grupo">Quantas vezes, por demérito (neste mês)</th><th rowspan="2" class="n">Total</th><th colspan="${antes.length+1}" class="grupo">Casos por mês de fabricação</th><th rowspan="2">Situação</th></tr><tr>${L.dem.map((k,i)=>`<th class="n" title="${esc(A.demNome[k])}">${A.badgeDem(i)}</th>`).join('')}${thMeses()}</tr></thead><tbody>${rows.map(({e,a,tot:t})=>{
      const ant=antes.map(m=>{ const mm=cuboDphu().get(st.mod+'|'+m); return mm?((mm.get(e)||[0,0,0,0,0]).reduce((x,y)=>x+y,0)):null; });
      return `<tr><td>${esc(A.nome.elem(e))}</td>${a.map(n=>`<td class="n ${n?'':'dim'}">${n?fmt(n):'—'}</td>`).join('')}<td class="n"><b>${fmt(t)}</b></td>${tdMeses(ant,t)}<td>${recorrencia(ant,t,st.lim)||'<span class="suave mini">abaixo do mínimo</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
  } else h+='<p class="suave">Sem registros do DPHU para este modelo e mês.</p>';
  h+='</div>';
  // garantia: abaixo da fábrica, em largura total
  h+=`<div class="cartao" style="box-shadow:none;margin-top:16px"><h4>${A.badgeFonte('GARANTIA')} O que os clientes reclamaram depois <span class="suave" style="font-weight:400">(carros do ${esc(st.mod)} fabricados em ${esc(mesNome(st.mes))})</span></h4>`;
  if(gc){
    const rows=Object.entries(gc.fam).filter(([f])=>M.fam_nomes[f]).sort((a,b)=>b[1][0]-a[1][0]).slice(0,10);
    h+=`<p class="mini suave">${fmt(gc.n)} casos de garantia${esc_==='sem'?' (sem G057)':''}. "Meses de uso" = idade típica do carro quando reclamou.</p><div class="rolagem"><table class="tab-rec"><thead><tr><th rowspan="2">Família</th><th rowspan="2" class="n">Casos</th><th rowspan="2" class="n">Meses de uso</th><th colspan="${antes.length+1}" class="grupo">Casos por mês de fabricação</th><th rowspan="2">Situação</th></tr><tr>${thMeses()}</tr></thead><tbody>${rows.map(([f,[n,l,mis]])=>{
      const nm=M.stats[esc_].share[f]||0, acima=(n/gc.n)>=nm*1.15&&n>=st.lim;
      const ant=antes.map(m=>{ const c=T[esc_].coortes[st.mod+'|'+m]; return c?((c.fam[f]||[0])[0]):null; });
      return `<tr><td><b>${f}</b> · ${esc(M.fam_nomes[f])}${acima?` <span class="badge" style="background:var(--bordo-fundo);color:var(--bordo);border:1px solid var(--bordo-claro)" title="Esta família pesa mais aqui do que no GMF inteiro">▲ acima do normal</span>`:''}</td><td class="n">${n}${n<30?'*':''}</td><td class="n">${fmt(mis,1)}</td>${tdMeses(ant,n)}<td>${recorrencia(ant,n,st.lim)||'<span class="suave mini">abaixo do mínimo</span>'}</td></tr>`; }).join('')}</tbody></table></div>`; }
  else h+='<p class="suave">Sem casos de garantia para esta coorte.</p>';
  h+='</div></div>';
  // série da família
  const ser=T[esc_].serie[st.fam]||{}; const ms=L.meses.filter(m=>ser[m]&&ser[m][0]>=30); const fora=L.meses.filter(m=>ser[m]&&ser[m][0]<30); const shF=M.stats[esc_].share[st.fam]||0; const mx=Math.max(shF*1.3,...ms.map(m=>ser[m][1]*shF));
  h+=`<div class="ctrl" style="margin-top:14px"><div><label for="tFam">Família</label><select id="tFam">${optFam}</select></div><span class="mini suave">% da família entre os casos de garantia de cada mês de fabricação (todos os modelos). O normal no GMF inteiro é <b>${pct1(shF)}</b>.</span></div>
    <div class="serie" style="position:relative">${ms.map(m=>{ const [n,l]=ser[m]; const pc=l*shF; return `<div title="${esc(mesNome(m))}: ${pct1(pc)} (${n} casos no mês)"><span>${fmt(pc*100,0)}%</span><i class="${pc>=shF*1.15?'alta':''}" style="height:${(pc/mx*88).toFixed(0)}%"></i><span>${esc(mesNome(m).slice(0,3))}</span></div>`; }).join('')}</div>
    <p class="mini suave">Barra bordô = acima do normal da família. Meses recentes têm menos casos porque os carros tiveram menos tempo na rua. ${fora.length?`<b>Não aparecem por falta de dados</b> (menos de 30 casos de garantia no mês): ${fora.map(m=>`${esc(mesNome(m))} (${ser[m][0]})`).join(', ')}.`:''}</p></details>`;
  return h;
}

// ------------------------------------------------------------------ 2. lotes
function secLotes(){
  const M=A.M, L=A.L; let rows=M.tend.lotes; if(st.lotMod!=='') rows=rows.filter(x=>x[1]===+st.lotMod);
  rows=rows.slice().sort((a,b)=>b[4]-a[4]||b[6]-a[6]);
  return `<details class="sec cartao"><summary>Lotes fora do padrão (modelo × semana de fabricação × código) ${A.btnAj('lotes')}</summary>
    <p class="suave mini">Combinações com muito mais reclamações do que o normal para aquele modelo. Já descontam o G057 (por definição).</p>
    <div class="ctrl"><div><label for="lMod">Modelo</label><select id="lMod"><option value="">todos</option>${L.modelos.map((m,i)=>`<option value="${i}" ${String(i)===String(st.lotMod)?'selected':''}>${esc(m)}</option>`).join('')}</select></div></div>
    <div class="rolagem"><table><thead><tr><th>Problema</th><th>Modelo</th><th>Semana de fabricação</th><th class="n">Casos</th><th class="n">Esperado</th><th>Evidência</th></tr></thead><tbody>
    ${rows.slice(0,25).map(([c,mo,w,nl,o,ex,rz,q])=>`<tr><td>${esc(A.nome.codsint(c))}</td><td>${esc(A.nome.mod(mo))}</td><td>${esc(w.replace('/',' a '))}</td><td class="n">${o}${o<30?'*':''}</td><td class="n">${fmt(ex,1)}</td><td>${A.badgeEvid(A.evid(o,q,q))}</td></tr>`).join('')||'<tr><td colspan="6" class="suave">Nenhum lote fora do padrão para este modelo.</td></tr>'}</tbody></table></div>
    <p class="mini suave">${rows.length} lotes com evidência. * = menos de 30 casos. Um mesmo carro que volta várias vezes pesa mais de uma vez; trate como pista a investigar.</p></details>`;
}

// ------------------------------------------------------------------ 3. efeito dominó
function secDomino(){
  const M=A.M, esc_=A.escopo(), D=M.domino[esc_][st.domNivel]; const nome=i=>st.domNivel==='fam'?`${i} · ${A.famN(i)}`:A.nome.codsint(i);
  let rows=D.rows.map(x=>({x,ev:A.evid(x[2],x[8],x[9])}));
  const fortes=rows.filter(r=>r.x[2]>=30); if(!st.domFraca) rows=fortes;
  rows=rows.slice().sort((a,b)=>b.x[2]-a.x[2]||b.x[6]-a.x[6]).slice(0,30);
  const av=M.aves_juntos;
  return `<details class="sec cartao"><summary>Efeito dominó (o que costuma vir depois no mesmo carro) ${A.btnAj('domino')}</summary>
    <p class="suave mini">Regras do tipo "carros que reclamaram de A costumam reclamar de B depois", calculadas por VIN (mesmo carro, mais de um evento). Só regras com <b>30 carros ou mais</b> aparecem por padrão; as demais são "fraca evidência".</p>
    <div class="ctrl"><span class="seg" role="group" aria-label="Nível"><button type="button" data-dn="fam" aria-pressed="${st.domNivel==='fam'}">por família</button><button type="button" data-dn="cod" aria-pressed="${st.domNivel==='cod'}">por código</button></span>
      <label class="sw" style="margin:0"><input type="checkbox" id="domFraca" ${st.domFraca?'checked':''}><span>mostrar fraca evidência</span></label></div>
    <div class="rolagem"><table><thead><tr><th>Se o carro reclamou de…</th><th>…costuma reclamar depois de</th><th class="n">Carros</th><th class="n" title="Dos carros com A, quantos tiveram B depois do A">% que tiveram B depois</th><th class="n" title="Chance de qualquer carro ter B depois do primeiro caso">% normal</th><th class="n">Atraso (meses)</th><th>Evidência</th></tr></thead><tbody>
    ${rows.map(({x,ev})=>`<tr><td>${esc(nome(x[0]))}</td><td>${x[0]===x[1]?'<b>voltar com o mesmo</b> (reincidência)':esc(nome(x[1]))}</td><td class="n">${x[2]}${x[2]<30?'*':''}</td><td class="n"><span class="${x[6]>1.15?'alto':x[6]<0.85?'baixo':''}">${pct1(x[5])}</span></td><td class="n">${pct1(x[0]===x[1]?D.base_reincidencia:x[4]/D.carros)}</td><td class="n">${fmt(x[7],1)}</td><td>${A.badgeEvid(x[2]<30&&ev==='alto'?'medio':ev)}${x[2]<30?' <span class="badge baixo">fraca evidência</span>':''}</td></tr>`).join('')||`<tr><td colspan="7" class="suave">Nenhuma regra com 30 carros ou mais e diferença clara. Ligue "mostrar fraca evidência" para ver as demais.</td></tr>`}</tbody></table></div>
    <p class="mini suave">${fmt(D.carros)} carros com pelo menos um caso. A ordem é a da data do caso. "Voltar com o mesmo" é a reincidência: o mesmo carro abre outro caso com o mesmo código (ou família) em outro dia; a coluna "% normal" mostra a taxa média de reincidência (${pct1(D.base_reincidencia)}). Em vermelho, quando está acima do normal.</p>
    <h4 style="margin-top:14px">Auditoria (AVES): falhas que aparecem juntas no mesmo carro</h4><p class="mini suave">Amostra pequena (${av.carros} carros). Só como pista.</p>
    <div class="rolagem"><table><tbody>${av.rows.slice(0,6).map(x=>`<tr><td>${esc(A.nome.tipo(x[0]))}</td><td>${esc(A.nome.tipo(x[1]))}</td><td class="n">${x[2]} carros</td><td class="n">${pct1(x[5])} dos carros com A</td><td><span class="badge baixo">fraca evidência</span></td></tr>`).join('')}</tbody></table></div></details>`;
}

// ------------------------------------------------------------------ 4. dados novos
function secNovos(){
  return `<details class="sec cartao"><summary>Quando entram dados novos ${A.btnAj('novos')}</summary>
    <p class="suave mini">Carregue um CSV com as <b>mesmas colunas</b> do DPHU, AVES ou GMF (o site descobre qual é). Tudo é calculado no seu navegador; nada é enviado.</p>
    <div class="drop" id="drop"><p style="margin:0 0 8px">Arraste o arquivo CSV aqui ou escolha:</p><input type="file" id="arq" accept=".csv,text/csv,text/plain" style="width:auto"><p class="mini suave" style="margin:8px 0 0">Colunas mínimas — DPHU: VIN, Type Code, Final Element Code, Final Incident Code, Demerit · AVES: VIN, Tipo de veículo, Descrição defeito, Demérito (pt) · GMF: VIN, MODEL CODE, SYMPTOM CODE</p></div>
    <p class="mini" style="margin:8px 0">Ou cole as linhas aqui (com o cabeçalho):</p><textarea id="colar" style="min-height:70px" placeholder="VIN,Type Code,Final Element Code,..."></textarea>
    <div style="margin:8px 0"><button class="btn" id="novosGo" type="button">Analisar dados novos</button> <button class="btn sec" id="exemploCsv" type="button">Baixar CSV de exemplo (DPHU)</button></div>
    <div id="novosSaida">${st.novos||''}</div></details>`;
}

function liga(box){
  const ref=()=>A.mods.alert.desenhar();
  $('#tMod',box).onchange=e=>{ st.mod=e.target.value; ref(); };
  $('#tMes',box).onchange=e=>{ st.mes=e.target.value; ref(); };
  $('#tFam',box).onchange=e=>{ st.fam=e.target.value; ref(); };
  $$('#ordT button',box).forEach(b=>b.onclick=()=>{ st.ordT=b.dataset.o; ref(); });
  $('#tLim',box).onchange=e=>{ st.lim=Math.max(1,parseInt(e.target.value)||5); ref(); };
  $('#lMod',box).onchange=e=>{ st.lotMod=e.target.value; ref(); };
  $$('[data-dn]',box).forEach(b=>b.onclick=()=>{ st.domNivel=b.dataset.dn; ref(); });
  $('#domFraca',box).onchange=e=>{ st.domFraca=e.target.checked; ref(); };
  const drop=$('#drop',box);
  const ler=f=>{ const rd=new FileReader(); rd.onload=()=>analisarNovos(String(rd.result)); rd.readAsText(f,'utf-8'); };
  $('#arq',box).onchange=e=>{ if(e.target.files[0]) ler(e.target.files[0]); };
  drop.ondragover=e=>{ e.preventDefault(); drop.classList.add('sobre'); }; drop.ondragleave=()=>drop.classList.remove('sobre');
  drop.ondrop=e=>{ e.preventDefault(); drop.classList.remove('sobre'); if(e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]); };
  $('#novosGo',box).onclick=()=>{ const t=$('#colar',box).value; if(t.trim()) analisarNovos(t); };
  $('#exemploCsv',box).onclick=()=>{ const L=A.L, linhas=['VIN,Type Code,Final Element Code,Final Incident Code,Demerit,Vehicle MADU Date']; for(let i=0;i<40;i++) linhas.push(`VIN-9${String(i).padStart(5,'0')},${L.modelos[0]},${L.elem[0][0]},${L.inc[0][0]},,15/07/2026`); const b=new Blob([linhas.join('\n')],{type:'text/csv'}), u=URL.createObjectURL(b), a=document.createElement('a'); a.href=u; a.download='exemplo_dphu.csv'; a.click(); URL.revokeObjectURL(u); };
}

// ---- CSV
function parseCSV(txt){
  txt=txt.replace(/^﻿/,''); const prim=txt.split(/\r?\n/,1)[0]; const delim=[';','\t',','].map(d=>[d,prim.split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let cur=[],f='',q=false;
  for(let i=0;i<txt.length;i++){ const c=txt[i];
    if(q){ if(c==='"'){ if(txt[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if(c==='"') q=true; else if(c===delim){ cur.push(f); f=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&txt[i+1]==='\n') i++; cur.push(f); f=''; if(cur.some(x=>x!=='')) rows.push(cur); cur=[]; }
    else f+=c; }
  if(f!==''||cur.length){ cur.push(f); rows.push(cur); }
  const head=rows.shift().map(h=>h.trim());
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]??'').trim()])));
}
const col=(r,...nomes)=>{ for(const n of nomes){ const k=Object.keys(r).find(x=>x.toLowerCase()===n.toLowerCase()); if(k!==undefined&&r[k]!=='') return r[k]; } return ''; };

function analisarNovos(txt){
  let rows; try{ rows=parseCSV(txt); }catch(e){ rows=[]; }
  const out=$('#novosSaida'); if(!rows.length){ out.innerHTML='<div class="aviso bordo"><b class="t">Não consegui ler linhas.</b> Confira se o cabeçalho está na primeira linha.</div>'; return; }
  const k=Object.keys(rows[0]).map(x=>x.toLowerCase());
  const tipo=k.includes('final element code')?'dphu':k.includes('symptom code')?'gmf':(k.includes('descrição defeito')||k.includes('código do defeito'))?'aves':null;
  if(!tipo){ out.innerHTML='<div class="aviso bordo"><b class="t">Não reconheci o tipo de arquivo.</b> O cabeçalho precisa ter "Final Element Code" (DPHU), "Descrição defeito" (AVES) ou "SYMPTOM CODE" (GMF).</div>'; return; }
  const al=tipo==='dphu'?alertasDphu(rows):tipo==='gmf'?alertasGmf(rows):alertasAves(rows);
  const nome={dphu:'DPHU (fábrica)',aves:'AVES (auditoria)',gmf:'GMF (garantia)'}[tipo];
  st.novos=`<div class="aviso azul"><b>Arquivo reconhecido como ${nome}:</b> ${fmt(rows.length)} linhas · ${al.length} alerta(s).</div>`+(al.join('')||'<p class="suave">Nada fora do padrão neste lote.</p>');
  out.innerHTML=st.novos;
}
const cardAl=(titulo,corpo,ev,nivel)=>`<div class="alerta ${nivel||ev}"><h4>${titulo} ${A.badgeEvid(ev)}</h4><div>${corpo}</div><p class="mini suave" style="margin:6px 0 0">Associação estatística, não prova de causa.</p></div>`;

function alertasDphu(rows){
  const M=A.M, L=A.L, esc_=A.escopo(), N=rows.length; const idx=new Map(L.elem.map((e,i)=>[e[0],i])); const tot=L.elem.reduce((s,e)=>s+e[2],0);
  const g=new Map();
  rows.forEach(r=>{ const e=col(r,'Final Element Code'); const i=idx.get(e); const k=i??('?'+e); const o=g.get(k)||{n:0,sev:0,mod:new Map()}; o.n++; o.sev+=A.peso(col(r,'Demerit')||'sem'); const m=col(r,'Type Code'); o.mod.set(m,(o.mod.get(m)||0)+1); g.set(k,o); });
  const lista=[];
  g.forEach((o,k)=>{ const exp=typeof k==='number'?L.elem[k][2]/tot*N:0; if(o.n>=30||(o.n>=10&&o.n>=1.5*exp)) lista.push({k,o,exp}); });
  lista.sort((a,b)=>b.o.n-a.o.n||b.o.sev-a.o.sev);
  return lista.slice(0,15).map(({k,o,exp})=>{
    if(typeof k!=='number') return cardAl(`Elemento novo ${esc(k.slice(1))}`,`<b>${o.n}</b> carros com um elemento que não existe no histórico. Sem como estimar o que isso antecede.`,'baixo');
    const info=M.info_el[esc_].elem[String(k)], rs=M.assoc[esc_].DG_elem.rows.filter(x=>x[0]===k).sort((a,b)=>b[2]-a[2]||a[5]-b[5]), Nn=M.assoc[esc_].DG_elem.N;
    let hist='Sem histórico suficiente para dizer o que isso antecede.', ev='baixo';
    if(rs.length&&rs[0][2]>=2){ const [,y,n,nX,nY,p,q,lag]=rs[0]; ev=A.evid(n,p,q); hist=`Historicamente, isso antecede reclamações de <b>${esc(y)} · ${esc(A.famN(y))}</b>${lag!=null?` em ~<b>${fmt(lag,1)} meses</b>`:''}, em <b>${pct1(n/nX)}</b> dos casos (${n} carros).`; }
    return cardAl(`${o.n} carros com «${esc(A.nome.elem(k))}»`,`${exp>0?`Esperado neste lote: ~${fmt(exp,1)}; vieram ${o.n}. `:''}Gravidade (pesos): ${o.sev}. ${hist}${info?`<br><span class="mini suave">Dos ${fmt(info[0])} carros históricos com esse defeito, ${pct1(info[1]/info[0])} reclamaram.</span>`:''}`,ev);
  });
}
function alertasGmf(rows){
  const M=A.M, esc_=A.escopo(), N=rows.length, S=M.stats[esc_]; const g=new Map(); const vins=new Map(); let rein=0;
  rows.forEach(r=>{ const m=/^\s*(\S+?)\s+-/.exec(col(r,'SYMPTOM CODE')); if(!m) return; const c=m[1]; if(A.estado.excl&&c==='G057') return; const f=c[0].toUpperCase();
    const o=g.get(f)||{n:0,cod:new Map()}; o.n++; o.cod.set(c,(o.cod.get(c)||0)+1); g.set(f,o);
    const v=col(r,'VIN').toUpperCase(); if(v){ const k=v+'|'+c; if(vins.has(k)) rein++; vins.set(k,1); } });
  const lista=[]; g.forEach((o,f)=>{ const exp=(S.share[f]||0)*[...g.values()].reduce((s,x)=>s+x.n,0); if(o.n>=10&&o.n>=2*exp) lista.push({f,o,exp}); });
  lista.sort((a,b)=>b.o.n-a.o.n);
  const out=lista.slice(0,10).map(({f,o,exp})=>{
    const rs=M.domino[esc_].fam.rows.filter(x=>x[0]===f&&x[1]!==f&&x[6]>=1.15).sort((a,b)=>b[2]-a[2]); const top=[...o.cod.entries()].sort((a,b)=>b[1]-a[1])[0];
    let hist='Sem padrão claro do que costuma vir depois.', ev='baixo';
    if(rs.length&&rs[0][2]>=5){ const x=rs[0]; ev=A.evid(x[2],x[8],x[9]); hist=`Historicamente, carros assim reclamam depois de <b>${esc(x[1])} · ${esc(A.famN(x[1]))}</b> em ~<b>${fmt(x[7],1)} meses</b>, em <b>${pct1(x[5])}</b> dos casos (${x[2]} carros).`; }
    return cardAl(`${o.n} casos de garantia na família ${esc(f)} · ${esc(A.famN(f))}`,`Esperado ~${fmt(exp,1)}; vieram ${o.n}. Código mais frequente: ${esc(A.codIdx.has(top[0])?A.nome.codsint(A.codIdx.get(top[0])):top[0])} (${top[1]}). ${hist}`,ev);
  });
  if(rein>0) out.push(cardAl(`${rein} reincidência(s) no próprio arquivo`,'Mesmo carro com o mesmo código de sintoma mais de uma vez: o reparo pode não ter resolvido.','medio'));
  return out;
}
function alertasAves(rows){
  const M=A.M, L=A.L, esc_=A.escopo(); const tix=new Map(L.tipo.map((t,i)=>[t[0],i])); const g=new Map();
  rows.forEach(r=>{ const d=col(r,'Descrição defeito'); if(!d) return; const t=d.split('-')[0].trim(); const o=g.get(t)||{n:0,sev:0}; o.n++; o.sev+=A.peso((col(r,'Demérito (pt)')||'V2').replace(/[()]/g,'').trim()); g.set(t,o); });
  return [...g.entries()].filter(([,o])=>o.n>=3).sort((a,b)=>b[1].n-a[1].n).slice(0,12).map(([t,o])=>{
    const i=tix.get(t), rs=i==null?[]:M.assoc[esc_].AG.rows.filter(x=>x[0]===i).sort((a,b)=>b[2]-a[2]);
    const hist=rs.length?`Nos poucos carros que passaram pelo AVES e pela garantia, isso antecedeu <b>${esc(rs[0][1])} · ${esc(A.famN(rs[0][1]))}</b> (${rs[0][2]} carros).`:'Sem histórico no AVES × GMF para este tipo de falha.';
    return cardAl(`${o.n} auditorias com «${esc(t)}»`,`Gravidade (pesos): ${o.sev}. ${hist} <span class="badge baixo">amostra pequena</span>`,'baixo');
  });
}
})();

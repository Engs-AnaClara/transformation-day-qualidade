function criarMotor(M){
  const STOP=new Set(M.norm.stop), TY=new Map(Object.entries(M.norm.typos));
  const NW=M.vocab.nw, IDF=M.vocab.idf, FEATS=M.vocab.feats, IDX=new Map(FEATS.map((f,i)=>[f,i]));
  const P=M.num;

  // Texto -> palavras. ESPELHO de treinar.py::tokens
  function tokens(texto){
    let s=String(texto).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(!s) return [];
    const out=[];
    for(const t0 of s.split(' ')){
      let t=TY.get(t0)||t0.replace(/aao/g,'cao');
      t=TY.get(t)||t;
      if(t.length>=2&&!STOP.has(t)) out.push(t);
    }
    return out;
  }
  // Palavras e pedaços de letras. ESPELHO de treinar.py::contagem_features. `orig` guarda de qual palavra veio cada feature.
  function features(toks){
    const c=new Map(), orig=new Map();
    const add=(f,...is)=>{c.set(f,(c.get(f)||0)+1); if(!orig.has(f)) orig.set(f,[]); const o=orig.get(f); for(const i of is) if(!o.includes(i)) o.push(i);};
    toks.forEach((t,i)=>{
      add('w:'+t,i);
      if(i+1<toks.length) add('w:'+t+' '+toks[i+1],i,i+1);
      const s=' '+t+' ';
      for(const n of [3,4,5]) for(let k=0;k<=s.length-n;k++) add('c:'+s.substr(k,n),i);
    });
    return {c,orig};
  }
  function numericas(modelo,km,mis){
    const v=P.modelos.map(m=>m===modelo?1:0);
    if(km==null) v.push(0,P.neutro_km10k);
    else v.push((Math.log1p(Math.min(Math.max(km,0),150000))-P.media_logkm)/P.dp_logkm,(km>=9000&&km<=11000)?1:0);
    v.push(mis==null?0:(Math.min(Math.max(mis,0),24)-P.media_mis)/P.dp_mis);
    return v;
  }
  // tf-idf (tf sublinear, cada bloco normalizado)
  function vetor(toks){
    const {c,orig}=features(toks), itens=[];
    for(const [f,k] of c){ const j=IDX.get(f); if(j!==undefined) itens.push({j,v:(1+Math.log(k))*IDF[j],o:orig.get(f)}); }
    for(const bloco of [it=>it.j<NW, it=>it.j>=NW]){
      const parte=itens.filter(bloco); let s=0; for(const it of parte) s+=it.v*it.v;
      const n=Math.sqrt(s); for(const it of parte) it.v/=n;
    }
    return itens;
  }
  function logits(A,itens,num){
    const K=A.classes.length, z=A.b.slice(), e=A.esc;
    for(const it of itens) for(let q=A.ptr[it.j];q<A.ptr[it.j+1];q++) z[A.cls[q]]+=it.v*A.val[q]/e;
    for(let k=0;k<K;k++){ const w=A.num[k]; for(let i=0;i<num.length;i++) z[k]+=num[i]*w[i]; }
    return z;
  }
  function softmaxT(z,T){ const m=Math.max(...z), e=z.map(x=>Math.exp((x-m)/T)), s=e.reduce((a,b)=>a+b,0); return e.map(x=>x/s); }

  // quanto cada palavra empurrou a classe `k` para cima, em relação à média das respostas (ponderada pelas probabilidades)
  function motivos(A,itens,num,p,k){
    const por=new Map();
    for(const it of itens){
      let a=0,media=0;
      for(let q=A.ptr[it.j];q<A.ptr[it.j+1];q++){ const w=it.v*A.val[q]/A.esc; media+=p[A.cls[q]]*w; if(A.cls[q]===k) a=w; }
      const d=a-media; if(d===0) continue;
      for(const i of it.o) por.set(i,(por.get(i)||0)+d/it.o.length);
    }
    let kmEfeito=0; // efeito do "km perto de 10 mil"
    { const w=A.num[k][5]; let media=0; for(let c=0;c<A.classes.length;c++) media+=p[c]*A.num[c][5]; kmEfeito=num[5]*(w-media); }
    return {porToken:por,km10k:kmEfeito};
  }

  function prever(e,escopo){
    const toks=tokens(e.texto||''), itens=vetor(toks), num=numericas(e.modelo,e.km??null,e.mis??null);
    const r={toks,escopo};
    for(const alvo of ['fam','cod']){
      const A=M.modelos[escopo][alvo], z=logits(A,itens,num), p=softmaxT(z,A.T);
      r['p_'+alvo]=p;
      r[alvo]=p.map((pp,k)=>({c:A.classes[k],p:pp,k})).sort((a,b)=>b.p-a.p);
    }
    // palavras reconhecidas
    r.reconhecidas=toks.filter(t=>IDX.has('w:'+t)).length;
    // motivos do top-1 de código (para destacar) e dos 5 melhores
    const A=M.modelos[escopo].cod;
    r.explic={};
    r.cod.filter(x=>x.c!=='OUTROS').slice(0,5).forEach(x=>{ r.explic[x.c]=motivos(A,itens,num,r.p_cod,x.k); });
    return r;
  }
  return {tokens,prever,numericas,vetor,logits,softmaxT};
}
if(typeof module!=='undefined') module.exports=criarMotor;

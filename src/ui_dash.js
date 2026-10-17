(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {$}=A.ui;
let criado=false, htmlCache=null;
const dashHtml=()=>{ if(htmlCache) return htmlCache; const bin=atob(window.DASH_B64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return htmlCache=new TextDecoder('utf-8').decode(u); };

A.mods.dash={
  init(){
    const box=$('#a5saida');
    if(!window.DASH_B64){
      box.innerHTML=`<div class="cartao"><h3>Dashboard ${A.btnAj('dash')}</h3><div class="aviso azul" style="margin:0"><b>A dashboard não está nesta versão.</b> Ela traz dados por carro, por isso só vai no arquivo <b>com busca por VIN</b> (<code>Transformation_Qualidade.html</code>).</div></div>`;
      return;
    }
    box.innerHTML=`<div class="cartao"><div class="grupo-tit"><h3>Dashboard de qualidade ${A.btnAj('dash')}</h3><button type="button" class="btn sec" id="dashTela" style="padding:5px 12px">Abrir em tela cheia</button></div>
      <p class="suave mini" style="margin:0 0 10px">Garantia, fábrica e auditoria no mesmo painel. Ele tem os próprios filtros.</p><div id="dashAqui"><p class="suave">Carregando o painel…</p></div></div>`;
    $('#dashTela').onclick=()=>{ const u=URL.createObjectURL(new Blob([dashHtml()],{type:'text/html'})); window.open(u,'_blank'); setTimeout(()=>URL.revokeObjectURL(u),60000); };
    A.aoAbrirAba.aba5=()=>{ if(criado) return; criado=true;
      setTimeout(()=>{ const f=document.createElement('iframe'); f.className='dash-frame'; f.title='Painel de Qualidade'; f.srcdoc=dashHtml(); const alvo=$('#dashAqui'); alvo.innerHTML=''; alvo.appendChild(f); },30); };
  },
  desenhar(){}
};
})();

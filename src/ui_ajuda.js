(function(){
if(typeof module!=='undefined') return;
const A=window.APP, {esc,fmt,pct,pct1}=A.ui;
A.textos=A.textos||{};
const EV='<p><b>Evidência:</b> <b>alta</b> = 30 carros ou mais e diferença confirmada depois de corrigir para muitos testes; <b>média</b> = diferença provável, mas com poucos carros; <b>baixa</b> = pode ser acaso. Asterisco (*) = menos de 30 casos. Sempre: associação estatística, não prova de causa.</p>';
const DEM='<p><b>Demérito (gravidade):</b> V1+ crítico (o cliente não tolera) · V1 vai à concessionária imediatamente · V2 não vai direto · V3 muito leve · "sem demérito" = testes de função.</p>';
const T=A.textos;

T.g057=()=>{ const pf=A.M.sobre.perfil; return `<h4>Por que existe o filtro "Excluir G057"?</h4>
  <p>O G057 (consumo de óleo alto) é cerca de <b>46% de todas as linhas do GMF</b>. Pelos dados, ele se concentra em revisões de 10.000 km e não em defeitos:</p>
  <ul class="limpa"><li><b>${pct(pf.g057_revisao)}</b> dos casos citam "revisão" (ou subsídio de mão de obra);</li><li><b>${pct(pf.g057_km_9_11k)}</b> estão entre 9 e 11 mil km;</li><li>o mesmo carro repete o G057 perto de 10 e de 20 mil km.</li></ul>
  <p>Como ele é tão grande, pode esconder os outros problemas. O filtro é <b>opcional</b>: ligue para ver tudo sem o G057 (vale para todas as abas) e desligue quando quiser.</p>`; };

T.busca=()=>{ const Q=A.M.qual, S=Q.sobreposicao; return `<h4>Como funciona a busca por VIN</h4>
  <p>O VIN é o número do chassi: ele liga o <b>mesmo carro</b> nas três tabelas.</p>
  <ul class="limpa"><li><b>Fábrica (DPHU):</b> defeitos de montagem registrados na linha, com o demérito.</li><li><b>Auditoria (AVES):</b> olha os detalhes; é uma amostra aleatória de 1 carro a cada 50.</li><li><b>Garantia (GMF):</b> o que o cliente reclamou depois, com km, meses de uso e custo.</li></ul>
  ${DEM}
  <p>Aceita "vin 1", "VIN-000001" e minúsculas. Só cerca de 7% dos carros da fábrica chegam à garantia, então muitos carros aparecem em uma tabela só.</p>
  <p class="mini suave">Dados: DPHU ${fmt(Q.dphu.vins)} carros · AVES ${fmt(Q.aves.vins)} · GMF ${fmt(Q.gmf.vins)}. VINs em comum: DPHU×GMF ${fmt(S.DG)} · DPHU×AVES ${fmt(S.DA)} · AVES×GMF ${fmt(S.AG)} · nas três ${fmt(S.tres)}. ${fmt(Q.gmf.km_zero)} casos do GMF têm km = 0.</p>`; };

T.comum=()=>`<h4>Como ler "o que as tabelas têm em comum"</h4>
  <p><b>✓ azul</b> = há algo em comum; <b>— apagado</b> = não há. Só entram dados <b>deste carro</b>.</p>
  <ul class="limpa"><li><b>Mesmo mês de fabricação:</b> compara o mês que a fábrica e a garantia informam (as bases podem divergir um pouco).</li>
  <li><b>Tempo:</b> quantos dias passaram entre um evento e outro.</li>
  <li><b>Mesma família:</b> a família do defeito de fábrica ou de auditoria é <b>estimada pelas palavras do nome do defeito</b> e comparada com a família do código de sintoma da garantia.</li>
  <li><b>Palavras em comum:</b> compara o texto do defeito (português) com o sintoma (inglês, do dicionário) e um trecho do diagnóstico; por isso coincidir é raro.</li>
  <li><b>Demérito:</b> se a gravidade é igual na fábrica e na auditoria.</li></ul>`;

T.problemas=()=>{ const me=A.M.sobre.metricas, esc_=A.escopo(); const L=(n,m,k)=>`<tr><td>${n}</td><td class="n">${pct1(m.top1)}</td><td class="n">${pct1(m['top'+k])}</td><td class="n">${pct1(m.chute_top1)}</td></tr>`;
  const cal=me[esc_].cod.calibracao;
  return `<h4>Como o modelo chega nesses números</h4>
  <p>Ele lê o texto (palavras e pedaços de palavras, para aguentar erros de digitação) junto com o <b>modelo, o km e os meses de uso</b>, e calcula a chance de cada problema. As chances são <b>calibradas</b>: "60%" significa perto de 60% de acerto, não "certeza".</p>
  <p><b>Quanto ele acerta</b> (teste em ${esc(A.M.meta.teste)}, meses que ele nunca viu):</p>
  <table><thead><tr><th>Alvo</th><th class="n">Acerta 1º</th><th class="n">Está no top-3 / top-5</th><th class="n">"Chute"</th></tr></thead><tbody>
  <tr><td colspan="4" style="font-weight:600">Com G057</td></tr>${L('Família',me.com.fam,3)}${L('Código',me.com.cod,5)}
  <tr><td colspan="4" style="font-weight:600">Sem G057</td></tr>${L('Família',me.sem.fam,3)}${L('Código',me.sem.cod,5)}</tbody></table>
  <p class="mini suave">"Chute" = sempre apostar na classe mais comum. Com G057 os números sobem porque ele é fácil de reconhecer; <b>sem G057 é o teste mais honesto</b>.</p>
  <p><b>Confiança baixa</b> aparece quando o texto é curto, poucas palavras são reconhecidas ou nenhuma resposta passa de 30%.</p>
  <p class="mini suave">Quando o modelo diz… (código, ${esc_==='com'?'com':'sem'} G057): ${cal.filter(b=>b.n>0).map(b=>`${Math.round(b.de*100)}–${Math.round(b.ate*100)}% → acertou ${pct(b.acerto)}`).join(' · ')}.</p>`; };

T.palavras=()=>`<h4>Palavras que o modelo leu</h4><p>É o texto já limpo: minúsculas, sem acento e com erros comuns corrigidos (por exemplo "injeaao" vira "injecao"). As palavras <b>destacadas</b> foram as que mais puxaram para o problema nº 1.</p>`;

T.correlacao=()=>`<h4>Como ler "Correlação entre elas"</h4>
  <ul class="limpa"><li><span class="badge base-vin">BASE: VIN</span> usa só os carros que estão <b>nas duas tabelas</b>: é o mesmo carro. Compara se o defeito de fábrica é da mesma família da reclamação (família do defeito estimada pelas palavras do nome) e diz quanto seria o normal.</li>
  <li><span class="badge base-coorte">BASE: COORTE</span> vale para os carros <b>sem registro no DPHU</b>. A ligação é só por <b>modelo × mês de fabricação</b>: <b>não é o mesmo carro</b>.</li></ul>${EV}`;

T.tend=()=>`<h4>Tendências por data de fabricação</h4>
  <ul class="limpa"><li><b>Fábrica:</b> os 10 defeitos mais frequentes do modelo no mês, com a quantidade de cada <b>demérito</b> em uma coluna (V1+ crítico, V1, V2, V3 e "sem demérito" = testes de função).</li>
  <li><b>Garantia:</b> as famílias de reclamação dos carros daquele modelo e mês de fabricação. <b>▲ acima do normal</b> aparece quando a família pesa pelo menos 15% mais ali do que no GMF inteiro (e tem casos suficientes). <b>Meses de uso</b> = idade típica do carro quando reclamou.</li>
  <li><b>Casos por mês de fabricação:</b> as colunas com o nome de cada mês mostram quantos casos o problema teve no mês escolhido (primeira coluna, em rosa) e nos 3 meses anteriores com dados (do mais novo ao mais antigo). Quadro <b>azul</b> = o problema ocorreu naquele mês (casos ≥ o mínimo que você definiu, padrão 5). <b>Situação:</b> <b>Recorrente</b> = ocorreu em todos os meses anteriores; <b>Voltou</b> = em alguns; <b>Novo neste mês</b> = em nenhum.</li>
  <li>Janeiro/2026 não tem dados; por isso o "mês anterior" de fev/2026 é dez/2025.</li>
  <li>No gráfico, meses com menos de 30 casos de garantia ficam de fora.</li></ul>`;

T.lotes=()=>`<h4>Lotes fora do padrão</h4>
  <p>Um lote é <b>modelo × semana de fabricação</b>. O <b>esperado</b> é a % daquele código no modelo vezes o número de casos do lote. Só aparecem lotes com <b>bem mais casos que o esperado</b>, confirmados depois de corrigir para muitos testes. O G057 fica de fora por definição.</p>
  <p class="mini suave">Um mesmo carro que volta várias vezes pesa mais de uma vez: trate como pista a investigar.</p>${EV}`;

T.domino=()=>`<h4>Efeito dominó</h4>
  <p>Regras do tipo "carros que reclamaram de <b>A</b> costumam reclamar de <b>B</b> depois", calculadas por <b>VIN</b> (mesmo carro, mais de um evento). Só conta o B que vem <b>depois</b> do A.</p>
  <ul class="limpa"><li><b>% que tiveram B depois:</b> dos carros com A, quantos tiveram B depois.</li>
  <li><b>% normal:</b> a chance de qualquer carro ter B depois do seu primeiro caso. Bordô = acima do normal.</li>
  <li><b>Voltar com o mesmo (reincidência):</b> o mesmo carro abre outro caso com o mesmo código ou família, em outro dia.</li>
  <li>Só regras com <b>30 carros ou mais</b> aparecem por padrão; as demais são "fraca evidência".</li></ul>${EV}`;

T.novos=()=>`<h4>Quando entram dados novos</h4>
  <p>Carregue um CSV com as <b>mesmas colunas</b> do DPHU, AVES ou GMF. O site descobre qual é e compara com o histórico, tudo no seu navegador (nada é enviado).</p>
  <ul class="limpa"><li><b>DPHU:</b> alerta quando o lote tem 30 carros ou mais com o mesmo defeito, ou 10 ou mais e pelo menos 1,5 vez o habitual.</li>
  <li><b>GMF:</b> alerta quando uma família tem 10 casos ou mais e pelo menos o dobro do esperado; avisa também carros que repetem o mesmo código.</li>
  <li><b>AVES:</b> agrupa por tipo de falha (3 auditorias ou mais).</li></ul>
  <p>Cada alerta diz o que o histórico mostra que costuma vir depois e o nível de evidência.</p>${EV}`;

T.prior=()=>{ const M=A.M, S=M.stats[A.escopo()], ncod={}; Object.keys(M.dic).forEach(c=>{ ncod[c[0]]=(ncod[c[0]]||0)+1; });
  const linhas=Object.entries(S.share).filter(([f])=>M.fam_nomes[f]&&S.n_fam[f]>=5).sort((a,b)=>b[1]-a[1]).map(([f,p])=>`<tr><td><b>${esc(f)}</b></td><td>${esc(M.fam_nomes[f])}</td><td class="n">${ncod[f]||0}</td><td class="n">${pct(p)}</td></tr>`).join('');
  return `<h4>Como ler as prioridades</h4>
  <ul class="limpa"><li><b>Quantidade</b> (padrão) é o critério principal; a <b>gravidade</b> desempata. Você pode trocar a ordenação.</li>
  <li><b>Gravidade (ponderada):</b> soma dos pesos do demérito (editáveis em "Pesos do demérito"). <b>Gravidade média:</b> peso médio por defeito.</li>
  <li>No <b>GMF</b> não existe demérito: a gravidade é aproximada pelo <b>custo do reparo</b>.</li>
  <li>No <b>AVES</b> o mês é o da auditoria (a tabela não traz o mês de fabricação).</li>
  <li>A <b>família</b> do DPHU e do AVES é estimada pelas palavras do nome do defeito.</li></ul>${DEM}
  <p><b>O que é uma família?</b> Todo código de sintoma começa com uma letra (G057, R187…). A letra junta códigos parecidos numa mesma área do carro.</p>
  <table><thead><tr><th></th><th>Família</th><th class="n">Códigos</th><th class="n">% dos casos</th></tr></thead><tbody>${linhas}</tbody></table>`; };

T.dash=()=>`<h4>Sobre a dashboard</h4>
  <p>É o <b>Painel de Qualidade</b> (última versão que fizemos), com garantia (GMF), fábrica (DPHU) e auditoria (AVES) no mesmo lugar. Ele tem os <b>próprios filtros</b> e abas (Principais e Detalhado); o interruptor "Excluir G057" do topo deste site não muda o painel, mas o painel tem o seu.</p>
  <p class="mini suave">Roda dentro desta página, sem internet. Se preferir, use "Abrir em tela cheia".</p>`;
})();

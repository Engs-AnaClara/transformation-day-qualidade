# Transformation Day · Qualidade

Site que faz as tabelas **DPHU** (fábrica), **AVES** (auditoria) e **GMF** (garantia) conversarem pelo **VIN**, para enxergar o problema cedo, antes de virar insatisfação do cliente. O site roda 100% no navegador, sem servidor.

> **Este repositório contém apenas código. Não há dados, planilhas, modelos treinados nem arquivos gerados.** Eles são material confidencial e ficam fora do GitHub (veja o `.gitignore`).

## Como funciona
1. `treinar.py` lê as planilhas, treina o classificador de texto (TF-IDF + regressão logística, calibrado) e, com o `agregados.py`, calcula as correlações por VIN, alertas e cubos de prioridade. Gera `modelo.js`/`modelo.json` e `vins.js`.
2. `montar_site.py` junta o código de `src/` em `site.html`.
3. `empacotar.py` embute tudo em arquivos únicos que abrem com duplo clique.
4. `testar.py` valida o site contra o Python (probabilidades iguais).

## Como rodar
Precisa das planilhas (não incluídas), Python 3.12, e Node 22 só para o teste.

```bash
python3 -m venv .venv
.venv/bin/pip install pandas numpy scipy scikit-learn openpyxl
.venv/bin/python treinar.py --dados "Transformation Day Qualidade - Dados 2.xlsx" --dicionario "Dicionario_Codigos_Sintoma_GMF.xlsx"
python3 montar_site.py
python3 empacotar.py
.venv/bin/python testar.py
```

A aba Dashboard precisa do painel `src/dashboard_painel.html` (não incluído); sem ele, a aba mostra um aviso.

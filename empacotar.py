#!/usr/bin/env python3
"""Gera os arquivos únicos (abrem com duplo clique, sem pasta):
   Transformation_Qualidade.html          -> com busca por VIN (índice de VINs embutido)
   Transformation_Qualidade_sem_VIN.html  -> sem o índice de VINs (só agregados)
"""
from pathlib import Path

aqui = Path(__file__).resolve().parent
site = (aqui / "site.html").read_text(encoding="utf-8")
modelo = (aqui / "modelo.js").read_text(encoding="utf-8").replace("</", "<\\/")      # não fechar a tag <script> por engano
tm, tv, td = '<script src="modelo.js"></script>', '<script src="vins.js"></script>', '<script src="dashboard.js"></script>'
assert tm in site and tv in site and td in site, "site.html mudou: não achei as linhas de modelo.js/vins.js/dashboard.js"
base = site.replace(tm, "<script>" + modelo + "</script>")
vins = aqui / "vins.js"
if vins.exists():
    dash = (aqui / "dashboard.js").read_text(encoding="utf-8")      # base64: não tem "</"
    (aqui / "Transformation_Qualidade.html").write_text(base.replace(tv, "<script>" + vins.read_text(encoding="utf-8").replace("</", "<\\/") + "</script>").replace(td, "<script>" + dash + "</script>"), encoding="utf-8")
    print("Transformation_Qualidade.html gerado (com busca por VIN)")
(aqui / "Transformation_Qualidade_sem_VIN.html").write_text(base.replace(tv, "").replace(td, ""), encoding="utf-8")   # sem VIN: sem a dashboard (ela traz dados por carro)
print("Transformation_Qualidade_sem_VIN.html gerado")

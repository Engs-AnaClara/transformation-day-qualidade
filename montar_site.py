#!/usr/bin/env python3
"""Monta `site.html` juntando os pedaços de `src/` (estilo, corpo, motor do classificador e as telas)."""
from pathlib import Path

aqui = Path(__file__).resolve().parent
src = aqui / "src"
ler = lambda n: (src / n).read_text(encoding="utf-8")
telas = ["ui_core.js", "ui_ajuda.js", "ui_vin.js", "ui_clf.js", "ui_alert.js", "ui_prior.js", "ui_dash.js"]
html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transformation Day · Qualidade</title>
<style>
{ler('estilo_base.css')}
{ler('estilo_novo.css')}
</style>
</head>
<body>
{ler('corpo.html')}
<script src="modelo.js"></script>
<script src="vins.js"></script>
<script src="dashboard.js"></script>

<!-- MOTOR do classificador (sem tela; igual ao treinar.py) -->
<script id="motor">
{ler('motor.js')}
</script>
""" + "\n".join(f"<script id=\"{t[:-3]}\">\n{ler(t)}\n</script>" for t in telas) + """
<script>APP.iniciar();</script>
</body>
</html>
"""
(aqui / "site.html").write_text(html, encoding="utf-8")
# a dashboard vai em arquivo à parte (como o vins.js), em base64
import base64
painel = src / "dashboard_painel.html"
if painel.exists():
    (aqui / "dashboard.js").write_text('window.DASH_B64="' + base64.b64encode(painel.read_bytes()).decode() + '";', encoding="utf-8")
else:
    print("aviso: src/dashboard_painel.html não está na pasta; a aba Dashboard mostrará um aviso.")
print("site.html montado:", len(html) // 1024, "KB")

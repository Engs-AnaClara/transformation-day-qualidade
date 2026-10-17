#!/usr/bin/env python3
"""
testar.py — confere o protótipo.

1. Recalcula as probabilidades a partir do modelo.json (sem scikit-learn) e confere que o acerto
   no período de teste é o mesmo que o treinar.py informou.
2. Pega 10 reclamações reais do GMF (período de teste) e mostra texto, código real e top 3 previsto.
3. Roda o MESMO motor do site.html (JavaScript, via Node) e confere que as probabilidades são iguais.
Saída: TESTE.md e teste_casos.json.
"""
import argparse, json, math, subprocess, sys
from pathlib import Path

import numpy as np
import pandas as pd

import treinar as T

AQUI = Path(__file__).resolve().parent


def carregar():
    return json.loads((AQUI / "modelo.json").read_text(encoding="utf-8"))


class Ref:
    """Calculadora de referência: lê só o JSON (igual ao que o site faz)."""
    def __init__(self, M):
        self.M = M
        self.idx = {f: i for i, f in enumerate(M["vocab"]["feats"])}
        self.idf = M["vocab"]["idf"]; self.nw = M["vocab"]["nw"]
        self.par = {k: M["num"][k] for k in ("media_logkm", "dp_logkm", "neutro_km10k", "media_mis", "dp_mis")}
        T.STOP.clear(); T.STOP.update(M["norm"]["stop"])   # usa as mesmas regras gravadas no JSON

    def vetor(self, texto):
        c = T.contagem_features(T.tokens(texto))
        itens = [(self.idx[f], (1 + math.log(k)) * self.idf[self.idx[f]]) for f, k in c.items() if f in self.idx]
        out = []
        for bloco in (lambda j: j < self.nw, lambda j: j >= self.nw):
            parte = [(j, v) for j, v in itens if bloco(j)]
            n = math.sqrt(sum(v * v for _, v in parte))
            out += [(j, v / n) for j, v in parte]
        return out

    def prob(self, escopo, alvo, texto, modelo, km=None, mis=None):
        A = self.M["modelos"][escopo][alvo]
        itens = self.vetor(texto)
        num = T.numericas(modelo, km, mis, self.par)
        z = np.array(A["b"], dtype=float)
        for j, v in itens:
            for q in range(A["ptr"][j], A["ptr"][j + 1]):
                z[A["cls"][q]] += v * A["val"][q] / A["esc"]
        z += np.array(A["num"]) @ np.array(num)
        z = z / A["T"]; z -= z.max(); e = np.exp(z)
        return (e / e.sum()).tolist()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dados"); ap.add_argument("--dicionario")
    args = ap.parse_args()
    M = carregar(); ref = Ref(M)
    _, _, gmf, dic, fam = T.ler(args)
    g, cod_info, _ = T.preparar_gmf(gmf, dic, fam)
    txt = g[g["cod"].notna() & g["CUSTOMER VERBATIM"].notna()].copy()
    teste = txt[(txt["criado"] > pd.Timestamp(T.FIM_TREINO + " 23:59:59")) & (txt["criado"].dt.strftime("%Y-%m") != T.CALIB_MES)]
    teste = teste[teste["CUSTOMER VERBATIM"].map(lambda s: len(T.tokens(s))) > 0]
    print(f"Teste: {len(teste)} casos reais (jul–ago/2026)")

    # ---- 1. o JSON reproduz as métricas do treino?
    linhas = []
    for escopo in ("com", "sem"):
        sub = teste if escopo == "com" else teste[teste["cod"] != "G057"]
        A = M["modelos"][escopo]["cod"]; cl = A["classes"]
        acert = acert5 = 0
        for texto, mod, km, mis, real in zip(sub["CUSTOMER VERBATIM"], sub["modelo"], sub["km"], sub["mis"], sub["cod"]):
            p = ref.prob(escopo, "cod", texto, mod, float(km), float(mis))
            ordem = np.argsort(-np.array(p))
            top = [cl[i] for i in ordem if cl[i] != "OUTROS"][:5]   # 'OUTROS' nunca conta
            acert += top[0] == real; acert5 += real in top
        n = len(sub)
        m = M["sobre"]["metricas"][escopo]["cod"]
        ok1 = abs(acert / n - m["top1"]) < 0.002; ok5 = abs(acert5 / n - m["top5"]) < 0.002
        linhas.append(f"- {escopo.upper()} G057: top-1 = {acert / n:.1%} (treinar.py: {m['top1']:.1%}) · top-5 = {acert5 / n:.1%} "
                      f"(treinar.py: {m['top5']:.1%}) → {'IGUAL' if ok1 and ok5 else 'DIFERENTE!'}")
        print(linhas[-1])

    # ---- 2. 10 reclamações reais (variadas, sementes fixas)
    alvos = ["G057", "G057", "G045", "G091", "H255", "B235", "R186", "G022", "C", "I", "O", "V"]
    casos, usados = [], set()
    rng = np.random.RandomState(T.SEED)
    for a in alvos:
        pool = teste[(teste["cod"] == a) if len(a) > 1 else (teste["fam"] == a)]
        pool = pool[~pool.index.isin(usados) & (pool["CUSTOMER VERBATIM"].str.len() > 12)]
        if len(pool) == 0:
            continue
        r = pool.iloc[rng.randint(len(pool))]
        usados.add(r.name); casos.append(r)
        if len(casos) == 10:
            break
    entradas = []
    for r in casos:
        entradas.append({"texto": r["CUSTOMER VERBATIM"], "modelo": r["modelo"], "km": float(r["km"]), "mis": float(r["mis"]),
                         "real": r["cod"], "real_desc": cod_info.get(r["cod"], ("?",))[0]})
    for e in entradas:
        for escopo in ("com", "sem"):
            e["p_" + escopo] = {alvo: ref.prob(escopo, alvo, e["texto"], e["modelo"], e["km"], e["mis"]) for alvo in ("fam", "cod")}
    (AQUI / "teste_casos.json").write_text(json.dumps(entradas, ensure_ascii=False), encoding="utf-8")

    # ---- 3. mesmo cálculo no JavaScript do site
    js = r"""
const fs=require('fs'), path=require('path');
global.window={}; eval(fs.readFileSync(path.join(__dirname,'modelo.js'),'utf8'));
const html=fs.readFileSync(path.join(__dirname,'site.html'),'utf8');
const m=html.match(/<script id="motor">([\s\S]*?)<\/script>/)[1];
const mod={exports:{}}; new Function('module',m)(mod);
const motor=mod.exports(window.MODELO);
const casos=JSON.parse(fs.readFileSync(path.join(__dirname,'teste_casos.json'),'utf8'));
let maxd=0, out=[];
for(const c of casos){ for(const esc of ['com','sem']){
  const r=motor.prever({texto:c.texto,modelo:c.modelo,km:c.km,mis:c.mis},esc);
  for(const alvo of ['fam','cod']){ const a=r['p_'+alvo], b=c['p_'+esc][alvo];
    for(let i=0;i<a.length;i++) maxd=Math.max(maxd,Math.abs(a[i]-b[i])); } } }
console.log(JSON.stringify({maxd,n:casos.length}));
"""
    (AQUI / "_conferir_js.js").write_text(js, encoding="utf-8")
    try:
        saida = subprocess.run(["node", str(AQUI / "_conferir_js.js")], capture_output=True, text=True, check=True).stdout.strip()
        res = json.loads(saida); js_ok = res["maxd"] < 1e-9
        js_txt = f"Maior diferença entre o site (JavaScript) e o Python: **{res['maxd']:.2e}** em {res['n']} casos × 2 modos × (família + código) → {'IGUAIS' if js_ok else 'DIFERENTES!'}"
    except Exception as ex:
        js_txt = f"Não consegui rodar o Node: {ex}"; js_ok = False
    print(js_txt)
    (AQUI / "_conferir_js.js").unlink(missing_ok=True)

    # ---- relatório
    nomes = M["fam_nomes"]
    md = ["# Teste do protótipo", "",
          "## 1. O modelo.json reproduz o treino", *linhas, "",
          "## 2. Dez reclamações reais do GMF (período de teste, jul–ago/2026)", "",
          "Previsão COM G057 ligado. Código real em **negrito**; ✔ = o código real está no top 3.", ""]
    for i, e in enumerate(entradas, 1):
        cl = M["modelos"]["com"]["cod"]["classes"]; p = np.array(e["p_com"]["cod"])
        top = [(cl[k], p[k]) for k in np.argsort(-p) if cl[k] != "OUTROS"][:3]
        acerto = "✔" if e["real"] in [t[0] for t in top] else "✘"
        km_txt = f"{int(e['km']):,}".replace(",", ".")
        md.append(f"**{i}.** “{e['texto']}” — {e['modelo']}, {km_txt} km, {int(e['mis'])} meses")
        md.append(f"   - Real: **{e['real']}** · {e['real_desc']} {acerto}")
        for c, pp in top:
            d = M["dic"].get(c, ["?"])[0]
            md.append(f"   - Previsto: {c} · {d} — {pp:.0%}")
        md.append("")
    md += ["## 3. Site × Python", "", js_txt, ""]
    (AQUI / "TESTE.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md[10:60]))
    sys.exit(0 if js_ok else 1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
analise_dados.py — análise de cada tabela (DPHU, AVES, GMF) e dos cruzamentos por VIN, duas a duas.
Tudo local. Escreve `analise_dados_saida.txt` (os números citados no ANALISE_DADOS.md).

Uso: python analise_dados.py
"""
import contextlib, io, sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

import treinar as T

AQUI = Path(__file__).resolve().parent
pd.set_option("display.width", 220); pd.set_option("display.max_colwidth", 60)


def bh(p):
    """Correção de Benjamini-Hochberg (controla falsos positivos em muitos testes)."""
    p = pd.Series(p).reset_index(drop=True); o = p.sort_values(); m = len(o)
    q = (o * m / np.arange(1, m + 1))[::-1].cummin()[::-1].clip(upper=1)
    return q.reindex(p.index).values


def titulo(t):
    print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100)


def carregar():
    xlsx = T.achar("Transformation Day Qualidade - Dados 2.xlsx", None)
    dic = T.achar("Dicionario_Codigos_Sintoma_GMF.xlsx", None)
    ab = pd.read_excel(xlsx, sheet_name=["DPHU", "AVES", "GMF"])
    d, a, g = ab["DPHU"], ab["AVES"], ab["GMF"]
    di = pd.read_excel(dic, sheet_name="DICIONARIO_COMPLETO", header=1)
    desc = dict(zip(di["Código"], di["Descrição (original, em inglês)"]))
    g["cod"] = g["SYMPTOM CODE"].str.extract(r"^\s*(\S+?)\s+-")[0]; g["fam"] = g.cod.str[0]
    g["cr"] = pd.to_datetime(g["GI CREATION DATE"], dayfirst=True)
    g["mfg"] = pd.to_datetime(g["VEHICLE MANUFACTURING DATE"], dayfirst=True)
    g["ent"] = pd.to_datetime(g["DELIVERY DATE"], dayfirst=True, errors="coerce")
    g["custo"] = g["TOTAL AMOUNT PI+MO+LU+FO EXCLUDING MARGIN"]
    d["mes"] = d["Vehicle MADU Month"].dt.to_period("M").astype(str); d["mod"] = d["Type Code"]
    d["elem"] = d["Final Element Code"].astype(str) + " · " + d["Final Element Label"].str.strip()
    d["inc"] = d["Final Incident Code"].astype(str) + " · " + d["Final Incident Label"].str.strip()
    a["dt"] = pd.to_datetime(a["data de cotação"], dayfirst=True)
    return d, a, g, desc


# --------------------------------------------------------------------------- 1. cada tabela sozinha
def tabela_dphu(d):
    titulo("1. DPHU sozinha (fábrica)")
    print(f"linhas {len(d)} | VINs únicos {d.VIN.nunique()} (uma linha por VIN) | meses {sorted(d.mes.unique())}")
    print("linhas por mês:", d.mes.value_counts().sort_index().unique(), "(exatamente igual em todos os meses: confirmar se o arquivo foi cortado em 5.000/mês)")
    print("por modelo:", d["mod"].value_counts().to_dict())
    print("demérito:", d.Demerit.fillna("sem").value_counts().to_dict())
    print("ponto de detecção (top 5):", d["Declaration Capture Point"].value_counts().head(5).to_dict())
    e = d.elem.value_counts(); i = d.inc.value_counts()
    print(f"elementos distintos {len(e)} | top 10 = {e.head(10).sum() / len(d):.1%} | top 50 = {e.head(50).sum() / len(d):.1%}")
    print(e.head(8).to_string())
    print(f"incidentes distintos {len(i)} | top 5 = {i.head(5).sum() / len(d):.1%}")
    print(i.head(8).to_string())
    print("campo Comment preenchido:", f"{d.Comment.notna().mean():.1%}", "| Location Code:", f"{d['Location Code'].notna().mean():.1%}")
    lag = (d["Declaration Date Time"].dt.normalize() - d["Vehicle MADU Date"]).dt.days
    print("dias fabricação→declaração do defeito: mediana", lag.median(), "(defeito é achado na própria linha)")


def tabela_aves(a):
    titulo("2. AVES sozinha (auditoria)")
    print(f"linhas {len(a)} | VINs únicos {a.VIN.nunique()} | VIN vazio {a.VIN.isna().sum()} | defeitos por VIN: média {a.groupby('VIN').size().mean():.2f}, máx {a.groupby('VIN').size().max()}")
    print("por modelo:", a["Tipo de veículo"].value_counts().to_dict())
    print("demérito:", a["Demérito (pt)"].str.replace("(", "").str.replace(")", "").value_counts().to_dict())
    print("meses de cotação:", a.dt.dt.to_period("M").astype(str).value_counts().sort_index().to_dict())
    print(f"defeitos distintos {a['Descrição defeito'].nunique()} | top 10 = {a['Descrição defeito'].value_counts().head(10).sum() / len(a):.1%}")
    tipo = a["Descrição defeito"].str.split("-", n=1).str[0]
    print("tipo de falha (1ª parte do texto):", tipo.value_counts().head(6).to_dict())
    print("comentário preenchido:", f"{a['Comentário de defeito'].notna().mean():.1%}", "| coluna 'Avanço-produto' e 'Transmissão': 1 valor só (sem informação)")


def tabela_gmf(g, desc):
    titulo("3. GMF sozinha (garantia)")
    n = g.groupby("VIN").size()
    print(f"linhas {len(g)} | VINs únicos {g.VIN.nunique()} | incidentes por VIN: média {n.mean():.2f} | VINs com 2+ incidentes: {(n >= 2).mean():.1%}")
    print("preenchimento: código", f"{g.cod.notna().mean():.0%}", "| texto do cliente", f"{g['CUSTOMER VERBATIM'].notna().mean():.0%}", "| diagnóstico", f"{g['REPAIR DIAGNOSIS'].notna().mean():.0%}")
    print("fabricação→entrega (dias, mediana):", (g.ent - g.mfg).dt.days.median(), "| entrega→abertura (dias, mediana):", (g.cr - g.ent).dt.days.median())
    print("km mediano:", g["MILEAGE (KM)"].median(), "| meses de uso mediano:", g.MIS.median(), "| abertos com <=1 mês de uso:", f"{(g.MIS <= 1).mean():.1%}")
    print("países de entrega:", g["DELIVERY COUNTRY"].value_counts(normalize=True).round(3).head(4).to_dict())
    c = g.groupby("fam").custo.agg(["size", "sum", "median"]).sort_values("sum", ascending=False).round(0)
    print("custo por família (soma, mediana):"); print(c.head(8).to_string())
    print(f"custo total {g.custo.sum():,.0f} | G057 = {g.loc[g.cod == 'G057', 'custo'].sum() / g.custo.sum():.1%} do custo")
    gc = g.dropna(subset=["cod"]).sort_values(["VIN", "cr"])
    rep = gc.groupby(["VIN", "cod"]).size()
    print(f"VINs que voltaram com o MESMO código: {rep[rep >= 2].reset_index().VIN.nunique()} ({rep[rep >= 2].reset_index().VIN.nunique() / gc.VIN.nunique():.1%})")
    x = gc[gc.cod == "G057"].groupby("VIN").filter(lambda s: len(s) >= 2).groupby("VIN")["MILEAGE (KM)"].apply(lambda s: list(s)[:2])
    print(f"G057 repetido em {len(x)} VINs; km mediano da 1ª ocorrência {np.median([p for p, q in x]):.0f}, da 2ª {np.median([q for p, q in x]):.0f} (revisões de 10 mil e 20 mil km)")



def demerito(d, a, g):
    titulo("2b. Demérito = criticalidade (V1+ crítico | V1 vai à concessionária imediatamente | V2 não vai direto | V3 muito leve)")
    d = d.assign(dem=d.Demerit.fillna("sem")); a = a.assign(dm=a["Demérito (pt)"].str.replace("(", "").str.replace(")", ""))
    print("DPHU:", d.dem.value_counts().to_dict(), "| AVES:", a.dm.value_counts().to_dict(), f"| linhas AVES com o demérito entre parênteses: {a['Demérito (pt)'].str.contains(chr(40), regex=False).sum()}")
    s = d[d.dem == "sem"]
    print("DPHU 'sem demérito' = testes de função:", s.elem.value_counts().head(6).to_dict(), "| incidente mais comum:", s.inc.value_counts().head(1).to_dict())
    print("DPHU V1+ (crítico):", d[d.dem == "V1+"].elem.value_counts().head(3).to_dict(), "|", d[d.dem == "V1+"].inc.value_counts().head(2).to_dict())
    print("DPHU V3 (muito leve):", int((d.dem == "V3").sum()), "linhas")
    print("AVES V1:", a[a.dm == "V1"]["Descrição defeito"].value_counts().head(3).to_dict())
    claim = set(g[g.cod != "G057"].VIN)
    r = sir_tabela(d.assign(Demerit=d.dem), "Demerit", claim, 5)
    print("\nrazão observado/esperado de reclamação (sem G057) por demérito do DPHU:"); print(r[["n", "obs", "exp", "sir", "p", "q"]].round(3).to_string())
    g1 = g.drop_duplicates("VIN").assign(mes=lambda x: x.mfg.dt.to_period("M").astype(str)); g1["no_dphu"] = g1.VIN.isin(set(d.VIN))
    t = g1.groupby("mes").agg(vins_gmf=("VIN", "size"), tambem_no_dphu=("no_dphu", "sum")); t["cobertura"] = (t.tambem_no_dphu / t.vins_gmf).round(2)
    print("\nQuantos VINs do GMF aparecem no DPHU, por mês de fabricação:"); print(t.to_string())
    print(f"AVES: {a.VIN.nunique()} VINs; ~{a.groupby(a.dt.dt.to_period('M')).VIN.nunique().mean():.0f} por mês (se forem ~5.000 carros por mês, 1 em 50 dá ~100). No DPHU: {a.VIN.dropna().drop_duplicates().isin(set(d.VIN)).mean():.0%}")

# --------------------------------------------------------------------------- 2. cruzamentos por VIN
def sir_tabela(d, col, claim, minn):
    d = d.assign(y=d.VIN.isin(claim).astype(int)); d["exp"] = d.groupby(["mes", "mod"]).y.transform("mean")
    r = d.groupby(col).agg(n=("y", "size"), obs=("y", "sum"), exp=("exp", "sum")); r = r[r.n >= minn]; r["sir"] = r.obs / r.exp
    r["p"] = [min(1, 2 * (stats.poisson.sf(o - 1, e) if o >= e else stats.poisson.cdf(o, e))) for o, e in zip(r.obs, r.exp)]
    r["q"] = bh(r.p); return r.sort_values("p")


def dphu_gmf(d, g):
    titulo("4. DPHU × GMF (por VIN)")
    com = set(d.VIN) & set(g.VIN)
    print(f"VINs em comum: {len(com)} = {len(com) / d.VIN.nunique():.1%} dos VINs DPHU e {len(com) / g.VIN.nunique():.1%} dos VINs GMF")
    j = d.merge(g.drop_duplicates("VIN")[["VIN", "MODEL CODE", "mfg"]], on="VIN")
    print(f"consistência: mesmo modelo {(j['mod'] == j['MODEL CODE']).mean():.1%} | mesmo mês de fabricação {(j['Vehicle MADU Date'].dt.to_period('M') == j.mfg.dt.to_period('M')).mean():.1%} | mesma data {(j['Vehicle MADU Date'] == j.mfg).mean():.1%}")
    d2 = d.assign(claim=d.VIN.isin(com))
    print("taxa de VINs DPHU com reclamação, por mês de fabricação (cai porque os carros novos tiveram menos tempo na rua):")
    print(d2.groupby("mes").claim.mean().round(3).to_dict())
    print("por modelo:", d2.groupby("mod").claim.mean().round(3).to_dict())
    gm = g[g.VIN.isin(com)].merge(d[["VIN", "Vehicle MADU Date"]], on="VIN")
    print("dias da fabricação até a abertura do caso (mediana):", (gm.cr - gm["Vehicle MADU Date"]).dt.days.median())
    claim = set(g[g.cod != "G057"].VIN)
    print(f"\nTaxa de reclamação (sem G057) nos VINs DPHU: {d.VIN.isin(claim).mean():.2%}. Razão observado/esperado (esperado ajustado por mês×modelo):")
    for col, nm, mn in [("elem", "elemento", 100), ("inc", "incidente", 100), ("Declaration Capture Point", "ponto de detecção", 200), ("Demerit", "demérito", 200)]:
        r = sir_tabela(d.assign(Demerit=d.Demerit.fillna("sem")), col, claim, mn)
        print(f"  por {nm}: {len(r)} grupos testados, {(r.q < 0.05).sum()} fora do esperado (q<0.05)")
        for k, x in r[r.q < 0.05].iterrows():
            print(f"     {k}: n={x.n:.0f} obs={x.obs:.0f} esp={x.exp:.0f} razão={x.sir:.2f} q={x.q:.3f}")
    # família do defeito (De-Para provisório) × família da reclamação
    fams = list("GRBCIHOVESA")
    d = d.assign(dfam=d["Final Element Label"].map({l: T.depara(l) or "?" for l in d["Final Element Label"].unique()}), strata=d.mes + "|" + d["mod"])
    gg = g[g.VIN.isin(d.VIN) & g.fam.isin(fams) & (g.cod != "G057")][["VIN", "fam"]].drop_duplicates()
    Y = pd.DataFrame(0, index=d.VIN.values, columns=fams)
    for v, f in gg.itertuples(index=False): Y.at[v, f] = 1
    R = Y.groupby(d.strata.values).transform("mean").values; Yv = Y.values; rows = []
    for e in d.dfam.unique():
        m = (d.dfam == e).values
        if m.sum() < 200: continue
        O, E = Yv[m].sum(0), R[m].sum(0)
        for k, f in enumerate(fams):
            if O[k] >= 5: rows.append((e, f, int(m.sum()), int(O[k]), E[k], O[k] / E[k], min(1, 2 * (stats.poisson.sf(O[k] - 1, E[k]) if O[k] >= E[k] else stats.poisson.cdf(O[k], E[k])))))
    r = pd.DataFrame(rows, columns=["fam_defeito", "fam_reclamacao", "n", "obs", "exp", "razao", "p"]); r["q"] = bh(r.p)
    print(f"\nfamília do defeito de fábrica × família da reclamação: {len(r)} pares, {(r.q < 0.05).sum()} com q<0.05, menor q = {r.q.min():.2f}")
    print("pares 'mesmo sistema' (defeito G→reclamação G, R→R, I→I, B→B, C→C, H→H, O→O, V→V):")
    print(r[r.fam_defeito == r.fam_reclamacao].round(2).to_string(index=False))
    # lotes semanais
    gl = g[g.cod.notna() & (g.cod != "G057")].copy(); gl["lote"] = gl["MODEL CODE"] + "|" + gl.mfg.dt.to_period("W").astype(str)
    d["lote"] = d["mod"] + "|" + d["Vehicle MADU Date"].dt.to_period("W").astype(str)
    nd, ng = d.groupby("lote").size(), gl.groupby("lote").size()
    lotes = [l for l in nd.index if l in ng.index and nd[l] >= 100 and ng[l] >= 30]
    print(f"\nPor lote (modelo × semana de fabricação), {len(lotes)} lotes: correlação (Spearman) entre % de defeitos de fábrica da família e % de reclamações da família:")
    out = []
    for f in "GRCIHOVE":
        x = d[d.dfam == f].groupby("lote").size().reindex(lotes).fillna(0) / nd[lotes]
        y = gl[gl.fam == f].groupby("lote").size().reindex(lotes).fillna(0) / ng[lotes]
        rho, p = stats.spearmanr(x, y); out.append((f, round(rho, 2), round(p, 3), round(min(1, p * 8), 3)))
    print(pd.DataFrame(out, columns=["família", "rho", "p", "p_corrigido(x8)"]).to_string(index=False))


def dphu_aves(d, a):
    titulo("5. DPHU × AVES (por VIN)")
    com = set(d.VIN) & set(a.VIN.dropna())
    j = a[a.VIN.isin(com)].merge(d[["VIN", "Type Code", "Vehicle MADU Date", "Declaration Date Time", "Final Element Label"]], on="VIN")
    print(f"VINs em comum: {len(com)} = {len(com) / a.VIN.nunique():.1%} dos VINs AVES e {len(com) / d.VIN.nunique():.2%} dos VINs DPHU")
    print(f"mesmo modelo: {(j['Tipo de veículo'] == j['Type Code']).mean():.0%} | dias da declaração DPHU até a cotação AVES (mediana): {(j.dt - j['Declaration Date Time'].dt.normalize()).dt.days.median():.0f} | da fabricação até a AVES: {(j.dt - j['Vehicle MADU Date']).dt.days.median():.0f}")
    pal = lambda s: {w for w in T.tokens(s) if len(w) >= 4}
    obs = np.mean([len(pal(x) & pal(y)) > 0 for x, y in zip(j["Final Element Label"], j["Descrição defeito"])])
    rnd = np.mean([len(pal(x) & pal(y)) > 0 for x, y in zip(j["Final Element Label"].sample(len(j), random_state=1).values, j["Descrição defeito"])])
    print(f"AVES e DPHU do mesmo VIN falam do mesmo componente (palavra em comum): {obs:.1%} (ao acaso daria {rnd:.1%}). Taxonomias diferentes: falta o De-Para.")


def aves_gmf(a, g):
    titulo("6. AVES × GMF (por VIN)")
    com = set(a.VIN.dropna()) & set(g.VIN)
    g2 = g[g.VIN.isin(com)].merge(a.drop_duplicates("VIN")[["VIN", "Tipo de veículo", "dt"]], on="VIN")
    print(f"VINs em comum: {len(com)} = {len(com) / a.VIN.nunique():.1%} dos VINs AVES e {len(com) / g.VIN.nunique():.2%} dos VINs GMF")
    print(f"mesmo modelo: {(g2['Tipo de veículo'] == g2['MODEL CODE']).mean():.0%} | dias da auditoria até a abertura do caso (mediana): {(g2.cr - g2.dt).dt.days.median():.0f} | caso aberto antes da auditoria: {((g2.cr - g2.dt).dt.days < 0).mean():.0%}")
    print(f"famílias nos casos GMF desses VINs: {g2.fam.value_counts(normalize=True).round(2).head(4).to_dict()} | G057: {(g2.cod == 'G057').mean():.0%} (geral {(g.cod == 'G057').mean():.0%})")
    print("n pequeno (87 VINs): serve para descrever, não para concluir.")


def tripla(d, a, g):
    titulo("7. As três tabelas juntas")
    tri = set(d.VIN) & set(a.VIN.dropna()) & set(g.VIN)
    print(f"VINs nas três: {len(tri)} (n pequeno demais para conclusões)")
    print(f"VINs que ligam DPHU↔GMF: {len(set(d.VIN) & set(g.VIN))} | DPHU↔AVES: {len(set(d.VIN) & set(a.VIN.dropna()))} | AVES↔GMF: {len(set(a.VIN.dropna()) & set(g.VIN))}")
    num = g.VIN.drop_duplicates().str.extract(r"(\d+)")[0].astype(int)
    print("VINs do GMF por faixa de numeração (a numeração segue a ordem em que cada base entrou na anonimização):",
          pd.cut(num, [0, 45000, 46000, 60000, 1e9]).value_counts().sort_index().to_dict())


# --------------------------------------------------------------------------- 3. sinais de alerta (só GMF)
def alertas(g, desc):
    titulo("8. Sinais de alerta na GMF (prevenir antes de virar insatisfação)")
    gc = g.dropna(subset=["cod"]).sort_values(["VIN", "cr"]); e = gc[gc.cod != "G057"].copy(); e["d_ent"] = (e.cr - e.ent).dt.days
    res = []
    for c, s in e.groupby("cod"):
        if len(s) < 100: continue
        gaps = s.groupby("VIN").cr.apply(lambda t: (t.iloc[1] - t.iloc[0]).days if len(t) >= 2 else np.nan).dropna(); v = s.VIN.nunique()
        res.append((c, desc.get(c, ""), len(s), v, len(gaps) / v, gaps.median() if len(gaps) else np.nan, (s.d_ent <= 30).mean()))
    r = pd.DataFrame(res, columns=["cod", "descrição", "casos", "VINs", "voltou_pelo_mesmo_código", "dias_até_voltar(mediana)", "aberto_em_até_30d"])
    print("Retorno pelo MESMO código (reparo que não resolveu?), códigos com 100+ casos:")
    print(r.sort_values("voltou_pelo_mesmo_código", ascending=False).head(8).round(3).to_string(index=False))
    print(f"retorno médio (sem G057): {(r.voltou_pelo_mesmo_código * r.VINs).sum() / r.VINs.sum():.1%}")
    print("\nFalha precoce (aberto em até 30 dias da entrega):")
    print(r.sort_values("aberto_em_até_30d", ascending=False).head(6)[["cod", "descrição", "casos", "aberto_em_até_30d"]].round(2).to_string(index=False))
    e["sem"] = e.mfg.dt.to_period("W").astype(str); cand = []
    cods = e.cod.value_counts(); cods = cods[cods >= 60].index
    for c in cods:
        for m, sub in e.groupby("MODEL CODE"):
            pm = (sub.cod == c).mean()
            for w, s in sub.groupby("sem"):
                if len(s) >= 30:
                    o = (s.cod == c).sum(); ex = pm * len(s)
                    if o >= 6 and o > ex: cand.append((c, desc.get(c, ""), m, w, len(s), o, ex, o / ex, stats.poisson.sf(o - 1, ex)))
    L = pd.DataFrame(cand, columns=["cod", "descrição", "modelo", "semana_fab", "casos_lote", "obs", "esp", "razão", "p"]).sort_values("p")
    L["q"] = bh(L.p)
    print(f"\nLotes (modelo × semana de fabricação × código) com excesso: {len(L)} testes, {(L.q < 0.05).sum()} fora do esperado (q<0.05). Os 10 mais fortes:")
    print(L[L.q < 0.05].head(10).round(3).to_string(index=False))
    L[L.q < 0.05].to_csv(AQUI / "lotes_em_alerta.csv", index=False, encoding="utf-8-sig")


def main():
    d, a, g, desc = carregar()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        tabela_dphu(d); tabela_aves(a); demerito(d, a, g); tabela_gmf(g, desc)
        dphu_gmf(d, g); dphu_aves(d, a); aves_gmf(a, g); tripla(d, a, g); alertas(g, desc)
    txt = buf.getvalue()
    (AQUI / "analise_dados_saida.txt").write_text(txt, encoding="utf-8")
    print(txt)


if __name__ == "__main__":
    main()

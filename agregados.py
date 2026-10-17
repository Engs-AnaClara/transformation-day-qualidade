#!/usr/bin/env python3
"""
agregados.py — tudo o que o site usa além do classificador:
  * índice de VINs (eventos de DPHU, AVES e GMF por carro)            -> vins.js   (some com --sem-vin)
  * correlações por VIN (DPHU×GMF, DPHU×AVES, AVES×GMF)               -> modelo.js
  * cartões da Aba 2 (como cada tabela traz um problema)              -> modelo.js
  * tendências por mês/semana de fabricação, efeito dominó, cubos     -> modelo.js
Só agregados saem em modelo.js; o texto livre do cliente nunca é exportado.
"""
import math
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy import stats

EPOCH = pd.Timestamp("2025-01-01")
DEM = ["V1+", "V1", "V2", "V3", "sem"]                 # do mais grave ao mais leve; "sem" = testes de função
PESOS = {"V1+": 10, "V1": 5, "V2": 2, "V3": 1, "sem": 5}   # SUPOSIÇÃO (editável na tela de Prioridades)
MIN_SOLIDO = 30        # carros mínimos para evidência "alta"
DIAS_MES = 30.4


def bh(p):
    p = pd.Series(list(p)); o = p.sort_values(); m = len(o)
    if m == 0:
        return []
    q = (o * m / np.arange(1, m + 1))[::-1].cummin()[::-1].clip(upper=1)
    return q.reindex(p.index).tolist()


def dias(s):
    return (s - EPOCH).dt.days


def r(x, n=4):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), n)


# ----------------------------------------------------------------------------- preparação
def preparar(d, a, g, dic_desc, depara):
    d, a, g = d.copy(), a.copy(), g.copy()
    for df in (d, a, g):
        df["VIN"] = df["VIN"].astype("string").str.strip().str.upper()
    a = a[a.VIN.notna()].copy()
    d["mod"] = d["Type Code"]; d["mes"] = d["Vehicle MADU Month"].dt.to_period("M").astype(str)
    d["elem"] = d["Final Element Code"].astype(str).str.strip(); d["elem_l"] = d["Final Element Label"].astype(str).str.strip()
    d["inc"] = d["Final Incident Code"].astype(str).str.strip(); d["inc_l"] = d["Final Incident Label"].astype(str).str.strip()
    d["dem"] = d["Demerit"].fillna("sem"); d["dia"] = dias(d["Declaration Date Time"].dt.normalize())
    a["mod"] = a["Tipo de veículo"]; a["def"] = a["Descrição defeito"].astype(str).str.strip()
    a["tipo"] = a["def"].str.split("-", n=1).str[0].str.strip()
    a["dem"] = a["Demérito (pt)"].astype(str).str.replace(r"[()]", "", regex=True).str.strip()
    a["dt"] = pd.to_datetime(a["data de cotação"], dayfirst=True)
    a["dia"] = dias(a["dt"]); a["mes_aud"] = a["dt"].dt.to_period("M").astype(str)
    g["cod"] = g["SYMPTOM CODE"].str.extract(r"^\s*(\S+?)\s+-")[0]; g["fam"] = g.cod.str[0].str.upper()
    g["cr"] = pd.to_datetime(g["GI CREATION DATE"], dayfirst=True); g["mfg"] = pd.to_datetime(g["VEHICLE MANUFACTURING DATE"], dayfirst=True)
    g["custo"] = g["TOTAL AMOUNT PI+MO+LU+FO EXCLUDING MARGIN"]
    g["mod"] = g["MODEL CODE"]; g["dia"] = dias(g["cr"]); g["mes"] = g["mfg"].dt.to_period("M").astype(str)
    g["km"] = g["MILEAGE (KM)"]; g["mis"] = g["MIS"]
    return d, a, g


def listas(d, a, g, dic_desc, depara):
    L = {}
    e = d.groupby("elem").agg(l=("elem_l", "first"), n=("elem", "size")).sort_values("n", ascending=False)
    L["elem"] = [[k, v.l, int(v.n)] for k, v in e.iterrows()]
    i = d.groupby("inc").agg(l=("inc_l", "first"), n=("inc", "size")).sort_values("n", ascending=False)
    L["inc"] = [[k, v.l, int(v.n)] for k, v in i.iterrows()]
    df_ = a["def"].value_counts()
    L["def"] = [[k, int(n)] for k, n in df_.items()]
    L["tipo"] = [[k, int(n)] for k, n in a["tipo"].value_counts().items()]
    tix = {k: i for i, (k, _) in enumerate(L["tipo"])}
    L["def2tipo"] = [tix[k.split("-", 1)[0].strip()] for k, _ in L["def"]]
    codes = list(dic_desc.keys()) + sorted(set(g.cod.dropna()) - set(dic_desc))
    L["codes"] = [[c, str(dic_desc.get(c, ""))] for c in codes]
    L["cmp"] = sorted(g["CUSTOMER COMPLAINT"].dropna().unique().tolist())
    L["modelos"] = sorted(set(d["mod"]) | set(a["mod"]) | set(g["mod"]))
    L["meses"] = sorted(set(d.mes) | set(g.mes.dropna()))
    L["dem"] = DEM; L["pesos"] = PESOS
    L["elem_fam"] = [depara(l) for _, l, _ in L["elem"]]
    L["inc_fam"] = [depara(l) for _, l, _ in L["inc"]]
    L["def_fam"] = [depara(k) for k, _ in L["def"]]
    return L


def indices(L):
    return {"elem": {k: i for i, (k, _, _) in enumerate(L["elem"])}, "inc": {k: i for i, (k, _, _) in enumerate(L["inc"])},
            "def": {k: i for i, (k, _) in enumerate(L["def"])}, "tipo": {k: i for i, (k, _) in enumerate(L["tipo"])},
            "code": {k: i for i, (k, _) in enumerate(L["codes"])}, "cmp": {k: i for i, k in enumerate(L["cmp"])},
            "mod": {k: i for i, k in enumerate(L["modelos"])}, "mes": {k: i for i, k in enumerate(L["meses"])}, "dem": {k: i for i, k in enumerate(DEM)}}


# ----------------------------------------------------------------------------- índice de VINs
def indice_vins(d, a, g, L):
    ix = indices(L)
    D = {v: (ix["elem"][e], ix["inc"][i], ix["dem"].get(m, 4), int(x)) for v, e, i, m, x in zip(d.VIN, d.elem, d.inc, d.dem, d.dia)}
    Dmod = dict(zip(d.VIN, d["mod"])); Dmes = dict(zip(d.VIN, d.mes))
    A = defaultdict(list)
    for v, df_, m, x in sorted(zip(a.VIN, a["def"], a.dem, a.dia), key=lambda t: (t[0], t[3])):
        A[v].append([ix["def"][df_], ix["dem"].get(m, 1), int(x)])
    Amod = dict(zip(a.VIN, a["mod"]))
    G = defaultdict(list); Gmod = {}; Gmes = {}
    cols = zip(g.VIN, g.cod, g["CUSTOMER COMPLAINT"], g.km, g.mis, g["custo"], g.dia, g["REPAIR DIAGNOSIS"], g["mod"], g.mes)
    for v, c, cm, km, mis, cu, dia, dg, mo, me in cols:
        diag = "" if pd.isna(dg) else " ".join(str(dg).split())[:90]    # só um trecho curto do diagnóstico
        G[v].append([ix["code"].get(c, -1) if isinstance(c, str) else -1, ix["cmp"].get(cm, -1) if isinstance(cm, str) else -1,
                     int(km), int(mis), -1 if pd.isna(cu) else round(float(cu), 2), int(dia), diag])
        Gmod[v] = mo; Gmes[v] = me
    rows = []
    for v in sorted(set(D) | set(A) | set(G), key=lambda s: int(s.split("-")[1])):
        mod = Dmod.get(v) or Amod.get(v) or Gmod.get(v)
        mes = Dmes.get(v) or Gmes.get(v)
        gm = sorted(G.get(v, []), key=lambda e: e[5])
        gmes = Gmes.get(v)    # mês de fabricação como o GMF informa (pode diferir do DPHU em ~4% dos carros)
        rows.append([int(v.split("-")[1]), ix["mod"].get(mod, -1), ix["mes"].get(mes, -1) if isinstance(mes, str) else -1, list(D[v]) if v in D else 0, A.get(v, []), gm,
                     ix["mes"].get(gmes, -1) if isinstance(gmes, str) else -1])
    return rows


# ----------------------------------------------------------------------------- associações por VIN
def assoc(px, py, minpar=2, com_lag=False):
    """px: DataFrame (VIN, x[, dia]); py: (VIN, y[, dia]). Só carros presentes nas duas tabelas."""
    cars = set(px.VIN) & set(py.VIN); N = len(cars)
    px = px[px.VIN.isin(cars)]; py = py[py.VIN.isin(cars)]
    gx = px.groupby(["VIN", "x"], as_index=False).agg(dx=("dia", "min")) if "dia" in px else px.drop_duplicates(["VIN", "x"]).assign(dx=0)
    gy = py.groupby(["VIN", "y"], as_index=False).agg(dy=("dia", "min")) if "dia" in py else py.drop_duplicates(["VIN", "y"]).assign(dy=0)
    nX = gx.x.value_counts(); nY = gy.y.value_counts()
    m = gx.merge(gy, on="VIN")
    grp = m.groupby(["x", "y"])
    t = grp.size().rename("n").reset_index()
    if com_lag:
        m["lag"] = (m.dy - m.dx)
        t["lag"] = (grp["lag"].median().values / DIAS_MES)
    t = t[t.n >= minpar].copy()
    t["nX"] = t.x.map(nX).values; t["nY"] = t.y.map(nY).values
    t["p"] = [stats.hypergeom.sf(n - 1, N, nx, ny) for n, nx, ny in zip(t.n, t.nX, t.nY)]
    t["q"] = bh(t.p)
    rows = [[x, y, int(n), int(nx), int(ny), r(p, 5), r(q, 5), r(lag, 1) if com_lag else None]
            for x, y, n, nx, ny, p, q, lag in zip(t.x, t.y, t.n, t.nX, t.nY, t.p, t.q, t["lag"] if com_lag else [None] * len(t))]
    return {"N": N, "rows": sorted(rows, key=lambda z: (z[5], -z[2]))}


def correlacoes(d, a, g, L):
    ix = indices(L); out = {}
    dx_e = d[["VIN", "elem", "dia"]].rename(columns={"elem": "x"}).assign(x=lambda t: t.x.map(ix["elem"]))
    dx_i = d[["VIN", "inc", "dia"]].rename(columns={"inc": "x"}).assign(x=lambda t: t.x.map(ix["inc"]))
    ax = a[["VIN", "tipo", "dia"]].rename(columns={"tipo": "x"}).assign(x=lambda t: t.x.map(ix["tipo"]))
    ay = ax.rename(columns={"x": "y"})
    for esc in ("com", "sem"):
        gg = g[g.cod.notna() & g.fam.notna()] if esc == "com" else g[g.cod.notna() & (g.cod != "G057")]
        gy = gg[["VIN", "fam", "dia"]].rename(columns={"fam": "y"})
        out[esc] = {"DG_elem": assoc(dx_e, gy, com_lag=True), "DG_inc": assoc(dx_i, gy, com_lag=True), "AG": assoc(ax, gy, minpar=1, com_lag=True)}
    out["DA_elem"] = assoc(dx_e, ay, minpar=2); out["DA_inc"] = assoc(dx_i, ay, minpar=2)
    # ordem no tempo (precisa o defeito vir antes da reclamação)
    m = d[["VIN", "dia"]].merge(g.groupby("VIN").dia.min().rename("dg"), on="VIN")
    out["ordem_dg"] = float((m.dg >= m.dia).mean())
    return out


def info_elementos(d, g, L):
    """Por elemento/incidente do DPHU: carros, quantos tiveram reclamação (por escopo), atraso típico em meses."""
    ix = indices(L); res = {}
    for esc in ("com", "sem"):
        gg = g[g.cod.notna()] if esc == "com" else g[g.cod.notna() & (g.cod != "G057")]
        prim = gg.groupby("VIN").dia.min()
        for chave, col in (("elem", "elem"), ("inc", "inc")):
            t = d[["VIN", col, "dia"]].copy(); t["g1"] = t.VIN.map(prim)
            agg = t.groupby(col).agg(n=("VIN", "size"), nclaim=("g1", lambda s: int(s.notna().sum())))
            lag = (t.dropna(subset=["g1"]).assign(l=lambda z: z.g1 - z.dia).groupby(col).l.median() / DIAS_MES)
            res.setdefault(esc, {})[chave] = {str(ix[chave][k]): [int(v.n), int(v.nclaim), r(lag.get(k), 1)] for k, v in agg.iterrows()}
    return res


# ----------------------------------------------------------------------------- cartões da Aba 2
def cartoes(d, a, g, L, depara):
    ix = indices(L)
    dfam = dict(zip(d.elem, [depara(l) for l in d.elem_l]))        # família (De-Para provisório) por elemento
    d = d.assign(dfam=d.elem.map(dfam))
    n_d = len(d); share_fam_d = d.dfam.value_counts(normalize=True).to_dict()
    share_el = d.elem.value_counts(normalize=True).to_dict()
    coh = d.groupby(["mod", "mes", "elem"]).size(); coh_n = d.groupby(["mod", "mes"]).size()
    coh_fam = d.groupby(["mod", "mes", "dfam"]).size()
    afam_map = {x: depara(x) for x in a["def"].unique()}
    av_mod = a.groupby(["mod", "def"]).size(); av_mod_n = a.groupby("mod").size()
    vin_d = set(d.VIN); vin_a = set(a.VIN)
    dd = d.set_index("VIN"); aa = a.groupby("VIN")
    g1 = g.drop_duplicates("VIN").set_index("VIN")[["mod", "mes"]]
    gc = g[g.cod.notna()]
    out = {}
    alvos = [("cod", c) for c, n in gc.cod.value_counts().items() if n >= 10] + [("fam", f) for f in sorted(gc.fam.unique())]
    for tipo, chave in alvos:
        ev = gc[gc.cod == chave] if tipo == "cod" else gc[gc.fam == chave]
        fam = chave[0] if tipo == "cod" else chave
        cars = ev.VIN.unique(); nc = len(cars)
        card = {"n": int(len(ev)), "carros": int(nc), "fam": fam}
        # ---- garantia
        cm = ev["CUSTOMER COMPLAINT"].value_counts(normalize=True).head(3)
        card["garantia"] = {"cmp": [[ix["cmp"][k], r(v, 3)] for k, v in cm.items()],
                            "km": [int(x) for x in ev.km.quantile([.25, .5, .75])], "mis": [r(x, 1) for x in ev.mis.quantile([.25, .5, .75])],
                            "custo": [r(ev.custo.mean(), 2), r(ev.custo.median(), 2), int(ev.custo.notna().sum())] if ev.custo.notna().any() else None,
                            "irmaos": [[ix["code"][k], r(v, 3)] for k, v in gc[gc.fam == fam].cod.value_counts(normalize=True).head(4).items() if k in ix["code"]]}
        # ---- fábrica, via VIN
        com_d = [v for v in cars if v in vin_d]; nin = len(com_d)
        f = {"carros_com_dphu": nin, "pct_com_dphu": r(nin / nc, 4) if nc else None}
        if nin:
            sub = dd.loc[com_d]
            el = sub.elem.value_counts().head(5)
            f["elem"] = [[ix["elem"][k], int(n), r(n / nin, 3), r((n / nin) / share_el[k], 2)] for k, n in el.items()]
            inc = sub.inc.value_counts().head(3)
            f["inc"] = [[ix["inc"][k], int(n), r(n / nin, 3)] for k, n in inc.items()]
            f["dem"] = {k: int(v) for k, v in sub.dem.value_counts().items()}
            corr = int((sub.dfam == fam).sum()); base = share_fam_d.get(fam, 0)
            f["corresp"] = {"n": corr, "pct": r(corr / nin, 4), "base": r(base, 4), "lift": r((corr / nin) / base, 2) if base else None,
                            "p": r(stats.binomtest(corr, nin, base, alternative="two-sided").pvalue, 5) if 0 < base < 1 else None}
        # ---- fábrica, via coorte (carros SEM DPHU)
        fora = [v for v in cars if v not in vin_d and v in g1.index]
        if fora:
            w = Counter((g1.at[v, "mod"], g1.at[v, "mes"]) for v in fora); tw = sum(w.values()); esp = Counter(); espf = 0.0
            for (mo, me), k in w.items():
                if (mo, me) in coh_n.index:
                    n_ = coh_n[(mo, me)]
                    for e_, c_ in coh.loc[(mo, me)].items():
                        esp[e_] += k * c_ / n_
                    espf += k * coh_fam.get((mo, me, fam), 0) / n_
            tw_ok = sum(k for (mo, me), k in w.items() if (mo, me) in coh_n.index)
            if tw_ok:
                f["coorte"] = {"carros": int(len(fora)), "usados": int(tw_ok),
                               "elem": [[ix["elem"][k], r(v / tw_ok, 3), r((v / tw_ok) / share_el[k], 2)] for k, v in esp.most_common(5)],
                               "fam_pct": r(espf / tw_ok, 4), "fam_base": r(share_fam_d.get(fam, 0), 4)}
        card["fabrica"] = f
        # ---- auditoria
        com_a = [v for v in cars if v in vin_a]
        au = {"carros_com_aves": len(com_a)}
        if com_a:
            sub = a[a.VIN.isin(com_a)]
            au["def"] = [[ix["def"][k], int(n)] for k, n in sub["def"].value_counts().head(5).items()]
        mods = Counter(g1.at[v, "mod"] for v in cars if v in g1.index); tm = sum(mods.values())
        if tm:
            esp = Counter()
            for mo, k in mods.items():
                if mo in av_mod_n.index:
                    for df_, c_ in av_mod[mo].items():
                        if afam_map[df_] == fam:
                            esp[df_] += k * c_ / av_mod_n[mo]
            au["coorte"] = [[ix["def"][k], r(v / tm, 4)] for k, v in esp.most_common(5)]
        card["auditoria"] = au
        out[("c:" if tipo == "cod" else "f:") + chave] = card
    return out


# ----------------------------------------------------------------------------- tendências e lotes
def tendencias(d, g, L):
    ix = indices(L); res = {}
    for esc in ("com", "sem"):
        gg = g[g.cod.notna()] if esc == "com" else g[g.cod.notna() & (g.cod != "G057")]
        tot = gg.fam.value_counts(normalize=True).to_dict()
        coh = {}
        for (mo, me), sub in gg.groupby(["mod", "mes"]):
            fams = {}
            for f, s in sub.groupby("fam"):
                fams[f] = [int(len(s)), r((len(s) / len(sub)) / tot[f], 2), r(s.mis.median(), 1)]
            coh[f"{mo}|{me}"] = {"n": int(len(sub)), "fam": fams}
        serie = {}
        for f in tot:
            serie[f] = {}
            for me, sub in gg.groupby("mes"):
                serie[f][me] = [int(len(sub)), r(((sub.fam == f).sum() / len(sub)) / tot[f], 2)]
        res[esc] = {"coortes": coh, "serie": serie}
    dc = {}
    for (mo, me), sub in d.groupby(["mod", "mes"]):
        top = sub.groupby("elem").agg(n=("elem", "size")).sort_values("n", ascending=False).head(6)
        pesos = sub.dem.map(PESOS).groupby(sub.elem).sum()
        dc[f"{mo}|{me}"] = {"n": int(len(sub)), "top": [[ix["elem"][k], int(v.n), int(pesos[k])] for k, v in top.iterrows()]}
    res["dphu"] = dc
    # lotes (modelo × semana de fabricação × código), sem G057
    e = g[g.cod.notna() & (g.cod != "G057")].copy(); e["sem"] = e.mfg.dt.to_period("W").astype(str)
    cand = []
    cods = e.cod.value_counts(); cods = cods[cods >= 60].index
    for c in cods:
        for m, sub in e.groupby("mod"):
            pm = (sub.cod == c).mean()
            for w, s in sub.groupby("sem"):
                if len(s) >= 30:
                    o = int((s.cod == c).sum()); ex = pm * len(s)
                    if o >= 6 and o > ex:
                        cand.append([ix["code"][c], ix["mod"][m], w, int(len(s)), o, r(ex, 2), r(o / ex, 2), float(stats.poisson.sf(o - 1, ex))])
    q = bh([c[-1] for c in cand])
    lotes = [c[:-1] + [r(qq, 5)] for c, qq in zip(cand, q) if qq < 0.05]
    res["lotes"] = sorted(lotes, key=lambda z: z[-1])[:80]
    return res


# ----------------------------------------------------------------------------- efeito dominó (por VIN, dentro do GMF)
def domino(g, L, minpar=5):
    ix = indices(L); res = {}
    for esc in ("com", "sem"):
        gg = g[g.cod.notna()] if esc == "com" else g[g.cod.notna() & (g.cod != "G057")]
        out = {}
        for nivel, col in (("fam", "fam"), ("cod", "cod")):
            prim = gg.groupby(["VIN", col]).dia.min().reset_index()          # 1ª vez que cada família/código aparece no carro
            primeiro_evento = gg.groupby("VIN").dia.min()                      # data do 1º caso do carro (qualquer código)
            prim["depois"] = prim.dia > prim.VIN.map(primeiro_evento)           # este item apareceu depois do 1º caso?
            if nivel == "cod":
                vc = prim[col].value_counts(); prim = prim[prim[col].isin(vc[vc >= 30].index)]
            cars = prim.VIN.nunique(); nA = prim[col].value_counts()
            nDepois = prim[prim.depois][col].value_counts()                    # carros em que B aparece DEPOIS do 1º caso
            m = prim.merge(prim, on="VIN", suffixes=("_a", "_b"))
            m = m[m.dia_b > m.dia_a]
            m = m.assign(l=(m.dia_b - m.dia_a) / DIAS_MES)
            t = m.groupby([col + "_a", col + "_b"]).agg(n=("VIN", "size"), lag=("l", "median")).reset_index()
            t = t[t.n >= minpar].copy()
            t["nA"] = t[col + "_a"].map(nA).values; t["nB"] = t[col + "_b"].map(nDepois).fillna(0).values
            t["base"] = t.nB / cars                                            # chance de B aparecer depois do 1º caso, em qualquer carro
            t = t[t.base > 0].copy()
            t["p"] = [stats.binomtest(int(n), int(a_), float(b), alternative="greater").pvalue for n, a_, b in zip(t.n, t.nA, t.base)]
            t["q"] = bh(t.p)
            rows = []
            for A_, B_, n, lag, a_, b_, p, q, base in zip(t[col + "_a"], t[col + "_b"], t.n, t.lag, t.nA, t.nB, t.p, t.q, t.base):
                conf = n / a_; lift = conf / base
                rows.append([ix["code"][A_] if nivel == "cod" else A_, ix["code"][B_] if nivel == "cod" else B_, int(n), int(a_), int(b_), r(conf, 3), r(lift, 2), r(lag, 1), r(p, 5), r(q, 5)])
            # reincidência: o mesmo código/família volta no mesmo carro (em outro dia)
            ev = gg[["VIN", col, "dia"]].drop_duplicates().sort_values("dia")
            if nivel == "cod":
                ev = ev[ev[col].isin(nA.index)]
            seg = ev.groupby(["VIN", col]).dia.agg(lambda s: (s.iloc[1] - s.iloc[0]) / DIAS_MES if len(s) > 1 else np.nan).dropna()
            base = len(seg) / max(1, len(ev.groupby(["VIN", col])))
            nAA = seg.groupby(level=1).size(); lagAA = seg.groupby(level=1).median()
            rep = []
            for k, n in nAA.items():
                if n >= minpar and k in nA.index:
                    na = int(nA[k]); p = stats.binomtest(int(n), na, base, alternative="greater").pvalue
                    rep.append([k, int(n), na, p, float(lagAA[k])])
            qq = bh([x[3] for x in rep])
            for (k, n, na, p, lag), q in zip(rep, qq):
                kk = ix["code"][k] if nivel == "cod" else k
                rows.append([kk, kk, n, na, na, r(n / na, 3), r((n / na) / base, 2), r(lag, 1), r(p, 5), r(q, 5)])
            out[nivel] = {"carros": int(cars), "base_reincidencia": r(base, 4), "rows": sorted(rows, key=lambda z: z[9])[:300]}
        res[esc] = out
    # AVES: tipos de falha que aparecem juntos no mesmo carro
    return res


def aves_juntos(a, L, minpar=3):
    ix = indices(L)
    t = a.groupby("VIN").tipo.apply(lambda s: sorted(set(s)))
    cnt = Counter(); tot = Counter()
    for lst in t:
        for x in lst:
            tot[x] += 1
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                cnt[(lst[i], lst[j])] += 1
    N = len(t); rows = []
    for (x, y), n in cnt.items():
        if n >= minpar:
            lift = (n / tot[x]) / (tot[y] / N)
            rows.append([ix["tipo"][x], ix["tipo"][y], int(n), int(tot[x]), int(tot[y]), r(n / tot[x], 3), r(lift, 2)])
    return {"carros": int(N), "rows": sorted(rows, key=lambda z: -z[2])[:80]}


# ----------------------------------------------------------------------------- cubos para a Aba 4
def cubos(d, a, g, L):
    ix = indices(L); c = {}
    e = d.groupby(["elem", "mod", "mes", "dem"]).size().reset_index(name="n")
    c["dphu_elem"] = [[ix["elem"][x], ix["mod"][mo], ix["mes"][me], ix["dem"].get(de, 4), int(n)] for x, mo, me, de, n in zip(e.elem, e["mod"], e.mes, e.dem, e.n)]
    i = d.groupby(["inc", "mod", "mes", "dem"]).size().reset_index(name="n")
    c["dphu_inc"] = [[ix["inc"][x], ix["mod"][mo], ix["mes"][me], ix["dem"].get(de, 4), int(n)] for x, mo, me, de, n in zip(i.inc, i["mod"], i.mes, i.dem, i.n)]
    v = a.groupby(["def", "mod", "mes_aud", "dem"]).size().reset_index(name="n")
    c["aves"] = [[ix["def"][x], ix["mod"][mo], me, ix["dem"].get(de, 1), int(n)] for x, mo, me, de, n in zip(v["def"], v["mod"], v.mes_aud, v.dem, v.n)]
    gg = g[g.cod.notna()].groupby(["cod", "mod", "mes"]).agg(n=("cod", "size"), cs=("custo", "sum"), cn=("custo", "count")).reset_index()
    c["gmf"] = [[ix["code"][k], ix["mod"][mo], ix["mes"].get(me, -1), int(n), r(cs, 2), int(cn)] for k, mo, me, n, cs, cn in zip(gg.cod, gg["mod"], gg.mes, gg.n, gg.cs, gg.cn)]
    return c


def qualidade(d, a, g):
    """Números para a aba 'Sobre o modelo' (qualidade dos dados)."""
    q = {}
    for nome, df in (("dphu", d), ("aves", a), ("gmf", g)):
        v = df.VIN
        q[nome] = {"linhas": int(len(df)), "vins": int(v.nunique()), "linhas_em_vin_repetido": int(v.duplicated(keep=False).sum())}
    q["aves"]["vin_vazio"] = 4
    q["gmf"].update({"km_zero": int((g.km == 0).sum()), "km_ate_10": int((g.km <= 10).sum()), "mis_zero": int((g.mis == 0).sum()),
                     "sem_codigo": int(g.cod.isna().sum()), "com_diag": r(g["REPAIR DIAGNOSIS"].notna().mean(), 3), "com_verbatim": r(g["CUSTOMER VERBATIM"].notna().mean(), 3)})
    q["dphu"]["demerito"] = {k: int(v) for k, v in d.dem.value_counts().items()}
    q["aves"]["demerito"] = {k: int(v) for k, v in a.dem.value_counts().items()}
    q["aves"]["parenteses"] = int(a["Demérito (pt)"].astype(str).str.contains("(", regex=False).sum())
    q["sobreposicao"] = {"DG": len(set(d.VIN) & set(g.VIN)), "DA": len(set(d.VIN) & set(a.VIN)), "AG": len(set(a.VIN) & set(g.VIN)), "tres": len(set(d.VIN) & set(a.VIN) & set(g.VIN))}
    return q

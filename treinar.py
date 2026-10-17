#!/usr/bin/env python3
"""
treinar.py — Transformation Day · Qualidade

Lê as planilhas, treina os modelos da Aba 1 (reclamação -> código/família de sintoma),
calcula as tabelas de apoio (lift e custo por família) e exporta tudo
para `modelo.json` (+ `modelo.js`, a mesma coisa em formato de script, para o site abrir
offline com duplo clique). Tudo roda local; nada é enviado para a internet.

Uso:   python treinar.py
       python treinar.py --dados "caminho/Dados.xlsx" --dicionario "caminho/Dicionario.xlsx"
"""
import argparse, json, math, re, sys, time, unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.optimize import minimize_scalar
from sklearn.linear_model import LogisticRegression

AQUI = Path(__file__).resolve().parent
SEED = 7

# ------------------------------------------------------------------ configuração
# Divisão por TEMPO (data de abertura do caso no GMF). Nada de embaralhar.
FIM_TREINO = "2026-05-31"      # treino: tudo até aqui
CALIB_MES = "2026-06"          # calibração das probabilidades: junho/26
# teste: o que vier depois (jul–ago/26)
MIN_COD_TREINO = 10            # código com menos casos no treino vira "outros raros"
MIN_FAM_TREINO = 30            # idem para família
MAX_PALAVRAS, MAX_CHARS = 6000, 14000
MIN_DF_PALAV, MIN_DF_CHAR = 3, 5
GRADE_C = [1, 3, 8]          # força da regularização (escolhida na calibração)
CORTE_PESO = 0.05              # pesos menores que isso viram 0 (deixa o JSON menor)
ESCALA = 1000                  # pesos esparsos guardados como inteiros (x 1/1000)
MIN_CELULA = 30                # abaixo disso: asterisco

# ------------------------------------------------------------------ texto
# IMPORTANTE: este bloco é espelhado no site.html (função `normalizar`). Se mudar aqui, mude lá.
STOP = {"de", "do", "da", "dos", "das", "o", "a", "os", "as", "e", "no", "na", "nos", "nas", "em",
        "com", "que", "para", "por", "ao", "um", "uma", "se", "ou", "cliente", "alega", "relata",
        "solicita", "el", "la", "en", "al", "del", "y", "las", "los", "con", "sin", "le"}
# erros comuns encontrados nos dados (acentos quebrados viram "aao", "veoculo" etc.)
TYPOS = {"serviaos": "servicos", "preao": "preco", "veoculo": "veiculo", "subsodio": "subsidio",
         "subisidio": "subsidio", "est": "esta", "acessa": "acesa", "revis": "revisao",
         "rev": "revisao", "kms": "km", "10mil": "10000km", "10000": "10000km",
         "000km": "km", "barulhos": "barulho", "ruidos": "ruido", "vehiculo": "veiculo",
         "revision": "revisao", "aire": "ar", "pantalla": "tela", "luces": "luzes", "luz": "luz"}
RE_COMB = re.compile("[̀-ͯ]")
RE_NAO_ALNUM = re.compile("[^a-z0-9]+")
RE_AAO = re.compile("aao")


def tokens(texto):
    s = unicodedata.normalize("NFD", str(texto))
    s = RE_COMB.sub("", s).lower()
    s = RE_NAO_ALNUM.sub(" ", s).strip()
    out = []
    for t in s.split():
        t = TYPOS.get(t) or RE_AAO.sub("cao", t)
        t = TYPOS.get(t, t)
        if len(t) >= 2 and t not in STOP:
            out.append(t)
    return out


def contagem_features(toks):
    """Palavras (1 e 2 seguidas) e pedaços de 3 a 5 letras dentro de cada palavra."""
    c = Counter()
    for i, t in enumerate(toks):
        c["w:" + t] += 1
        if i + 1 < len(toks):
            c["w:" + t + " " + toks[i + 1]] += 1
        s = " " + t + " "
        for n in (3, 4, 5):
            for k in range(len(s) - n + 1):
                c["c:" + s[k:k + n]] += 1
    return c


# ------------------------------------------------------------------ números (modelo, km, meses)
MODELOS = ["Modelo A", "Modelo B", "Modelo C", "Modelo D"]
N_NUM = 7   # 4 modelos + km (z) + km 9–11 mil + meses


def numericas(modelo, km, mis, par):
    """Vetor de 7 números. km/mis vazios (None) => valor neutro (média do treino)."""
    v = [1.0 if modelo == m else 0.0 for m in MODELOS]
    if km is None:
        v += [0.0, par["neutro_km10k"]]
    else:
        z = (math.log1p(min(max(km, 0), 150000)) - par["media_logkm"]) / par["dp_logkm"]
        v += [z, 1.0 if 9000 <= km <= 11000 else 0.0]
    v.append(0.0 if mis is None else (min(max(mis, 0), 24) - par["media_mis"]) / par["dp_mis"])
    return v


# ------------------------------------------------------------------ leitura
def achar(nome, dados_dir):
    for d in [Path.cwd(), AQUI, AQUI.parent, AQUI.parent.parent, dados_dir]:
        if d and (Path(d) / nome).exists():
            return Path(d) / nome
    sys.exit(f"Não achei '{nome}'. Passe o caminho com --dados / --dicionario.")


def ler(args):
    t0 = time.time()
    xlsx = Path(args.dados) if args.dados else achar("Transformation Day Qualidade - Dados 2.xlsx", None)
    dic = Path(args.dicionario) if args.dicionario else achar("Dicionario_Codigos_Sintoma_GMF.xlsx", None)
    print(f"Lendo {xlsx.name} ...")
    abas = pd.read_excel(xlsx, sheet_name=["DPHU", "AVES", "GMF"])
    d = pd.read_excel(dic, sheet_name="DICIONARIO_COMPLETO", header=1)
    f = pd.read_excel(dic, sheet_name="FAMILIAS", header=1)
    print(f"  ok em {time.time() - t0:.0f}s")
    return abas["DPHU"], abas["AVES"], abas["GMF"], d, f


# ------------------------------------------------------------------ regra provisória De-Para (DPHU/AVES -> família GMF)
# PROVISÓRIO: o arquivo De-Para oficial ainda não existe. Usada só em analise_dados.py (a Aba 2 saiu do site).
DEPARA = [
    ("S", ["airbag", "cinto"]),
    ("H", ["ar condicionado", "climatiz", "aquecimento", "ventila", "difusor", "evaporador"]),
    ("C", ["freio", "abs", "direcao", "suspensao", "amortecedor", "estabilidade", "roda", "pneu"]),
    ("B", ["ruido", "barulho", "vibracao", "chiado", "rangido", "estalo"]),
    ("R", ["junta", "vedac", "aflor", "deform", "encaixe", "encosta", "retraimento", "folga", "pintura", "risco",
           "insonor", "moldura", "canaleta", "friso", "borracha", "coluna", "montante", "paralama", "para-choque",
           "parachoque", "para choque", "soleira", "grade", "tapete", "carpete", "acabamento", "vazamento"]),
    ("E", ["bateria", "alternador", "fusivel", "chicote", "rele"]),
    ("O", ["porta mala", "teto solar", "capo", "tampa", "fechadura", "macaneta", "trava", "porta"]),
    ("V", ["vidro", "retrovisor", "espelho", "limpador", "farol", "lanterna", "lampada", "buzina", "parabrisa", "para brisa"]),
    ("I", ["multimidia", "radio", "tela", "console", "painel", "cluster", "volante", "banco", "forro"]),
    ("G", ["injecao", "anti partida", "antipartida", "partida", "motor", "ecm", "obd", "luz", "aviso", "mensagem", "cambio", "marcha"]),
    ("R", ["teto"]),
]


def norm_txt(s):
    s = RE_COMB.sub("", unicodedata.normalize("NFD", str(s))).lower().replace("-", " ")
    return " " + RE_NAO_ALNUM.sub(" ", s).strip() + " "


def depara(rotulo):
    """Primeira regra cujo trecho aparece (no começo de uma palavra) no rótulo."""
    n = norm_txt(rotulo)
    for fam, palavras in DEPARA:
        for p in palavras:
            if " " + norm_txt(p).strip() in n:
                return fam
    return ""


# ------------------------------------------------------------------ preparação do GMF
def preparar_gmf(g, dic, fam):
    g = g.copy()
    cod = g["SYMPTOM CODE"].str.extract(r"^\s*(\S+?)\s+-")[0]
    g["cod"] = cod
    d = dic.rename(columns={"Código": "cod", "Descrição (original, em inglês)": "desc", "Família": "famnome"})
    d = d.dropna(subset=["cod"])
    d["cod"] = d["cod"].astype(str).str.strip()
    cod_info = {r.cod: (r.desc, r.famnome) for r in d.itertuples()}
    g["fam"] = g["cod"].str[0].str.upper()
    g["criado"] = pd.to_datetime(g["GI CREATION DATE"], dayfirst=True, errors="coerce")
    g["fab"] = pd.to_datetime(g["VEHICLE MANUFACTURING DATE"], dayfirst=True, errors="coerce").dt.strftime("%Y-%m")
    g["modelo"] = g["MODEL CODE"]
    g["km"] = g["MILEAGE (KM)"]
    g["mis"] = g["MIS"]
    g["custo"] = g["TOTAL AMOUNT PI+MO+LU+FO EXCLUDING MARGIN"]
    fam_nome = {}
    for r in fam.dropna(subset=["Letra"]).itertuples():
        letra = str(r.Letra).strip()
        if letra.isalpha() and letra.isupper():        # ignora as linhas "Não classificado" (6, 1, b)
            fam_nome[letra] = r[2]
    return g, cod_info, fam_nome


# ------------------------------------------------------------------ treino
def construir_vocab(docs):
    n = len(docs)
    df = Counter()
    for c in docs:
        df.update(c.keys())
    pal = [(f, k) for f, k in df.items() if f[0] == "w" and k >= MIN_DF_PALAV]
    chr_ = [(f, k) for f, k in df.items() if f[0] == "c" and k >= MIN_DF_CHAR]
    pal = sorted(pal, key=lambda x: (-x[1], x[0]))[:MAX_PALAVRAS]
    chr_ = sorted(chr_, key=lambda x: (-x[1], x[0]))[:MAX_CHARS]
    feats = [f for f, _ in pal] + [f for f, _ in chr_]
    idf = [round(math.log((1 + n) / (1 + df[f])) + 1, 6) for f in feats]   # já arredondado: igual ao que vai para o JSON
    return feats, idf, len(pal)


def matriz_texto(docs, feats, idf, nw):
    idx = {f: i for i, f in enumerate(feats)}
    lin, col, val = [], [], []
    for r, c in enumerate(docs):
        itens = [(idx[f], (1 + math.log(k)) * idf[idx[f]]) for f, k in c.items() if f in idx]
        for bloco in (lambda j: j < nw, lambda j: j >= nw):  # cada bloco normalizado separado
            parte = [(j, v) for j, v in itens if bloco(j)]
            nrm = math.sqrt(sum(v * v for _, v in parte))
            for j, v in parte:
                lin.append(r); col.append(j); val.append(v / nrm)
    return sp.csr_matrix((val, (lin, col)), shape=(len(docs), len(feats)))


def softmax_T(z, T):
    z = z / T
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def nll(z, y, T):
    p = softmax_T(z, T)
    return -np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-12, None)))


def treinar_alvo(Xtr, ytr, Xcal, ycal, classes):
    """Treina a regressão logística multinomial, poda pesos e calibra por temperatura."""
    melhor = None
    for C in GRADE_C:
        lr = LogisticRegression(C=C, max_iter=400, solver="lbfgs")
        lr.fit(Xtr, ytr)
        W = lr.coef_.copy(); b = lr.intercept_.copy()
        # classes ausentes no treino não existem: mapeia para o índice global
        full_W = np.zeros((len(classes), Xtr.shape[1])); full_b = np.full(len(classes), -30.0)
        for k, c in enumerate(lr.classes_):
            full_W[c] = W[k]; full_b[c] = b[k]
        nt = Xtr.shape[1] - N_NUM                      # colunas de texto (as últimas N_NUM são números)
        txt_w = full_W[:, :nt]
        txt_w[np.abs(txt_w) < CORTE_PESO] = 0
        full_W[:, :nt] = np.round(txt_w * ESCALA) / ESCALA
        full_W[:, nt:] = np.round(full_W[:, nt:], 4)
        full_b = np.round(full_b, 4)
        z = Xcal @ full_W.T + full_b
        r = minimize_scalar(lambda T: nll(z, ycal, T), bounds=(0.4, 6), method="bounded")
        score = r.fun
        print(f"     C={C:<3} NLL calibração={score:.3f} (T={r.x:.2f})")
        if melhor is None or score < melhor[0]:
            melhor = (score, C, full_W, full_b, float(r.x))
    _, C, W, b, T = melhor
    return dict(C=C, W=W, b=b, T=round(T, 4))


def logits(X, m):
    return np.asarray(X @ m["W"].T) + m["b"]


def avaliar(m, X, y, classes, base_ordem, k):
    """Acerto honesto: 'OUTROS' (códigos raros) nunca conta como resposta nem como acerto."""
    z = logits(X, m)
    p = softmax_T(z, m["T"])
    outros = classes.index("OUTROS")
    pm = p.copy(); pm[:, outros] = -1                      # só ranqueia classes com nome
    ordem = np.argsort(-pm, axis=1)
    certo = (y != outros)
    top1 = float(np.mean((ordem[:, 0] == y) & certo))
    topk = float(np.mean([(y[i] in ordem[i, :k]) and certo[i] for i in range(len(y))]))
    chute1 = float(np.mean(y == base_ordem[0]))
    chutek = float(np.mean([yy in base_ordem[:k] for yy in y]))
    conf = pm.max(axis=1); acerto = (ordem[:, 0] == y) & certo
    caixas = []
    for lo, hi in [(0, .2), (.2, .4), (.4, .6), (.6, .8), (.8, 1.01)]:
        s = (conf >= lo) & (conf < hi)
        caixas.append({"de": lo, "ate": min(hi, 1), "n": int(s.sum()),
                       "conf_media": float(conf[s].mean()) if s.any() else None,
                       "acerto": float(acerto[s].mean()) if s.any() else None})
    return {"n": int(len(y)), "top1": top1, f"top{k}": topk, "chute_top1": chute1, f"chute_top{k}": chutek,
            "nll_sem_calibrar": float(nll(z, y, 1.0)), "nll_calibrado": float(nll(z, y, m["T"])), "calibracao": caixas}


def esparso(m, nt):
    """Pesos de texto em formato esparso por feature (ptr/cls/val, inteiros x 1/ESCALA) + pesos numéricos."""
    Wt = sp.csr_matrix(np.rint(m["W"][:, :nt] * ESCALA).T.astype(np.int32))   # [features x classes]
    return {"T": m["T"], "C": m["C"], "esc": ESCALA, "b": [float(x) for x in m["b"]],
            "ptr": Wt.indptr.tolist(), "cls": Wt.indices.tolist(), "val": Wt.data.tolist(),
            "num": m["W"][:, nt:].tolist()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dados"); ap.add_argument("--dicionario")
    ap.add_argument("--saida", default=str(AQUI))
    ap.add_argument("--sem-vin", action="store_true", help="não gera vins.js (site sem busca por VIN)")
    args = ap.parse_args()
    np.random.seed(SEED)
    dphu, aves, gmf, dic, fam = ler(args)
    g, cod_info, fam_nome = preparar_gmf(gmf, dic, fam)

    # ---------------- perfil dos dados (aparece na aba "Sobre o modelo")
    com_cod = g[g["cod"].notna()]
    vc = com_cod["cod"].value_counts()
    perfil = {
        "gmf_linhas": int(len(g)), "dphu_linhas": int(len(dphu)), "aves_linhas": int(len(aves)),
        "gmf_com_codigo": float(g["cod"].notna().mean()),
        "gmf_com_reclamacao": float(g["CUSTOMER COMPLAINT"].notna().mean()),
        "gmf_com_verbatim": float(g["CUSTOMER VERBATIM"].notna().mean()),
        "gmf_com_verbatim_sem_g057": float(g.loc[g["cod"] != "G057", "CUSTOMER VERBATIM"].notna().mean()),
        "gmf_com_diagnostico": float(g["REPAIR DIAGNOSIS"].notna().mean()),
        "gmf_com_efeito": float(g["CUSTOMER EFFECT"].notna().mean()),
        "codigos_distintos": int(len(vc)), "codigos_menos_5": int((vc < 5).sum()), "codigos_1_caso": int((vc == 1).sum()),
        "codigos_30_mais": int((vc >= 30).sum()), "cobertura_codigos_30_mais": float(vc[vc >= 30].sum() / vc.sum()),
        "g057_share": float((com_cod["cod"] == "G057").mean()),
        "g057_revisao": float(g.loc[g["cod"] == "G057", "CUSTOMER VERBATIM"].dropna().str.contains(r"\brev", case=False, regex=True).mean()),
        "g057_km_9_11k": float(g.loc[g["cod"] == "G057", "km"].between(9000, 11000).mean()),
    }
    por_mes = com_cod.assign(m=com_cod["criado"].dt.strftime("%Y-%m")).groupby("m").apply(
        lambda x: pd.Series({"n": len(x), "g057": float((x["cod"] == "G057").mean())}), include_groups=False)
    perfil["g057_por_mes_abertura"] = {k: [int(v.n), round(float(v.g057), 3)] for k, v in por_mes.iterrows()}

    # ---------------- Aba 1: base de treino (casos com código e texto)
    txt = g[g["cod"].notna() & g["CUSTOMER VERBATIM"].notna()].copy()
    txt["toks"] = txt["CUSTOMER VERBATIM"].map(tokens)
    txt = txt[txt["toks"].map(len) > 0]
    txt["feat"] = txt["toks"].map(contagem_features)
    mes = txt["criado"].dt.strftime("%Y-%m")
    eh_treino = txt["criado"] <= pd.Timestamp(FIM_TREINO)
    eh_calib = mes == CALIB_MES
    eh_teste = txt["criado"] > pd.Timestamp(FIM_TREINO + " 23:59:59")
    eh_teste &= ~eh_calib
    print(f"Casos com texto e código: {len(txt)} | treino {int(eh_treino.sum())} (até {FIM_TREINO}) | "
          f"calibração {int(eh_calib.sum())} ({CALIB_MES}) | teste {int(eh_teste.sum())}")
    # treino de verdade = até o fim de maio; calibração = junho (não entra no treino)
    tr, ca, te = txt[eh_treino], txt[eh_calib], txt[eh_teste]

    feats, idf, nw = construir_vocab(list(tr["feat"]))
    print(f"Vocabulário: {nw} palavras/bigramas + {len(feats) - nw} pedaços de letras")

    km_tr = np.log1p(np.clip(tr["km"].values, 0, 150000))
    par = {"media_logkm": float(km_tr.mean()), "dp_logkm": float(km_tr.std()),
           "neutro_km10k": float(tr["km"].between(9000, 11000).mean()),
           "media_mis": float(tr["mis"].clip(0, 24).mean()), "dp_mis": float(tr["mis"].clip(0, 24).std())}

    def montar(df):
        Xt = matriz_texto(list(df["feat"]), feats, idf, nw)
        num = np.array([numericas(m, float(k), float(s), par) for m, k, s in zip(df["modelo"], df["km"], df["mis"])])
        return sp.hstack([Xt, sp.csr_matrix(num)]).tocsr()

    Xtr, Xca, Xte = montar(tr), montar(ca), montar(te)

    escopos, modelos_json, sobre = {}, {}, {}
    for escopo in ("com", "sem"):
        print(f"\n=== Escopo: {'COM' if escopo == 'com' else 'SEM'} G057 ===")
        sel = (lambda df: df) if escopo == "com" else (lambda df: df[df["cod"] != "G057"])
        mtr, mca, mte = sel(tr), sel(ca), sel(te)
        itr, ica, ite = [np.where(x.index.isin(m.index))[0] for x, m in ((tr, mtr), (ca, mca), (te, mte))]
        modelos_json[escopo] = {}
        sobre[escopo] = {"n_treino": len(mtr), "n_calibracao": len(mca), "n_teste": len(mte)}
        for alvo in ("fam", "cod"):
            ctr = mtr[alvo if alvo == "fam" else "cod"].value_counts()
            minimo = MIN_FAM_TREINO if alvo == "fam" else MIN_COD_TREINO
            classes = sorted(ctr[ctr >= minimo].index.tolist())
            classes.append("OUTROS")
            cidx = {c: i for i, c in enumerate(classes)}
            ymap = lambda df: np.array([cidx.get(c, cidx["OUTROS"]) for c in df[alvo]])
            ytr, yca, yte = ymap(mtr), ymap(mca), ymap(mte)
            print(f"  [{alvo}] {len(classes) - 1} classes + 'OUTROS' (casos de treino em classes raras: {(ytr == cidx['OUTROS']).mean():.1%})")
            m = treinar_alvo(Xtr[itr], ytr, Xca[ica], yca, classes)
            k = 3 if alvo == "fam" else 5
            base = np.argsort(-np.bincount(ytr, minlength=len(classes)))
            base = np.array([b for b in base if classes[b] != "OUTROS"])
            met = avaliar(m, Xte[ite], yte, classes, base, k)
            met["teste_em_classes_conhecidas"] = float((yte != cidx["OUTROS"]).mean())
            met["classes"] = len(classes) - 1
            print(f"     TESTE n={met['n']}: top-1={met['top1']:.1%}  top-{k}={met[f'top{k}']:.1%}  "
                  f"| chute: top-1={met['chute_top1']:.1%}  top-{k}={met[f'chute_top{k}']:.1%}")
            sobre[escopo][alvo] = met
            modelos_json[escopo][alvo] = {"classes": classes, **esparso(m, Xtr.shape[1] - N_NUM)}

    # ---------------- tabelas de apoio (lift, custo)
    def tabelas(df):
        tot = df["fam"].value_counts()
        share = (tot / tot.sum()).to_dict()
        lift = {}
        for mod, sub in df.groupby("modelo"):
            vc_ = sub["fam"].value_counts()
            lift[mod] = {f: [int(n), float((n / len(sub)) / share[f])] for f, n in vc_.items()}
        custo = {f: [float(s["custo"].mean()), float(s["custo"].median()), int(s["custo"].notna().sum())]
                 for f, s in df.groupby("fam") if s["custo"].notna().any()}
        custo_cod = {c: [float(s["custo"].mean()), int(s["custo"].notna().sum())]
                     for c, s in df.groupby("cod") if s["custo"].notna().any()}
        return {"n": int(len(df)), "share": share, "n_fam": {k: int(v) for k, v in tot.items()},
                "lift": lift, "custo_fam": custo, "custo_cod": custo_cod}

    base_gmf = com_cod
    stats = {"com": tabelas(base_gmf), "sem": tabelas(base_gmf[base_gmf["cod"] != "G057"])}

    dic_json = {c: [str(d_), f] for c, (d_, f) in cod_info.items()}
    # ---------------- correlações por VIN, cartões, tendências, efeito dominó, cubos (agregados.py)
    import agregados as AG
    print("\nCalculando correlações por VIN e demais agregados ...")
    dic_desc = {c: str(x[0]) for c, x in cod_info.items()}
    D, A_, G_ = AG.preparar(dphu, aves, gmf, dic_desc, depara)
    Lst = AG.listas(D, A_, G_, dic_desc, depara)
    ag = {"lst": Lst, "assoc": AG.correlacoes(D, A_, G_, Lst), "info_el": AG.info_elementos(D, G_, Lst),
          "cartoes": AG.cartoes(D, A_, G_, Lst, depara), "tend": AG.tendencias(D, G_, Lst), "domino": AG.domino(G_, Lst),
          "aves_juntos": AG.aves_juntos(A_, Lst), "cubos": AG.cubos(D, A_, G_, Lst), "qual": AG.qualidade(D, A_, G_)}
    print(f"  ordem no tempo: em {ag['assoc']['ordem_dg']:.1%} dos carros a 1ª reclamação vem depois do defeito de fábrica")
    indice = None if args.sem_vin else AG.indice_vins(D, A_, G_, Lst)

    saida = {
        "meta": {"gerado_em": time.strftime("%Y-%m-%d %H:%M"), "fim_treino": FIM_TREINO, "calibracao": CALIB_MES,
                 "teste": "jul–ago/2026", "seed": SEED, "versao": "versão final"},
        "norm": {"stop": sorted(STOP), "typos": TYPOS},
        "vocab": {"feats": feats, "idf": idf, "nw": nw},
        "num": {"modelos": MODELOS, **par},
        "modelos": modelos_json,
        "dic": dic_json, "fam_nomes": {**fam_nome, "OUTROS": "Outros (raros)"},
        "stats": stats,
        "sobre": {"perfil": perfil, "metricas": sobre},
        **ag, "com_vin": indice is not None,
    }
    out = Path(args.saida)
    txtjson = json.dumps(saida, ensure_ascii=False, separators=(",", ":"))
    (out / "modelo.json").write_text(txtjson, encoding="utf-8")
    (out / "modelo.js").write_text("window.MODELO=" + txtjson + ";", encoding="utf-8")
    print(f"\nmodelo.json: {len(txtjson) / 1e6:.1f} MB")
    vj = out / "vins.js"
    if indice is not None:
        txtv = json.dumps(indice, ensure_ascii=False, separators=(",", ":"))
        vj.write_text("window.VINS=" + txtv + ";", encoding="utf-8")
        print(f"vins.js: {len(txtv) / 1e6:.1f} MB ({len(indice)} VINs)")
    elif vj.exists():
        vj.unlink()
    print("pronto.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
PORTAIL RH FICTIF — "NOVA RH", portail interne du Groupe Novalis.
Multi-pages HTML (login -> dashboard -> employes -> fiche -> bulletin
-> prevoyance -> conges -> documents), PAS d'API.
Cible de navigation pour l'agent computer-use / crawler.

Contient 4 ANOMALIES DE CONFORMITE volontaires, pour l'audit :
  1. Amina Belkacem  — salaire brut SOUS le SMIC
  2. Thomas Lefevre  — heures supplementaires effectuees mais NON payees
  3. Karim Ndiaye    — cotisation "Mutuelle" prelevee DEUX fois
  4. CADRES          — non couverts par la prevoyance obligatoire 1,50 % TA
                       (ANI du 14/03/1947, art. 7) : le contrat prevoyance ne
                       couvre que les ETAM ; aucune ligne prevoyance sur les
                       bulletins des cadres (Marchand, Laurent).

Branche dans server.py :  from portail_rh import rh ; app.register_blueprint(rh)
"""

import hashlib

from flask import Blueprint

rh = Blueprint("rh", __name__)

ENTREPRISE = {
    "nom": "Groupe Novalis",
    "siret": "812 456 789 00034",
    "adresse": "14 rue de la Concorde, 75008 Paris",
    "convention": "Syntec (IDCC 1486)",
}

# SMIC horaire brut en vigueur (nov. 2024 -> 2025)
SMIC_HORAIRE = 11.88
SMIC_MENSUEL = round(SMIC_HORAIRE * 151.67, 2)  # ~1801,80 €

# ── EMPLOYES ────────────────────────────────────────────────────────────────
# categorie : "Cadre" ou "ETAM" (classification Syntec). Sert au controle
# prevoyance : les cadres doivent etre couverts (1,50 % TA), ce qui n'est pas
# le cas ici -> anomalie.
EMPLOYES = [
    {
        "id": "laurent", "prenom": "Etienne", "nom": "Laurent",
        "poste": "Directeur des operations", "service": "Direction",
        "contrat": "CDI — cadre au forfait", "entree": "03/05/2018",
        "statut": "Actif", "matricule": "NV-0031", "categorie": "Cadre",
        "email": "etienne.laurent@novalis.fr",
    },
    {
        "id": "belkacem", "prenom": "Amina", "nom": "Belkacem",
        "poste": "Assistante administrative", "service": "Administration",
        "contrat": "CDI — temps plein", "entree": "12/03/2021",
        "statut": "Actif", "matricule": "NV-0142", "categorie": "ETAM",
        "email": "amina.belkacem@novalis.fr",
    },
    {
        "id": "lefevre", "prenom": "Thomas", "nom": "Lefevre",
        "poste": "Developpeur back-end", "service": "Technique",
        "contrat": "CDI — temps plein", "entree": "02/09/2022",
        "statut": "Actif", "matricule": "NV-0210", "categorie": "ETAM",
        "email": "thomas.lefevre@novalis.fr",
    },
    {
        "id": "marchand", "prenom": "Sophie", "nom": "Marchand",
        "poste": "Responsable commerciale", "service": "Ventes",
        "contrat": "CDI — cadre au forfait", "entree": "18/01/2019",
        "statut": "Actif", "matricule": "NV-0087", "categorie": "Cadre",
        "email": "sophie.marchand@novalis.fr",
    },
    {
        "id": "ndiaye", "prenom": "Karim", "nom": "Ndiaye",
        "poste": "Technicien support", "service": "Technique",
        "contrat": "CDI — temps plein", "entree": "05/06/2023",
        "statut": "Actif", "matricule": "NV-0233", "categorie": "ETAM",
        "email": "karim.ndiaye@novalis.fr",
    },
    {
        "id": "rousseau", "prenom": "Julie", "nom": "Rousseau",
        "poste": "Chargee de recrutement", "service": "Ressources humaines",
        "contrat": "CDI — temps plein", "entree": "22/11/2020",
        "statut": "Actif", "matricule": "NV-0119", "categorie": "ETAM",
        "email": "julie.rousseau@novalis.fr",
    },
    {
        "id": "bianchi", "prenom": "Marco", "nom": "Bianchi",
        "poste": "Assistant marketing", "service": "Marketing",
        "contrat": "CDD — temps partiel 24h", "entree": "01/02/2025",
        "statut": "Actif", "matricule": "NV-0251", "categorie": "ETAM",
        "email": "marco.bianchi@novalis.fr",
    },
]
EMP_BY_ID = {e["id"]: e for e in EMPLOYES}

# ── BULLETINS ───────────────────────────────────────────────────────────────
# base = salaire de base brut ; hs_h = heures supp effectuees ;
# hs_montant = montant paye pour ces heures ; primes = liste (libelle, montant)
# anomalie : cle interne pour la mise en evidence (le texte reste realiste)
BULLETINS = [
    # Etienne Laurent — CADRE, CONFORME sur la paie (mais prevoyance absente)
    {"id": "b-laurent-2025-01", "emp": "laurent", "mois": "Janvier 2025",
     "periode": "01/01/2025 au 31/01/2025", "paiement": "31/01/2025",
     "heures": 151.67, "base": 5200.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 260.00)], "anomalie": None},
    {"id": "b-laurent-2025-02", "emp": "laurent", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 151.67, "base": 5200.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 260.00)], "anomalie": None},
    {"id": "b-laurent-2025-03", "emp": "laurent", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 151.67, "base": 5200.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 260.00)], "anomalie": None},

    # Amina Belkacem — SOUS LE SMIC (base < SMIC mensuel)
    {"id": "b-belkacem-2025-01", "emp": "belkacem", "mois": "Janvier 2025",
     "periode": "01/01/2025 au 31/01/2025", "paiement": "31/01/2025",
     "heures": 151.67, "base": 1750.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": "sous_smic"},
    {"id": "b-belkacem-2025-02", "emp": "belkacem", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 151.67, "base": 1750.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": "sous_smic"},
    {"id": "b-belkacem-2025-03", "emp": "belkacem", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 151.67, "base": 1750.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime de transport", 42.00)], "anomalie": "sous_smic"},

    # Thomas Lefevre — HEURES SUPP NON PAYEES (hs_h > 0, hs_montant = 0)
    {"id": "b-lefevre-2025-01", "emp": "lefevre", "mois": "Janvier 2025",
     "periode": "01/01/2025 au 31/01/2025", "paiement": "31/01/2025",
     "heures": 151.67, "base": 3200.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": None},
    {"id": "b-lefevre-2025-02", "emp": "lefevre", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 163.67, "base": 3200.00, "hs_h": 12, "hs_montant": 0.0,
     "primes": [], "anomalie": "hs_impayees"},
    {"id": "b-lefevre-2025-03", "emp": "lefevre", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 159.67, "base": 3200.00, "hs_h": 8, "hs_montant": 0.0,
     "primes": [], "anomalie": "hs_impayees"},

    # Sophie Marchand — CADRE, CONFORME sur la paie (mais prevoyance absente)
    {"id": "b-marchand-2025-01", "emp": "marchand", "mois": "Janvier 2025",
     "periode": "01/01/2025 au 31/01/2025", "paiement": "31/01/2025",
     "heures": 151.67, "base": 4100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 120.00)], "anomalie": None},
    {"id": "b-marchand-2025-02", "emp": "marchand", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 151.67, "base": 4100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 120.00), ("Prime commerciale", 850.00)],
     "anomalie": None},
    {"id": "b-marchand-2025-03", "emp": "marchand", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 151.67, "base": 4100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime d'anciennete", 120.00)], "anomalie": None},

    # Karim Ndiaye — DOUBLE PRELEVEMENT MUTUELLE
    {"id": "b-ndiaye-2025-01", "emp": "ndiaye", "mois": "Janvier 2025",
     "periode": "01/01/2025 au 31/01/2025", "paiement": "31/01/2025",
     "heures": 151.67, "base": 2100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": None},
    {"id": "b-ndiaye-2025-02", "emp": "ndiaye", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 151.67, "base": 2100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": "double_mutuelle"},
    {"id": "b-ndiaye-2025-03", "emp": "ndiaye", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 151.67, "base": 2100.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": "double_mutuelle"},

    # Julie Rousseau — CONFORME
    {"id": "b-rousseau-2025-02", "emp": "rousseau", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 151.67, "base": 2800.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": None},
    {"id": "b-rousseau-2025-03", "emp": "rousseau", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 151.67, "base": 2800.00, "hs_h": 0, "hs_montant": 0.0,
     "primes": [("Prime de transport", 42.00)], "anomalie": None},

    # Marco Bianchi — temps partiel, CONFORME (base proratisee)
    {"id": "b-bianchi-2025-02", "emp": "bianchi", "mois": "Fevrier 2025",
     "periode": "01/02/2025 au 28/02/2025", "paiement": "28/02/2025",
     "heures": 104.00, "base": 1235.52, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": None},
    {"id": "b-bianchi-2025-03", "emp": "bianchi", "mois": "Mars 2025",
     "periode": "01/03/2025 au 31/03/2025", "paiement": "31/03/2025",
     "heures": 104.00, "base": 1235.52, "hs_h": 0, "hs_montant": 0.0,
     "primes": [], "anomalie": None},
]
BUL_BY_ID = {b["id"]: b for b in BULLETINS}


def bulletins_de(emp_id):
    return [b for b in BULLETINS if b["emp"] == emp_id]


def eur(x):
    return f"{x:,.2f} €".replace(",", " ").replace(".", ",")


def hh(x):
    """Formate un nombre d'heures a la francaise (virgule) + unite."""
    return f"{x:.2f}".replace(".", ",")


# ── PREVOYANCE & PROTECTION SOCIALE ─────────────────────────────────────────
# Deux contrats collectifs. Le contrat PREVOYANCE ne couvre que les "ETAM" :
# les CADRES sont donc HORS COUVERTURE alors que la loi impose une cotisation
# patronale prevoyance >= 1,50 % de la Tranche A (ANI 14/03/1947, art. 7).
CONTRATS_SOCIAUX = [
    {
        "id": "mutuelle",
        "type": "Mutuelle sante (frais de sante)",
        "organisme": "Malakoff Humanis",
        "reference": "CT-SANTE-2023-0442",
        "effet": "01/01/2023",
        "categories": ["Cadre", "ETAM"],          # tout l'effectif
        "assiette": "Forfait mensuel",
        "taux": "34,50 € / mois (part salariale)",
        "obligatoire": True,
        "garanties": [
            ("Hospitalisation", "100 % base de remboursement"),
            ("Soins courants", "150 % BR"),
            ("Optique", "forfait 200 € / 2 ans"),
            ("Dentaire", "200 % BR"),
        ],
        "note": None,
    },
    {
        "id": "prevoyance",
        "type": "Prevoyance (deces / incapacite / invalidite)",
        "organisme": "AG2R Prevoyance",
        "reference": "PV-2022-1187",
        "effet": "01/06/2022",
        "categories": ["ETAM"],                    # !!! CADRES ABSENTS
        "assiette": "Tranche A / Tranche B",
        "taux": "0,86 % TA (part salariale)",
        "obligatoire": True,
        "garanties": [
            ("Capital deces", "300 % du salaire annuel brut"),
            ("Rente education", "oui, par enfant a charge"),
            ("Incapacite temporaire de travail", "80 % du salaire net"),
            ("Invalidite", "rente selon categorie 1 / 2 / 3"),
        ],
        "note": ("Point de conformite : l'ANI du 14/03/1947 (art. 7) impose une "
                 "cotisation patronale prevoyance d'au moins 1,50 % de la Tranche A "
                 "pour les salaries CADRES. Ce contrat ne mentionne que la categorie "
                 "ETAM ; aucune couverture prevoyance n'est en place pour les cadres."),
    },
]
CONTRAT_BY_ID = {c["id"]: c for c in CONTRATS_SOCIAUX}


def categories_effectif():
    """Liste ordonnee des categories presentes dans l'effectif."""
    cats = []
    for e in EMPLOYES:
        if e["categorie"] not in cats:
            cats.append(e["categorie"])
    return cats


def effectif_cat(cat):
    return sum(1 for e in EMPLOYES if e["categorie"] == cat)


def couvert(contrat, cat):
    return cat in contrat["categories"]


# Taux prevoyance ETAM applique sur le bulletin (part salariale)
PREVOYANCE_TAUX_ETAM = 0.0086


# ── CALCUL DU BULLETIN ──────────────────────────────────────────────────────
COTISATIONS = [
    ("Securite sociale - Assurance maladie", 0.0000),
    ("Assurance vieillesse plafonnee", 0.0690),
    ("Assurance vieillesse deplafonnee", 0.0040),
    ("Retraite complementaire Agirc-Arrco T1", 0.0315),
    ("Contribution equilibre general (CEG)", 0.0086),
    ("CSG deductible (98,25 %)", 0.0668),
    ("CSG / CRDS non deductible (98,25 %)", 0.0285),
]
MUTUELLE = 34.50


def calc(b):
    """Calcule les lignes de paie d'un bulletin (dict enrichi)."""
    emp = EMP_BY_ID[b["emp"]]
    base = b["base"]
    primes_total = sum(m for _, m in b["primes"])
    brut = round(base + b["hs_montant"] + primes_total, 2)

    lignes_cot = [(lib, round(brut * taux, 2)) for lib, taux in COTISATIONS]
    # Ligne mutuelle (doublee si anomalie)
    lignes_cot.append(("Mutuelle sante obligatoire", MUTUELLE))
    if b.get("anomalie") == "double_mutuelle":
        lignes_cot.append(("Mutuelle sante obligatoire", MUTUELLE))
    # Ligne prevoyance : presente pour les ETAM, ABSENTE pour les CADRES
    # (les cadres devraient pourtant etre couverts -> anomalie de conformite)
    if emp["categorie"] == "ETAM":
        lignes_cot.append(("Prevoyance obligatoire (0,86 % TA)",
                           round(brut * PREVOYANCE_TAUX_ETAM, 2)))

    total_cot = round(sum(m for _, m in lignes_cot), 2)
    net_avant_impot = round(brut - total_cot, 2)
    net_imposable = round(brut - total_cot + brut * (0.0285), 2)
    taux_pas = 0.068
    impot = round(net_imposable * taux_pas, 2)
    net_paye = round(net_avant_impot - impot, 2)
    taux_horaire = round(base / b["heures"], 2) if b["heures"] else 0.0

    return {
        **b, "brut": brut, "primes_total": primes_total,
        "lignes_cot": lignes_cot, "total_cot": total_cot,
        "net_avant_impot": net_avant_impot, "net_imposable": net_imposable,
        "impot": impot, "taux_pas": taux_pas, "net_paye": net_paye,
        "taux_horaire": taux_horaire,
    }


# ── AVATARS (SVG deterministes, sans dependance reseau) ─────────────────────
_AVA_BG = ["#e0e7ff", "#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe",
           "#ccfbf1", "#ffe4e6"]
_AVA_SKIN = ["#f4d4b8", "#e8b892", "#cf9d6f", "#a9714a", "#f7ddc9", "#8d5a3c"]
_AVA_HAIR = ["#2b2b2b", "#4a2f1b", "#6b4423", "#9aa0a6", "#111827", "#5c3a21",
             "#b0763a"]
_AVA_CLOTH = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
              "#14b8a6", "#ef4444"]


def _ava_seed(emp):
    h = hashlib.md5(emp["matricule"].encode()).hexdigest()
    return [int(h[i:i + 2], 16) for i in range(0, 14, 2)]


def avatar_svg(emp):
    """Retourne un <svg> d'avatar illustre, deterministe par matricule.
    Le conteneur (.avatar / .big) applique le clip circulaire en CSS."""
    s = _ava_seed(emp)
    bg = _AVA_BG[s[0] % len(_AVA_BG)]
    skin = _AVA_SKIN[s[1] % len(_AVA_SKIN)]
    hair = _AVA_HAIR[s[2] % len(_AVA_HAIR)]
    cloth = _AVA_CLOTH[s[4] % len(_AVA_CLOTH)]
    style = s[3] % 4

    hairs = {
        0: f'<path d="M27 46 Q28 22 50 22 Q72 22 73 46 Q66 34 50 34 Q34 34 27 46Z" fill="{hair}"/>',
        1: f'<path d="M30 41 Q34 24 50 24 Q66 24 70 41 Q60 33 50 33 Q40 33 30 41Z" fill="{hair}"/>',
        2: ('<path d="M25 68 Q22 24 50 21 Q78 24 75 68 Q73 46 66 45 '
            f'Q70 34 50 32 Q30 34 34 45 Q27 46 25 68Z" fill="{hair}"/>').format(hair=hair),
        3: ('<path d="M28 45 Q26 30 34 26 Q38 18 50 20 Q62 18 66 26 '
            f'Q74 30 72 45 Q66 34 50 33 Q34 34 28 45Z" fill="{hair}"/>').format(hair=hair),
    }
    return (
        '<svg viewBox="0 0 100 100" width="100%" height="100%" '
        f'preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
        f'<rect width="100" height="100" fill="{bg}"/>'
        f'<path d="M14 100 Q14 74 50 74 Q86 74 86 100Z" fill="{cloth}"/>'
        f'<rect x="43" y="62" width="14" height="16" fill="{skin}"/>'
        f'<circle cx="29" cy="50" r="4" fill="{skin}"/>'
        f'<circle cx="71" cy="50" r="4" fill="{skin}"/>'
        f'<ellipse cx="50" cy="49" rx="21" ry="24" fill="{skin}"/>'
        f'{hairs[style]}'
        '<circle cx="42" cy="49" r="2.6" fill="#374151"/>'
        '<circle cx="58" cy="49" r="2.6" fill="#374151"/>'
        '<path d="M43 59 Q50 65 57 59" stroke="#a85f50" stroke-width="2.2" '
        'fill="none" stroke-linecap="round"/>'
        '</svg>'
    )


def initiales(e):
    return (e["prenom"][0] + e["nom"][0]).upper()


# ── MISE EN PAGE ────────────────────────────────────────────────────────────
CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f1f5f9;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;
  --brand:#4f46e5;--brand-d:#4338ca;--sb:#111827;--sb2:#1f2937;
  --green:#16a34a;--amber:#d97706;--red:#dc2626;
}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:var(--bg);color:var(--ink);font-size:14px;line-height:1.5}
a{color:inherit;text-decoration:none}
.layout{display:flex;min-height:100vh}
/* Sidebar */
.sb{width:248px;background:var(--sb);color:#cbd5e1;flex-shrink:0;
  display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.sb-logo{display:flex;align-items:center;gap:.6rem;padding:1.25rem 1.25rem;
  border-bottom:1px solid var(--sb2)}
.sb-logo .mark{width:30px;height:30px;border-radius:8px;
  background:linear-gradient(135deg,#6366f1,#4338ca);display:grid;place-items:center;
  color:#fff;font-weight:800;font-size:15px}
.sb-logo b{color:#fff;font-size:15px;letter-spacing:-.01em}
.sb-logo span{display:block;font-size:11px;color:#64748b}
.sb nav{padding:.75rem .6rem;display:flex;flex-direction:column;gap:2px;flex:1}
.sb nav a{display:flex;align-items:center;gap:.7rem;padding:.6rem .75rem;
  border-radius:8px;font-size:13.5px;font-weight:500;color:#94a3b8;transition:.12s}
.sb nav a .ic{width:18px;text-align:center;opacity:.9}
.sb nav a:hover{background:var(--sb2);color:#e2e8f0}
.sb nav a.active{background:var(--brand);color:#fff}
.sb-foot{padding:1rem 1.25rem;border-top:1px solid var(--sb2);font-size:12px;color:#64748b}
/* Main */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{background:#fff;border-bottom:1px solid var(--line);padding:.85rem 1.75rem;
  display:flex;align-items:center;gap:1rem;position:sticky;top:0;z-index:5}
.top .crumb{font-size:13px;color:var(--muted)}
.top .crumb b{color:var(--ink)}
.top .user{margin-left:auto;display:flex;align-items:center;gap:.6rem;font-size:13px}
/* Avatars */
.avatar{width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;
  background:#e0e7ff;line-height:0;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06)}
.avatar svg{display:block;width:100%;height:100%}
.avatar.initials{display:grid;place-items:center;background:var(--brand);color:#fff;
  font-weight:700;font-size:12px;line-height:1}
.wrap{padding:1.75rem;max-width:1100px;width:100%;margin:0 auto}
h1.page{font-size:22px;font-weight:700;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:13.5px;margin-top:.2rem}
/* Cards / stats */
.grid{display:grid;gap:1rem}
.stats{grid-template-columns:repeat(4,1fr);margin:1.5rem 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.1rem}
.stat .k{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.stat .v{font-size:26px;font-weight:750;margin-top:.35rem;letter-spacing:-.02em}
.stat .d{font-size:12px;color:var(--muted);margin-top:.15rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px}
.card-h{padding:1rem 1.25rem;border-bottom:1px solid var(--line);
  display:flex;align-items:center;justify-content:space-between}
.card-h h2{font-size:15px;font-weight:650}
.card-h a{font-size:13px;color:var(--brand);font-weight:600}
/* Table */
table{width:100%;border-collapse:collapse}
thead th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;
  color:var(--muted);font-weight:650;padding:.7rem 1.25rem;border-bottom:1px solid var(--line)}
tbody td{padding:.85rem 1.25rem;border-bottom:1px solid var(--line);font-size:13.5px;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr{transition:background .1s}
tbody tr.clic:hover{background:#f8fafc;cursor:pointer}
.emp-cell{display:flex;align-items:center;gap:.75rem}
.emp-cell b{font-weight:600}
.emp-cell small{display:block;color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:.2rem .6rem;border-radius:20px;font-size:11.5px;font-weight:650}
.b-green{background:#dcfce7;color:#15803d}
.b-gray{background:#f1f5f9;color:#475569}
.b-blue{background:#dbeafe;color:#1d4ed8}
.b-red{background:#fee2e2;color:#b91c1c}
.b-amber{background:#fef3c7;color:#b45309}
.link{color:var(--brand);font-weight:600}
.right{text-align:right}
/* Fiche employe */
.profile{display:flex;gap:1.25rem;align-items:center;background:var(--card);
  border:1px solid var(--line);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
.profile .big{width:66px;height:66px;border-radius:50%;overflow:hidden;flex-shrink:0;
  background:#e0e7ff;line-height:0;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06)}
.profile .big svg{display:block;width:100%;height:100%}
.profile h1{font-size:20px}
.profile .meta{color:var(--muted);font-size:13.5px;margin-top:.15rem}
.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem}
.info-grid .box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.9rem 1.1rem}
.info-grid .box .k{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;font-weight:600}
.info-grid .box .v{font-size:14px;font-weight:600;margin-top:.25rem}
/* Prevoyance */
.contract-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.5rem 0}
.contract{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.25rem;
  display:flex;flex-direction:column;gap:.6rem}
.contract .ctype{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.contract .cnom{font-size:17px;font-weight:700;letter-spacing:-.01em}
.contract .cmeta{font-size:12.5px;color:var(--muted)}
.contract .cfoot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;
  padding-top:.6rem;border-top:1px solid var(--line)}
.note{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:.9rem 1.1rem;
  font-size:13px;color:#9a3412;line-height:1.55;margin-top:.4rem}
.note b{color:#7c2d12}
.gtable td{font-size:13px}
/* Bulletin */
.payslip{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ps-head{padding:1.5rem 1.75rem;border-bottom:2px solid var(--ink);
  display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem}
.ps-head .co b{font-size:16px}
.ps-head .co div{font-size:12.5px;color:var(--muted)}
.ps-head .ttl{text-align:right}
.ps-head .ttl b{font-size:18px}
.ps-head .ttl div{font-size:12.5px;color:var(--muted)}
.ps-two{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}
.ps-two > div{background:#fff;padding:1.1rem 1.75rem}
.ps-two .k{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;font-weight:600}
.ps-two .lbl{font-size:13px;margin:.15rem 0}
.ps-two .lbl b{font-weight:650}
.ps table{font-size:13px}
.ps thead th{background:#f8fafc}
.ps td.n{text-align:right;font-variant-numeric:tabular-nums;font-family:'SF Mono',monospace;font-size:12.5px}
.ps .grp td{background:#f8fafc;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#475569}
.ps .tot td{font-weight:750;background:#f8fafc}
.ps .net{background:var(--ink);color:#fff}
.ps .net td{color:#fff;font-weight:750;font-size:15px;padding:1rem 1.25rem}
.ps-foot{padding:1.1rem 1.75rem;font-size:12px;color:var(--muted);border-top:1px solid var(--line)}
.wm{color:#94a3b8;font-size:12px}
/* Login */
.login{min-height:100vh;display:grid;place-items:center;
  background:radial-gradient(1200px 600px at 20% -10%,#312e81 0%,#0b1020 55%)}
.login-card{background:#fff;border-radius:16px;padding:2.25rem;width:380px;
  box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
.login .mark{width:44px;height:44px;border-radius:11px;
  background:linear-gradient(135deg,#6366f1,#4338ca);display:grid;place-items:center;
  color:#fff;font-weight:800;font-size:20px;margin-bottom:1.1rem}
.login h1{font-size:20px}
.login p.s{color:var(--muted);font-size:13px;margin:.25rem 0 1.5rem}
.field{margin-bottom:1rem}
.field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:.35rem}
.field input{width:100%;padding:.7rem .85rem;border:1px solid var(--line);border-radius:9px;
  font-size:14px;font-family:inherit}
.field input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px #e0e7ff}
.btn{width:100%;padding:.8rem;background:var(--brand);color:#fff;border:none;border-radius:9px;
  font-size:14.5px;font-weight:650;cursor:pointer;font-family:inherit;transition:.12s}
.btn:hover{background:var(--brand-d)}
.hint{margin-top:1rem;font-size:12px;color:var(--muted);background:#f8fafc;
  border:1px dashed var(--line);border-radius:8px;padding:.65rem .8rem;line-height:1.6}
.hint code{color:var(--brand-d);font-weight:600}
@media(max-width:820px){.sb{display:none}.stats,.info-grid,.contract-grid{grid-template-columns:1fr 1fr}.ps-two{grid-template-columns:1fr}}
"""


def shell(title, body, active=""):
    def nav(href, ic, label, key):
        cls = " class=\"active\"" if key == active else ""
        return f'<a href="{href}"{cls}><span class="ic">{ic}</span>{label}</a>'

    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — NOVA RH</title><style>{CSS}</style></head>
<body><div class="layout">
  <aside class="sb">
    <div class="sb-logo">
      <div class="mark">N</div>
      <div><b>NOVA RH</b><span>{ENTREPRISE['nom']}</span></div>
    </div>
    <nav>
      {nav('/rh/dashboard','▦','Tableau de bord','dash')}
      {nav('/rh/employes','◉','Employes','emp')}
      {nav('/rh/bulletins','▤','Bulletins de paie','bul')}
      {nav('/rh/prevoyance','✚','Prevoyance & protection sociale','prev')}
      {nav('/rh/conges','◷','Conges & absences','conges')}
      {nav('/rh/documents','▢','Documents RH','docs')}
    </nav>
    <div class="sb-foot">Connecte : audit@novalis.fr<br>Role : Auditeur (lecture)</div>
  </aside>
  <div class="main">
    <div class="top">
      <div class="crumb">{title}</div>
      <div class="user"><span>Audit externe</span><div class="avatar initials">AX</div></div>
    </div>
    <div class="wrap">{body}</div>
  </div>
</div></body></html>"""


# ── ROUTES ──────────────────────────────────────────────────────────────────
@rh.route("/rh")
@rh.route("/rh/login")
def login():
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion — NOVA RH</title><style>{CSS}</style></head>
<body><div class="login"><div class="login-card">
  <div class="mark">N</div>
  <h1>NOVA RH</h1>
  <p class="s">Portail interne — {ENTREPRISE['nom']}</p>
  <form method="POST" action="/rh/dashboard">
    <div class="field"><label>Adresse e-mail</label>
      <input type="email" name="email" placeholder="prenom.nom@novalis.fr" value="audit@novalis.fr"></div>
    <div class="field"><label>Mot de passe</label>
      <input type="password" name="pwd" placeholder="••••••••" value="demo2025"></div>
    <button class="btn" type="submit">Se connecter</button>
  </form>
  <div class="hint">Acces demo — identifiants pre-remplis :<br>
    <code>audit@novalis.fr</code> / <code>demo2025</code></div>
</div></div></body></html>"""


@rh.route("/rh/dashboard", methods=["GET", "POST"])
def dashboard():
    masse = sum(calc(b)["brut"] for b in BULLETINS if b["mois"] == "Mars 2025")
    rows = ""
    for b in [x for x in BULLETINS if x["mois"] == "Mars 2025"][:6]:
        e = EMP_BY_ID[b["emp"]]
        c = calc(b)
        rows += f"""<tr class="clic" data-href="/rh/bulletin/{b['id']}" onclick="location.href='/rh/bulletin/{b['id']}'">
          <td><div class="emp-cell"><div class="avatar">{avatar_svg(e)}</div>
            <div><b>{e['prenom']} {e['nom']}</b><small>{e['poste']}</small></div></div></td>
          <td>{b['mois']}</td>
          <td class="right">{eur(c['brut'])}</td>
          <td class="right">{eur(c['net_paye'])}</td>
          <td><a class="link" href="/rh/bulletin/{b['id']}">Ouvrir →</a></td></tr>"""

    body = f"""
    <h1 class="page">Tableau de bord</h1>
    <p class="sub">Vue d'ensemble de la paie et des effectifs — {ENTREPRISE['nom']}</p>
    <div class="grid stats">
      <div class="stat"><div class="k">Effectif</div><div class="v">{len(EMPLOYES)}</div><div class="d">salaries actifs</div></div>
      <div class="stat"><div class="k">Bulletins</div><div class="v">{len(BULLETINS)}</div><div class="d">emis (2025)</div></div>
      <div class="stat"><div class="k">Masse salariale</div><div class="v">{eur(masse)}</div><div class="d">brut — mars 2025</div></div>
      <div class="stat"><div class="k">Convention</div><div class="v" style="font-size:15px">Syntec</div><div class="d">IDCC 1486</div></div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Derniers bulletins — Mars 2025</h2><a href="/rh/bulletins">Tout voir</a></div>
      <table><thead><tr><th>Salarie</th><th>Periode</th><th class="right">Brut</th><th class="right">Net paye</th><th></th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""
    return shell("Tableau de bord", body, "dash")


@rh.route("/rh/employes")
def employes():
    rows = ""
    for e in EMPLOYES:
        n = len(bulletins_de(e["id"]))
        cat_cls = "b-blue" if e["categorie"] == "Cadre" else "b-gray"
        rows += f"""<tr class="clic" data-href="/rh/employe/{e['id']}" onclick="location.href='/rh/employe/{e['id']}'">
          <td><div class="emp-cell"><div class="avatar">{avatar_svg(e)}</div>
            <div><b>{e['prenom']} {e['nom']}</b><small>{e['matricule']}</small></div></div></td>
          <td>{e['poste']}</td>
          <td>{e['service']}</td>
          <td><span class="badge {cat_cls}">{e['categorie']}</span></td>
          <td>{e['contrat']}</td>
          <td>{n} bulletin{'s' if n>1 else ''}</td>
          <td><a class="link" href="/rh/employe/{e['id']}">Fiche →</a></td></tr>"""
    body = f"""
    <h1 class="page">Employes</h1>
    <p class="sub">{len(EMPLOYES)} salaries — cliquez sur une ligne pour ouvrir la fiche</p>
    <div class="card" style="margin-top:1.5rem">
      <table><thead><tr><th>Nom</th><th>Poste</th><th>Service</th><th>Categorie</th><th>Contrat</th><th>Paie</th><th></th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""
    return shell("Employes", body, "emp")


@rh.route("/rh/employe/<eid>")
def employe(eid):
    e = EMP_BY_ID.get(eid)
    if not e:
        return shell("Introuvable", "<h1 class='page'>Employe introuvable</h1>"), 404
    rows = ""
    for b in bulletins_de(eid):
        c = calc(b)
        rows += f"""<tr class="clic" data-href="/rh/bulletin/{b['id']}" onclick="location.href='/rh/bulletin/{b['id']}'">
          <td><b>{b['mois']}</b><small style="display:block;color:var(--muted)">{b['periode']}</small></td>
          <td class="right">{eur(c['brut'])}</td>
          <td class="right">{eur(c['total_cot'])}</td>
          <td class="right">{eur(c['net_paye'])}</td>
          <td><a class="link" href="/rh/bulletin/{b['id']}">Voir le bulletin →</a></td></tr>"""
    prev = "Couvert (ETAM)" if e["categorie"] == "ETAM" else "Non couvert (cadre)"
    prev_cls = "b-green" if e["categorie"] == "ETAM" else "b-red"
    body = f"""
    <div class="profile">
      <div class="big">{avatar_svg(e)}</div>
      <div>
        <h1>{e['prenom']} {e['nom']}</h1>
        <div class="meta">{e['poste']} · {e['service']} · matricule {e['matricule']}</div>
      </div>
      <div style="margin-left:auto"><span class="badge b-green">{e['statut']}</span></div>
    </div>
    <div class="info-grid">
      <div class="box"><div class="k">Contrat</div><div class="v">{e['contrat']}</div></div>
      <div class="box"><div class="k">Categorie</div><div class="v">{e['categorie']}</div></div>
      <div class="box"><div class="k">Date d'entree</div><div class="v">{e['entree']}</div></div>
      <div class="box"><div class="k">Prevoyance</div><div class="v"><span class="badge {prev_cls}">{prev}</span></div></div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Bulletins de paie</h2></div>
      <table><thead><tr><th>Periode</th><th class="right">Brut</th><th class="right">Cotisations</th><th class="right">Net paye</th><th></th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""
    return shell(f"{e['prenom']} {e['nom']}", body, "emp")


@rh.route("/rh/bulletins")
def bulletins():
    rows = ""
    for b in BULLETINS:
        e = EMP_BY_ID[b["emp"]]
        c = calc(b)
        rows += f"""<tr class="clic" data-href="/rh/bulletin/{b['id']}" onclick="location.href='/rh/bulletin/{b['id']}'">
          <td><div class="emp-cell"><div class="avatar">{avatar_svg(e)}</div>
            <div><b>{e['prenom']} {e['nom']}</b><small>{e['poste']}</small></div></div></td>
          <td>{b['mois']}</td>
          <td class="right">{eur(c['brut'])}</td>
          <td class="right">{eur(c['net_paye'])}</td>
          <td><a class="link" href="/rh/bulletin/{b['id']}">Ouvrir →</a></td></tr>"""
    body = f"""
    <h1 class="page">Bulletins de paie</h1>
    <p class="sub">{len(BULLETINS)} bulletins emis — exercice 2025</p>
    <div class="card" style="margin-top:1.5rem">
      <table><thead><tr><th>Salarie</th><th>Periode</th><th class="right">Brut</th><th class="right">Net paye</th><th></th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""
    return shell("Bulletins de paie", body, "bul")


@rh.route("/rh/bulletin/<bid>")
def bulletin(bid):
    b = BUL_BY_ID.get(bid)
    if not b:
        return shell("Introuvable", "<h1 class='page'>Bulletin introuvable</h1>"), 404
    e = EMP_BY_ID[b["emp"]]
    c = calc(b)

    # Lignes de gains
    gains = f"""<tr><td>Salaire de base ({hh(b['heures'])} h)</td>
        <td class="n">{hh(b['heures'])}</td><td class="n">{eur(round(b['base']/b['heures'],2)) if b['heures'] else '-'}</td>
        <td class="n">{eur(b['base'])}</td></tr>"""
    if b["hs_h"]:
        gains += f"""<tr><td>Heures supplementaires (+25 %)</td>
        <td class="n">{hh(b['hs_h'])}</td><td class="n">{eur(round(b['base']/b['heures']*1.25,2))}</td>
        <td class="n">{eur(b['hs_montant'])}</td></tr>"""
    for lib, m in b["primes"]:
        gains += f"""<tr><td>{lib}</td><td class="n">-</td><td class="n">-</td><td class="n">{eur(m)}</td></tr>"""

    # Lignes de cotisations
    cots = ""
    for lib, m in c["lignes_cot"]:
        cots += f"""<tr><td>{lib}</td><td class="n"></td><td class="n"></td><td class="n">-{eur(m)}</td></tr>"""

    # Bandeau temps de travail (rend l'anomalie HS lisible dans le texte)
    if b["hs_h"]:
        temps = f"""<div><div class="k">Temps de travail</div>
          <div class="lbl">Heures contractuelles : <b>151,67 h</b></div>
          <div class="lbl">Heures supplementaires effectuees : <b>{hh(b['hs_h'])} h</b></div>
          <div class="lbl">Total heures travaillees : <b>{hh(b['heures'])} h</b></div></div>"""
    else:
        temps = f"""<div><div class="k">Temps de travail</div>
          <div class="lbl">Heures travaillees : <b>{hh(b['heures'])} h</b></div>
          <div class="lbl">Taux horaire brut : <b>{eur(c['taux_horaire'])}</b></div></div>"""

    body = f"""
    <p class="sub" style="margin-bottom:1rem"><a class="link" href="/rh/employe/{e['id']}">← Fiche de {e['prenom']} {e['nom']}</a></p>
    <div class="payslip ps">
      <div class="ps-head">
        <div class="co"><b>{ENTREPRISE['nom']}</b>
          <div>{ENTREPRISE['adresse']}</div>
          <div>SIRET {ENTREPRISE['siret']}</div>
          <div>Convention collective : {ENTREPRISE['convention']}</div>
        </div>
        <div class="ttl"><b>Bulletin de paie</b>
          <div>{b['mois']}</div>
          <div>Periode : {b['periode']}</div>
          <div>Paiement le {b['paiement']}</div>
        </div>
      </div>
      <div class="ps-two">
        <div><div class="k">Salarie</div>
          <div class="lbl"><b>{e['prenom']} {e['nom']}</b></div>
          <div class="lbl">{e['poste']} — {e['service']}</div>
          <div class="lbl">Matricule {e['matricule']} · Categorie {e['categorie']}</div>
          <div class="lbl">Contrat : {e['contrat']}</div>
          <div class="lbl">Entree le {e['entree']}</div>
        </div>
        {temps}
      </div>
      <table>
        <thead><tr><th>Designation</th><th class="n">Nombre / Base</th><th class="n">Taux</th><th class="n">Montant</th></tr></thead>
        <tbody>
          <tr class="grp"><td colspan="4">Remuneration</td></tr>
          {gains}
          <tr class="tot"><td colspan="3">Salaire brut</td><td class="n">{eur(c['brut'])}</td></tr>
          <tr class="grp"><td colspan="4">Cotisations et contributions salariales</td></tr>
          {cots}
          <tr class="tot"><td colspan="3">Total des retenues</td><td class="n">-{eur(c['total_cot'])}</td></tr>
          <tr class="tot"><td colspan="3">Net a payer avant impot sur le revenu</td><td class="n">{eur(c['net_avant_impot'])}</td></tr>
          <tr><td>Impot sur le revenu preleve a la source</td><td class="n"></td><td class="n">{c['taux_pas']*100:.1f} %</td><td class="n">-{eur(c['impot'])}</td></tr>
          <tr class="net"><td colspan="3">NET PAYE</td><td class="n">{eur(c['net_paye'])}</td></tr>
        </tbody>
      </table>
      <div class="ps-foot">
        Net imposable : {eur(c['net_imposable'])} — Net social : {eur(c['net_avant_impot'])}<br>
        Ce bulletin est conserve sans limitation de duree. Document genere par NOVA RH.
      </div>
    </div>"""
    return shell(f"Bulletin {b['mois']} — {e['nom']}", body, "bul")


# ── PREVOYANCE & PROTECTION SOCIALE ─────────────────────────────────────────
@rh.route("/rh/prevoyance")
def prevoyance():
    # Cartes contrats
    cards = ""
    for c in CONTRATS_SOCIAUX:
        cats = ", ".join(c["categories"])
        cards += f"""
        <div class="contract">
          <div class="ctype">{c['type']}</div>
          <div class="cnom">{c['organisme']}</div>
          <div class="cmeta">Reference {c['reference']} · effet {c['effet']}</div>
          <div class="cmeta">Categories couvertes : <b>{cats}</b></div>
          <div class="cmeta">Assiette : {c['assiette']} · {c['taux']}</div>
          <div class="cfoot">
            <span class="badge {'b-green' if c['obligatoire'] else 'b-gray'}">{'Obligatoire' if c['obligatoire'] else 'Facultatif'}</span>
            <a class="link" href="/rh/prevoyance/{c['id']}">Voir le contrat →</a>
          </div>
        </div>"""

    # Tableau de couverture par categorie
    mut = CONTRAT_BY_ID["mutuelle"]
    prev = CONTRAT_BY_ID["prevoyance"]
    cov_rows = ""
    for cat in categories_effectif():
        m_ok = couvert(mut, cat)
        p_ok = couvert(prev, cat)
        m_badge = '<span class="badge b-green">Couvert</span>' if m_ok else '<span class="badge b-red">Non couvert</span>'
        p_badge = '<span class="badge b-green">Couvert</span>' if p_ok else '<span class="badge b-red">Non couvert</span>'
        cov_rows += f"""<tr>
          <td><b>{cat}</b></td>
          <td>{effectif_cat(cat)} salarie{'s' if effectif_cat(cat)>1 else ''}</td>
          <td>{m_badge}</td>
          <td>{p_badge}</td></tr>"""

    note = ""
    if not couvert(prev, "Cadre"):
        ncadres = effectif_cat("Cadre")
        note = f"""<div class="note"><b>Vigilance conformite.</b> {prev['note']}
          {ncadres} salarie(s) cadre(s) concerne(s) : aucune ligne de cotisation prevoyance
          n'apparait sur leurs bulletins.</div>"""

    body = f"""
    <h1 class="page">Prevoyance & protection sociale</h1>
    <p class="sub">Contrats collectifs de {ENTREPRISE['nom']} et couverture par categorie</p>
    <div class="contract-grid">{cards}</div>
    <div class="card">
      <div class="card-h"><h2>Couverture par categorie de personnel</h2></div>
      <table><thead><tr><th>Categorie</th><th>Effectif</th><th>Mutuelle sante</th><th>Prevoyance</th></tr></thead>
      <tbody>{cov_rows}</tbody></table>
    </div>
    {note}"""
    return shell("Prevoyance & protection sociale", body, "prev")


@rh.route("/rh/prevoyance/<cid>")
def prevoyance_contrat(cid):
    c = CONTRAT_BY_ID.get(cid)
    if not c:
        return shell("Introuvable", "<h1 class='page'>Contrat introuvable</h1>"), 404
    gar = ""
    for lib, val in c["garanties"]:
        gar += f"""<tr><td><b>{lib}</b></td><td>{val}</td></tr>"""
    cats = ""
    for cat in ["Cadre", "ETAM"]:
        ok = cat in c["categories"]
        cats += f'<span class="badge {"b-green" if ok else "b-red"}" style="margin-right:.4rem">{cat} : {"couvert" if ok else "non couvert"}</span>'
    note = f"""<div class="note"><b>Point de conformite.</b> {c['note']}</div>""" if c.get("note") else ""

    body = f"""
    <p class="sub" style="margin-bottom:1rem"><a class="link" href="/rh/prevoyance">← Prevoyance & protection sociale</a></p>
    <h1 class="page">{c['organisme']}</h1>
    <p class="sub">{c['type']} · reference {c['reference']}</p>
    <div class="info-grid" style="margin-top:1.5rem">
      <div class="box"><div class="k">Organisme</div><div class="v">{c['organisme']}</div></div>
      <div class="box"><div class="k">Effet</div><div class="v">{c['effet']}</div></div>
      <div class="box"><div class="k">Assiette</div><div class="v">{c['assiette']}</div></div>
      <div class="box"><div class="k">Cotisation</div><div class="v">{c['taux']}</div></div>
    </div>
    <div style="margin-bottom:1.25rem">{cats}</div>
    <div class="card">
      <div class="card-h"><h2>Garanties</h2></div>
      <table class="gtable"><thead><tr><th>Garantie</th><th>Niveau</th></tr></thead>
      <tbody>{gar}</tbody></table>
    </div>
    {note}"""
    return shell(f"Contrat {c['organisme']}", body, "prev")


# Pages secondaires (donnent de la matiere a crawler, liens internes)
@rh.route("/rh/conges")
def conges():
    rows = ""
    demandes = [
        ("Sophie Marchand", "Conges payes", "14/04 → 18/04/2025", "5 j", "Approuve", "b-green"),
        ("Thomas Lefevre", "RTT", "22/04/2025", "1 j", "Approuve", "b-green"),
        ("Karim Ndiaye", "Maladie", "03/03 → 05/03/2025", "3 j", "Justifie", "b-blue"),
        ("Julie Rousseau", "Conges payes", "05/05 → 09/05/2025", "5 j", "En attente", "b-gray"),
    ]
    for nom, typ, per, dur, st, cls in demandes:
        rows += f"""<tr><td><b>{nom}</b></td><td>{typ}</td><td>{per}</td>
          <td>{dur}</td><td><span class="badge {cls}">{st}</span></td></tr>"""
    body = f"""
    <h1 class="page">Conges & absences</h1>
    <p class="sub">Demandes recentes</p>
    <div class="card" style="margin-top:1.5rem">
      <table><thead><tr><th>Salarie</th><th>Type</th><th>Periode</th><th>Duree</th><th>Statut</th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""
    return shell("Conges & absences", body, "conges")


@rh.route("/rh/documents")
def documents_rh():
    docs = [
        ("Reglement interieur", "PDF · maj 01/2025"),
        ("Accord d'entreprise — temps de travail", "PDF · 03/2024"),
        ("Convention collective Syntec (IDCC 1486)", "Lien externe"),
        ("Grille des salaires minima 2025", "PDF · 01/2025"),
        ("Note de service — tickets restaurant", "PDF · 02/2025"),
        ("Contrat de prevoyance collective — AG2R (PV-2022-1187)", "PDF · 06/2022"),
        ("Decision unilaterale de l'employeur (DUE) — frais de sante", "PDF · 01/2023"),
        ("Notice d'information prevoyance", "PDF · 06/2022"),
    ]
    rows = ""
    for titre, meta in docs:
        rows += f"""<tr><td><b>{titre}</b></td><td style="color:var(--muted)">{meta}</td>
          <td><span class="link">Consulter →</span></td></tr>"""
    body = f"""
    <h1 class="page">Documents RH</h1>
    <p class="sub">Base documentaire de l'entreprise</p>
    <div class="card" style="margin-top:1.5rem">
      <table><tbody>{rows}</tbody></table>
    </div>"""
    return shell("Documents RH", body, "docs")

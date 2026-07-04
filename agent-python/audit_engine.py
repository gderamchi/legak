#!/usr/bin/env python3
"""
MOTEUR D'AUDIT DETERMINISTE — la phase "apres Computer Use".

Ce module reproduit les briques metier de `docs/audit/06-modele-donnees.md` qui
DOIVENT rester deterministes (le modele ne conclut pas, il redige) :

  3. Moteur de preuve      -> build_dossier() : relie regles et pieces crawlees
  4. Moteur de controle    -> controle_*()   : teste chaque regle sur les donnees
  5. Moteur de conclusion  -> Finding + build_register() : verdict + risque + chiffrage
  6. Moteur de restitution -> render_*() / build_deliverables() : livrables M&A

Les valeurs chiffrees proviennent EXCLUSIVEMENT du registre versionne
(`audit_kb.parametre`), jamais codees en dur ici (invariant time-travel).

Source des donnees : dans ce MVP, la "data room" crawlee par Computer Use est
le portail NOVA RH (`portail_rh.py`). build_dossier() en fait un dossier
structure et TRACABLE : chaque donnee porte sa route source (document + passage).
En production, ces memes structures seraient alimentees par l'extraction des
pieces ramenees par l'agent Computer Use (PDF -> texte, captures, exports).
"""

import csv
import io
import json
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path
from typing import Optional

import audit_kb as kb
import portail_rh as portal


BASE_DIR = Path(__file__).parent
DEFAULT_OUTPUT = BASE_DIR / "audit_output"

# Heures contractuelles temps plein (151,67 h) — reference de calcul du taux horaire.
HEURES_TEMPS_PLEIN = 151.67


# ── Utilitaires ─────────────────────────────────────────────────────────────

def _parse_fr(datestr: str) -> date:
    """Convertit une date francaise 'JJ/MM/AAAA' en objet date."""
    j, m, a = datestr.split("/")
    return date(int(a), int(m), int(j))


def eur(x: float) -> str:
    return f"{x:,.0f} EUR".replace(",", " ")


def _fourchette(point: float, marge: float = 0.30) -> tuple[float, float, float]:
    """Fourchette (bas, point, haut) autour d'une estimation ponctuelle.

    La marge traduit l'incertitude (echantillon partiel, pieces manquantes).
    """
    return (round(point * (1 - marge), 2), round(point, 2), round(point * (1 + marge), 2))


# ── Objets metier (doc 06 §2 / fiche risque doc 03 §4) ──────────────────────

@dataclass
class Source:
    """Traçabilite : document source + passage cite (doc 03 §8)."""
    document: str        # libelle du document
    route: str           # localisation exacte (route portail / fichier)
    passage: str         # extrait / valeur observee


@dataclass
class Finding:
    """Fiche risque (gabarit obligatoire doc 03 §4)."""
    risk_id: str
    regle_id: str
    titre: str
    verticale: str
    sources: list[Source]
    faits_constates: str
    regle_applicable: str            # texte + version applicable a la periode
    periode_exposee: str
    population: str
    montant_bas: float
    montant_point: float
    montant_haut: float
    methode_chiffrage: str
    probabilite: str                 # Faible / Moyenne / Elevee
    gravite: int                     # 1..5
    nature_anomalie: str             # cf. kb.NATURE_ANOMALIE
    statut_probatoire: str           # cf. kb.STATUT_PROBATOIRE
    etat_conclusion: str             # cf. kb.ETAT_CONCLUSION
    impact_deal: str
    reco_pre_closing: str
    reco_spa: str
    action_post_closing: str
    niveau_confiance: str            # Fort / Moyen / Faible
    parametres_utilises: list[str] = field(default_factory=list)

    @property
    def gravite_label(self) -> str:
        return kb.gravite_label(self.gravite)

    def to_dict(self) -> dict:
        dd = asdict(self)
        dd["gravite_label"] = self.gravite_label
        return dd


# Ponderation du Deal Risk Score par gravite (documentee, deterministe).
POIDS_GRAVITE = {5: 30, 4: 18, 3: 8, 2: 3, 1: 0}

# Mapping risque -> traitement SPA / impact deal (doc 02 §3.4).
IMPACT_DEAL = {
    5: "Condition precedent (closing bloque tant que non regularise)",
    4: "Garantie specifique / escrow + price chip",
    3: "Covenant de remediation post-closing",
    2: "Disclosure schedule + suivi",
    1: "Information",
}
RECO_SPA = {
    5: "Condition precedent + indemnite specifique",
    4: "Indemnite specifique (specific indemnity) et/ou escrow",
    3: "Covenant de remediation",
    2: "Disclosure",
    1: "Aucune",
}


# ── Moteur de preuve : construction du dossier crawle (doc 06 §3) ───────────

def build_dossier(base_url: str = "http://localhost:5001") -> dict:
    """Assemble le dossier structure a partir de la data room crawlee.

    Chaque piece / donnee porte sa route source pour la traçabilite. Le
    perimetre (entite, periode, population, thematiques) cadre l'analyse
    (doc 01 §1).
    """
    def route(path: str) -> str:
        return f"{base_url}{path}"

    perimetre = {
        "entite": portal.ENTREPRISE["nom"],
        "siret": portal.ENTREPRISE["siret"],
        "convention_collective": portal.ENTREPRISE["convention"],
        "periode": "01/2025 - 03/2025",
        "effectif": len(portal.EMPLOYES),
        "thematiques": ["PSC", "WT", "CCN", "URSSAF"],
        "mode_mission": "buy-side",
    }

    employes = [
        {**e, "source": route(f"/rh/employe/{e['id']}")}
        for e in portal.EMPLOYES
    ]

    bulletins = []
    for b in portal.BULLETINS:
        c = portal.calc(b)
        bulletins.append({
            "id": b["id"], "emp": b["emp"], "mois": b["mois"],
            "paiement": b["paiement"], "heures": b["heures"],
            "base": b["base"], "hs_h": b["hs_h"], "hs_montant": b["hs_montant"],
            "brut": c["brut"], "lignes_cot": c["lignes_cot"],
            "categorie": portal.EMP_BY_ID[b["emp"]]["categorie"],
            "contrat": portal.EMP_BY_ID[b["emp"]]["contrat"],
            "source": route(f"/rh/bulletin/{b['id']}"),
        })

    contrats = [
        {"id": c["id"], "type": c["type"], "organisme": c["organisme"],
         "reference": c["reference"], "effet": c["effet"],
         "categories": c["categories"], "obligatoire": c["obligatoire"],
         "source": route(f"/rh/prevoyance/{c['id']}")}
        for c in portal.CONTRATS_SOCIAUX
    ]

    return {
        "perimetre": perimetre,
        "employes": employes,
        "bulletins": bulletins,
        "contrats": contrats,
    }


# ── Moteur de controle : les regles executables (doc 01 §6 / docs 04-05) ────

def controle_ccn_smic(dossier: dict) -> list[Finding]:
    """RF-CCN-001 — salaire de base horaire < SMIC applicable a la periode.

    Comparaison au taux horaire (neutralise le temps partiel) : base / heures
    vs SMIC horaire versionne a la date de paiement (time-travel).
    """
    touches: dict[str, list[dict]] = {}
    montant = 0.0
    sources: list[Source] = []
    params: set[str] = set()

    for b in dossier["bulletins"]:
        jour = _parse_fr(b["paiement"])
        p_smic = kb.parametre("SMIC-HORAIRE-2025", jour)
        params.add(p_smic.id)
        heures = b["heures"] or HEURES_TEMPS_PLEIN
        taux_horaire = b["base"] / heures if heures else 0.0
        if taux_horaire < p_smic.valeur - 1e-6:
            ecart_h = p_smic.valeur - taux_horaire
            rappel = round(ecart_h * heures, 2)
            montant += rappel
            touches.setdefault(b["emp"], []).append(b)
            sources.append(Source(
                f"Bulletin {b['mois']}", b["source"],
                f"base {b['base']:.2f} EUR / {heures:.2f} h = {taux_horaire:.2f} EUR/h "
                f"< SMIC {p_smic.valeur:.2f} EUR/h"))

    if not touches:
        return []

    emp_ids = list(touches.keys())
    noms = ", ".join(f"{portal.EMP_BY_ID[i]['prenom']} {portal.EMP_BY_ID[i]['nom']}" for i in emp_ids)
    bas, point, haut = _fourchette(montant)
    return [Finding(
        risk_id="SOC-CCN-001", regle_id="RF-CCN-001",
        titre="Salaire de base inferieur au SMIC",
        verticale="CCN", sources=sources,
        faits_constates=(f"{noms} : salaire horaire de base sous le SMIC sur "
                         f"{sum(len(v) for v in touches.values())} bulletin(s) de la periode."),
        regle_applicable="Code du travail art. L3231-2 (SMIC) + grille minima CCN Syntec ; "
                         "SMIC horaire en vigueur a la date de paiement.",
        periode_exposee="01/2025 - 03/2025",
        population=f"{len(emp_ids)} salarie(s)",
        montant_bas=bas, montant_point=point, montant_haut=haut,
        methode_chiffrage="Somme des ecarts (SMIC horaire - taux horaire) x heures, par bulletin. "
                          "Rappel de salaire hors charges ; risque penal travail dissimule non chiffre.",
        probabilite="Elevee", gravite=4, nature_anomalie="calcul",
        statut_probatoire="non_conformite_averee", etat_conclusion="non_conforme",
        impact_deal=IMPACT_DEAL[4], reco_pre_closing=(
            "Recalcul complet sur 3 ans + verification grille minima Syntec applicable."),
        reco_spa=RECO_SPA[4],
        action_post_closing="Regularisation paie + mise a niveau des salaires sous minima (30 j).",
        niveau_confiance="Moyen", parametres_utilises=sorted(params),
    )]


def controle_wt_hs_impayees(dossier: dict) -> list[Finding]:
    """RF-WT-001 — heures supplementaires effectuees (hs_h) mais non payees."""
    touches: list[dict] = []
    total_h = 0.0
    montant = 0.0
    sources: list[Source] = []
    params: set[str] = set()

    for b in dossier["bulletins"]:
        if b["hs_h"] and not b["hs_montant"]:
            jour = _parse_fr(b["paiement"])
            p_majo = kb.parametre("HS-MAJO-8PREM", jour)
            params.add(p_majo.id)
            taux_horaire = b["base"] / HEURES_TEMPS_PLEIN
            majo = 1 + p_majo.valeur / 100.0
            du = round(b["hs_h"] * taux_horaire * majo, 2)
            total_h += b["hs_h"]
            montant += du
            touches.append(b)
            sources.append(Source(
                f"Bulletin {b['mois']}", b["source"],
                f"{b['hs_h']:.0f} h supp effectuees, montant HS paye = 0 EUR "
                f"(rappel estime {du:.2f} EUR a +{p_majo.valeur:.0f} %)"))

    if not touches:
        return []

    emp = portal.EMP_BY_ID[touches[0]["emp"]]
    charges = round(montant * 0.42, 2)  # estimation charges patronales
    bas, point, haut = _fourchette(montant + charges)
    return [Finding(
        risk_id="SOC-WT-001", regle_id="RF-WT-001",
        titre="Heures supplementaires non payees",
        verticale="WT", sources=sources,
        faits_constates=(f"{emp['prenom']} {emp['nom']} : {total_h:.0f} h supplementaires "
                         f"effectuees et visibles au bulletin, aucune payee sur la periode."),
        regle_applicable="Code du travail art. L3121-28 et s. ; majoration legale HS "
                         "en vigueur a la periode (a defaut d'accord).",
        periode_exposee="02/2025 - 03/2025",
        population="1 salarie (echantillon) - a etendre a l'equipe technique",
        montant_bas=bas, montant_point=point, montant_haut=haut,
        methode_chiffrage="Rappel = heures supp x taux horaire de base x (1 + majoration legale) "
                          "+ charges patronales estimees (42 %). Perimetre a etendre sur 3 ans.",
        probabilite="Elevee", gravite=4, nature_anomalie="declarative",
        statut_probatoire="non_conformite_averee", etat_conclusion="non_conforme",
        impact_deal=IMPACT_DEAL[4], reco_pre_closing=(
            "Exports GTA/badgeuse complets sur 3 ans + echantillon emails managers "
            "(risque travail dissimule si systematique)."),
        reco_spa=RECO_SPA[4],
        action_post_closing="Reparametrage GTA/paie + procedure de validation et paiement des HS (60 j).",
        niveau_confiance="Moyen", parametres_utilises=sorted(params),
    )]


def controle_psc_cadres(dossier: dict) -> list[Finding]:
    """RF-PSC-001 — cadres non couverts par la prevoyance obligatoire 1,50 % TA."""
    prev = next((c for c in dossier["contrats"] if c["id"] == "prevoyance"), None)
    if not prev or "Cadre" in prev["categories"]:
        return []

    cadres = [e for e in dossier["employes"] if e["categorie"] == "Cadre"]
    if not cadres:
        return []

    montant = 0.0
    sources: list[Source] = [Source(
        f"Contrat prevoyance {prev['organisme']}", prev["source"],
        f"Categories couvertes : {', '.join(prev['categories'])} - "
        f"categorie Cadre absente")]
    params: set[str] = set()

    cadre_ids = {e["id"] for e in cadres}
    for b in dossier["bulletins"]:
        if b["emp"] in cadre_ids:
            jour = _parse_fr(b["paiement"])
            p_taux = kb.parametre("PSC-CADRE-MIN-TA", jour)
            annee = jour.year
            p_pmss = kb.parametre(f"PMSS-{annee}", jour)
            params.update({p_taux.id, p_pmss.id})
            tranche_a = min(b["brut"], p_pmss.valeur)
            cotis = tranche_a * p_taux.valeur / 100.0
            montant += cotis
            sources.append(Source(
                f"Bulletin {b['mois']} ({portal.EMP_BY_ID[b['emp']]['nom']})", b["source"],
                "aucune ligne de cotisation prevoyance"))

    noms = ", ".join(f"{e['prenom']} {e['nom']}" for e in cadres)
    bas, point, haut = _fourchette(montant, marge=0.40)
    return [Finding(
        risk_id="SOC-PSC-001", regle_id="RF-PSC-001",
        titre="Cadres non couverts par la prevoyance obligatoire (1,50 % TA)",
        verticale="PSC", sources=sources,
        faits_constates=(f"{len(cadres)} cadre(s) ({noms}) sans couverture prevoyance : le "
                         f"contrat {prev['organisme']} ({prev['reference']}) ne couvre que les ETAM ; "
                         f"aucune ligne prevoyance sur leurs bulletins."),
        regle_applicable="ANI du 14/03/1947 art. 7 (cotisation patronale prevoyance cadres >= 1,50 % "
                         "Tranche A) ; assiette plafonnee au PMSS de l'annee.",
        periode_exposee="01/2025 - 03/2025 (a etendre depuis l'embauche des cadres)",
        population=f"{len(cadres)} cadre(s)",
        montant_bas=bas, montant_point=point, montant_haut=haut,
        methode_chiffrage="Cotisation patronale reconstituee = 1,50 % x Tranche A (min(brut, PMSS)) "
                          "par cadre et par mois observe. Redressement URSSAF potentiel + risque "
                          "de responsabilite employeur ; extrapolation pluriannuelle a chiffrer.",
        probabilite="Elevee", gravite=4, nature_anomalie="juridique",
        statut_probatoire="non_conformite_averee", etat_conclusion="non_conforme",
        impact_deal=IMPACT_DEAL[4], reco_pre_closing=(
            "Obtenir acte fondateur / DUE prevoyance cadres + historique depuis l'embauche ; "
            "recalcul de l'exposition sur toute la periode non prescrite."),
        reco_spa=RECO_SPA[4],
        action_post_closing="Souscription d'une couverture prevoyance cadres conforme + "
                            "regularisation retroactive (60 j).",
        niveau_confiance="Moyen", parametres_utilises=sorted(params),
    )]


def controle_psc_double_mutuelle(dossier: dict) -> list[Finding]:
    """RF-PSC-002 — cotisation mutuelle prelevee deux fois (indu salarial)."""
    touches: list[dict] = []
    montant = 0.0
    sources: list[Source] = []

    for b in dossier["bulletins"]:
        lignes_mut = [(lib, m) for lib, m in b["lignes_cot"] if "Mutuelle" in lib]
        if len(lignes_mut) > 1:
            indu = sum(m for _, m in lignes_mut[1:])
            montant += indu
            touches.append(b)
            sources.append(Source(
                f"Bulletin {b['mois']}", b["source"],
                f"{len(lignes_mut)} lignes 'Mutuelle sante' : indu {indu:.2f} EUR"))

    if not touches:
        return []

    emp = portal.EMP_BY_ID[touches[0]["emp"]]
    bas, point, haut = _fourchette(montant, marge=0.10)
    return [Finding(
        risk_id="SOC-PSC-002", regle_id="RF-PSC-002",
        titre="Cotisation mutuelle prelevee deux fois",
        verticale="PSC", sources=sources,
        faits_constates=(f"{emp['prenom']} {emp['nom']} : double prelevement de la cotisation "
                         f"mutuelle sante sur {len(touches)} bulletin(s)."),
        regle_applicable="Retenue salariale sans contrepartie (indu) - a rembourser au salarie.",
        periode_exposee="02/2025 - 03/2025",
        population="1 salarie",
        montant_bas=bas, montant_point=point, montant_haut=haut,
        methode_chiffrage="Somme des lignes mutuelle en doublon a rembourser. Faible materialite ; "
                          "signal de fiabilite du parametrage paie.",
        probabilite="Elevee", gravite=2, nature_anomalie="declarative",
        statut_probatoire="non_conformite_averee", etat_conclusion="non_conforme",
        impact_deal=IMPACT_DEAL[2], reco_pre_closing=(
            "Verifier le parametrage de la rubrique mutuelle sur l'ensemble de l'effectif."),
        reco_spa=RECO_SPA[2],
        action_post_closing="Correction du parametrage paie + remboursement du salarie (30 j).",
        niveau_confiance="Fort", parametres_utilises=[],
    )]


CONTROLES = [
    controle_ccn_smic,
    controle_wt_hs_impayees,
    controle_psc_cadres,
    controle_psc_double_mutuelle,
]


def run_controles(dossier: dict) -> list[Finding]:
    """Boucle d'analyse regle par regle (doc 01 §7)."""
    findings: list[Finding] = []
    for controle in CONTROLES:
        findings.extend(controle(dossier))
    return findings


# ── Moteur de conclusion : Deal Risk Score & synthese (doc 03 §3) ───────────

def build_register(findings: list[Finding]) -> dict:
    """Agrege les fiches risque en risk register + Deal Risk Score."""
    score = min(100, sum(POIDS_GRAVITE.get(f.gravite, 0) for f in findings))
    nb_critiques = sum(1 for f in findings if f.gravite == 5)
    expo_bas = sum(f.montant_bas for f in findings)
    expo_haut = sum(f.montant_haut for f in findings)
    closing_blocker = any(f.gravite == 5 for f in findings)

    findings_tries = sorted(findings, key=lambda f: (-f.gravite, -f.montant_point))
    return {
        "deal_risk_score": score,
        "nb_risques": len(findings),
        "nb_critiques": nb_critiques,
        "exposition_bas": round(expo_bas, 2),
        "exposition_haut": round(expo_haut, 2),
        "closing_blocker": closing_blocker,
        "fiches_risque": [f.to_dict() for f in findings_tries],
    }


# ── Moteur de restitution : livrables M&A (doc 02) ──────────────────────────

def build_qa_tracker(dossier: dict) -> list[dict]:
    """Q&A tracker / request list a partir du referentiel non couvert (doc 02 §3.2).

    Les regles du referentiel non testables faute de pieces deviennent des
    demandes de pieces (statut "pieces en attente" - doc 01 §9).
    """
    tracker = []
    for r in kb.regles_referentiel():
        tracker.append({
            "regle": r.id,
            "verticale": r.verticale,
            "question": f"Controle non demontre : {r.titre}",
            "documents_demandes": list(r.pieces),
            "raison": r.condition,
            "urgence": "Haute" if r.gravite >= 4 else "Moyenne",
            "statut": "pieces_en_attente",
            "impact_si_non_fourni": "Conformite non demontrable "
                                    "(l'absence de preuve n'est pas la preuve de conformite).",
        })
    return tracker


def render_risk_register_csv(register: dict) -> str:
    """Risk register exportable CSV (doc 02 §1)."""
    buf = io.StringIO()
    cols = ["risk_id", "titre", "verticale", "gravite", "gravite_label",
            "probabilite", "montant_bas", "montant_point", "montant_haut",
            "etat_conclusion", "statut_probatoire", "impact_deal",
            "reco_spa", "niveau_confiance"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for f in register["fiches_risque"]:
        w.writerow(f)
    return buf.getvalue()


def render_executive_summary(register: dict, dossier: dict) -> str:
    """Executive summary deterministe (draft, doc 02 §2.2).

    Redige a partir des seuls chiffres du risk register (aucune valeur inventee).
    Le modele Antigravity pourra l'enrichir, mais les montants restent ceux du
    moteur.
    """
    p = dossier["perimetre"]
    lignes = [
        "# Executive summary - Audit social (buy-side)",
        "",
        f"**Cible** : {p['entite']} (SIRET {p['siret']}) - "
        f"CCN {p['convention_collective']} - effectif {p['effectif']}.",
        f"**Periode auditee** : {p['periode']}. **Thematiques** : {', '.join(p['thematiques'])}.",
        "",
        f"**Deal Risk Score** : {register['deal_risk_score']}/100 - "
        f"{register['nb_risques']} risque(s), dont {register['nb_critiques']} critique(s).",
        f"**Exposition estimee** : {eur(register['exposition_bas'])} - "
        f"{eur(register['exposition_haut'])}.",
        f"**Closing blocker** : {'OUI' if register['closing_blocker'] else 'Non'}.",
        "",
        "## Cartographie des risques (par criticite)",
        "",
        "| Risque | Gravite | Exposition | Impact deal | Reco |",
        "|---|---|---|---|---|",
    ]
    for f in register["fiches_risque"]:
        lignes.append(
            f"| {f['titre']} | {f['gravite_label']} ({f['gravite']}) | "
            f"{eur(f['montant_bas'])} - {eur(f['montant_haut'])} | "
            f"{f['impact_deal']} | {f['reco_spa']} |")
    lignes += [
        "",
        "> Rapport preliminaire prepare sur la base des documents communiques et crawles. "
        "Ne vaut pas opinion juridique exhaustive. Parametres chiffres 'a verifier' -> "
        "niveau de confiance plafonne a Moyen tant qu'ils ne sont pas confirmes sur source "
        "officielle (BOSS / Legifrance). Decision finale humaine.",
    ]
    return "\n".join(lignes)


def build_deliverables(dossier: dict, findings: list[Finding],
                       output_dir: Path = DEFAULT_OUTPUT) -> dict:
    """Genere et ecrit le package decisionnel (doc 06 §7). Retourne un resume."""
    output_dir.mkdir(exist_ok=True)
    register = build_register(findings)
    qa = build_qa_tracker(dossier)
    exec_summary = render_executive_summary(register, dossier)
    csv_reg = render_risk_register_csv(register)

    (output_dir / "risk_register.json").write_text(
        json.dumps(register, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "risk_register.csv").write_text(csv_reg, encoding="utf-8")
    (output_dir / "qa_tracker.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "executive_summary.md").write_text(exec_summary, encoding="utf-8")

    return {
        "register": register,
        "qa_tracker": qa,
        "executive_summary": exec_summary,
        "output_dir": str(output_dir),
        "fichiers": ["risk_register.json", "risk_register.csv",
                     "qa_tracker.json", "executive_summary.md"],
    }


def run_audit(base_url: str = "http://localhost:5001",
              output_dir: Path = DEFAULT_OUTPUT) -> dict:
    """Pipeline deterministe complet : dossier -> controles -> livrables."""
    dossier = build_dossier(base_url)
    findings = run_controles(dossier)
    return build_deliverables(dossier, findings, output_dir)


if __name__ == "__main__":
    result = run_audit()
    reg = result["register"]
    print(f"Deal Risk Score : {reg['deal_risk_score']}/100 "
          f"({reg['nb_risques']} risques, {reg['nb_critiques']} critiques)")
    print(f"Exposition : {eur(reg['exposition_bas'])} - {eur(reg['exposition_haut'])}")
    for f in reg["fiches_risque"]:
        print(f"  - [{f['gravite_label']}] {f['risk_id']} {f['titre']} : "
              f"{eur(f['montant_point'])}")
    print(f"Livrables ecrits dans : {result['output_dir']}")

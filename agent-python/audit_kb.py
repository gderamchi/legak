#!/usr/bin/env python3
"""
BASE DE CONNAISSANCE D'AUDIT — moteur "apres Computer Use".

Ce module encode, en Python deterministe, la base de regles decrite dans
`docs/audit/` :

  - le REGISTRE DE PARAMETRES VERSIONNES (doc 07) : aucune valeur chiffree
    n'est codee en dur ailleurs, chaque controle reference un parametre + sa
    periode de validite (time-travel juridique) ;
  - le REFERENTIEL DE REGLES / red flags (docs 04 et 05) : chaque red flag est
    une regle de detection, avec ses sources juridiques et sa gravite ;
  - le BAREME DE GRAVITE et les STATUTS (doc 03).

Principe directeur (CLAUDE.md / README) : le modele lit et redige ; le CODE
DETERMINISTE (ce module + audit_engine.py) verifie, calcule et conclut ;
l'expert arbitre et signe. Ici on ne stocke que des donnees de reference : la
logique executable des controles vit dans audit_engine.py.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


# ── Helpers de date (time-travel juridique) ─────────────────────────────────

def d(iso: Optional[str]) -> Optional[date]:
    """Parse une date ISO 'YYYY-MM-DD' ; None = borne ouverte."""
    return date.fromisoformat(iso) if iso else None


def _in_range(jour: date, du: Optional[date], au: Optional[date]) -> bool:
    if du and jour < du:
        return False
    if au and jour > au:
        return False
    return True


# ── 1. Registre de parametres versionnes (doc 07) ───────────────────────────
# Statut : 'confirme' (verifie sur source officielle) ou 'a_verifier' (issu des
# documents de travail, a confirmer avant chiffrage final -> plafonne la
# confiance de la fiche a 'Moyen', cf. doc 07 §4 regle 2).

@dataclass(frozen=True)
class Parametre:
    id: str
    libelle: str
    valeur: float               # valeur numerique exploitable par le calcul
    unite: str                  # '%', 'EUR/mois', 'EUR/h', 'h', ...
    du: Optional[str]           # entree en vigueur (ISO) ou None
    au: Optional[str]           # fin de validite (ISO) ou None
    source: str                 # reference juridique exacte
    statut: str = "a_verifier"  # 'confirme' | 'a_verifier'


# NB : on conserve TOUTES les versions (jamais de suppression) : l'historique
# complet est la condition du time-travel juridique (doc 07 §4 regle 3).
PARAMETRES: list[Parametre] = [
    # --- Plafonds de securite sociale (PMSS) ---
    Parametre("PMSS-2023", "Plafond mensuel securite sociale 2023", 3666.0, "EUR/mois",
              "2023-01-01", "2023-12-31", "Arrete annuel PMSS 2023"),
    Parametre("PMSS-2024", "Plafond mensuel securite sociale 2024", 3864.0, "EUR/mois",
              "2024-01-01", "2024-12-31", "Arrete annuel PMSS 2024"),
    Parametre("PMSS-2025", "Plafond mensuel securite sociale 2025", 3925.0, "EUR/mois",
              "2025-01-01", "2025-12-31", "Arrete annuel PMSS 2025"),

    # --- SMIC (necessaire au controle minima ; doc 07 ne le fige pas, ajoute ici) ---
    Parametre("SMIC-HORAIRE-2025", "SMIC horaire brut (nov. 2024 -> 2025)", 11.88, "EUR/h",
              "2024-11-01", "2025-12-31", "Decret SMIC (a referencer sur Legifrance)"),
    Parametre("SMIC-MENSUEL-2025", "SMIC mensuel brut (35 h -> 151,67 h)", 1801.80, "EUR/mois",
              "2024-11-01", "2025-12-31", "SMIC horaire x 151,67 (a referencer)"),

    # --- Avantage en nature vehicule (ANV) ---
    Parametre("ANV-LOUE-NOUVEAU", "Base forfaitaire vehicule loue (LLD/LOA)", 50.0, "%",
              "2025-02-01", None, "Decret n. 2025-144 du 25/02/2025 + BOSS Avantages en nature"),
    Parametre("ANV-LOUE-ANCIEN", "Base forfaitaire vehicule loue - ancien bareme", 30.0, "%",
              None, "2025-01-31", "BOSS Avantages en nature (version anterieure)"),
    Parametre("ANV-ELECTRIQUE-ABATT", "Abattement vehicule 100% electrique (sous eco-score)", 70.0, "%",
              "2026-01-01", None, "urssaf.fr / BOSS (a referencer)"),

    # --- Heures supplementaires / temps de travail ---
    Parametre("HS-MAJO-8PREM", "Majoration legale HS (8 premieres heures)", 25.0, "%",
              None, None, "Code du travail art. L3121-36 (a referencer)"),
    Parametre("HS-MAJO-AUDELA", "Majoration legale HS (au-dela de 8 h)", 50.0, "%",
              None, None, "Code du travail art. L3121-36 (a referencer)"),
    Parametre("HS-MAJO-PLANCHER-CONV", "Plancher conventionnel de majoration HS", 10.0, "%",
              None, None, "Code du travail art. L3121-33 (a referencer)"),
    Parametre("HS-COR-SUP20", "Contrepartie repos > contingent (effectif > 20)", 100.0, "%",
              None, None, "Code du travail art. L3121-38 (a referencer)"),
    Parametre("HS-COR-INF20", "Contrepartie repos > contingent (effectif <= 20)", 50.0, "%",
              None, None, "Code du travail art. L3121-38 (a referencer)"),
    Parametre("REPOS-NOTIF-SEUIL", "Seuil de notification du repos compensateur", 7.0, "h",
              None, None, "Ministere du travail (a referencer)"),

    # --- Prevoyance / protection sociale complementaire (PSC) ---
    Parametre("PSC-CADRE-MIN-TA", "Cotisation patronale prevoyance minimale cadres (Tranche A)", 1.50, "%",
              "1947-03-14", None, "ANI du 14/03/1947 art. 7 (repris CCN cadres 2017)"),
]


def parametre(param_id: str, jour: Optional[date] = None) -> Parametre:
    """Renvoie le parametre `param_id` en vigueur a la date `jour`.

    Coeur du time-travel juridique : on selectionne la version applicable a la
    DATE D'EXIGIBILITE, jamais la version courante. Sans date, renvoie l'unique
    version (ou la premiere) ; avec date, filtre sur la periode de validite.
    """
    candidats = [p for p in PARAMETRES if p.id == param_id]
    if not candidats:
        raise KeyError(f"Parametre inconnu : {param_id}")
    if jour is None:
        return candidats[0]
    for p in candidats:
        if _in_range(jour, d(p.du), d(p.au)):
            return p
    # Aucune version couvrant la date : on retombe sur la plus proche connue.
    return candidats[0]


# ── 2. Bareme de gravite et statuts (doc 03) ────────────────────────────────

GRAVITE = {
    5: ("Critique", "Peut affecter le prix, le closing ou la structure du deal"),
    4: ("Eleve", "Justifie une garantie specifique ou un escrow"),
    3: ("Moyen", "A corriger post-closing"),
    2: ("Faible", "Non materiel mais a suivre"),
    1: ("Information", "Pas de risque significatif identifie"),
}


def gravite_label(score: int) -> str:
    return GRAVITE.get(score, ("Inconnu", ""))[0]


# Statuts probatoires (doc 03 §5) — l'absence de preuve n'est PAS la preuve de
# conformite.
STATUT_PROBATOIRE = {
    "non_conformite_averee": "Non-conformite averee",
    "absence_preuve": "Absence de preuve de conformite",
    "preuve_partielle": "Preuve partielle",
    "non_verifiee": "Piece recue mais non verifiee exhaustivement",
    "sous_reserve": "Piece potentiellement probante sous reserve de validation",
    "hors_perimetre": "Piece recue mais hors perimetre",
    "non_probante": "Piece recue mais non probante (declaratif)",
}

# Etats de conclusion d'un controle (doc 03 §6 / doc 06 §5) — non binaire.
ETAT_CONCLUSION = [
    "conforme", "non_conforme", "probablement_conforme", "probablement_non_conforme",
    "incomplet", "non_demontre_faute_de_piece", "hors_perimetre", "a_confirmer",
]

# Typologie des anomalies (doc 03 §7).
NATURE_ANOMALIE = [
    "juridique", "documentaire", "versionning", "calcul", "perimetre",
    "declarative", "preuve",
]

# Statuts de workflow d'un point de controle (doc 06 §4).
WORKFLOW = [
    "non_commence", "pieces_en_attente", "en_cours_analyse", "incomplet",
    "a_valider", "valide", "risque_identifie", "conforme", "non_conforme",
    "chiffrage_a_completer", "pret_pour_rapport",
]

# Prefixes de verticales (doc 06 §3) — identifiants SOC-<VERTICALE>-<NNN>.
VERTICALES = {
    "URSSAF": "Paie / cotisations / ANV / frais professionnels",
    "WT": "Temps de travail / heures supplementaires",
    "PSC": "Prevoyance / sante / protection sociale complementaire",
    "CTR": "Contrats de travail / dirigeants / clauses sensibles",
    "CCN": "Convention collective / classification / minima",
    "CSE": "Representation du personnel",
    "LIT": "Contentieux / inspections / controles",
    "HSE": "Sante-securite / AT-MP / RPS",
    "HC": "Effectifs / workforce",
    "REST": "Restructuration / integration post-deal",
}


# ── 3. Referentiel de regles (docs 04 et 05) ────────────────────────────────
# Metadonnees des red flags. Les regles avec `executable=True` sont testees par
# audit_engine.py sur les donnees du dossier ; les autres constituent le
# referentiel a couvrir : faute de pieces, elles alimentent la request list
# (Q&A tracker) au statut "pieces en attente" (doc 01 §9).

@dataclass(frozen=True)
class Regle:
    id: str                     # RF-<VERTICALE>-<NNN>
    verticale: str              # cle de VERTICALES
    titre: str
    gravite: int                # 1..5 (bareme doc 03)
    condition: str              # condition de detection (donnees requises)
    sources: tuple[str, ...]    # references juridiques / doctrinales
    pieces: tuple[str, ...]     # pieces necessaires (doc 04/05 §1..7)
    executable: bool = False    # True => detection implementee dans le moteur


REGLES: list[Regle] = [
    # --- Regles ACTIVES (donnees presentes dans le portail NOVA RH) ---
    Regle(
        "RF-PSC-001", "PSC",
        "Cadres non couverts par la prevoyance obligatoire (1,50 % TA)",
        4,
        "Salaries de categorie Cadre presents dans l'effectif ET contrat "
        "prevoyance ne couvrant pas la categorie Cadre / aucune ligne "
        "prevoyance sur leurs bulletins",
        ("ANI du 14/03/1947 art. 7", "CCN cadres du 17/11/2017",
         "BOSS Protection sociale complementaire"),
        ("Acte fondateur prevoyance", "Contrat assureur", "Bulletins cadres",
         "DUE / accord collectif"),
        executable=True,
    ),
    Regle(
        "RF-PSC-002", "PSC",
        "Cotisation mutuelle prelevee deux fois (indu salarial)",
        2,
        "Deux lignes de cotisation mutuelle identiques sur le meme bulletin",
        ("Code de la securite sociale", "DUE frais de sante"),
        ("Bulletins de paie", "Parametrage paie rubriques", "DUE"),
        executable=True,
    ),
    Regle(
        "RF-WT-001", "WT",
        "Heures supplementaires effectuees mais non payees",
        4,
        "(heures pointees - heures payees - repos attribues) > 0 sur >= 1 mois",
        ("Code du travail art. L3121-28", "Jurisprudence Cass. soc. charge de la preuve"),
        ("Registre des temps / GTA", "Bulletins de paie", "Compteurs repos"),
        executable=True,
    ),
    Regle(
        "RF-CCN-001", "CCN",
        "Salaire brut de base inferieur au SMIC / minima conventionnel",
        4,
        "Salaire de base mensuel < SMIC mensuel applicable a la periode "
        "(a temps plein, hors primes non incluses dans l'assiette de comparaison)",
        ("Code du travail art. L3231-2 (SMIC)", "CCN Syntec IDCC 1486 - grille minima"),
        ("Bulletins de paie", "Contrats de travail", "Grille minima CCN"),
        executable=True,
    ),

    # --- Referentiel a couvrir (pieces en attente -> request list) ---
    # Verticale ANV vehicules (doc 04 §10) — non testables sans data room flotte.
    Regle("RF-ANV-001", "URSSAF",
          "Vehicule affecte nominativement mais aucun ANV en paie", 5,
          "Affectation presente ET aucune rubrique ANV sur >= 1 mois",
          ("BOSS Avantages en nature",),
          ("Table d'affectation salarie/vehicule", "Bulletins de paie")),
    Regle("RF-ANV-004", "URSSAF",
          "Ancien bareme ANV applique apres le 01/02/2025", 5,
          "Date de mise a disposition >= 01/02/2025 ET taux applique = 30 % au lieu de 50 %",
          ("Decret n. 2025-144", "BOSS Avantages en nature"),
          ("Table d'affectation", "Fichier calcul ANV")),
    Regle("RF-ANV-007", "URSSAF",
          "Rubrique ANV presente mais non soumise a cotisations", 5,
          "Rubrique ANV au bulletin ET exclue de l'assiette cotisable",
          ("BOSS Avantages en nature",),
          ("Parametrage paie", "DSN")),
    # Verticale temps de travail (doc 05 §10) — non testables sans GTA / accords.
    Regle("RF-WT-004", "WT",
          "Forfait jours sans convention individuelle signee", 5,
          "Statut forfait jours en paie ET convention individuelle absente/non signee",
          ("Code du travail art. L3121-55",),
          ("Contrats", "Avenants", "Accord collectif forfait jours")),
    Regle("RF-WT-005", "WT",
          "Forfait jours sans suivi de la charge de travail", 5,
          "Forfait jours ET absence de suivi des jours / d'entretien annuel de charge",
          ("Code du travail art. L3121-60", "Jurisprudence charge de travail"),
          ("Suivi des jours", "Entretiens annuels")),
    Regle("RF-WT-010", "WT",
          "Taux de majoration HS inferieur au minimum applicable", 5,
          "Taux applique < taux legal ou conventionnel plancher a la periode",
          ("Code du travail", "CCN applicable"),
          ("Bulletins", "CCN", "Registre parametres")),
]

REGLE_BY_ID = {r.id: r for r in REGLES}


def regles_executables() -> list[Regle]:
    return [r for r in REGLES if r.executable]


def regles_referentiel() -> list[Regle]:
    """Regles du referentiel non testables faute de pieces (-> request list)."""
    return [r for r in REGLES if not r.executable]

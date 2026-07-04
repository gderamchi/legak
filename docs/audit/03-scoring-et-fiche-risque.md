# 03 — Scoring, heatmap, fiche risque & statuts

C'est ce qui transforme un audit juridique en **donnée exploitable et homogène**.
Chaque risque produit par le système doit respecter ces gabarits.

## 1. Barème de gravité (scoring)

| Score | Niveau | Signification |
|---|---|---|
| 5 | **Critique** | Peut affecter le **prix, le closing ou la structure** du deal |
| 4 | **Élevé** | Justifie une **garantie spécifique ou un escrow** |
| 3 | **Moyen** | À corriger **post-closing** |
| 2 | **Faible** | Non matériel mais **à suivre** |
| 1 | **Information** | Pas de risque significatif identifié |

## 2. Axes de la heatmap

Chaque risque est positionné sur plusieurs axes :

- **gravité juridique** ;
- **probabilité** (faible / moyenne / élevée) ;
- **montant estimé** (fourchette €) ;
- **impact closing** ;
- **impact intégration** ;
- **niveau de documentation disponible** (force probante).

## 3. Deal Risk Score (agrégat)

Sortie de synthèse pour le dashboard de décision :

- **Score global** (ex. 72/100) ;
- **Nombre de risques critiques** ;
- **Exposition estimée** (fourchette €, ex. 1,2 M€ – 2,4 M€) ;
- **Impact EBITDA** potentiel (%) ;
- **Closing blocker** : oui / non.

## 4. Gabarit de fiche risque (obligatoire)

Chaque risque **doit** sortir sous ce format. C'est le contrat de données du
moteur de restitution.

| Champ | Contenu attendu |
|---|---|
| **Risk ID** | Identifiant stable — convention définie dans [`06-modele-donnees.md`](06-modele-donnees.md) (ex. `SOC-URSSAF-001`, `SOC-WT-001`) |
| **Titre** | Ex. « Avantage en nature véhicule sous-évalué » |
| **Source documentaire** | Fichiers exacts + passage cité (traçabilité) |
| **Faits constatés** | Ce qui a été observé, chiffré et daté |
| **Règle applicable** | Référence légale / BOSS / conventionnelle **+ version applicable à la période** |
| **Période exposée** | Ex. 2024-2026 |
| **Population concernée** | Nb de salariés / catégories |
| **Montant estimé** | Cotisations + majorations potentielles (fourchette) |
| **Probabilité** | Faible / Moyenne / Élevée |
| **Gravité** | 1 à 5 (voir barème) |
| **Impact deal** | Garantie spécifique / réduction prix / CP / etc. |
| **Recommandation pré-closing** | Pièces à demander, recalcul, échantillon |
| **Recommandation SPA** | Indemnity / escrow / CP / covenant / disclosure |
| **Action post-closing** | Correction opérationnelle + délai (30/60/90 j) |
| **Niveau de confiance** | Fort / Moyen / Faible (selon complétude des pièces) |

### Exemple rempli — valeurs illustratives (fictives)

| Champ | Valeur |
|---|---|
| Risk ID | `SOC-URSSAF-001` |
| Titre | Avantage en nature véhicule sous-évalué |
| Source documentaire | Fichier paie 2024-2026, contrats LLD, policy véhicule |
| Faits constatés | 42 véhicules, méthode forfaitaire incohérente, carburant non isolé |
| Règle applicable | BOSS « Avantages en nature » + décret n° 2025-144 (barèmes au 01/02/2025) |
| Période exposée | 2024-2026 |
| Population concernée | 42 salariés |
| Montant estimé | 120 k€ cotisations + majorations potentielles |
| Probabilité | Élevée |
| Gravité | 4 / Élevé |
| Impact deal | Garantie spécifique ou réduction prix |
| Recommandation pré-closing | Demander fichiers carburant + recalcul |
| Recommandation SPA | Indemnité spécifique URSSAF sur ANV |
| Action post-closing | Recalcul paie + policy véhicule à 60 jours |
| Niveau de confiance | Moyen si pièces incomplètes |

## 5. Statuts probatoires (à distinguer impérativement)

Nuance juridiquement centrale — à modéliser dans le système.

- **Non-conformité avérée** — la règle n'est pas respectée, preuve à l'appui.
- **Absence de preuve de conformité** — ≠ non-conformité. La pièce probante
  manque.
- **Preuve partielle** — pièce présente mais incomplète.
- **Pièce reçue mais non vérifiée exhaustivement**.
- **Pièce potentiellement probante sous réserve de validation**.
- **Pièce reçue mais hors périmètre**.
- **Pièce reçue mais non probante** (déclaratif sans force de preuve).

> **L'absence de preuve n'est pas la preuve de conformité.**

## 6. États de conclusion d'un contrôle (non binaire)

- conforme ;
- non conforme ;
- probablement conforme ;
- probablement non conforme ;
- incomplet ;
- non démontré faute de pièce ;
- hors périmètre ;
- à confirmer.

## 7. Typologie des anomalies

Le système doit taguer chaque anomalie par nature :

- **juridique** — mauvaise règle appliquée, mauvaise version ;
- **documentaire** — pièce manquante, incomplète, illisible ;
- **versionning** — taux ou plafond d'une mauvaise période ;
- **calcul** — erreur d'assiette, de taux, de plafond ;
- **périmètre** — mauvais établissement, mauvaise population ;
- **déclarative** — incohérence paie / DSN / bordereau ;
- **preuve** — document non probant, déclaratif sans force de preuve.

## 8. Traçabilité (exigence transverse)

Toute conclusion doit exposer une chaîne complète :

```
document source (+ passage cité)  →  règle (+ version)  →  constat
        →  conclusion (+ statut probatoire)  →  chiffrage  →  recommandation
```

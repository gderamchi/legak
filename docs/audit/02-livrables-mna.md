# 02 — Livrables de sortie (contrats du moteur de restitution)

La sortie d'un audit n'est pas « un rapport », c'est un **package décisionnel**
qui répond aux cinq questions de l'acheteur :

1. Est-ce que je continue le deal ?
2. Est-ce que je baisse le prix ?
3. Est-ce que j'exige une garantie spécifique ?
4. Est-ce que je conditionne le closing ?
5. Qu'est-ce que je corrige post-closing ?

> Les tableaux d'exemple de ce fichier contiennent des **valeurs illustratives
> (fictives)** qui montrent le format attendu — jamais des données à réutiliser.

## 1. Package décisionnel (livrables à générer)

| Livrable | Usage client | Format |
|---|---|---|
| Executive summary | Décision go / no-go | 2 à 5 pages |
| Risk register social | Pilotage des risques | Tableau scoré, exportable Excel / CSV / JSON |
| Red flag report | Négociation deal | Word / PDF, 10 à 30 pages |
| Quantification des expositions | Ajustement prix / garantie | Annexe chiffrée |
| Q&A tracker / request list | Données manquantes | Tableau |
| Recommandations SPA | Clauses de garantie, indemnité, CP | Note ou markup |
| Post-closing action plan | Intégration 30/60/90 jours | Tableau opérationnel |

- **Minimum** : red flag report + executive summary + risk register + Q&A
  tracker.
- **Premium** : + annexe chiffrée + recommandations SPA + plan post-closing +
  dashboard de décision (Command Center).

## 2. Structure du rapport

### 2.1 Page de garde et limites de mission

Deal · client · cible · période auditée · documents revus · seuils de
matérialité · exclusions · dépendance aux documents fournis. Mention : rapport
préparé pour le client dans le contexte de la transaction, sur la base des
documents communiqués — **ne vaut pas opinion juridique exhaustive**.

### 2.2 Executive summary (format)

| Risque | Gravité | Exposition estimée | Impact deal | Reco |
|---|---|---|---|---|
| Temps de travail cadres | Critique | 450 k€ – 900 k€ | Garantie spécifique + price chip | Audit complémentaire urgent |
| URSSAF avantages véhicules | Élevé | 80 k€ – 180 k€ | Escrow / indemnité | Recalcul 3 ans |
| CSE non consulté | Critique | Calendrier closing | Condition precedent | Sécuriser procédure |
| Contentieux prud'homal | Moyen | 60 k€ | Disclosure + garantie | Provision |

### 2.3 Heatmap

Axes et barème : voir
[`03-scoring-et-fiche-risque.md`](03-scoring-et-fiche-risque.md).

### 2.4 Verticales sociales (taxonomie des thématiques)

Le rapport est organisé par verticale ; chaque verticale a sa checklist et ses
red flags :

1. **Effectifs / workforce overview** — headcount, statuts, CDD, intérim,
   freelances, dirigeants.
2. **Contrats / dirigeants / clauses sensibles** — non-concurrence, golden
   parachutes, change of control, variable, forfait jours.
3. **Convention collective / classification / minima** — mauvaise convention,
   classification erronée, minima non respectés.
4. **Paie / cotisations / URSSAF** — ANV, frais professionnels, IK,
   titres-restaurants, PSC, primes, assiettes.
   → [`04-checklist-anv-vehicules.md`](04-checklist-anv-vehicules.md)
5. **Temps de travail** — forfait jours, heures supplémentaires, repos,
   astreintes, travail dissimulé potentiel.
   → [`05-checklist-heures-supplementaires.md`](05-checklist-heures-supplementaires.md)
6. **Représentation du personnel / CSE** — existence, élections, PV,
   consultation transaction, accords.
7. **Contentieux / inspections / contrôles** — prud'hommes, URSSAF, inspection
   du travail, alertes internes.
8. **Santé-sécurité / AT-MP / RPS** — DUERP, accidents, prévention,
   harcèlement, enquêtes internes.
9. **Restructuration / intégration post-deal** — harmonisation statuts, coûts
   sociaux, départs clés.

## 3. Formats annexes

### 3.1 Issue list (réunion deal)

| # | Sujet | Risque | € | Deal impact | Action |
|---|---|---|---|---|---|
| 1 | Forfaits jours | Critique | 600 k€ | Price chip | Analyse contrats + entretiens |
| 2 | CSE | Critique | Calendrier | CP closing | Vérifier consultation |
| 3 | URSSAF véhicules | Élevé | 150 k€ | Indemnité spécifique | Recalcul 3 ans |
| 4 | Prévoyance | Moyen | 70 k€ | Post-closing | Acte fondateur à régulariser |

### 3.2 Q&A tracker (request list) — colonnes obligatoires

question · document demandé · raison de la demande · urgence · statut ·
réponse cible · relance · **impact si non fourni**.

### 3.3 Annexe chiffrée — postes à couvrir

redressement URSSAF potentiel · rappels de salaire · indemnités prud'homales ·
coût de régularisation · coût de restructuration · coût de rétention des key
people · impact EBITDA · cash-out post-closing.

### 3.4 Mapping risque → traitement SPA (règle de décision)

| Nature du risque | Traitement SPA à proposer |
|---|---|
| Connu et chiffrable | Specific indemnity |
| Incertain mais matériel | Garantie déclarative renforcée |
| Très critique | Condition precedent |
| Documentation incomplète | Disclosure schedule + holdback |
| Corrigeable post-closing | Covenant de remédiation |
| Diffus | Ajustement prix / escrow |

## 4. Modes de mission (paramètre de la mission)

| Mode | Objectif | Rendu attendu |
|---|---|---|
| Buy-side DD | Protéger l'acheteur | Red flags, exposition €, garanties, baisse de prix |
| Vendor DD | Préparer la vente | Rapport vendeur, disclosure, nettoyage data room |
| Confirmatory DD | Valider avant signing / closing | Rapport final court, points ouverts |
| Post-closing audit | Remédier | Plan 30/60/90 jours |

## 5. Command Center (sortie premium)

- **Deal Risk Score** — score global, nb de risques critiques, exposition
  estimée (fourchette €), impact EBITDA potentiel, **closing blocker oui/non** ;
- **Top 10 red flags** — montant, source, gravité, recommandation ;
- **Risk register exportable** — Excel / CSV / JSON, lignes au format
  [fiche risque](03-scoring-et-fiche-risque.md) ;
- **Draft executive summary** — prêt à intégrer dans le rapport avocat ;
- **SPA recommendations** — indemnity, escrow, CP, covenant ;
- **Q&A auto-générée** — questions restantes à poser à la cible ;
- **Post-closing remediation plan** — 30/60/90 jours.

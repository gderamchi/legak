# 06 — Modèle de données & statuts de workflow

Ce fichier modélise ce que le système doit reproduire *après* Computer Use.
Sans cette modélisation, on ne reproduit pas le travail d'audit : on produit un
simple assistant conversationnel.

## 1. Les 6 briques métier à reproduire

| # | Brique | Rôle |
|---|---|---|
| 1 | **Périmètre** | Identifier la bonne entité, période, population, thème |
| 2 | **Référentiel de règles** | Découper chaque thème en règles élémentaires, **versionnées dans le temps** |
| 3 | **Moteur de preuve** | Relier chaque règle aux pièces attendues / reçues / manquantes et à leur force probante |
| 4 | **Moteur de contrôle** | Tester la règle sur les données, documents et incohérences détectées |
| 5 | **Moteur de conclusion** | Produire un verdict motivé : conforme / non conforme / incomplet / indéterminé + risque + chiffrage |
| 6 | **Moteur de restitution** | Générer les livrables : rapport, liste de pièces manquantes, plan de remédiation, reco SPA |

## 2. Objets métier à modéliser

```
Client
 └─ Mission ── Périmètre d'audit
                 ├─ Entité juridique ── Établissement
                 ├─ Période auditée
                 └─ Thématique
                      └─ Règle ── Version de règle ── Source juridique
                           ├─ Pièce attendue ── Pièce reçue ── Preuve
                           ├─ Donnée structurée ── Test de contrôle
                           ├─ Anomalie
                           ├─ Conclusion ── Risque ── Chiffrage
                           └─ Recommandation ── Validation humaine
```

| Objet | Champs clés (indicatif) |
|---|---|
| **Client** | raison sociale, forme juridique, groupe |
| **Mission** | type (buy-side / vendor / confirmatory / post-closing), périmètre, calendrier, livrables |
| **Périmètre d'audit** | entités, établissements (SIREN/SIRET), période, populations, thématiques, exclusions, seuils de matérialité |
| **Entité / Établissement** | SIREN, SIRET, CCN applicable, effectif, outil paie |
| **Thématique** | ex. ANV véhicules, heures supplémentaires, PSC, réduction générale |
| **Règle** | id, thème, énoncé, type (fond / forme / preuve / calcul / déclaratif) |
| **Version de règle** | date d'entrée en vigueur, date de fin, paramètres (taux, plafonds, PMSS), source |
| **Source juridique** | type (loi / décret / BOSS / CCN / JP), référence exacte, URL, passage cité |
| **Pièce attendue** | thématique, priorité (P0/P1/P2), obligatoire ? |
| **Pièce reçue** | fichier, nature, période couverte, SIRET, statut probatoire |
| **Preuve** | pièce(s) liée(s), force probante, limites |
| **Donnée structurée** | valeurs paie / DSN / bordereaux, CTP, assiettes, effectifs, dates |
| **Test de contrôle** | règle testée, données d'entrée, résultat, écart |
| **Anomalie** | nature (voir typologie), gravité, description |
| **Conclusion** | état (voir §5), statut probatoire, dépendance à une pièce |
| **Risque** | score gravité, probabilité, impact deal/closing/intégration |
| **Chiffrage** | fourchette €, méthode, hypothèses, période exposée, population |
| **Recommandation** | pré-closing, SPA, post-closing (30/60/90 j) |
| **Validation humaine** | expert, décision, horodatage, commentaire |

## 3. Conventions d'identifiants

Format : `SOC-<VERTICALE>-<NNN>` pour les risques, `RF-<VERTICALE>-<NNN>` pour
les règles de red flag. Les numéros sont séquentiels par verticale et **jamais
réutilisés** (un risque supprimé garde son numéro).

| Préfixe verticale | Périmètre |
|---|---|
| `URSSAF` | Paie / cotisations / ANV / frais professionnels (dont `RF-ANV-*`) |
| `WT` | Temps de travail / heures supplémentaires (`RF-WT-*`) |
| `PSC` | Prévoyance / santé / protection sociale complémentaire |
| `CTR` | Contrats de travail / dirigeants / clauses sensibles |
| `CCN` | Convention collective / classification / minima |
| `CSE` | Représentation du personnel |
| `LIT` | Contentieux / inspections / contrôles |
| `HSE` | Santé-sécurité / AT-MP / RPS |
| `HC` | Effectifs / workforce |
| `REST` | Restructuration / intégration post-deal |

## 4. Statuts de workflow d'un point de contrôle

Chaque point de contrôle vit avec un statut clair :

- `non commencé`
- `pièces en attente`
- `en cours d'analyse`
- `incomplet`
- `à valider`
- `validé`
- `risque identifié`
- `conforme`
- `non conforme`
- `chiffrage à compléter`
- `prêt pour rapport`

```
non commencé → pièces en attente → en cours d'analyse
   → (incomplet | risque identifié | conforme | non conforme)
   → chiffrage à compléter → à valider → validé → prêt pour rapport
```

## 5. États de conclusion (non binaire)

conforme · non conforme · probablement conforme · probablement non conforme ·
incomplet · non démontré faute de pièce · hors périmètre · à confirmer.

Voir aussi les **statuts probatoires** et la **typologie d'anomalies** dans
[`03-scoring-et-fiche-risque.md`](03-scoring-et-fiche-risque.md).

## 6. Invariants du moteur (règles non négociables)

1. **Time-travel juridique** : chaque règle exécutée avec sa **version en
   vigueur à la date d'exigibilité** de la cotisation concernée. Les paramètres
   (PMSS, SMIC, coefficient T, barèmes ANV) viennent du registre
   [`07-parametres-versionnes.md`](07-parametres-versionnes.md).
2. **Séparation des sources** : source normative (loi/décret) ≠ doctrine
   administrative (BOSS) ≠ jurisprudence ≠ aide à la rédaction.
3. **Traçabilité intégrale** : document source (+ passage) → règle (+ version) →
   constat → conclusion → chiffrage → recommandation.
4. **L'absence de preuve n'est pas la preuve de conformité.**
5. **Décision finale humaine** : le modèle lit et rédige, le code vérifie /
   calcule / conclut, l'expert **arbitre et signe**.
6. **Contradiction croisée** : deux points de vue indépendants pour éviter
   ancrage et faux consensus.

## 7. Contrat de sortie du système (fin d'audit)

À la fin d'un audit, le système produit **au minimum** :

1. **Deal Risk Score** + closing blocker (oui/non) ;
2. **Risk register** structuré et exportable (Excel / CSV / JSON), chaque ligne
   au format [fiche risque](03-scoring-et-fiche-risque.md#4-gabarit-de-fiche-risque-obligatoire) ;
3. **Executive summary** (draft, 2–5 pages) ;
4. **Top red flags** avec montant, source, gravité, recommandation ;
5. **Q&A tracker / request list** des pièces manquantes ;
6. **Recommandations SPA** (indemnity / escrow / CP / covenant / disclosure) ;
7. **Plan de remédiation post-closing** (30/60/90 jours).

Le tout **cité et rejouable** : chaque conclusion pointe vers son passage source.

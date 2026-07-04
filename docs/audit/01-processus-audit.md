# 01 — Processus d'audit (pipeline du moteur)

Un audit social/URSSAF est un **processus de qualification juridique et
probatoire** : règles versionnées + pièces hétérogènes + contrôles croisés.
Ce fichier définit les étapes que le système doit orchestrer.

## 0. Objectif de chaque exécution

1. Définir le **bon périmètre** (entité, établissement, période, population,
   thématiques).
2. Identifier les **règles réellement applicables** (entreprise × période ×
   population).
3. Vérifier les conditions de **fond, forme, preuve, calcul, déclaratif**.
4. **Croiser** les données hétérogènes (juridique, paie, DSN, contrats, preuves
   de remise, justificatifs, bordereaux).
5. **Détecter** anomalies, incohérences, absences de preuve, pièces manquantes.
6. **Qualifier** le risque et **quantifier** l'exposition quand c'est possible.
7. Produire une **conclusion traçable** + une **remédiation** actionnable.

## 1. Cadrage (inputs obligatoires avant toute analyse)

Champs requis pour démarrer une mission :

- raison sociale, forme juridique, structure du groupe ;
- établissements concernés, SIREN / SIRET ;
- effectif salarié ;
- convention collective applicable (IDCC) ;
- outils paie / RH utilisés ;
- thématiques auditées ;
- période visée ;
- enjeux connus (contrôle en cours, redressement antérieur, changement de
  prestataire paie).

> **Point critique** : une part majeure des mauvaises analyses vient d'un
> **mauvais périmètre** — mauvaise société, mauvais établissement, documents hors
> périmètre, confusion intra-groupe, période erronée, population mal identifiée.
> Le moteur doit valider le rattachement (SIRET, période) de chaque pièce.

## 2. Collecte et pré-qualification des pièces

La liste de pièces dépend des thématiques : voir
[ANV véhicules](04-checklist-anv-vehicules.md) et
[Heures supplémentaires](05-checklist-heures-supplementaires.md).

À la réception, chaque pièce est qualifiée (ce n'est pas de l'administratif,
c'est déjà de l'analyse) :

- lisible ? complète ?
- bonne société / bon établissement (SIRET) ?
- bonne période ?
- pertinente pour la thématique ?
- original, extrait, export, brouillon ?
- **preuve réelle ou simple élément déclaratif ?**

## 3. Référentiels juridiques (hiérarchie et usage)

| Source | URL | Rôle dans le moteur |
|---|---|---|
| **BOSS** | https://boss.gouv.fr | Point d'entrée principal. Doctrine administrative **opposable** (depuis 2021), par thème. Parser les rubriques, lier chaque règle à « rubrique + paragraphe », détecter les mises à jour. |
| **Légifrance** | https://www.legifrance.gouv.fr | Texte de référence (CSS, Code du travail, décrets, arrêtés). Les **versions antérieures** d'un article = clé du time-travel juridique. |
| Décrets / arrêtés | via Légifrance / JO | Dates d'entrée en vigueur, seuils, plafonds, modalités. |
| **Conventions collectives** | https://www.legifrance.gouv.fr/liste/idcc (+ BOCC) | Règles de branche : PSC, classifications, forfaits jours, primes. |
| **Jurisprudence** | Légifrance / https://www.doctrine.fr | Arbitrage ciblé de points sensibles uniquement. **Ne jamais inventer une référence.** |
| Site URSSAF | https://www.urssaf.fr | Complément pratique (barèmes, taux). Non opposable au sens strict. |

Règles d'usage :

- **Ne jamais confondre** source normative (loi, décret), doctrine
  administrative (BOSS), jurisprudence et aide à la rédaction : fonctions
  différentes dans le raisonnement.
- Tous les paramètres chiffrés datés sont dans
  [`07-parametres-versionnes.md`](07-parametres-versionnes.md) — jamais codés
  en dur.

## 4. Inputs dossier (3 catégories, rôles distincts)

- **A. Contexte** : identité, SIREN/SIRET, période, CCN, effectif, outil paie,
  périmètre. → détermine quelles règles s'appliquent.
- **B. Données structurées** : DSN, livres de paie, bulletins, bordereaux,
  exports paie, registres. → matériau brut sur lequel les contrôles s'exécutent.
- **C. Documents probatoires** : contrats, DUE, accords, notices, preuves de
  remise, justificatifs, politiques, dispenses. → démontrent la conformité ;
  **sans eux, un calcul correct ne suffit pas**.

## 5. Règles d'analyse (contraintes du moteur)

- **Appliquer les textes en vigueur à la date d'exigibilité** de chaque
  cotisation (time-travel juridique). Première source d'erreur connue.
- **Ne jamais conclure « conforme » sans preuve documentaire suffisante.**
  L'absence de preuve n'est pas la preuve de conformité.
- Signaler toute incertitude ; structurer chaque analyse en : (1) règle +
  source, (2) pièces utilisées, (3) pièces manquantes, (4) analyse,
  (5) conclusion.
- **Contradiction croisée** : deux points de vue indépendants (analyse +
  contrôle) pour éviter l'ancrage et le faux consensus ; arbitrage humain en
  cas de divergence persistante.
- Les modèles ne sont **jamais la source de vérité finale** : la décision
  finale est humaine.

## 6. Découpage de l'audit

**Thèmes → sous-thèmes → règles de contrôle élémentaires.** Chaque règle est une
unité d'analyse autonome.

Exemple (PSC Prévoyance) : acte fondateur valable → forme de mise en place →
preuve de remise de notice → caractère collectif (catégories objectives) →
caractère obligatoire (dispenses limitatives) → financement employeur →
articulation dispenses → assiette d'exonération → plafond d'exonération →
cohérence contrat / paie / DSN / justificatifs.

Types de contrôles (chaque test de contrôle porte un type) :

1. **périmètre** — bonne entité, bonne population ;
2. **règle** — bonne norme, bonne version ;
3. **preuve** — pièce présente, probante, complète ;
4. **calcul** — assiettes, taux, plafonds ;
5. **cohérence inter-documents** — contrat vs paie vs DSN vs bordereau ;
6. **qualification de risque** et rédaction.

## 7. Boucle d'analyse règle par règle

1. **Lister** les règles applicables du thème (exhaustivité d'abord, détail
   ensuite), puis contrôler la liste par contradiction.
2. **Analyser** chaque règle isolément : partir des pièces indiquées, puis
   balayer **toutes** les pièces du dossier pour repérer d'autres éléments
   pertinents.
3. **Contrôler** (contradiction croisée) : fond juridique, version applicable,
   conditions d'exonération complètes, pièces, cohérence de la conclusion.
4. **Consolider** : intégrer les corrections ; arbitrage humain si divergence.

Erreurs typiques que le contrôle croisé doit attraper :

- **versionning** (la plus fréquente et dangereuse) : taux ANV post-02/2025 sur
  des données 2023, PMSS 2025 sur l'exercice 2023 ;
- **oubli de conditions d'exonération** (notice non vérifiée, panier de soins) ;
- **conclusion trop affirmative** alors qu'une pièce clé manque ;
- **erreur de qualification** (DUE vs accord collectif, catégories ANI 2017 vs
  CCN) ;
- **incohérence inter-pièces** (taux patronal différent entre acte fondateur,
  contrat assureur et bulletins).

## 8. Contenu obligatoire d'une analyse de règle

| # | Bloc | Contenu attendu |
|---|---|---|
| A | Règle de droit applicable | Textes, doctrine, JP utile, **version applicable à la période** |
| B | Objet du contrôle | Ce qui doit être démontré, conditions cumulatives, exceptions, seuils, pièces attendues |
| C | Pièces utilisées | Documents exploités, période couverte, force probante, limites |
| D | Pièces manquantes | Absentes, incomplètes, illisibles, non probantes |
| E | Données exploitées | Valeurs bulletins, lignes de paie, CTP, assiettes, effectifs, dates, montants, populations |
| F | Contrôles réalisés | Juridique, documentaire, cohérence inter-documents, calcul, concordance paie / DSN / bordereaux / contrat / acte |
| G | Conclusion | État (voir [`03`](03-scoring-et-fiche-risque.md)) + risque + chiffrage + degré de certitude + dépendance à une pièce |
| H | Remédiation | Correction, pièce à produire, régularisation, priorisation, impact en cas de contrôle |

## 9. Pièces manquantes

Si une pièce manque : vérifier qu'elle est réellement nécessaire → la
redemander (alimenter la request list) → sinon analyser **en l'état**.

Conclusions possibles : non-conformité avérée · conformité non démontrable ·
risque probable · conclusion indéterminée · conformité possible sous réserve de
production. Statuts probatoires détaillés :
[`03-scoring-et-fiche-risque.md`](03-scoring-et-fiche-risque.md).

## 10. Remédiation

Pour chaque non-conformité : **quelle action, qui** (RH, prestataire paie,
direction, assureur), **quel délai, quels documents**. Chiffrer l'exposition si
non corrigé et le levier d'optimisation si applicable.

## 11. Contrôles transverses de fin d'audit (obligatoires)

1. **Exhaustivité** — aucun angle oublié.
2. **Cohérence interne des données** — ex. un ANV identifié dans la thématique
   ANV mais absent de l'assiette Rémunérations ; taux PSC incohérent entre
   contrat et paie ; effectifs divergents entre thématiques.
3. **Cohérence documentaire** — les pièces citées existent dans le dossier,
   bonne entité, bonne période, et soutiennent réellement la conclusion.
4. **Cohérence juridique globale** — bon régime, versionning correct, pas de
   projection d'une règle actuelle sur une période passée.

## 12. Consolidation du rapport

Mise en forme **sans modifier le fond** (pas de reformulation des conclusions,
pas de suppression de nuances). Organisation : thématique → section → règle ;
chaque règle = droit applicable, pièces, analyse, conclusion, risque, chiffrage,
remédiation. **Synthèse en tête** : cartographie Risque & Cash, exposition par
thématique, classement critique / élevé / modéré / faible. Validation humaine
avant restitution ; constats restitués par ordre de criticité.

Formats de sortie : voir [`02-livrables-mna.md`](02-livrables-mna.md).

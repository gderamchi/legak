# Base de règles d'audit — Legak

Ce dossier est la **base de connaissance métier** qui alimente la logique du
système *après* la phase « Computer Use ».

- **Computer Use** navigue la data room, ouvre les pièces et ramène des captures
  et des passages sources.
- **La base de règles ci-dessous** définit ce qu'on cherche, comment on le
  qualifie, comment on le chiffre, et ce qu'on doit produire à la fin.
- **Le code déterministe** exécute les contrôles, calcule les expositions et
  conclut. **L'expert arbitre et signe.**

> Principe directeur : le vrai produit n'est pas un assistant conversationnel.
> C'est un **moteur de contrôle juridique** couplé à un **moteur de preuve**, un
> **moteur de données** et un **moteur de restitution**. On transforme une data
> room sociale en **risk register M&A chiffré**, directement exploitable pour
> décider, négocier et sécuriser le closing.

## Fichiers

| Fichier | Rôle | Ce qu'il pilote dans le système |
|---|---|---|
| [`01-processus-audit.md`](01-processus-audit.md) | Pipeline d'audit du moteur | Orchestration : cadrage → collecte → analyse règle par règle → contrôles transverses → rapport |
| [`02-livrables-mna.md`](02-livrables-mna.md) | Contrats de sortie (livrables M&A) | Formats à générer : red flag report, executive summary, risk register, Q&A tracker, reco SPA, plan post-closing |
| [`03-scoring-et-fiche-risque.md`](03-scoring-et-fiche-risque.md) | Scoring, heatmap, gabarit de fiche risque, statuts probatoires | Qualification, chiffrage, structuration homogène de chaque risque |
| [`04-checklist-anv-vehicules.md`](04-checklist-anv-vehicules.md) | Vertical **Avantages en nature véhicules** | Pièces à demander, données à extraire, red flags auto |
| [`05-checklist-heures-supplementaires.md`](05-checklist-heures-supplementaires.md) | Vertical **Temps de travail / heures supplémentaires** | Pièces à demander, données à extraire, red flags auto |
| [`06-modele-donnees.md`](06-modele-donnees.md) | Objets métier & statuts de workflow (les 6 briques) | Modèle de données du moteur, machine à états de chaque contrôle |
| [`07-parametres-versionnes.md`](07-parametres-versionnes.md) | Registre unique des paramètres chiffrés datés (PMSS, barèmes ANV, majorations HS) | Time-travel juridique : aucune valeur codée en dur, chaque contrôle référence un paramètre daté |

## Chaîne fonctionnelle (résumé)

```
Périmètre  →  Référentiel de règles  →  Moteur de preuve  →  Moteur de contrôle
        →  Moteur de conclusion  →  Moteur de restitution
```

1. **Périmètre** : bonne entité, bon établissement, bonne période, bonne
   population, bon thème.
2. **Référentiel de règles** : chaque thème découpé en règles élémentaires,
   **versionnées dans le temps** (time-travel juridique).
3. **Moteur de preuve** : relie chaque règle aux pièces attendues / reçues /
   manquantes et à leur force probante.
4. **Moteur de contrôle** : teste la règle sur les données (paie, DSN,
   contrats) et détecte les incohérences.
5. **Moteur de conclusion** : verdict motivé + niveau de risque + chiffrage +
   degré de certitude.
6. **Moteur de restitution** : rapport, liste de pièces manquantes, plan de
   remédiation, recommandations SPA.

## Règle d'or non négociable

- Appliquer **les textes en vigueur à la date d'exigibilité** de chaque
  cotisation (versionning temporel). C'est la première source d'erreur.
- **L'absence de preuve n'est pas la preuve de conformité.** Ne jamais conclure
  « conforme » sans pièce probante suffisante.
- Toute conclusion doit être **traçable** : document source → règle → constat →
  conclusion → recommandation.

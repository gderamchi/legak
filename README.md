# Legak

Legak est un agent de due diligence sociale M&A buy-side. Il joue le rôle de
l'avocat M&A social de l'acquéreur sur une verticale : **les avantages en
nature véhicules (URSSAF)**.

Entrée : les pièces de la data room sociale (listing flotte, journal de paie,
politique véhicule, avenants, cartes grises, contrats de location).
Sortie : un package décisionnel M&A — executive summary, risk register scoré,
fiches risque chiffrées (format `SOC-ANV-XXX`), recommandations SPA, Q&A
tracker, plan post-closing 30/60/90 et annexe chiffrée véhicule par véhicule.

## Primitives Google DeepMind (les deux sont porteuses)

1. **Gemini Computer Use** (`gemini-3.5-flash`, Interactions API, tool
   `computer_use`) — la salle de données du vendeur est en consultation seule :
   pas d'API, pas de téléchargement. La seule voie d'entrée est l'écran. Le
   modèle reçoit la capture d'écran, décide chaque action (`click`, `type`,
   `scroll`… avec son `intent`), Playwright l'exécute, et l'écran suivant
   repart en `function_result` — la boucle de référence Computer Use. Sans
   opération du navigateur, la collecte est impossible (le VDR est en
   consultation seule) ; la primitive remplace le parcours scripté par une
   décision du modèle écran par écran, avec repli scripté tracé
   (`decidedBy: "code"`).
2. **Agent Antigravity** (`antigravity-preview-05-2026`, Interactions API) —
   une due diligence dure des jours, pas une session. Le dossier de travail
   (inventaire, pièces manquantes, registre Q&A, journal) est tenu par l'agent
   dans son environnement persistant : fil `previous_interaction_id` +
   `environment_id`, fichiers réels maintenus par l'agent. On coupe le serveur
   local, on revient le lendemain, la mémoire de mission est intacte
   (`POST /api/missions/:id/dossier-recall`).

Le couplage exigé par l'énoncé : chaque jalon Antigravity n'existe que parce
que l'opérateur computer use a collecté ou déposé quelque chose au navigateur,
et la liste des pièces manquantes tenue au dossier déclenche l'action computer
use suivante (dépôt de la request list au VDR).

## Le pipeline (workflow d'un avocat M&A social)

1. **Cadrage** — périmètre (cible, SIREN, période, CCN, effectif) et liste de
   pièces propre à la thématique. L'agent Antigravity ouvre le dossier de
   travail de la mission dans son environnement persistant.
2. **Collecte en computer use** — la salle de données du vendeur (portail VDR
   sur `/vdr`, code d'accès `ATLAS-2026`) est en **consultation seule** : pas
   de téléchargement, documents filigranés. L'agent-opérateur (Gemini Computer
   Use) pilote un vrai navigateur (Chrome headless via Playwright) : le modèle
   voit chaque écran et décide chaque clic — connexion, parcours des dossiers,
   lecture de chaque pièce en place, **capture d'écran horodatée à chaque
   action** versée au trail de preuve (chaque capture porte `decidedBy` :
   action décidée par le modèle, ou checkpoint/reprise scriptée du code). Le
   code vérifie l'état d'arrivée de chaque étape (aucune conclusion sans
   preuve) et ne reprend la main en scripté qu'en dernier recours, tracé
   comme tel. Les pièces sont ensuite archivées, empreintées
   (SHA-256), triées par thème et qualifiées : nature, rattachement SIRET,
   force probante (probante / déclarative / hors périmètre). L'inventaire est
   consigné au dossier Antigravity.
3. **Analyse règle par règle** — un moteur déterministe exécute 8 contrôles
   élémentaires (périmètre, preuve, règle, calcul, cohérence) avec des
   **barèmes versionnés dans le temps** : arrêté du 10 décembre 2002 vs arrêté
   du 25 février 2025, sélectionnés selon la date d'attribution du véhicule au
   salarié (réattributions comprises).
4. **Contradiction croisée** — un second agent Gemini challenge les
   conclusions (versionning, conclusions trop affirmatives, statuts
   probatoires). Les chiffres restent la propriété du moteur.
5. **Restitution** — rapport red flag exportable en Markdown, à relire et
   signer par l'avocat. Les conclusions (chiffres du moteur, jamais recalculés
   par le modèle) sont consignées au dossier Antigravity.
6. **Dépôt de la request list** — l'agent computer use retourne dans le VDR et
   dépose chaque pièce manquante dans le module Q&A du portail vendeur
   (formulaire rempli et soumis à l'écran, preuve du registre à l'appui). Le
   registre Q&A du dossier Antigravity est mis à jour : c'est lui qui porte
   l'attente des retours vendeur d'un jour sur l'autre.

Principes hérités du processus d'audit URSSAF réel : aucune conclusion sans
pièce, l'absence de preuve n'est pas la preuve de conformité, statuts nuancés
(conforme, non conforme, conformité non démontrable, indéterminé, à
confirmer), et traçabilité complète dans le journal d'audit.

## Répartition modèle / code

- **Gemini Computer Use** : toutes les actions navigateur dans le VDR
  (connexion, navigation, lecture en place, formulaire Q&A) — décision par le
  modèle à partir des pixels, exécution Playwright, preuve d'écran par action.
- **Agent Antigravity** : la mémoire longue de la mission (fichiers du dossier
  de travail maintenus dans son environnement persistant, interrogeables à
  tout moment).
- **Gemini (generateContent)** : classification documentaire, mapping de schéma des tableaux
  (le modèle identifie le rôle de chaque colonne, le code parse toutes les
  lignes lui-même : aucune valeur ne transite par le modèle), extraction typée
  des pièces libres (avenants, cartes grises, contrats — dates normalisées en
  ISO), contradiction croisée des conclusions, rédaction de l'executive
  summary.
- **Code** : normalisation des valeurs (dates FR, montants « 28 000,00 »),
  jointures tolérantes preuves ↔ véhicules ↔ paie, barèmes datés, calculs
  d'assiette et d'exposition, statuts probatoires, verdicts, structure du
  rapport.
- **L'expert** : arbitrage et signature.

Sans clé Gemini, le pipeline retombe sur des parsers hors ligne qui ne
comprennent que les fichiers canoniques de `demo-data-room/`.

## Lancer en local

Prérequis : Node ≥ 22.9 (option `--env-file-if-exists`) et un Chrome ou
Chromium installé pour l'agent VDR (`playwright-core` n'embarque aucun
navigateur ; sans Chrome, la collecte VDR répond 502 et le reste du produit
fonctionne).

```bash
npm install
npm run api   # API sur 127.0.0.1:8787 (sert aussi le portail VDR /vdr)
npm run dev   # Front sur :5173 — le produit est sur /app
```

Variables : `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`), `GEMINI_MODEL`, `PORT`
côté API ; `VITE_API_BASE` côté front si l'API n'est pas sur
`http://localhost:8787`.

## Jeu de démonstration

Les 23 pièces de la data room fictive sont exportées en vrais fichiers dans
`demo-data-room/` (régénérables via `node scripts/export-demo-data-room.mjs`).
Pour tester le parcours principal : ouvrir `/app`, cadrer la mission,
sélectionner tous les fichiers de `demo-data-room/` et les glisser d'un coup
dans la zone de dépôt, puis « Trier et qualifier les pièces (agent) » — le tri
s'affiche en direct (boîte de réception → dossiers thématiques, force probante
qualifiée pièce par pièce, fichiers réellement déplacés sur le disque).

`demo-data-room-variant/` contient les **mêmes données dans des formats
entièrement différents** (fichiers renommés, colonnes renommées et réordonnées,
dates DD/MM/YYYY, montants « 28 000 » / « 202,50 », avenants et cartes grises
reformulés) — régénérable via `node scripts/export-demo-data-room-variant.mjs`
pour rester synchrone avec le jeu canonique. L'extraction étant faite par
Gemini (mapping de schéma pour les tableaux, extraction typée pour les pièces
libres) puis calculée par code, les deux jeux produisent le même rapport au
centime près — preuve que le produit lit les documents au lieu de reconnaître
ses propres fichiers.

Smoke test du pipeline complet (data room de démonstration incluse) :

```bash
cp .env.example .env
curl -s -X POST http://localhost:8787/api/run-diligence -H 'content-type: application/json' -d '{}'
```

Endpoints :

- `GET /api/health` — état et mode (gemini/demo).
- `GET /api/missions` — liste des missions ; `GET /api/missions/:id` — état complet.
- `POST /api/missions` — cadrage (cible et période obligatoires, aucun défaut).
- `POST /api/missions/:id/documents` — réception de pièces (dédupliquées par
  empreinte SHA-256 du contenu).
- `POST /api/missions/:id/demo-documents` — chargement du jeu de démonstration.
- `POST /api/missions/:id/vdr-collect` — l'agent Gemini Computer Use opère le
  portail VDR de démonstration au navigateur et collecte les pièces en place
  (captures de preuve).
- `POST /api/missions/:id/vdr-post-qa` — l'agent computer use dépose la
  request list dans le module Q&A du VDR.
- `GET /api/missions/:id/vdr-live.mjpeg` — retransmission en direct de l'écran
  piloté par le modèle (flux MJPEG, affiché dans l'app pendant chaque run) ;
  `GET /api/missions/:id/vdr-live` — état structuré du run (but en cours,
  dernière action, intent du modèle, compteurs).
- `GET /api/missions/:id/vdr-evidence/:file` — captures de preuve (PNG).
- `POST /api/missions/:id/dossier-recall` — interroge la mémoire de mission
  tenue par l'agent Antigravity (`{"question": "..."}`), y compris après un
  redémarrage du serveur local.
- `POST /api/missions/:id/intake` — lance le tri (202) ;
  `GET /api/missions/:id/intake-progress` — progression du classement.
- `POST /api/missions/:id/analyze` — extraction + contrôles + contradiction + rapport.
- `GET /api/missions/:id/report.md` — export Markdown du rapport.
- `POST /api/run-diligence` — pipeline complet sur le jeu de démonstration
  (smoke test ; seule route qui utilise la cible fictive par défaut).

Le portail VDR de démonstration (vue vendeur) est servi sur
`http://localhost:8787/vdr` — cible fictive Novatech Services SAS,
12 véhicules, anomalies plantées dans les données.

## Environnement

```bash
GEMINI_API_KEY=
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_COMPUTER_USE_MODEL=gemini-3.5-flash
GEMINI_AGENT_ID=antigravity-preview-05-2026
PORT=8787
```

## Sources juridiques encodées

- Arrêté du 10 décembre 2002 (ancien barème forfaitaire ANV).
- Arrêté du 25 février 2025 (barème majoré pour les mises à disposition à
  compter du 1er février 2025, abattement électrique 70 % plafonné à 4 582 €
  sous condition d'éco-score).
- BOSS, rubrique « Avantages en nature » (doctrine de la date d'attribution).
- Art. L. 242-1, L. 244-3, R. 243-18, R. 243-59 CSS (assiette, prescription,
  majorations, charge de la preuve).

## Business plan

Voir [docs/business-plan.md](docs/business-plan.md).

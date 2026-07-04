# 07 — Paramètres versionnés (référentiel daté)

Registre unique des paramètres chiffrés utilisés par le moteur de contrôle.
**Aucun paramètre ne doit être codé en dur ni repris depuis la prose des autres
fichiers** : c'est ce registre qui fait foi, avec dates de validité et source.

Statuts :

- `confirmé` — valeur vérifiée sur la source officielle (BOSS / Légifrance),
  avec référence exacte ;
- `à vérifier` — valeur issue des documents de travail du projet, à confirmer
  sur la source officielle **avant toute utilisation dans un chiffrage**.

## 1. Plafonds de sécurité sociale

| Paramètre | Valeur | En vigueur du | Au | Source | Statut |
|---|---|---|---|---|---|
| PMSS 2023 | 3 666 € | 01/01/2023 | 31/12/2023 | Arrêté annuel (à référencer) | à vérifier |
| PMSS 2024 | 3 864 € | 01/01/2024 | 31/12/2024 | Arrêté annuel (à référencer) | à vérifier |
| PMSS 2025 | 3 925 € | 01/01/2025 | 31/12/2025 | Arrêté annuel (à référencer) | à vérifier |

## 2. Avantage en nature véhicule (ANV)

| Paramètre | Valeur | En vigueur du | Au | Source | Statut |
|---|---|---|---|---|---|
| Base forfaitaire véhicule **loué / LLD / LOA** | 50 % du coût global annuel (traitement carburant spécifique selon le cas) | 01/02/2025 | — | Décret n° 2025-144 du 25/02/2025 + BOSS « Avantages en nature » | à vérifier |
| Base forfaitaire véhicule loué — **ancien barème** | 30 % du coût global annuel | — | 31/01/2025 | BOSS « Avantages en nature » (version antérieure) | à vérifier |
| Abattement véhicule **100 % électrique** | Réduction de 70 % dans la limite annuelle applicable, sous condition d'éco-score | Exercice 2026 | — | urssaf.fr / BOSS (à référencer) | à vérifier |

> Règle de non-régression : un contrôle sur des données antérieures au
> 01/02/2025 utilise l'ancien barème ; postérieures, le nouveau. La **date de
> mise à disposition** du véhicule détermine le régime applicable.

## 3. Heures supplémentaires / temps de travail

| Paramètre | Valeur | En vigueur du | Au | Source | Statut |
|---|---|---|---|---|---|
| Majoration légale HS (à défaut d'accord) | 25 % (8 premières heures), 50 % au-delà | — | — | Code du travail (à référencer) | à vérifier |
| Plancher conventionnel de majoration | 10 % minimum par accord | — | — | Code du travail (à référencer) | à vérifier |
| Contrepartie obligatoire en repos au-delà du contingent (à défaut d'accord) | 50 % si effectif ≤ 20 salariés ; 100 % si > 20 | — | — | Code du travail (à référencer) | à vérifier |
| Seuil de notification du repos compensateur | Information du salarié dès que le droit atteint 7 heures | — | — | Ministère du travail (à référencer) | à vérifier |
| CTP déduction forfaitaire patronale HS | CTP 004 | — | — | urssaf.fr | à vérifier |
| Périmètre déduction forfaitaire patronale | HS + jours de repos rachetés en forfait jours ; **exclut les heures complémentaires** des temps partiel | — | — | urssaf.fr | à vérifier |

## 4. Règles d'usage du registre

1. Chaque exécution de contrôle référence l'**identifiant du paramètre + sa
   période de validité**, jamais une valeur copiée.
2. Un paramètre `à vérifier` peut alimenter une analyse préliminaire, mais le
   chiffrage final d'une fiche risque exige le statut `confirmé` — sinon le
   **niveau de confiance** de la fiche est plafonné à `Moyen`.
3. Toute mise à jour conserve l'ancienne ligne avec sa date de fin (pas de
   suppression) : le time-travel juridique dépend de l'historique complet.

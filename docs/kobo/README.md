# KoboCollect → FaîtièreHub — XLSForm d'enrôlement

## Fichiers

| Fichier | Description |
|---------|-------------|
| `faitierehub_carte_membre_v2.xlsx` | **XLSForm prêt à importer** dans KoboToolbox |
| `generate_xlsform.py` | Script Python (openpyxl) pour régénérer le XLSX |

## Principe

L'agent collecteur saisit les données du membre sur le terrain. Après soumission :
- Le **numéro de carte** est généré automatiquement par le système
- Le **niveau** (Bronze 🥉 / Argent 🥈 / Or 🥇) est calculé automatiquement par le serveur
- La **carte membre** (numérique + physique) est produite avec QR code vérifiable

## Structure du formulaire (7 sections)

```
┌─────────────────────────────────────────────────────────────┐
│ S1 — Identité du membre                                     │
│   nom_complet, date_naissance, sexe, telephone, email,      │
│   photo_membre, consentement_donnees                        │
├─────────────────────────────────────────────────────────────┤
│ S2 — Organisation                                           │
│   code_faitiere, nom_cooperative, nom_union,                │
│   date_adhesion, statut_membre                              │
│   ⚡ Numéro de carte + niveau = générés par le système      │
├─────────────────────────────────────────────────────────────┤
│ S3 — Localisation géographique                              │
│   region (5 régions Togo), prefecture (36 préfectures),     │
│   canton, village, gps_localisation                         │
├─────────────────────────────────────────────────────────────┤
│ S4 — Cotisations                                            │
│   nb_cotisations_12mois, montant_derniere_cotisation,       │
│   date_derniere_cotisation, type_derniere_cotisation         │
├─────────────────────────────────────────────────────────────┤
│ S5 — Parcelles agricoles (REPEAT)                           │
│   culture_principale, superficie_ha, type_sol,              │
│   irrigation, type_agriculture, localite_parcelle           │
├─────────────────────────────────────────────────────────────┤
│ S6 — Productions (REPEAT)                                   │
│   culture_produite, campagne_annee, rendement_kg,           │
│   quantite_vendue_kg, prix_vente_fcfa                       │
├─────────────────────────────────────────────────────────────┤
│ S7 — Validation & Soumission                                │
│   Récapitulatif, confirmation, observations_agent,          │
│   nom_agent                                                 │
└─────────────────────────────────────────────────────────────┘
```

## Listes de choix (onglet choices)

| Liste | Contenu |
|-------|---------|
| `region_list` | 5 régions du Togo (Maritime, Plateaux, Centrale, Kara, Savanes) |
| `prefecture_list` | 36 préfectures du Togo (toutes) |
| `type_sol_list` | Argileux, Sableux, Limoneux, Latéritique, Ferralitique, Hydromorphe, Volcanique, Mixte |
| `irrigation_list` | Pluviale, Goutte-à-goutte, Aspersion, Gravitaire, Pompage, Bas-fond, Aucune |
| `type_agriculture_list` | Conventionnel, Biologique, Agroforesterie, Maraîchage, Élevage, Pisciculture, Mixte |
| `type_cotisation_list` | Cotisation annuelle, Crédit, Remboursement, Amende, Don |
| `campagne_list` | 2020 à 2026 |

## Calculs automatiques côté serveur (pas dans le formulaire)

| Critère | Règle |
|---------|-------|
| Bronze 🥉 | Membre actif + ≥1 cotisation payée dans les 12 derniers mois |
| Argent 🥈 | Bronze + ≥1 parcelle + ≥1 production enregistrée |
| Or 🥇 | Argent + ≥2 campagnes distinctes + ≥2 productions |

## Mapping vers la base de données

| Champ XLSForm | Table cible | Colonne | Transform |
|---------------|-------------|---------|-----------|
| `S1/nom_complet` | `members` | `first_name + last_name` | split |
| `S1/telephone` | `members` | `phone` | trim |
| `S1/photo_membre` | `members` | `photo_url` | upload |
| `S3/region` | `members` | `region` | — |
| `S3/prefecture` | `members` | `prefecture` | — |
| `S3/canton` | `members` | `canton` | — |
| `S3/village` | `members` | `village` | — |
| `S5/culture_principale` | `parcelles` | `culture_principale` | trim |
| `S5/superficie_ha` | `parcelles` | `superficie_ha` | to_number |
| `S5/type_agriculture` | `parcelles` | `type_agriculture` | — |
| `S6/rendement_kg` | `productions` | `rendement_kg` | to_number |
| `S6/prix_vente_fcfa` | `productions` | `prix_vente_fcfa` | to_number |
| `S6/campagne_annee` | `productions` | `campagne_annee` | — |

**Note :** Le numéro de carte est généré par le système. Le matching pour les mises à jour se fait par nom + coopérative + téléphone.

## Import dans KoboToolbox

1. Connectez-vous sur https://kf.kobotoolbox.org
2. Cliquez **New** → **Upload an XLSForm**
3. Sélectionnez `faitierehub_carte_membre_v2.xlsx`
4. Vérifiez la prévisualisation
5. Cliquez **Deploy**

## Régénérer le XLSX

```bash
pip install openpyxl
python generate_xlsform.py
```

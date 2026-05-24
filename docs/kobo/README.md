# XLSForm FENOMAT — Fiche Membre Collecte Terrain

## Fichiers

| Fichier | Description |
|---------|-------------|
| `survey.csv` | Feuille "survey" — structure du formulaire (8 sections) |
| `choices.csv` | Feuille "choices" — listes de choix (régions, préfectures, cantons, cultures, etc.) |
| `settings.csv` | Feuille "settings" — métadonnées du formulaire |

## Comment créer le .xlsx

### Option 1 : Google Sheets (recommandé)
1. Créer un nouveau Google Sheets
2. Renommer le premier onglet "survey" → coller le contenu de `survey.csv`
3. Créer un onglet "choices" → coller le contenu de `choices.csv`
4. Créer un onglet "settings" → coller le contenu de `settings.csv`
5. Fichier → Télécharger → Microsoft Excel (.xlsx)

### Option 2 : Import direct dans KoboToolbox
KoboToolbox accepte les fichiers .xlsx avec les 3 feuilles nommées exactement :
- `survey`
- `choices`
- `settings`

### Option 3 : Ligne de commande (Python)
```bash
pip install openpyxl pandas
python -c "
import pandas as pd
survey = pd.read_csv('survey.csv')
choices = pd.read_csv('choices.csv')
settings = pd.read_csv('settings.csv')
with pd.ExcelWriter('fenomat_membre_v3.xlsx') as writer:
    survey.to_excel(writer, sheet_name='survey', index=False)
    choices.to_excel(writer, sheet_name='choices', index=False)
    settings.to_excel(writer, sheet_name='settings', index=False)
print('✅ fenomat_membre_v3.xlsx créé')
"
```

## Sections du formulaire

| # | Section | Champs principaux |
|---|---------|-------------------|
| S1 | Identification membre | N° carte, photo |
| S2 | Localisation GPS | GPS, région, préfecture, canton, village |
| S3 | Profil exploitation | Superficie, mode faire-valoir, eau, équipements |
| S4 | Cultures (repeat ×10) | Culture, superficie, saison, semences, engrais |
| S5 | Production (repeat ×10) | Campagne, rendement, prix, canal vente, pertes |
| S6 | Intrants & dépenses | Semences, engrais, pesticides, main d'œuvre, crédit |
| S7 | Besoins & formations | Formations, groupement, téléphone, opérateur |
| S8 | Validation | Enquêteur, date, observations, consentement |

## Calculs automatiques

- `revenu_brut_total` : somme des (rendement_kg × prix_vente_moyen) par culture
- `depenses_totales` : somme de toutes les dépenses
- `marge_nette_estimee` : revenu_brut_total - depenses_totales

## Listes de choix

- **Régions** : 5 régions du Togo (Maritime, Plateaux, Centrale, Kara, Savanes)
- **Préfectures** : 30+ préfectures avec choice_filter par région
- **Cantons** : 25+ cantons avec choice_filter par préfecture
- **Cultures** : 25 cultures maraîchères/vivrières courantes au Togo
- **Équipements** : 9 types d'équipements agricoles
- **Sources d'eau** : 6 sources
- **Canaux de vente** : 5 canaux

## Configuration KoboToolbox

- **Form ID** : `fenomat_membre_v3`
- **Version** : `2026050100` (format YYYYMMDDVV)
- **Langue** : Français
- **Instance name** : `{card_number}_{date}`

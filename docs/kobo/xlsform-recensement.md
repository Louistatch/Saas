# XLSForm — Recensement Producteurs FaîtiereHub

Ce document décrit le formulaire XLSForm professionnel pour le recensement des producteurs agricoles via KoboCollect.

## Structure du formulaire

Le formulaire est organisé en sections (groups) avec logique conditionnelle, validations, et calculs automatiques.

---

## Sheet: survey

| type | name | label | hint | required | constraint | constraint_message | relevant | calculation | appearance | default |
|------|------|-------|------|----------|------------|-------------------|----------|-------------|------------|---------|
| start | start | | | | | | | | | |
| end | end | | | | | | | | | |
| today | today | | | | | | | | | |
| deviceid | deviceid | | | | | | | | | |
| username | username | | | | | | | | | |
| calculate | unique_id | | | | | | | concat('FH-', ${deviceid}, '-', format-date(${today}, '%Y%m%d%H%M')) | | |
| begin_group | identification | **1. Identification du producteur** | | | | | | | field-list | |
| text | prenom | Prénom | | yes | string-length(.) >= 2 | Le prénom doit avoir au moins 2 caractères | | | | |
| text | nom | Nom de famille | | yes | string-length(.) >= 2 | Le nom doit avoir au moins 2 caractères | | | | |
| select_one sexe | sexe | Sexe | | yes | | | | | minimal | |
| integer | age | Âge | | yes | . >= 15 and . <= 100 | L'âge doit être entre 15 et 100 ans | | | | |
| text | telephone | Numéro de téléphone | Format: 90 XX XX XX | yes | regex(., '^[0-9]{8,12}$') | Entrez un numéro valide (8-12 chiffres) | | | numbers | |
| text | telephone2 | Téléphone secondaire | Optionnel | no | regex(., '^[0-9]{8,12}$') or . = '' | Numéro invalide | | | numbers | |
| select_one piece_identite | type_piece | Type de pièce d'identité | | no | | | | | minimal | |
| text | numero_piece | Numéro de la pièce | | no | | | ${type_piece} != '' | | | |
| image | photo | Photo du producteur | Photo portrait claire | yes | | | | | | |
| end_group | | | | | | | | | | |
| begin_group | localisation | **2. Localisation** | | | | | | | field-list | |
| select_one region | region | Région | | yes | | | | | minimal | |
| select_one prefecture | prefecture | Préfecture | | yes | | | | | minimal | |
| select_one canton | canton | Canton | | yes | | | | | minimal | |
| text | village | Village / Localité | | yes | | | | | | |
| geopoint | gps_domicile | Coordonnées GPS du domicile | Attendez la précision < 10m | no | | | | | | |
| end_group | | | | | | | | | | |
| begin_group | cooperative_info | **3. Coopérative** | | | | | | | field-list | |
| select_one cooperative | cooperative_id | Coopérative d'appartenance | | yes | | | | | minimal | |
| text | cooperative_autre | Nom de la coopérative (si autre) | | yes | | | ${cooperative_id} = 'autre' | | | |
| select_one statut_membre | statut_membre | Statut dans la coopérative | | yes | | | | | minimal | |
| date | date_adhesion | Date d'adhésion | | no | . <= today() | La date ne peut pas être dans le futur | | | no-calendar | |
| text | numero_membre | Numéro de membre existant | Si déjà enregistré | no | | | | | | |
| barcode | qr_carte | Scanner QR carte existante | Si le membre a déjà une carte | no | | | | | | |
| end_group | | | | | | | | | | |
| begin_group | parcelles | **4. Parcelles et cultures** | | | | | | | | |
| integer | nombre_parcelles | Nombre total de parcelles | | yes | . >= 0 and . <= 50 | Maximum 50 parcelles | | | | |
| begin_repeat | parcelle_detail | Détail parcelle | | | | | ${nombre_parcelles} > 0 | | | |
| text | parcelle_nom | Nom / identifiant de la parcelle | | yes | | | | | | |
| decimal | superficie_ha | Superficie (hectares) | | yes | . > 0 and . <= 500 | Superficie entre 0 et 500 ha | | | | |
| select_one culture_principale | culture_principale | Culture principale | | yes | | | | | minimal | |
| select_multiple cultures_secondaires | cultures_secondaires | Cultures secondaires | | no | | | | | minimal | |
| select_one type_agriculture | type_agriculture | Type d'agriculture | | yes | | | | | minimal | |
| select_one irrigation | irrigation | Mode d'irrigation | | yes | | | | | minimal | |
| select_one tenure | tenure_fonciere | Tenure foncière | | yes | | | | | minimal | |
| geopoint | gps_parcelle | GPS de la parcelle | Centre de la parcelle | no | | | | | | |
| image | photo_parcelle | Photo de la parcelle | | no | | | | | | |
| end_repeat | | | | | | | | | | |
| calculate | superficie_totale | | | | | | | sum(${superficie_ha}) | | |
| end_group | | | | | | | | | | |
| begin_group | production | **5. Production** | | | | | | | field-list | |
| select_one campagne | campagne | Campagne agricole | | yes | | | | | minimal | |
| decimal | production_kg | Production totale (kg) | Dernière campagne | no | . >= 0 | Valeur positive requise | | | | |
| decimal | rendement_estime | Rendement estimé (kg/ha) | | no | | | | | | |
| calculate | rendement_calcule | | | | | | | if(${superficie_totale} > 0, ${production_kg} div ${superficie_totale}, 0) | | |
| select_one destination | destination_production | Destination principale | | yes | | | | | minimal | |
| decimal | prix_vente_kg | Prix de vente moyen (FCFA/kg) | | no | . >= 0 | Valeur positive | | | | |
| calculate | revenu_estime | | | | | | | ${production_kg} * ${prix_vente_kg} | | |
| end_group | | | | | | | | | | |
| begin_group | cotisations | **6. Cotisations** | | | | | | | field-list | |
| select_one cotisation_status | cotisation_a_jour | Cotisations à jour ? | | yes | | | | | minimal | |
| integer | montant_cotisation | Montant annuel (FCFA) | | no | . >= 0 | Montant positif | ${cotisation_a_jour} = 'oui' | | | |
| date | derniere_cotisation | Date dernière cotisation | | no | . <= today() | Date dans le passé | ${cotisation_a_jour} = 'oui' | | no-calendar | |
| text | notes_cotisation | Notes | | no | | | | | | |
| end_group | | | | | | | | | | |
| begin_group | equipements | **7. Équipements et besoins** | | | | | | | field-list | |
| select_multiple equipements | equipements_possedes | Équipements possédés | | no | | | | | minimal | |
| select_multiple besoins | besoins_exprimes | Besoins exprimés | | no | | | | | minimal | |
| select_one acces_credit | acces_credit | Accès au crédit | | no | | | | | minimal | |
| text | observations | Observations du technicien | | no | | | | | multiline | |
| end_group | | | | | | | | | | |
| begin_group | validation | **8. Validation** | | | | | | | field-list | |
| text | nom_enqueteur | Nom de l'enquêteur | | yes | | | | | | |
| image | signature | Signature ou empreinte | | no | | | | | signature | |
| note | resume | **Résumé:** ${prenom} ${nom}, ${age} ans, ${village} — ${nombre_parcelles} parcelle(s), ${superficie_totale} ha | | | | | | | | |
| end_group | | | | | | | | | | |

---

## Sheet: choices

| list_name | name | label |
|-----------|------|-------|
| sexe | homme | Homme |
| sexe | femme | Femme |
| piece_identite | cni | Carte nationale d'identité |
| piece_identite | passeport | Passeport |
| piece_identite | permis | Permis de conduire |
| piece_identite | electeur | Carte d'électeur |
| piece_identite | aucune | Aucune |
| region | maritime | Maritime |
| region | plateaux | Plateaux |
| region | centrale | Centrale |
| region | kara | Kara |
| region | savanes | Savanes |
| prefecture | golfe | Golfe |
| prefecture | lacs | Lacs |
| prefecture | vo | Vo |
| prefecture | yoto | Yoto |
| prefecture | zio | Zio |
| prefecture | ave | Avé |
| prefecture | agou | Agou |
| prefecture | kloto | Kloto |
| prefecture | wawa | Wawa |
| prefecture | haho | Haho |
| prefecture | moyen_mono | Moyen-Mono |
| prefecture | ogou | Ogou |
| prefecture | est_mono | Est-Mono |
| prefecture | amou | Amou |
| prefecture | danyi | Danyi |
| prefecture | tchaoudjo | Tchaoudjo |
| prefecture | sotouboua | Sotouboua |
| prefecture | blitta | Blitta |
| prefecture | kozah | Kozah |
| prefecture | binah | Binah |
| prefecture | doufelgou | Doufelgou |
| prefecture | keran | Kéran |
| prefecture | bassar | Bassar |
| prefecture | assoli | Assoli |
| prefecture | dankpen | Dankpen |
| prefecture | tone | Tône |
| prefecture | oti | Oti |
| prefecture | kpendjal | Kpendjal |
| prefecture | tandjoare | Tandjoare |
| prefecture | cinkasse | Cinkassé |
| canton | tsevie | Tsévié |
| canton | tabligbo | Tabligbo |
| canton | aneho | Aného |
| canton | kpalime | Kpalimé |
| canton | atakpame | Atakpamé |
| canton | sokode | Sokodé |
| canton | kara_ville | Kara |
| canton | dapaong | Dapaong |
| canton | autre_canton | Autre |
| cooperative | coop_1 | Coopérative Espoir |
| cooperative | coop_2 | Coopérative Solidarité |
| cooperative | coop_3 | Union des Producteurs |
| cooperative | autre | Autre (préciser) |
| statut_membre | actif | Membre actif |
| statut_membre | nouveau | Nouveau membre |
| statut_membre | bureau | Membre du bureau |
| statut_membre | president | Président(e) |
| statut_membre | tresorier | Trésorier(e) |
| statut_membre | secretaire | Secrétaire |
| culture_principale | mais | Maïs |
| culture_principale | riz | Riz |
| culture_principale | sorgho | Sorgho |
| culture_principale | mil | Mil |
| culture_principale | manioc | Manioc |
| culture_principale | igname | Igname |
| culture_principale | tomate | Tomate |
| culture_principale | piment | Piment |
| culture_principale | oignon | Oignon |
| culture_principale | soja | Soja |
| culture_principale | arachide | Arachide |
| culture_principale | coton | Coton |
| culture_principale | cafe | Café |
| culture_principale | cacao | Cacao |
| culture_principale | palmier | Palmier à huile |
| culture_principale | anacarde | Anacarde |
| culture_principale | teck | Teck |
| culture_principale | autre_culture | Autre |
| cultures_secondaires | mais | Maïs |
| cultures_secondaires | riz | Riz |
| cultures_secondaires | manioc | Manioc |
| cultures_secondaires | igname | Igname |
| cultures_secondaires | tomate | Tomate |
| cultures_secondaires | piment | Piment |
| cultures_secondaires | soja | Soja |
| cultures_secondaires | arachide | Arachide |
| cultures_secondaires | legumes | Légumes divers |
| type_agriculture | conventionnel | Conventionnel |
| type_agriculture | biologique | Biologique |
| type_agriculture | agroforesterie | Agroforesterie |
| type_agriculture | maraichage | Maraîchage |
| type_agriculture | mixte | Mixte |
| irrigation | pluvial | Pluvial (pluie) |
| irrigation | goutte_a_goutte | Goutte à goutte |
| irrigation | aspersion | Aspersion |
| irrigation | gravitaire | Gravitaire |
| irrigation | aucune | Aucune irrigation |
| tenure_fonciere | proprietaire | Propriétaire |
| tenure_fonciere | location | Location |
| tenure_fonciere | metayage | Métayage |
| tenure_fonciere | communautaire | Communautaire |
| tenure_fonciere | heritage | Héritage |
| campagne | 2025_2026 | 2025-2026 |
| campagne | 2024_2025 | 2024-2025 |
| campagne | 2023_2024 | 2023-2024 |
| destination | autoconsommation | Autoconsommation |
| destination | marche_local | Marché local |
| destination | marche_regional | Marché régional |
| destination | exportation | Exportation |
| destination | transformation | Transformation |
| destination | cooperative_vente | Vente via coopérative |
| cotisation_status | oui | Oui, à jour |
| cotisation_status | non | Non, en retard |
| cotisation_status | jamais | Jamais cotisé |
| equipements | houe | Houe |
| equipements | machette | Machette |
| equipements | pulverisateur | Pulvérisateur |
| equipements | motopompe | Motopompe |
| equipements | tracteur | Tracteur |
| equipements | semoir | Semoir |
| equipements | batteuse | Batteuse |
| equipements | sechoir | Séchoir |
| equipements | magasin | Magasin de stockage |
| besoins | formation | Formation technique |
| besoins | semences | Semences améliorées |
| besoins | engrais | Engrais |
| besoins | credit | Crédit agricole |
| besoins | equipement | Équipement |
| besoins | irrigation | Système d'irrigation |
| besoins | stockage | Stockage |
| besoins | commercialisation | Aide à la commercialisation |
| besoins | assurance | Assurance agricole |
| acces_credit | oui_formel | Oui (institution formelle) |
| acces_credit | oui_informel | Oui (tontine/informel) |
| acces_credit | non | Non |
| acces_credit | en_cours | Demande en cours |

---

## Sheet: settings

| form_title | form_id | version | style | default_language |
|------------|---------|---------|-------|-----------------|
| Recensement Producteurs FaîtiereHub | faitierehub_recensement_v1 | 2025052301 | theme-grid | French (fr) |

---

## Notes d'implémentation

### Logique conditionnelle
- `cultures_secondaires` : visible uniquement si `nombre_parcelles > 0`
- `cooperative_autre` : visible si `cooperative_id = 'autre'`
- `montant_cotisation` et `derniere_cotisation` : visibles si `cotisation_a_jour = 'oui'`
- `numero_piece` : visible si `type_piece` est renseigné

### Calculs automatiques
- `unique_id` : ID unique basé sur deviceid + timestamp
- `superficie_totale` : somme des superficies de toutes les parcelles
- `rendement_calcule` : production_kg / superficie_totale
- `revenu_estime` : production_kg × prix_vente_kg

### Validations
- Téléphone : regex 8-12 chiffres
- Âge : 15-100 ans
- Superficie : 0-500 ha
- Dates : ne peuvent pas être dans le futur
- Noms : minimum 2 caractères

### Offline
- Le formulaire fonctionne entièrement offline
- Les photos sont stockées localement
- La sync se fait au retour de connexion
- Les listes de choix sont embarquées (pas de pulldata)

### Mapping vers Supabase
| Champ Kobo | Table Supabase | Colonne |
|------------|---------------|---------|
| prenom | members | first_name |
| nom | members | last_name |
| telephone | members | phone |
| photo | members | photo_url |
| region | members | region |
| prefecture | members | prefecture |
| canton | members | canton |
| village | members | village |
| cooperative_id | members | cooperative_id |
| parcelle_nom | parcelles | name |
| superficie_ha | parcelles | superficie_ha |
| culture_principale | parcelles | culture_principale |
| gps_parcelle | parcelles | latitude, longitude |
| campagne | productions | campaign |
| production_kg | productions | quantite_kg |
| rendement_calcule | productions | rendement_kg_ha |
| montant_cotisation | cotisations | amount |
| derniere_cotisation | cotisations | paid_date |

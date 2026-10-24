# HarooLife — matrice REA de parité fonctionnelle (amorce)
Date : 2026-10-14. **Aucune session REA du site de référence n'a été exécutée pour cette amorce.** Les intitulés de colonnes sont un protocole, pas une preuve.

| Parcours | Référence Lagos Life | Preuve REA réelle | HarooLife existant | Manque à mesurer | Priorité | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| Arrivée invité et onboarding | Non observé par REA | Aucune | Monde monté via `app/haroolife/layout.tsx` | tester navigateur sans session, choix avatar initial | P0 | Non vérifié |
| Personnage et tenue | Non observé par REA | Aucune | six modèles Kenney et pagnes, préférences localStorage | création au premier démarrage, rechargement mobile | P0 | Implémentation existante à tester |
| Déplacement / carte / portes | Non observé par REA | Aucune | PlayCanvas/R3F, joystick, navigation, interactions | trajet maison depuis Lomé, portes sur téléphone | P0 | Implémentation existante à tester |
| Maison et intérieur | Non observé par REA | Aucune | intérieurs, résolution portes, sortie | ouvrir depuis trottoir avec le bon logement | P0 | Implémentation existante à tester |
| Besoins et activités | Non observé par REA | Aucune | six jauges, interactions | cohérence cadence et récupération | P1 | Implémentation existante à tester |
| Carrières / économie | Non observé par REA | Aucune | trois métiers, salaire journalier fictif | progression/promotion et tâche active | P1 | Écart connu |
| Messages temps réel | Non observé par REA | Aucune | client relais, salons/états sécurisés | test 2 utilisateurs simultanés | P1 | Implémentation existante à tester |
| Villes et trajets | Non observé par REA | Aucune | localités Lomé/Kara, carte, transport | vraie géographie avec attribution | P2 | À mesurer |
| Panneaux publicitaires | Non observé par REA | Aucune | panneaux et campagnes avec moteur d'exposition | tests visibilité, consentement et clic | P2 | Implémentation existante à tester |

## Validation
- Capturer la référence depuis le navigateur de l'utilisateur et joindre les Evidence IDs; ne pas publier de données de joueurs ni d'informations de compte.
- Rejouer le même parcours sur une preview HarooLife, écran Android ET desktop.
- Ouvrir des tickets sur les écarts prouvés. `inconnu` n'est jamais `conforme`.
- Exiger `npm run typecheck`, `npm run lint`, `npm run test:unit` et E2E avant tout merge.

## Références
- REA : https://github.com/morluto/rea
- REA navigateur CDP passif : https://github.com/morluto/rea/blob/main/docs/browser-observation.md
- Référence officielle à confirmer en contexte : https://lagoslife.app

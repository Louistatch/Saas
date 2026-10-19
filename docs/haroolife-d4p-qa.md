# HarooLife D4+ — matrice QA

Build de production locale, Chromium sous SwiftShader (rendu logiciel, sans GPU), mock Supabase local, relais Socket.IO local sur la vraie migration du chat (PGlite). Les durées et FPS SwiftShader ne préjugent pas d'un téléphone réel.

## Résultats

| Parcours | Desktop 1440 × 900 | Android émulé (Pixel 7, tactile) | Android réel (Motorola) |
|---|---|---|---|
| Entrer chez soi depuis la pelouse, joystick | ✅ | ✅ | non testé |
| Entrer / sortir ×5, retour devant la même porte (< 0,3 cellule) | ✅ | ✅ | non testé |
| « Rentrer chez moi » puis « Entrer » sans re-sélection | ✅ | ✅ | non testé |
| Rechargement à l'intérieur, puis sortie | ✅ | ✅ | non testé |
| Taxi, descente, retour, entrée (touche E sur PC) | ✅ | ✅ | non testé |
| 20 visites de la maison + 10 trajets Lomé ⇄ Kara, état GPU stable | ✅ | — | non testé |
| Discussion à deux, sans rafraîchir, isolation de canton | ✅ (desktop + Pixel 7 dans le même test) | ✅ | non testé |
| Coupure réseau : message en attente puis livré une fois, rattrapage | ✅ | ✅ | non testé |
| Rechargement : conversation conservée | ✅ | ✅ | non testé |
| Avatar distant interpolé dans la rue | ✅ | ✅ | non testé |
| Discussion via le réseau local (http, contexte non sécurisé) | — | ✅ (sonde Pixel 7 sur l'IP du conteneur) | non testé |
| Panneaux 3D : construction, lecture, « En savoir plus », statistiques | ✅ | ✅ | non testé |
| Campagne expirée masquée, coupure `enabled: false` | ✅ | ✅ | non testé |
| Console d'administration des panneaux | ✅ | — | — |
| Suite Lomé complète (19 scénarios × 2 profils) | 35 passés, 3 ignorés à dessein, 0 échec | | |
| Tests unitaires et SQL (PGlite) | 163 passés, 0 échec | | |

Le test « temps réel », la console et l'endurance ne tournent que sur desktop : le test temps réel ouvre lui-même un navigateur desktop et un navigateur Pixel 7.

## Mesures

| Mesure | Valeur | Conditions |
|---|---|---|
| Message saisi chez Ama → affiché chez Yawa | 785 ms | UI comprise, 2 pages SwiftShader à 2,7 FPS |
| Enregistrement + accusé du relais, p50 / p95 | 9 / 21 ms | relais local, PGlite |
| Doublons après coupure | 0 | 5 messages stockés |
| Avatar distant : images où il bouge | 21 / 23 | interpolation à maintenant − 220 ms |
| Panneaux : triangles propres (2 supports) | 76 | comptés exactement |
| Panneaux : appels de dessin ajoutés | +5 desktop, +3 mobile | même scène, avec / sans |
| Buffers GPU après 20 visites | stables (médiane 315 → 315) | +77 une seule fois, à la première visite |
| Textures GPU | 22 → 23 après 10 trajets | VRAM textures 8 Mo stable |
| Relais, mémoire résidente | 135 Mo (Supabase) ; 419 Mo (PGlite local) | sous tsx |

## Défauts trouvés et corrigés pendant la QA

- Entrée de maison refusée depuis la pelouse, et « Rentrer chez moi » refusé depuis la pelouse (voir `haroolife-d4p-diagnostic.md`).
- Panneau du domaine collé à la maison, qui masquait sa porte : déplacé.
- **Accès LAN cassé pour le Motorola** : la CSP de production (`upgrade-insecure-requests`) réécrivait chaque fichier en https quand la page est ouverte par l'IP du PC. La page ne se chargeait pas. Corrigé par une build LAN (`HAROOLIFE_LAN_HTTP=1`, jamais sur Vercel) et vérifié par une sonde.
- `crypto.randomUUID` absent en http sur le réseau local : repli sur `getRandomValues`, vérifié.
- Jeton expiré pendant une session : le client se reconnecte pour obtenir un jeton frais (test du relais).
- Mention « mode fictif, hors comptes réels » sous une discussion entre vrais comptes : corrigée.

## Points ouverts

- **Android réel : non testé.** Aucun téléphone n'est accessible depuis cette session.
- `lome-player` (Android émulé) a échoué une fois dans une suite complète : vitesse nulle avec le joystick à fond vers le haut. Ce cas n'a pas été reproduit en 4 exécutions isolées, dont 2 sous ralentissement CPU ×4, ni dans la suite finale. La cause n'est pas établie. Le test dépend de la position atteinte après 8 directions.
- Le chat n'est pas déployé : relais local seulement (voir le rapport).

## Protocole Motorola (à lancer par vous)

```bash
# Sur le PC, même Wi-Fi que le téléphone, avec le vrai Supabase dans .env.local
REALTIME=1 bash scripts/haroolife-lan.sh
# Sur le téléphone (Chrome) : http://<ip-du-pc>:3000/haroolife
```

1. Partie neuve : traverser la pelouse au joystick jusqu'à la maison, toucher « Entrer — Maison », puis « Sortir », trois fois.
2. « Mon foyer » → « Rentrer chez moi », puis « Entrer » à l'arrivée.
3. Taxi : monter, rouler, descendre, revenir, entrer.
4. Approcher le panneau de l'avenue : « Lire l'annonce ».
5. Si la migration du chat est appliquée sur une base de test : ouvrir Téléphone → Messages sur deux appareils connectés.
6. Mesures : `chrome://inspect` sur le PC, puis dans la console `__LOME_PERF_RESET()`, attendre 30 s, puis `copy(JSON.stringify(__LOME_PERF))`. Le relevé donne FPS, p95 en ms, appels de dessin et triangles.

# AgriAcademy J3 : spécification des écrans (à valider avant le code)

Référence : `docs/agriacademy-next-gen-prompt.md` §6 à §9 et §23 (« Provide a proposed visual
architecture and screen specifications for J3 before coding that redesign »). État des jalons :
`docs/agriacademy-next-gen-status.md`.

Maquettes haute fidélité (six planches, PC et Android, privées tant qu'elles ne sont pas
partagées) : https://claude.ai/artifact/3oA9fGYkWVofXqxReTcbyh

Rien de ce document n'est développé. Les valeurs affichées dans les maquettes (« 3 / 12 »,
« 82 / 100 », « Komlan », « coopérative Agbélé ») sont des exemples de présentation. Les seules
données réelles reprises sont les douze titres de leçons, la règle de validation (quiz réussi
et cas pratique déposé), les cinq questions par quiz, les trois tentatives par 24 h et les
frais de certification déjà affichés dans l'espace opérateur.

## 1. Ce que J3 change, et ce qu'il ne change pas

| Change | Ne change pas |
|---|---|
| Trois écrans apprenant : accueil, lecteur de leçon, laboratoire (cadre) | Les routes `/operator/training` et `/operator/training/[lessonId]` restent les entrées ; pas de second LMS |
| Navigation : barre latérale PC, barre d'onglets Android | Les règles serveur de J1 et J2 (`completion-policy.ts`, `assessment-policy.ts`) |
| Mise en page du contenu : diapositives, texte long enfin rendu (E4), place réservée aux captures (E3) | Le schéma de base ; aucune migration n'est nécessaire pour J3 |
| Mouvement : quatre moments, selon `.claude/skills/ui-motion/SKILL.md` | Le laboratoire 3D lui-même, qui est J5 ; J3 livre uniquement le cadre (en-tête, panneau de mission, bascule 2D/3D) |

## 2. Direction visuelle

Le sujet est une école professionnelle pour des opérateurs de terrain au Togo, pas un
tableau de bord d'entreprise. Le parti pris : une seule surface mémorable par écran, le reste
calme.

- **Couleurs** : sol `#F6F7F1`, encre `#10261A`, vert profond `#0D3D22` (navigation, blocs de
  parcours), vert vif `#1B7A46` (états en cours, liens), or `#C9A227` (acquis et action
  principale, jamais décoratif), trait `#DCE3DB`, texte secondaire `#6B7A70`.
  L'or signifie toujours « validé » ou « l'action à faire maintenant » ; une seule action or
  par écran.
- **Typographie** : Fraunces (titres, chiffres de progression, 500) et Manrope (tout le reste,
  400 à 700). Les deux sont servies par Google Fonts, déjà autorisé par la CSP pour les
  feuilles de style ; à vérifier au moment du code, sinon auto-hébergement via `next/font`.
  Corps 15 px sur PC, 15 px sur Android ; aucune ligne de texte au-delà de 70 caractères.
- **Surfaces** : rayon 20 px pour les blocs de page, 14 à 16 px pour les cartes, 999 px pour
  les boutons et pastilles. Pas d'ombre portée sauf sous la capture d'écran dans le lecteur.
- **Interdits** (prompt §6) : cartes empilées sans hiérarchie, écrans vides, illustrations
  enfantines, 3D décorative, animation permanente.

## 3. Architecture de navigation

```
/operator/training                      Accueil AgriAcademy (planche « PC · Accueil »)
/operator/training/[lessonId]           Lecteur : diapositives → quiz → cas pratique
/operator/training/[lessonId]/lab       Laboratoire (cadre J3, contenu J5)
/operator/training/results              Résultats et retours (existant : historique des tentatives, à regrouper)
/operator                               Dossier, certificat, frais (existant, inchangé)
```

PC : barre latérale fixe de 236 px, six entrées (Accueil, Mes cours, Laboratoire, Évaluations,
Résultats, Certificat). Les entrées « Mes cours » et « Évaluations » renvoient au lecteur ; il
n'y a qu'un module aujourd'hui, on n'invente pas de bibliothèque vide. « Certificat » renvoie
à `/operator`.

Android : barre d'onglets basse de quatre entrées (Accueil, Cours, Labo, Moi), 48 px de hauteur
de touche, jamais masquée par le clavier (elle disparaît quand un champ a le focus). Le lecteur
n'affiche pas la liste des leçons en permanence : elle s'ouvre dans un tiroir depuis le titre.

## 4. Écran 1 : accueil apprenant

Répond aux sept questions du prompt §7 dans l'ordre de lecture.

| Zone | Contenu | Source de données |
|---|---|---|
| En-tête | Prénom, titre « Votre parcours d'opérateur certifié », notifications, profil | `profiles.full_name` |
| Bloc parcours (or sur vert, la surface mémorable) | « n / 12 leçons validées », douze segments (or = validée, blanc = en cours, transparent = à faire), rappel de la règle, bouton « Reprendre : leçon k, titre » | `countCompletedLessons`, dernière leçon ouverte (`academy_profile_progress`) |
| Ce qui reste avant l'évaluation | Leçons, quiz, cas pratiques à déposer, cas pratiques corrigés | mêmes tables, calcul serveur |
| Prochaines activités (trois lignes au plus) | Leçon en cours, mission de laboratoire, cas pratique corrigé à lire | progress, submissions `reviewed` non lus |
| Compétences acquises | Objectifs des leçons validées, regroupés par leçon | `academy_lessons.objectives` (à vérifier : colonne ou JSON ; sinon J4) |

Vide : avant la première leçon, le bloc parcours affiche « 0 / 12 » et le bouton devient
« Commencer : leçon 1, Bienvenue dans le réseau ». Pas d'écran vide.

Android : même ordre, bloc parcours dans l'en-tête vert, cartes d'activité à pleine largeur,
section « Ce qui reste » réduite à une phrase.

## 5. Écran 2 : lecteur de leçon

Trois colonnes sur PC (300 / fluide / 280), une colonne sur Android.

**Colonne gauche, leçons.** Douze lignes, chacune avec un état et une sous-ligne :
« Validée », « En cours, quiz non tenté », « Quiz réussi, cas pratique à déposer », « Non
commencée ». La leçon courante est en vert profond. Aucune leçon n'est verrouillée (le prompt
parle de « locked » ; la décision J1 est l'accès libre, l'ordre reste conseillé).

**Centre, contenu.** Trois étapes visibles en haut sous forme de pastilles : Cours, Quiz, Cas
pratique ; la pastille active est teintée. Le cours est une suite de diapositives
(`academy_lesson_slides`) : texte à gauche, capture ou schéma à droite, pagination par points,
boutons « Précédente » et « Diapositive suivante ». Le texte long (`content_body`) est rendu
sous les diapositives dans une section repliable « Lire la leçon complète » (corrige E4). Les
captures manquantes affichent un cadre d'application stylisé avec la mention « Capture d'écran
réelle à produire » (E3, remplacé en J4), jamais une image générique.

Sous les diapositives, deux cartes : « Quiz, 5 questions » (bouton or « Commencer le quiz »,
actif dès l'ouverture de la leçon) et « Cas pratique » (désactivée avec « Disponible après le
quiz » tant que le quiz n'est pas réussi, conformément à `missingForLesson`). Les formulaires
existants `quiz-form.tsx` et `assignment-form.tsx` sont conservés et prennent la place du
contenu quand on les ouvre ; ils ne sont pas réécrits en J3.

**Colonne droite, repères.** Objectifs de la leçon avec pastille or pour ceux déjà couverts
par les diapositives lues, lien vers le laboratoire, lien « Écrire à l'équipe » (ouvre le
courriel existant, pas de messagerie nouvelle), rappel que la position est mémorisée.

Position mémorisée : index de diapositive par leçon, côté serveur dans
`academy_profile_progress` (colonne JSON existante à vérifier, sinon colonne `last_slide`
additive). « Reprendre » sur l'accueil ramène à cette diapositive.

Android : en-tête compact (retour, « Leçon 4 sur 12 », titre tronqué, points de pagination),
capture au-dessus du texte, deux boutons de navigation pleine largeur, puis les deux cartes
quiz et cas pratique réduites à une ligne chacune. Les diapositives suivantes se chargent une
par une (images en `loading="lazy"`, priorité à la courante).

## 6. Écran 3 : laboratoire (cadre)

J3 livre le cadre, J5 la première simulation (inscription d'un producteur, prompt §23).

- En-tête sombre : retour à la leçon, titre de la scène, badge « Données d'exercice, rien n'est
  enregistré », bascule « Vue 3D / Vue 2D ».
- Scène : sur PC, la 3D est proposée mais se charge seulement au clic (R3F et Rapier sont déjà
  dans les dépendances pour HarooLife, importés dynamiquement, jamais sur l'accueil ni le
  lecteur). Sur Android, la vue 2D est le défaut et la 3D une option annoncée avec son poids.
  La vue 2D est une liste des mêmes objets (ordinateur, registre, téléphone, archives) avec le
  même panneau de mission : elle est l'alternative accessible exigée par le prompt §13, pas un
  mode dégradé.
- Panneau de mission (360 px à droite sur PC, sous la scène sur Android) : numéro de mission,
  consigne, étapes avec états, indice, bouton principal, retour à la leçon, et la phrase
  « La mission réussie ne valide pas la leçon. Seuls le quiz et le cas pratique comptent. »
  Cette phrase est une règle : le laboratoire n'écrit jamais dans la progression.
- Points chauds : étiquettes numérotées, accessibles au clavier (Tab) et au lecteur d'écran
  (`aria-label` décrivant l'objet et l'action).

## 7. Mouvement

Quatre moments et rien d'autre, conformément au skill `ui-motion` (tw-animate-css, aucune
bibliothèque JS, `motion-reduce` respecté) :

1. Arrivée sur l'accueil : le bloc parcours apparaît d'abord, les segments se remplissent
   jusqu'à la leçon en cours (`route-draw`, 350 ms au total), puis les cartes suivent en 60 ms
   d'écart.
2. Changement de diapositive : glissement latéral de 200 ms dans le sens de la navigation.
3. Réponse à une action : quiz corrigé (la bonne réponse se teinte, `zoom-in-95`), cas pratique
   déposé (la carte passe à l'état « Déposé » sans sauter), leçon validée (la coche or se pose
   dans la liste, `zoom-in-50`).
4. Chargement de la 3D : barre indéterminée dans le cadre de la scène, texte « Chargement de
   la scène, 1,8 Mo » ; jamais d'écran noir.

## 8. Budgets et vérification

| Mesure | Budget | Comment |
|---|---|---|
| Accueil et lecteur, JavaScript transféré | ≤ 180 ko gzip, sans Three.js | `next build` et analyse des chunks |
| Première diapositive visible, Android émulé 4G lente | ≤ 2,5 s | Playwright, `test:e2e:mobile`, throttling CPU 4× |
| Scène 3D | ≤ 2 Mo, 30 i/s minimum sur Android émulé, 60 sur PC | mesure J5 ; la valeur « 1,8 Mo, 60 i/s » de la maquette est une cible, pas un résultat |
| Accessibilité | contraste AA, focus visible, navigation clavier complète du lecteur et des points chauds | contrôle manuel et axe dans Playwright |
| Motorola réel | aucune affirmation sans mesure sur l'appareil | mesure à faire par l'utilisateur (prompt §16) |

Tests J3 : captures Playwright 1440×900 et 390×844 des trois écrans ; parcours « reprendre →
diapositive mémorisée » ; quiz ouvert depuis le lecteur ; cas pratique désactivé tant que le
quiz n'est pas réussi ; aucune requête vers les chunks Three.js sur l'accueil et le lecteur.

## 9. Ordre de réalisation proposé

1. Accueil (PC et Android), avec les données réelles de progression.
2. Lecteur : diapositives, texte long, position mémorisée, intégration des formulaires existants.
3. Cadre du laboratoire avec vue 2D seule ; la 3D attend J5.
4. Mouvement, puis captures et tests, puis PR.

Chaque étape est une PR séparée vers `main`, fusionnée uniquement sur accord explicite.

## 10. Décisions à prendre par l'utilisateur avant le code

- Valider la direction visuelle (couleurs, Fraunces + Manrope, or réservé aux acquis).
- Confirmer l'accès libre aux douze leçons (pas de verrouillage).
- Confirmer que « Écrire à l'équipe » reste un courriel, sans messagerie intégrée en J3.
- Choisir la scène du laboratoire J5 : bureau de coopérative (maquette) ou terrain de parcelle.

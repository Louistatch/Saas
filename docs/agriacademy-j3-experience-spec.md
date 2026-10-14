# AgriAcademy J3 : expérience d'apprentissage, six écrans (spécification et correspondance)

Cadrage : `AGRIACADEMY_J3_J4_PROMPT_CLAUDE.md` (14 octobre 2026), en continuité de
`docs/agriacademy-j3-spec.md` (direction visuelle validée : vert institutionnel, or réservé aux
acquis et à l'action principale, Fraunces + Manrope) et de `docs/agriacademy-next-gen-status.md`.
Benchmark d'organisation : l'architecture pédagogique visible sur WorldQuant University, sans
reproduction de ses marques, textes, visuels ou code.

## 1. Preuves de départ (passe A)

- `main` synchronisé : PR #37 (progression, fin de formation) et #38 (moteur d'évaluation,
  correction) fusionnées ; règles serveur dans `lib/academy/completion-policy.ts` et
  `assessment-policy.ts`. Aucune règle de validation n'est modifiée par J3.
- Inventaire réel (lecture seule en production, repris dans `e2e/fixtures/academy-content.json`
  pour la pile locale) : 1 module publié, 12 leçons, 60 diapositives (5 par leçon :
  objectif, concept, capture d'écran, cas pratique, résumé), 12 quiz, 12 cas pratiques,
  12 médias tous `pending_capture`, `content_body` de 1 000 à 1 623 caractères par leçon,
  structuré par titres en capitales, sections numérotées, listes « - » et cases « □ ».
- Constat sur l'interface servie avant J3 (captures « avant » dans la PR) : une page par leçon
  empilant cinq cartes identiques, un badge de type sur chacune, un rectangle « Capture
  d'écran » textuel, le quiz et le dépôt à la suite ; `max-w-2xl` partout ; bulle
  « Messagerie » sur le contenu en 390 px ; `content_body` jamais affiché.

## 2. Carte du site et flux

```
/operator/training                      Écran 1  Mes formations
/operator/training/cursus               Écran 2  Vue d'ensemble du cursus
/operator/training/[lessonId]           Écran 3+4  Lecteur, espace Cours (lecture)
/operator/training/[lessonId]/lab       Écran 3  Espace Exercice (laboratoire 2D, J5 pour la 3D)
/operator/training/[lessonId]/evaluation Écran 5  Salle d'évaluation (quiz, cas pratique)
/operator/training/resume, /lab         reprise serveur (dernière leçon consultée non validée)
/admin/partners/training(/corrections)  Écran 6  Suivi instructeur (existant, raffiné en J6)
```

Flux principal : Mes formations → « Reprendre » (1 action) → Cours → Évaluation (quiz, puis
cas pratique quand le quiz est réussi) → retour au cours ou leçon suivante. Chaque espace est
une URL : le bouton Retour du téléphone fonctionne, rien n'est perdu (toute validation est
serveur).

## 3. Les six écrans (wireframes)

### Écran 1 : Mes formations (`page.tsx`)

```
PC                                                  Android 390
┌──────────┬──────────────────────────────────┐    ┌──────────────────────┐
│ Mes      │ Bonjour Prénom                   │    │ Bonjour Prénom       │
│ formations│ MES FORMATIONS                  │    │ MES FORMATIONS       │
│ Vue d'ens.│ ┌───────────────┐ ┌──────────┐  │    │ ┌──────────────────┐ │
│ Mes cours │ │ Opérateur …   │ │Ce qui    │  │    │ │ 3 / 12 validées  │ │
│ Labo      │ │ 3 / 12 ▬▬▬▭▭▭ │ │reste     │  │    │ │ ▬▬▬▭▭▭▭▭▭▭▭▭    │ │
│ Résultats │ │ [Reprendre 4] │ │9 9 9 1/3 │  │    │ │ [Reprendre 4]    │ │
│ Certificat│ └───────────────┘ └──────────┘  │    │ └──────────────────┘ │
│           │ Vue d'ensemble du cursus ›       │    │ Prochaines activités │
│           │ Prochaines activités │ Compét.   │    │ ▢ Leçon 4 (en cours) │
│           │ ▢ Leçon 4   ▢ Cas 5 à déposer   │    │ ▢ Cas 5 à déposer    │
│           │ ▢ Cas 3 corrigé 82/100           │    │ ▢ Cas 3 corrigé      │
│           │ Les 12 leçons (état réel)        │    │ Compétences, 12 leçons│
└──────────┴──────────────────────────────────┘    │ [Accueil Cours Labo Moi]│
```

Données : `countCompletedLessons` (segments), `last_viewed_at` (reprise), tentatives et dépôts
(scores, « à déposer », « corrigé »), modules publiés (autres formations, sans lien tant
qu'elles n'ont pas de parcours). Aucune date ni pourcentage inventé. États : 0 / 12 →
« Commencer : leçon 1 » ; tout validé → « Toutes les leçons sont validées », dossier.

### Écran 2 : Vue d'ensemble (`cursus/page.tsx`)

Titre, description du module, « durée estimée » étiquetée, trois blocs (débouché, prérequis,
après la formation), programme des 12 leçons avec objectif et état réel, évaluations requises
(compte réel des quiz et cas pratiques `is_required`), critères de passage à l'évaluation
pratique. Une seule action : reprendre.

### Écran 3 et 4 : Lecteur, espace Cours (`[lessonId]/page.tsx`)

```
PC : sommaire 300 px │ lecture (fil d'Ariane, titre, onglets Cours·Exercice·Évaluation) │ repères 280 px
Android : [‹] Leçon 4 sur 12 ▾ (tiroir sommaire)  →  lecture  →  barre basse Cours·Exercice·Évaluation
```

Ordre de lecture (`lib/academy/lesson-reading.ts`) : objectif (une fois : diapositive
« objective » ou section « Objectifs » du texte, jamais les deux) → points clés (diapositives
concept, procédure, attention) → démonstration (capture réelle si `status = ready`, sinon bloc
« Média à fournir » avec l'écran concerné, la consigne d'auteur « Utiliser une capture… »
n'est jamais montrée) → leçon complète (`content_body` rendu en h2, p, ul, ol, cases, par
`lib/academy/lesson-text.ts`, sans HTML injecté) → « À retenir » → action « Passer à
l'évaluation » → leçon précédente / suivante. Aucun badge de type, aucun quiz sur cette page.

### Écran 5 : Salle d'évaluation (`[lessonId]/evaluation/page.tsx`)

Page étroite (820 px), sans sommaire, bulle de support masquée (`.academy-focus`). Règles
affichées à partir des données du quiz (nombre de questions, seuil, tentatives utilisées sur
le maximum par 24 h). Quiz J2 inchangé (une question à la fois, « Question n sur 5 »,
confirmation, résultats et explications, historique, limite serveur). Cas pratique dans sa
propre section : énoncé (diapositive « case »), consignes et barème, dépôt, état de
correction, retour, reprise si demandée ; fermé tant que le quiz n'est pas réussi. Lien
« Revenir au cours : ce qui est validé reste validé ».

### Écran 6 : Suivi instructeur

Existant (`/admin/partners/training`, `/corrections`) : progrès, tentatives, dépôts,
correction. Raffinements (fiche candidat, alertes) au jalon J6, pas au prix de J3.

## 4. Correspondance ancien → nouveau

| Ancien (main avant J3) | Nouveau |
|---|---|
| `app/operator/training/page.tsx` : carte « Leçons » avec badges À commencer / En cours / Terminée | Écran 1 : `RouteCard` (segments), « Ce qui reste », activités, compétences, les 12 leçons avec `STATE_LABEL` |
| (absent) | Écran 2 : `cursus/page.tsx` |
| `[lessonId]/page.tsx` : 5 `Card` par diapositive + `Badge` de type + rectangle « Capture d'écran » | `LessonReadingView` : objectif, points clés, démonstration ou « Média à fournir », `LessonText`, à retenir |
| `content_body` non rendu | `lib/academy/lesson-text.ts` → `components/academy/lesson-text.tsx` |
| Quiz et dépôt sous les cartes | Écran 5 : `evaluation/page.tsx`, `QuizForm` et `AssignmentForm` inchangés |
| Lien « Retour à la formation » | Fil d'Ariane `LessonCrumbs` + sommaire `LessonList` (colonne, tiroir) |
| (absent) | `LessonTabs` : trois routes Cours / Exercice / Évaluation, barre basse sur téléphone |
| `SupportButton` sur le contenu en 390 px | relevé au-dessus de la barre basse, masqué en évaluation (CSS `globals.css`) |
| `max-w-2xl` partout | gabarits par écran : 1100 px (accueil), 960 px (cursus), 3 colonnes (lecture), 820 px (évaluation) |
| `components/academy/lesson-player.tsx` (diapositives une par une, J3 première version) | supprimé : lecture continue, plus lisible sur téléphone |

## 5. États

- Vide : aucune progression → « 0 / 12 », « Commencer : leçon 1 » ; compétences → invitation.
- Chargement : pages serveur, pas de squelette ; formulaires J2 avec bouton occupé.
- Erreur : module absent → « Formation indisponible » ; quiz refusé (limite) → message serveur
  avec l'heure de reprise ; réseau → « Vérifiez votre internet » (formulaires J2).
- Média manquant → bloc « Média à fournir » (apprenant) ; `academy_media_assets.status =
  pending_capture` (back-office, J4/J6).

## 6. Jetons et composants réutilisables

Jetons `.academy` dans `app/globals.css` (sol, encre, émeraude, vert, or, trait, brume,
sable). Composants : `AcademyNav`, `RouteCard`, `LessonList`, `LessonTabs`, `LessonCrumbs`,
`LessonReadingView`, `LessonText`, `LabFrame`. Mouvement : entrée orchestrée de l'accueil,
segments qui se révèlent, coche posée ; tout sous `motion-safe`.

## 7. Auto-critique face au benchmark

- Organisation : Mes formations → Vue d'ensemble → Leçon → Cours / Exercice / Évaluation →
  Résultats (accueil) reprend la logique universitaire ; manque encore une page « Résultats »
  dédiée avec historique complet des tentatives (aujourd'hui sur l'accueil et dans la salle
  d'évaluation) et la prise de notes (hors J3).
- Mobile : contrairement à un site PC compressé, la lecture est en une colonne, le sommaire en
  tiroir, les trois espaces sur une barre d'action basse de 48 px, aucun défilement horizontal
  à 320 px (test), aucune bulle sur les réponses.
- Risques : les captures authentiques manquent (J4) ; le laboratoire reste un cadre 2D (J5) ;
  les tests Playwright tournent sur mock, pas sur la base réelle.

## 8. Fichiers concernés

`app/operator/training/{page,layout}.tsx`, `cursus/page.tsx`, `resume/page.tsx`, `lab/page.tsx`,
`[lessonId]/{page,lesson-opened,quiz-form,assignment-form}.tsx`, `[lessonId]/lab/page.tsx`,
`[lessonId]/evaluation/page.tsx`, `components/academy/*`, `lib/academy/{learner-view,
learner-page,lesson-text,lesson-reading,lab-missions}.ts`, `tests/academy-*.test.ts`,
`e2e/academy.spec.ts`, `e2e/academy-playwright.config.ts`, `.github/workflows/academy-browser.yml`,
`e2e/fixtures/{mock-supabase.mjs,academy-content.json}`, `app/globals.css`,
`components/support/support-button.tsx`.

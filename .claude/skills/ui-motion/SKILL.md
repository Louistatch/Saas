---
name: ui-motion
description: Animer une interface FaîtiereHub (Next.js 16, Tailwind 4, tw-animate-css, aucune bibliothèque d'animation JS) — entrées orchestrées à l'ouverture d'une page, progression d'un parcours en étapes (candidature → formation → certification, cotisations, commandes), changements d'état après une action (validé, envoyé, payé), chargements et squelettes, toasts, tiroirs — en respectant prefers-reduced-motion. À utiliser dès qu'on demande d'« animer », de « rendre vivant », de « donner du mouvement », une « transition », un « effet », une « progression », ou qu'on redessine un écran du produit (espace opérateur, dashboard, Haroo, pages de vérification) même sans parler d'animation.
---

# Mouvement dans l'interface FaîtiereHub

Le mouvement sert à dire **ce qui vient de changer** et **où en est la personne**. Sur un
téléphone d'entrée de gamme, au soleil, avec une connexion lente, chaque animation coûte de la
batterie et de l'attention : on n'anime que ce qui porte une information. Pas de parallaxe,
pas de survol décoratif, pas d'apparition en cascade de chaque section.

## Ce dont on dispose (et rien d'autre)

- **tw-animate-css** est importé dans `app/globals.css` : classes `animate-in`, `animate-out`,
  `fade-in`, `fade-out`, `zoom-in-95`, `slide-in-from-bottom-2`, `slide-in-from-left-4`…
  avec `duration-300`, `delay-150`, `ease-out`, `fill-mode-both`. Les composants `ui/`
  (Dialog, Sheet, Popover) les utilisent déjà : réutiliser ces classes garde une seule
  grammaire de mouvement dans le produit.
- **Tailwind 4** : `transition-[property]`, `duration-*`, `ease-*`, `motion-safe:` et
  `motion-reduce:` (variantes de `prefers-reduced-motion`).
- **Keyframes maison** dans `app/globals.css` (`@keyframes`), uniquement quand tw-animate-css
  ne sait pas le faire : tracé d'une ligne de progression, pastille qui « respire », barre
  indéterminée. Les nommer par leur rôle (`route-draw`, `pulse-soft`), pas par leur forme.
- **Pas de framer-motion, GSAP, react-spring, lottie** : pas de JavaScript qui tourne à chaque
  image, pas de dépendance de 30 ko pour une page de 10 ko.

## Quatre familles de mouvement, et quand les employer

1. **Arrivée sur une page** : un seul moment orchestré, pas une pluie d'effets. Le bloc qui
   répond à la question de la personne (« où j'en suis ? », « combien ? ») apparaît d'abord,
   le reste suit dans l'ordre de lecture, avec des délais courts (60 à 90 ms entre éléments,
   350 ms maximum au total). Au-delà, la page paraît lente, pas vivante.
2. **Progression d'un parcours** : les étapes faites, l'étape en cours, les suivantes. La ligne
   qui relie les étapes se trace jusqu'à l'étape en cours (`route-draw`), la coche de l'étape
   faite se pose (`zoom-in-50`), l'étape en cours respire doucement (`pulse-soft`, 2,4 s,
   amplitude faible). Les étapes à venir ne bougent pas : elles n'ont rien à dire encore.
3. **Réponse à une action** : ce qui change après un clic bouge, le reste non. Le bouton
   passe en état occupé sans sauter (largeur fixe, spinner à la place du texte), le résultat
   apparaît là où le regard est déjà (`animate-in fade-in zoom-in-95 duration-200`), une
   erreur arrive sans secousse (pas de « shake ») et reste lisible.
4. **Attente** : squelette ou spinner selon la durée attendue. Moins d'une seconde : rien.
   Jusqu'à quelques secondes : spinner dans le bouton ou la zone concernée. Plus long
   (paiement, serveur qui démarre) : un message qui évolue dans le temps, comme la page de
   connexion le fait déjà (« Authentification… », puis « Le serveur démarre… »).

## Règles de métier

- **Mouvement réduit** : tout ce qui bouge sans action de la personne passe sous `motion-safe:`
  ou est annulé par `@media (prefers-reduced-motion: reduce)`. L'information doit rester
  complète sans l'animation : l'étape en cours se distingue aussi par sa couleur et son texte,
  la ligne de progression est dessinée d'emblée à sa longueur finale.
- **Durées** : 150 à 200 ms pour une réponse à une action, 250 à 400 ms pour une entrée, jamais
  plus de 600 ms sauf une ligne qui se trace (800 ms). Courbe `ease-out` pour ce qui arrive,
  `ease-in` pour ce qui part.
- **Propriétés** : n'animer que `opacity` et `transform` (et `stroke-dashoffset`,
  `background-size` pour une ligne) ; jamais `height`, `width`, `top`, `box-shadow` : ils
  forcent une mise en page à chaque image et saccadent sur un téléphone à 60 €.
- **Rendu serveur** : les classes d'animation sont inoffensives côté serveur ; un composant qui
  attend une donnée pour animer (`useEffect`) doit afficher l'état final par défaut, pas le vide.
- **Accessibilité** : une animation ne remplace jamais un texte (« Étape 2 sur 5 », « Envoyé »),
  `aria-live="polite"` sur la zone qui annonce un résultat, pas de clignotement (> 3 Hz).
- **Tests Playwright** : les tests lisent des rôles et des textes, jamais une classe
  d'animation ; une assertion qui dépend d'une durée est une source de « flaky ».

## Recette : orchestrer une entrée de page

```tsx
// Chaque bloc reçoit son rang ; les délais restent dans le CSS, pas dans un useEffect.
const enter = (rank: number) =>
  `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out` +
  ` motion-safe:[animation-delay:${rank * 70}ms]`
<section className={enter(0)}>…</section>
<ol className={enter(1)}>…</ol>
```

## Recette : ligne d'un parcours qui se trace

```css
/* app/globals.css — la ligne mesure 100 % mais ne se peint que jusqu'à --route-progress. */
@keyframes route-draw {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.route-line { transform-origin: top; animation: route-draw 800ms ease-out 200ms both; }
@media (prefers-reduced-motion: reduce) { .route-line { animation: none; } }
```

```tsx
<span className="route-line" style={{ height: `${progress}%` }} aria-hidden />
```

La hauteur finale vient d'une donnée (étape en cours / nombre d'étapes) ; l'animation ne fait
que la révéler. Si la donnée change (étape validée), la ligne se prolonge : `transition-[height]`
n'est pas acceptable (mise en page), on rejoue l'animation avec une `key` React.

## Avant de livrer

- Regarder l'écran avec `prefers-reduced-motion: reduce` émulé (Playwright :
  `page.emulateMedia({ reducedMotion: 'reduce' })`) : tout doit être là, immobile.
- Compter : plus de trois éléments qui bougent à l'ouverture, c'est trop.
- Chaque mouvement répond à « qu'est-ce que ça apprend à la personne ? ». Sans réponse, retirer.

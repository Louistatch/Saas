# Inscription Haroo indépendante

L’inscription publique Haroo suit le même principe que l’inscription Opérateur :
un compte personnel peut être créé sans appartenir à une organisation.

- Ouvrier, acheteur, agronome, technicien et conseiller : aucun choix de faîtière
  dans le formulaire initial, aucune dépendance au chargement de leur annuaire.
- Le schéma serveur accepte une affiliation absente, nulle ou vide. Un ancien
  client qui fournit un identifiant doit toujours désigner une faîtière valide.
- Après inscription, le suivi par une faîtière reste facultatif dans le profil.
  Un professionnel non encore validé peut retirer ce choix et rester indépendant.
  Ce champ ne modifie ni `profiles.role`, ni `profiles.cooperative_id`.
- L’instruction demande le diplôme/attestation et la pièce d’identité ; la photo
  reste recommandée. L’absence d’affiliation ne dégrade plus le classement du
  dossier et n’apparaît plus parmi les compléments à fournir.
- Les dossiers indépendants sont instruits par l’administration FaîtiereHub.
  Un opérateur conserve son périmètre de mandat pour les dossiers suivis par une
  faîtière. L’inscription ne délivre ni badge de qualification ni carte validée.
- Le parcours distinct d’inscription assistée par un opérateur mandaté conserve
  ses contrôles de mandat ; aucune nouvelle permission globale n’est accordée.

Le backend AgriTogo accepte déjà `faitiere_id` absent et crée la couche Haroo
séparément de l’organisation. La colonne Supabase correspondante a été vérifiée
nullable. Aucune migration ni modification de données existantes n’est requise.

Vérification : tests Zod pour chaque métier, dossiers indépendants complets et
incomplets, émission de carte après validation administrative, refus de validation
hors mandat. Les tests navigateur utilisent le vrai proxy Next et un backend
AgriTogo local simulé : aucune création de compte réel ni émission d’e-mail.

```bash
npm run test:unit
npm run test:hardening
PW_CHROMIUM_PATH=/usr/bin/chromium npx playwright test --config e2e/haroo-signup.config.ts
```

Le dernier test nécessite un build local avec les variables publiques de la
fixture définies par `e2e/seo.config.ts`, ainsi que `FAITIERE_LOCAL_VERIFY=1`.

/**
 * Enrichissement éditorial des 12 leçons du parcours opérateur (J4). Pour chaque leçon :
 * un exemple de terrain (coopérative togolaise, données fictives), trois questions
 * d'auto-vérification (non notées, réponses révélées à la demande) et ce qu'il faut observer
 * sur la capture du produit. Versionné avec le code, relu en PR : aucune écriture en base,
 * aucun barème modifié. Les quiz et cas pratiques (notés) restent ceux de la base.
 */

export interface SelfCheck {
  question: string
  answer: string
}

export interface LessonEnrichment {
  /** order_index de la leçon dans le module opérateur. */
  lesson: number
  /** Ce que la personne doit savoir faire en sortant (reformulé en verbe d'action). */
  outcome: string
  example: { title: string; body: string }
  selfCheck: SelfCheck[]
  /** Ce qu'il faut regarder sur la capture du produit (démonstration). */
  demoFocus: string
}

export const LESSON_ENRICHMENT: LessonEnrichment[] = [
  {
    lesson: 1,
    outcome: 'Expliquer FaîtiereHub et le rôle de l’opérateur à une organisation en deux minutes.',
    example: {
      title: 'Coopérative Agbélé (Kloto)',
      body: 'Le président de la coopérative Agbélé, 86 membres producteurs de café, demande « combien coûte le logiciel par mois ». La bonne réponse de l’opérateur : le cœur de FaîtiereHub est gratuit pour l’organisation ; ce qui se paie, ce sont des services réels (nettoyage du registre, cartes imprimées, rapport pour un bailleur), facturés par l’opérateur selon un périmètre clair. L’opérateur n’est pas le patron de la coopérative : il intervient par mandat, et la coopérative peut en changer.',
    },
    selfCheck: [
      {
        question:
          'Une personne est admin d’une coopérative et agronome Haroo. Peut-elle aussi devenir opérateur avec le même compte ?',
        answer:
          'Oui : un seul compte peut cumuler plusieurs capacités. Chaque capacité garde ses propres droits ; être opérateur ne donne aucun accès aux données d’une organisation sans mandat.',
      },
      {
        question: 'Qu’est-ce qui rémunère un opérateur ?',
        answer:
          'Les services réellement fournis aux organisations. Aucune commission pour recruter d’autres opérateurs : FaîtiereHub n’est pas un système MLM.',
      },
      {
        question: 'Où se place l’opérateur dans la hiérarchie faîtière, union, coopérative ?',
        answer:
          'Nulle part dans cette hiérarchie : il est transversal, prestataire par mandat de service, jamais au-dessus d’une faîtière ou d’une union.',
      },
    ],
    demoFocus:
      'Sur l’espace Opérateur : le statut du dossier (candidat, en formation, certifié), le parcours de certification en étapes et les actions disponibles. Rien ici ne donne accès à une coopérative.',
  },
  {
    lesson: 2,
    outcome:
      'Intervenir dans une organisation sans en prendre la propriété ni casser sa gouvernance.',
    example: {
      title: 'Union des producteurs de soja de Tchamba',
      body: 'L’union demande d’exporter tous les numéros de téléphone de ses 1 240 membres « pour un partenaire qui vend des intrants ». Avant d’agir, l’opérateur vérifie deux choses : le mandat autorise-t-il l’export (périmètre members.read ne suffit pas à transmettre à un tiers) et la finalité a-t-elle été expliquée aux membres ? Sans ces deux réponses, l’export attend une décision écrite du conseil de l’union.',
    },
    selfCheck: [
      {
        question:
          'À qui appartiennent les données d’une coopérative accompagnée par un opérateur ?',
        answer:
          'À la coopérative. L’opérateur reçoit un accès délégué, limité aux opérations du mandat, et révocable.',
      },
      {
        question: 'Quels périmètres un mandat peut-il autoriser ? Citez-en quatre.',
        answer:
          'Par exemple members.manage, cards.print, kobo.manage, reports.generate (ou imports.manage, analytics.read, projects.manage, support.manage).',
      },
      {
        question:
          'Que doit-il rester à une organisation quand elle remplace l’opérateur A par l’opérateur B ?',
        answer:
          'Tout : membres, cartes, cotisations, parcelles, historique, documents et QR. Un changement d’opérateur ne retire aucune donnée.',
      },
    ],
    demoFocus:
      'Sur le tableau de bord : le sélecteur d’organisation en haut. Avant toute action, lire sur quelle structure (faîtière, union, coopérative) elle va s’appliquer.',
  },
  {
    lesson: 3,
    outcome:
      'Transformer une première rencontre en diagnostic structuré et en plan d’onboarding daté.',
    example: {
      title: 'Coopérative maraîchère de Dapaong',
      body: 'Trois fichiers Excel contradictoires (2022, 2024, « liste finale ») et un cahier papier tenu par le trésorier. Ordre de traitement conseillé : 1) le cahier, source la plus récente et validée par le bureau ; 2) la « liste finale » pour les téléphones ; 3) les fichiers anciens seulement pour retrouver des membres absents ailleurs. Résultat attendu avant tout import : un seul fichier, une ligne par personne, une colonne « source ».',
    },
    selfCheck: [
      {
        question: 'Que vérifier avant toute configuration d’une organisation ?',
        answer:
          'Le niveau (faîtière, union, coopérative), le nom officiel et les responsables, la zone, les sources de données existantes, le nombre et la qualité des membres, les besoins prioritaires, l’administrateur côté organisation, ce que l’opérateur est autorisé à faire, le résultat attendu et sa date.',
      },
      {
        question: 'Quel est le livrable minimum d’un onboarding ?',
        answer:
          'Organisation configurée, administrateur identifié, données essentielles nettoyées, premier lot de membres validé, plan de travail court.',
      },
      {
        question: 'Pourquoi importer d’abord un petit lot ?',
        answer:
          'Pour contrôler le résultat (colonnes, doublons, localités) avant d’engager la base complète ; une erreur sur 20 lignes se corrige, sur 1 200 elle se subit.',
      },
    ],
    demoFocus:
      'Sur la gestion des organisations : nom, niveau, rattachement à l’union ou à la faîtière, et le contexte à lire avant de modifier des données.',
  },
  {
    lesson: 4,
    outcome:
      'Créer, importer et corriger des membres sans doublon ni incohérence, en gardant une trace.',
    example: {
      title: 'Coopérative Agbélé, import de 120 membres',
      body: 'Le fichier reçu contient 120 lignes : 7 doublons (même téléphone, orthographe différente du nom), 11 téléphones à 7 chiffres, 3 localités écrites de quatre façons. Protocole : sauvegarder le fichier source, normaliser les localités avec le bureau, compléter les téléphones auprès des personnes (jamais inventer), fusionner les doublons en gardant l’identifiant le plus ancien, importer 20 lignes, contrôler, puis le reste. Livrer un compte avant/après : 120 reçues, 113 importées, 7 fusionnées, 0 inventée.',
    },
    selfCheck: [
      {
        question: 'Deux membres portent le même nom et le même prénom. Est-ce un doublon ?',
        answer:
          'Pas forcément : il faut plusieurs indices (téléphone, localité, identifiant interne). Une similitude de nom seule ne suffit pas.',
      },
      {
        question: 'Un bailleur demande un champ « bénéficiaire du projet X ». Où le stocker ?',
        answer:
          'Séparément des données d’identité permanentes : les données de projet sont temporaires et ne doivent pas se mélanger à l’identité durable du membre.',
      },
      {
        question: 'Quels contrôles avant de livrer une base nettoyée ?',
        answer:
          'Vérifier un échantillon, compter les lignes avant/après, expliquer les doublons supprimés, documenter les champs transformés, faire valider par l’organisation.',
      },
    ],
    demoFocus:
      'Sur la page Membres : la recherche, les filtres, le bouton de création, l’import et les actions sur une fiche. Repérer où apparaît un doublon de téléphone au moment de la saisie.',
  },
  {
    lesson: 5,
    outcome:
      'Distinguer identité numérique (carte, QR) et support physique, et contrôler avant impression.',
    example: {
      title: 'Coopérative de riz de l’Oti',
      body: 'Le secrétaire affirme qu’« un membre n’existe pas tant que sa carte PVC n’est pas imprimée ». Faux : l’identité numérique (carte et QR vérifiables) existe dès l’enregistrement validé ; la carte physique est un service distinct, prévu à 2 000 FCFA (500 pour l’organisation, 1 500 dans le flux commercial de l’opérateur). Avant d’imprimer : identité validée, orthographe vérifiée, bonne organisation, pas de doublon, statut de commande confirmé quand le flux sera actif.',
    },
    selfCheck: [
      {
        question: 'Pourquoi la carte numérique ne doit-elle pas dépendre de l’impression ?',
        answer:
          'Parce que l’identification et la vérification (QR) servent aux cotisations, rapports et projets même sans PVC ; l’impression est un service séparé et optionnel.',
      },
      {
        question: 'Peut-on corriger un numéro de carte à la main ?',
        answer:
          'Jamais : les identifiants sont générés par le système. Modifier ou réinventer un numéro casse la vérification publique.',
      },
      {
        question: 'Que promettre sur l’automatisation impression/revenus ?',
        answer:
          'Rien qui ne soit activé : le flux complet est un module en déploiement. Dire « disponible », « pilote » ou « prévu », jamais « automatique » avant activation.',
      },
    ],
    demoFocus:
      'Sur la page Cartes : génération, statut et aperçu d’une carte. Puis, sur la page de vérification publique, ce que voit une personne qui scanne le QR.',
  },
  {
    lesson: 6,
    outcome: 'Organiser une collecte KoboToolbox propre, testée, importable dans FaîtiereHub.',
    example: {
      title: 'Collecte de 300 producteurs de maïs à Sotouboua',
      body: 'Zone à faible connexion. Le formulaire part de la décision à prendre (qui reçoit des semences ?), pas d’une liste de 60 questions : identification minimale, localité codifiée, superficie, contrainte sur le téléphone (8 chiffres). Test pilote avec 2 enquêteurs sur 15 producteurs, mode hors ligne, synchronisation le soir au chef-lieu, contrôle des doublons avant import. Import dans FaîtiereHub par lot de 25, après sauvegarde du fichier source.',
    },
    selfCheck: [
      {
        question: 'Par quoi commence la conception d’un formulaire Kobo ?',
        answer:
          'Par la décision à prendre avec les données, pas par la liste des questions : chaque variable doit avoir une utilité.',
      },
      {
        question: 'Que faire avant d’importer un export Kobo dans FaîtiereHub ?',
        answer:
          'Sauvegarder la source, vérifier la correspondance des colonnes et les types, nettoyer les doublons, importer un petit lot et contrôler avant le lot complet.',
      },
      {
        question: 'Quelle erreur ne jamais commettre lors d’un nettoyage ?',
        answer: 'Corriger silencieusement des centaines de valeurs sans trace du traitement.',
      },
    ],
    demoFocus:
      'Sur la page Intégrations, onglet « Disponibles » : KoboToolbox parmi les outils à connecter. La connexion au compte, le choix du formulaire et l’import vers les membres se font depuis cette entrée.',
  },
  {
    lesson: 7,
    outcome:
      'Transformer les données de terrain en indicateurs vérifiables et en rapports remontables à la source.',
    example: {
      title: 'Projet d’appui aux femmes transformatrices (Kara)',
      body: 'Le projet annonce 1 200 bénéficiaires ; la base contient 1 126 personnes validées. Le rapport distingue explicitement « cible annoncée : 1 200 » et « bénéficiaires enregistrées et validées : 1 126 », sans compléter les 74 manquantes par estimation. Chaque indicateur a sa définition, son unité, sa période, sa source (table membres, date d’extraction) et son responsable.',
    },
    selfCheck: [
      {
        question: 'Que doit contenir un bon indicateur ?',
        answer: 'Une définition, une unité, une période, une source et un responsable.',
      },
      {
        question:
          'Le bailleur demande la répartition par âge, mais l’âge manque pour 40 % des membres. Que faire ?',
        answer:
          'Présenter la répartition sur les membres renseignés en indiquant la couverture ; ne jamais inventer âge, sexe ou localité manquants.',
      },
      {
        question: 'Quelle différence entre baseline, cible et valeur observée ?',
        answer:
          'Baseline : situation de départ mesurée ; cible : objectif visé ; observée : valeur réellement mesurée. Une estimation n’est jamais une valeur observée.',
      },
    ],
    demoFocus:
      'Sur les statistiques : les indicateurs disponibles, leur période et la lecture des écarts entre cible et observé.',
  },
  {
    lesson: 8,
    outcome:
      'Gagner sa vie comme opérateur sans rendre l’organisation dépendante, avec un portefeuille PAYG lisible.',
    example: {
      title: 'Opérateur suivant 8 organisations, portefeuille insuffisant',
      body: 'Solde du portefeuille : 1 500 FCFA ; une impression de 10 cartes coûte plus. Ce qui est bloqué : cette nouvelle opération payante seulement. Ce qui doit rester : les données, les cartes déjà émises, les comptes et accès des 8 organisations. L’opérateur recharge, puis facture ses services à l’organisation selon un devis clair : périmètre, volume, délai, livrables, déplacements.',
    },
    selfCheck: [
      {
        question: 'Qui paie FaîtiereHub ?',
        answer:
          'L’opérateur professionnel, selon son utilisation (PAYG). Le cœur reste gratuit pour l’organisation.',
      },
      {
        question: 'Un solde insuffisant peut-il bloquer l’accès aux membres d’une coopérative ?',
        answer:
          'Non : il ne bloque qu’une nouvelle opération payante, jamais les données ni les comptes de l’organisation.',
      },
      {
        question: 'Combien coûte la certification et quand ?',
        answer:
          '15 000 FCFA, après validation de la formation et de l’évaluation pratique. La formation elle-même est gratuite.',
      },
    ],
    demoFocus:
      'Sur l’espace Opérateur certifié : le solde du portefeuille, le rechargement et l’historique des crédits et débits.',
  },
  {
    lesson: 9,
    outcome:
      'Protéger comptes, données et opérations financières, et réagir correctement à un incident.',
    example: {
      title: 'Téléphone perdu avec un export de membres',
      body: 'Un enquêteur perd son téléphone contenant l’export Excel de 400 membres. Dans l’heure : arrêter les opérations liées, noter la date et le contenu du fichier, prévenir le support et l’administrateur de la coopérative, changer le mot de passe du compte, expliquer à l’organisation l’impact réel (quelles données, combien de personnes), documenter la correction (fichiers temporaires supprimés sur les autres appareils, règle : plus d’export non protégé sur téléphone personnel).',
    },
    selfCheck: [
      {
        question:
          'Un administrateur vous propose son mot de passe « pour aller plus vite ». Que faire ?',
        answer:
          'Refuser : chacun utilise son propre compte ; ne jamais demander ni accepter le mot de passe d’un autre.',
      },
      {
        question: 'Quelles sont les six étapes en cas d’incident ?',
        answer:
          'Arrêter l’opération, conserver les références, ne pas masquer l’erreur, prévenir le support ou l’administrateur, expliquer l’impact réel, documenter la correction.',
      },
      {
        question: 'Un montant PAYG semble faux. Peut-on le corriger depuis le navigateur ?',
        answer:
          'Jamais : signaler l’anomalie financière ; toute correction passe par l’administration.',
      },
    ],
    demoFocus:
      'Sur l’espace connecté : l’identité du compte, l’organisation ou le partenaire actif, et la navigation. Vérifier ces trois repères avant toute action sensible.',
  },
  {
    lesson: 10,
    outcome:
      'Vendre et livrer un résultat professionnel, gérer les attentes et documenter chaque mission.',
    example: {
      title: 'Demande d’une fonction « en développement »',
      body: 'Une coopérative demande l’impression automatique des cartes avec paiement mobile intégré. Réponse professionnelle : « Disponible maintenant : cartes numériques vérifiables et préparation des impressions. Pilote : commande d’impression avec suivi. Prévu : paiement intégré, sans date promise. » Puis un bilan de mission écrit : actions réalisées, 113 membres traités, 4 anomalies restantes, prochaine action, responsable.',
    },
    selfCheck: [
      {
        question: 'Que cherche une organisation quand elle « achète » FaîtiereHub ?',
        answer:
          'Un résultat : registre propre, cartes, rapport, collecte, suivi de projet, assistance. Rarement « du SaaS ».',
      },
      {
        question: 'Que laisser à la fin d’une mission ?',
        answer:
          'Ce qui a été fait, combien d’enregistrements traités, les anomalies restantes, la prochaine action et son responsable.',
      },
      {
        question: 'Un opérateur peut viser environ 20 organisations. Est-ce une limite technique ?',
        answer:
          'Non, un objectif commercial ; la qualité du portefeuille se mesure aux services rendus, pas au nombre de recrues.',
      },
    ],
    demoFocus:
      'Sur l’espace Opérateur : les organisations suivies, les actions en attente et le statut de certification, le tableau de bord d’une activité professionnelle.',
  },
  {
    lesson: 11,
    outcome: 'Mobiliser toutes les compétences dans un scénario proche d’une mission réelle.',
    example: {
      title: 'Mission complète : coopérative fictive de 120 membres',
      body: 'Un fichier Excel imparfait, une intervention financée à préparer. En 45 minutes, présenter : le diagnostic de la structure, les erreurs et doublons repérés, un plan d’import sûr, la différence carte numérique / physique, un mini-formulaire Kobo de 8 variables, cinq indicateurs pour le projet, la propriété des données, ce qui se passe si la coopérative change d’opérateur, un devis de services sans commission de recrutement, et la réaction à un incident de données.',
    },
    selfCheck: [
      {
        question: 'Combien d’indicateurs proposer pour le projet, et comment ?',
        answer:
          'Cinq, chacun avec définition, unité, période, source et responsable, en séparant cible et observé.',
      },
      {
        question: 'Quels critères observe l’examinateur ?',
        answer:
          'Précision, respect de la gouvernance, maîtrise de FaîtiereHub, qualité des données, compréhension du modèle économique, sécurité, capacité à expliquer simplement.',
      },
      {
        question: 'La réussite de cette leçon certifie-t-elle ?',
        answer:
          'Non : elle prépare l’évaluation pratique officielle, dont la décision revient à l’examinateur.',
      },
    ],
    demoFocus:
      'Sur la page Membres : le point de départ du scénario, avec recherche, import et fiches, avant d’enchaîner vers Cartes, Kobo et Statistiques.',
  },
  {
    lesson: 12,
    outcome: 'Mesurer sa préparation sans consulter les leçons, et planifier ses révisions.',
    example: {
      title: 'Plan de révision après auto-évaluation',
      body: 'Résultat : 8 réponses sûres sur 12, hésitations sur les périmètres de mandat (leçon 2), la répartition du prix de la carte (leçon 5), le wallet (leçon 8) et la distinction cible / observé (leçon 7). Plan : relire ces quatre leçons, refaire leurs exemples de terrain, puis répondre à nouveau aux 12 questions dans l’ordre inverse, sans les leçons sous les yeux.',
    },
    selfCheck: [
      {
        question: 'Quel seuil de préparation est conseillé ?',
        answer:
          'Répondre clairement à au moins 10 questions sur 12 ; sinon, réviser les leçons concernées avant l’évaluation pratique.',
      },
      {
        question: 'Quelles sont les deux validations requises avant le paiement des 15 000 FCFA ?',
        answer: 'La formation validée (12 leçons) et l’évaluation pratique réussie.',
      },
      {
        question: 'Cette auto-évaluation attribue-t-elle la certification ?',
        answer: 'Non. La validation officielle reste distincte et appartient à l’administration.',
      },
    ],
    demoFocus:
      'Sur l’espace Opérateur : les étapes formation, évaluation, paiement, certification et activation, pour situer où l’on en est.',
  },
]

export function enrichmentFor(orderIndex: number | null): LessonEnrichment | null {
  if (orderIndex == null) return null
  return LESSON_ENRICHMENT.find((e) => e.lesson === orderIndex) ?? null
}

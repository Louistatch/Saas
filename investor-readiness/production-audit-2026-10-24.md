# Audit de préparation à la production nationale et internationale — FaîtiereHub / SaaS

**Date de référence : 24 octobre 2026.** Audit demandé par Louis Tatchida. Rapport technique et opérationnel ; aucune modification applicative ou de configuration de production.

## 1. Verdict

**Le socle fonctionne pour un pilote accompagné au Togo. L'ensemble des services n'est pas prêt pour une ouverture nationale sans accompagnement, ni pour une commercialisation internationale.**

Les principaux obstacles ne sont plus l'existence des écrans : ce sont les paiements encore en mode test, l'exploitation des tâches automatiques, des risques de sécurité dans les dépendances et dans le backend AgriTogo, les lectures tronquées à grande échelle, les preuves de terrain et de restauration manquantes et les modules commerciaux inachevés.

Cette conclusion distingue :

- **PROD** : observation directe du service ou de la base de production.
- **CODE** : comportement constaté dans une version précise du code ; pas nécessairement reproduit sur une transaction réelle.
- **DOCUMENTÉ** : limite ou résultat annoncé dans le dépôt, sans reproduction complète dans cet audit.
- **NON DÉMONTRÉ** : preuve insuffisante ; cela ne signifie pas que le service est nécessairement en panne.

Un service noté « pilote » peut être utilisable dans son périmètre. Aucun pourcentage arbitraire de préparation n'est attribué.

## 2. Périmètre et preuves positives

### Versions et hébergement

| Élément | État vérifié |
|---|---|
| Dépôt principal | Louistatch/Saas, main `471dd03d37f3452ab5b52a3e4ce2e3ed8704f35a` |
| Inventaire principal | 112 pages, 196 routes API, 135 fichiers de tests dans tests/, 135 fichiers SQL de migration suivis |
| Déploiement qui sert www.faitierehub.com | READY, `dpl_FEK5Wecas4NBXhd1K39hjM8Evorn`, même commit |
| Compte Vercel du site principal | issodo052@gmail.com, équipe issodo052-7639s-projects |
| Second projet saas | Équipe louis-issodo-tatchidas-projects, compte tatchida@gmail.com : accès API refusé 403, journaux non consultables |
| Supabase principal | hhnswekjgbxckluqnszo, ACTIVE_HEALTHY, PostgreSQL 17, région eu-west-1 |
| Correspondance site/base | URL publique Supabase retrouvée dans le JavaScript livré : même projet hhnswekjgbxckluqnszo |
| Base | 141 tables publiques, RLS activé sur toutes ; taille observée 37 MB |
| Historique serveur des migrations | 158 entrées ; les différences de numérotation ne prouvent pas à elles seules une migration absente |
| Backend complémentaire examiné | Louistatch/agritogo, main `7093a84bf3b410aa34cf78e75b9bb74d8faf59d9` |
| Version AgriTogo réellement déployée | NON DÉMONTRÉE : pas d'inspection de configuration Railway authentifiée dans cet audit |

La CI principale du commit fusionné est verte : TypeScript, tests unitaires, tests de durcissement PostgreSQL local, contrôles statiques et build. Le workflow de relais distribué HarooLife est vert également. Le contrôle statique de sécurité a été rejoué pendant cet audit : **18 assertions réussies**, avec compilation TypeScript.

Les pages d'accueil, tarifs, le catalogue public des opérateurs FedaPay et la liste des cultures AgriSmart répondent en HTTP 200. Les endpoints privés Kobo et statistiques cartographiques répondent 401 sans session : c'est le refus attendu.

Les règles RLS des membres utilisent les droits d'administration de l'organisation, l'appartenance personnelle ou un mandat opérateur explicite. Les collectes Kobo sont bornées par la hiérarchie d'organisation ; le nouveau résolveur de coopératives est réservé au serveur. Les politiques de lecture des achats exigent l'identité du compte ou une adresse confirmée relue dans Auth. Les changements de privilèges du profil restent protégés par un déclencheur actif.

**Ces observations ne certifient pas l'absence de toute fuite sur l'ensemble de l'écosystème : voir le backend AgriTogo ci-dessous.**

### Taille réelle du pilote

Comptages exacts en lecture seule ; démos et historique peuvent être inclus.

| Donnée | Volume |
|---|---:|
| Organisations | 19 lignes ; 17 non supprimées, dont 1 organisation de démo |
| Membres | 16 |
| Profils | 28 |
| Cartes | 12 : 10 agricoles actives, 1 agronome active, 1 agricole révoquée |
| Collectes Kobo | 6, toutes marquées traitées ; dernière création le 4 juin 2026 |
| Parcelles / productions | 6 / 6 |
| Cotisations / paiements de cotisation | 0 / 0 |
| Comptes d'exploitation publiés | 1 |
| Achats de documents | 26 : 16 échoués, 9 en attente, 1 terminé |
| Opérateurs | 4 individuels : 3 candidats, 1 en formation ; aucun actif dans ce comptage |
| Grand livre PAYG / intentions de paiement partenaires | 0 / 0 |
| Paiements de formation / revenus d'organisation | 0 / 0 |
| Académie | 12 leçons, 3 tentatives de quiz, 1 dépôt de devoir |
| Haroo | 3 profils ouvriers, 2 acheteurs, 5 agronomes ; 2 offres de travail, 2 missions, 2 préventes |
| Matching acheteurs | 0 demande, 0 rapprochement |
| Prix de marché | 2 733 observations ; 2 309 SIM-CPC et 424 manuelles |
| Sauvegardes de partie HarooLife | 8 |

**Un achat marqué terminé n'est pas une preuve de recette bancaire : le site annonce FedaPay sandbox lors de l'audit.** Ces volumes ne permettent pas de déduire la capacité nationale.

## 3. Blocages prioritaires

### P0 — Encaissements FedaPay encore en mode test

**PROD.** `GET /api/payments/fedapay/providers` renvoie `environment: sandbox`, `configured: true`. Une deuxième lecture sans cache reproduit le résultat.

Conséquence : le site public peut présenter un parcours de paiement dont les confirmations restent des simulations. Les achats historiques, la certification et les nouveaux parcours PAYG ne doivent pas être présentés comme des encaissements réels validés.

À terminer :

1. Vérifier le compte marchand, son activation et ses moyens de paiement autorisés.
2. Installer la configuration live cohérente dans le projet qui sert réellement le domaine, sans mélanger clés et environnement.
3. Faire une recette consentie : débit réel, reçu, droit accordé une seule fois, notification en double, retour navigateur interrompu, rapprochement, remboursement.
4. Séparer et identifier les transactions de test dans le suivi commercial.

**Critère de sortie :** un paiement réel réconcilié par moyen de paiement proposé, un double callback sans double crédit ni double accès, un scénario débit sans retour navigateur récupéré.

Sources : [endpoint public](https://www.faitierehub.com/api/payments/fedapay/providers), `lib/payments/fedapay.ts`, `lib/payg/payments.ts`, `lib/fiches/purchases.ts`.

### P0 — Dépendances exposées à des avis de sécurité

**VÉRIFIÉ.** `npm audit --omit=dev --json` remonte 30 entrées de dépendances : 3 classées critiques, 6 élevées, 20 modérées, 1 faible. Ce sont des classifications automatisées, pas 30 exploitations prouvées.

Versions verrouillées concernées notamment : Next.js 16.3.8, Sharp 0.34.5, Sentry Next.js 10.53.1, DOMPurify 3.4.7 et Zod 3.25.76.

- L'avis mainteneur Next.js sur l'optimisation des images confirme un risque critique conditionnel sur Linux/glibc ; le correctif implique notamment Sharp >= 0.35.5 et une version Next corrigée. Le diagnostic npm propose Next 16.4.3 à la date de l'audit.
- Le registre npm classe aussi Sentry et DOMPurify en critique, alors que les avis mainteneurs consultés classent les problèmes spécifiques cités respectivement en modéré et faible. Il faut donc trier les cas par conditions réelles.
- Sentry utilise un tunnel /monitoring dans ce dépôt ; l'avis consulté précise toutefois que les builds Turbopack ne sont pas affectés par ce contournement. Ce seul avis ne prouve pas un contournement exploitable sur le déploiement présent.
- Aucune tentative d'exploitation n'a été réalisée.

**Critère de sortie :** correctifs revus, lockfile actualisé, justification des éventuelles exceptions, tests et build sur les versions retenues. Ajouter un contrôle de dépendances au processus de livraison ; les 18 contrôles statiques actuels ne remplacent pas cet audit.

Références primaires : [Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Sentry](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55), [DOMPurify](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7).

### P0 — Cloisonnement des conversations AgriTogo incomplet dans le code

**CODE ; exposition réelle de la version en ligne NON TESTÉE.**

Dans le backend AgriTogo :

- La route publique `/` appelle `get_conversations()` sans identité ni numéro de carte.
- Cette fonction lit les 50 derniers messages de `ai_conversations` avec le client service_role ; le filtre par carte n'est ajouté que si un numéro est passé.
- La mémoire du moteur est une liste globale en processus. `/engine/memory` l'affiche sans garde d'identité visible ; les retours sont également adressés par index global.
- `/api/v1/agent/chat` accepte un numéro de carte fourni par le demandeur et peut écrire l'historique associé, sans vérification du titulaire visible dans cette route.

Le filtrage côté Next.js ne protège pas automatiquement une route backend accessible directement. Ce point empêche de promettre que toutes les conversations de toutes les faîtières sont isolées, même si les tables et le workflow Kobo sont protégés.

**Critère de sortie :** identité vérifiée au backend, filtrage par utilisateur/organisation pour chaque lecture et écriture, suppression des historiques globaux publics, mémoire séparée et bornée, tests à deux organisations incluant l'accès direct au backend. Vérifier ensuite la version effectivement livrée.

Preuves : [server.py](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/app/server.py#L269), [database.py](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/app/database.py#L415), [engine.py](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/app/agents/engine.py#L283), [api.py](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/app/api.py#L378).

### P0 — Tâches automatiques et SMS non opérationnels avec la configuration consultée

**PROD + CODE.** L'inventaire des variables Vercel du projet principal contient les clés Resend et Upstash, mais pas `CRON_SECRET`, `AFRICAS_TALKING_API_KEY` ni `AFRICAS_TALKING_USERNAME`. Seuls les noms et cibles des variables ont été conservés ; aucune valeur secrète n'a été affichée ou déchiffrée.

Les cinq routes cron exigent CRON_SECRET et refusent l'exécution s'il manque : notifications, synchronisation météo, rapprochement des achats, rapprochement PAYG et purge des visiteurs. Les notifications sont planifiées une seule fois par jour dans vercel.json.

L'envoi de SMS utilise Africa's Talking et renvoie « SMS provider not configured » si les deux variables manquent. La connexion par PIN reste un mécanisme distinct ; le constat SMS ne veut pas dire que tous les accès par carte sont cassés. Resend est configuré mais sa délivrabilité n'a pas été éprouvée par un envoi pendant cet audit.

**Critère de sortie :** configurer les secrets sur la bonne cible, observer une exécution autorisée et surveillée des cinq tâches, traiter les erreurs et retards, vérifier un SMS reçu sur téléphone de test consentant. Définir le délai métier acceptable ; une cadence quotidienne ne convient pas à toutes les alertes.

Sources : `vercel.json`, `app/api/cron/**`, `lib/notifications/delivery.ts`, `lib/email/resend.ts`.

### P1 — Échelle et cohérence des chiffres

**CODE.** La page Membres charge `.range(0, 999)`, puis effectue recherche et pagination en mémoire. Au-delà de 1 000 membres dans une coopérative, un nom peut devenir introuvable alors qu'il existe. Les rapports, statistiques de carte et plusieurs écrans Cartes/Analytics font également des agrégations à partir de listes non paginées.

**PROD.** L'API publique des prix annonce des décomptes totalisant 1 000 lignes sur 3 régions. La vue de production `market_price_current` contient 121 prix courants sur 5 régions, y compris lors d'une requête SQL sous rôle anon. La réponse publique a été reproduite avec un cache MISS.

Le code prévoit un repli silencieux vers 1 000 observations brutes si la vue échoue. Cela correspond à la forme du résultat observé ; **la cause exacte de cette erreur ou divergence au niveau REST reste à isoler**. Il ne faut pas assimiler 1 000 observations historiques à 1 000 prix courants.

**Critère de sortie :** pagination et recherche serveur, agrégats SQL, exports complets ; test avec 1 001 puis plusieurs milliers de membres. L'API Marché doit retrouver les 5 régions et les mêmes agrégats que la vue de référence ; toute dégradation doit être explicite.

Sources : `app/dashboard/members/page.tsx:124`, `app/dashboard/analytics/page.tsx:205`, `app/api/map/stats/route.ts`, `app/reports/cooperative/[coopId]/[type]/page.tsx`, `app/api/market-prices/route.ts:28`.

### P1 — Photos publiques, comptes privilégiés historiques et confidentialité

**PROD.** Le bucket member-photos est public et contient 12 objets. Le bucket member-signatures est également public mais vide lors de l'audit. Une URL publique connue reste consultable sans devenir protégée par le cloisonnement des tables.

La photo minimale de vérification d'une carte peut relever d'un choix produit. Les originaux, signatures et documents privés doivent avoir une politique explicite : minimisation, droits, durée et liens signés si nécessaires. Aucune énumération des fichiers ni extraction de photos n'a été effectuée.

Un compte super_admin historiquement associé à une adresse de démo existe toujours. L'audit du 11 octobre indiquait que des mots de passe avaient été publiés. **Il n'est pas établi que l'ancien mot de passe fonctionne encore** : aucun essai de connexion n'a été fait. Il faut une preuve de rotation et d'invalidation des sessions ou de fermeture du compte.

Supabase signale toujours la protection contre les mots de passe compromis désactivée.

Enfin, PostHog est configuré et son provider initialise cookies/localStorage et identification par UUID sans mécanisme de consentement visible dans ce provider. Il capture l'URL complète avec ses paramètres. La page Cookies décrit surtout Vercel Analytics : information, minimisation des URL et choix de consentement/exemption doivent être revus.

**Critère de sortie :** politique de publication des portraits, stockage privé des originaux/pièces confidentielles, preuve de traitement des anciens comptes privilégiés, protection Auth et règles de traceurs validées. Ne pas publier les adresses ou secrets de ces comptes dans un rapport commercial.

Sources : Storage et policies de production, `app/providers/posthog-provider.tsx`, `app/legal/cookies/page.tsx`, `investor-readiness/technical-audit.md`.

### P1 — Sauvegarde, récupération et supervision non qualifiées

**NON DÉMONTRÉ.** Les réglages applicatifs auto_backup=true et backup_frequency=daily ne prouvent pas une sauvegarde Supabase effective, sa rétention, un PITR ou la restauration des fichiers Storage.

Aucun procès-verbal de restauration isolée avec durée et intégrité DB + fichiers n'a été trouvé dans les sources examinées. Le dépôt prévoit un moniteur Supabase Railway ; son exploitation et ses alertes n'ont pas été vérifiées. Le projet Vercel possède zéro log drain ; Sentry est configuré, mais le routage d'alertes et les engagements d'astreinte ne sont pas prouvés.

Le contrôle Vercel ne remonte pas d'erreurs runtime sur la fenêtre de 7 jours consultée et la table app_errors n'a pas d'erreur récente. Cela ne remplace pas une preuve de détection d'incident et d'alerte.

**Critère de sortie :** sauvegarde vérifiée chez l'hébergeur, restauration en environnement isolé des données et fichiers, responsables identifiés, objectifs RPO/RTO approuvés, alerte de panne démontrée. Aucun exercice sur la production n'a été lancé.

## 4. État de tous les services

Les conditions transversales P0 s'appliquent aux services ouverts commercialement. La colonne internationale indique ce qui s'ajoute au périmètre togolais.

| Service | État actuel | Ce qui manque pour un lancement national fiable | Complément international |
|---|---|---|---|
| Organisations, faîtières, unions, membres | Socle fonctionnel, pilote | Recherche/pagination serveur, import/export complet, onboarding et délégations éprouvés sur plusieurs vrais clients | Pays et hiérarchies territoriales configurables ; règles contractuelles par pays |
| KoboCollect et nettoyage des coopératives | Correctifs livrés, recette terrain à terminer | Test Android hors ligne → envoi → membre → photo → carte → QR, doublon et reprise ; revue des cas ambigus | Référentiels, langues et formulaires par pays ; tests des variantes de noms locales |
| Cartes agricoles, QR, PIN, impression | Fonctionnel en pilote | Recette physique, SMS configuré, remplacement de carte perdue, quotas et lots de volume | Numérotation et formats selon pays ; support, fabrication et livraison |
| PAYG opérateur individuel | Code et fonctions SQL présents ; aucun mouvement de crédit observé | Certification/activation d'un opérateur réel, pack payé live, émission et débit atomiques, remboursement/rejeu | Paiements et comptabilité par pays ; tarification et documents commerciaux |
| Opérateur institutionnel et agents | Parcours codés ; aucun opérateur institutionnel observé | Recette FENOMAT/MAPTO : invitations, affectations, révocation, portefeuille commun, formation et rapports | Gouvernance, conventions de traitement et support multi-organisations |
| AgriAcademy et certification | Parcours enrichi utilisable en pilote | Parcours complet 12 leçons → quiz/devoirs → évaluation pratique → paiement live → certification et notifications ; contenus terrain | Langues, adaptation pédagogique, accessibilité et reconnaissance locale |
| Comptes d'exploitation historiques / marketplace documentaire | 1 fiche publiée, achats en sandbox | Vraies ventes, réconciliation, reçus/remboursements, accès après retrait ; droits de publication à clarifier | Catalogue validé, devise/taxation/conditions par marché |
| Nouveau module CE/IT | Désactivé et non achetable | Migrations, habilitations, circuit scientifique, branchement paiement, règles de répartition ; voir détail ci-dessous | Référentiels agronomiques locaux et droits d'exploitation |
| Cotisations et paiements aux organisations | Suivi codé, 0 cotisation et 0 paiement observés | CinetPay/Orange Money non configurés dans les variables consultées ; recette et rapprochement des cotisations | Prestataires et règles de recouvrement du pays |
| Parcelles, carnet agricole, productions | Fonctionnel sur 6 parcelles/6 productions | Qualité et rapprochement des données, parcelle-production, unités, champs obligatoires, preuve terrain | Cultures, saisons, unités et nomenclatures locales |
| Cartographie, tableaux de bord et rapports | Présents, limites de volume identifiées | Agrégats complets, géométrie/localisation contrôlée, exports cohérents au-delà de 1 000 lignes | Référentiel géographique par pays et performances à distance |
| AgriMarket, annonces et matching acheteurs | Mise en relation codée ; très faible activité | Qualification des offres, acceptation, clôture, litiges et vérification des acteurs ; pas de preuve de vente agricole encaissée | Transport, qualité, contrats, règlement et litiges selon marchés |
| Haroo ouvriers, acheteurs, agronomes et cartes pro | Profils et missions présents, pilote | Recette des 3 parcours, validation professionnelle, disponibilité et affectation réelle, modération, limites de responsabilité | Diplômes/habilitations et conditions de mission par pays |
| Prix de marché, prévisions, conseil de vente | Source CPC fraîche ; incohérence API et limites statistiques | Corriger l'écart des compteurs, afficher date/source/type/incertitude ; ne pas promettre des gains prédictifs non établis | Sources de prix fiables et validation par pays |
| AgriSmart irrigation et estimation de rendement | Catalogue API accessible ; calculs et hypothèses documentés | Comparaisons à références/mesures terrain, tests applicatifs reproductibles, données agronomiques validées | Sols, climat, Kc, cultures et rendements locaux |
| AgriTogo IA texte, image et voix | Interfaces et prestataires configurés ; validation métier partielle | Cloisonner le backend, plafonner coût et accès directs, évaluer les réponses, gérer pannes et consentement image/voix | Langues, évaluations locales, modèles et restrictions des prestataires |
| AgriCrédit / scoring financier | Workflow de dossiers et score heuristique ; pas de crédit observé | Validation avec prêteur, défauts observés, gouvernance du score ; ne pas utiliser les données synthétiques comme preuve bancaire | Partenaires, règles financières et validation dans chaque pays |
| Notifications, emails, SMS, push | Infrastructure présente, SMS et cron incomplets | Secrets, réception réelle, suivi des échecs, cadence et alertes ; push sur téléphone réel | Couverture fournisseurs, formats et règles de communication |
| Widget, intégrations et interopérabilité | Widget et Kobo existent ; autres connecteurs fermés | Tests d'intégration tiers ; Google Sheets/email/paiement du catalogue sont available:false | Documentation d'API, versions et compatibilité pour partenaires internationaux |
| HarooLife et publicité | Jeu/pilote ; relais actuel sain, livraison récente du relais échouée | Corriger la livraison, recette Android physique et réseau faible, modération, montée en charge, distinguer argent du jeu et paiements réels | Localisation, modération/support horaires, régions réseau, règles commerciales de publicité |
| Administration, support, sécurité et exploitation | Outils disponibles | Incidents, sauvegardes, comptes privilégiés, capacité, journalisation, priorités et délais de support | Contrats/SLA réalistes, sous-traitants et droits applicables aux pays visés |
| Site public, tarifs et documents légaux | En ligne ; incohérences commerciales | Mettre l'écran Facturation en cohérence avec PAYG ; identité légale et mentions à vérifier | Traductions, cadre commercial et confidentialité localisés |

### Kobo : ce qui s'adapte et ce qui ne s'automatise pas encore

Les correspondances de champs sont configurables, et les nouvelles questions restent conservées dans le JSON brut. Cela permet de renommer ou déplacer un champ connu sans réécrire toute l'application, à condition de mettre à jour la correspondance.

Cela **n'invente pas la signification métier** d'une nouvelle question, d'une nouvelle répétition ou d'un type de donnée modifié. Il manque, pour une exploitation industrielle, un processus de contrôle des changements de formulaire : schéma/version, champ obligatoire disparu, nouvelles correspondances à approuver, échantillon de validation et reprise des données si nécessaire.

Les variantes KPELEWAÏ / SCOOPS KPELEWAÏ retrouvent la référence existante dans le bon arbre. Les cas ambigus sont bloqués : le système ne fusionne pas aveuglément des membres ou des coopératives de faîtières différentes.

Autre limite de volume : Kobo n'achète aucun crédit et ne débite aucun portefeuille PAYG automatiquement. Quand le quota gratuit est atteint, le membre est enregistré mais la carte peut rester non émise. L'opérateur doit alors émettre la carte commerciale depuis sa console, puis relancer le traitement. C'est une sécurité de facturation actuelle, mais ce n'est pas encore un pipeline de cartes commerciales entièrement automatique.

Sources : `docs/kobo/workflow-terrain.md`, `lib/kobo/normalize.ts`, `lib/kobo/processing.ts:67`.

### Cartes : remplacement à corriger

**CODE + SCHÉMA PROD.** Le parcours d'émission historique cherche une ancienne carte révoquée/expirée et réutilise son numéro pour un nouvel INSERT. La base conserve une contrainte UNIQUE globale sur card_number. Une ancienne ligne conservée peut donc faire échouer cette réémission.

Le renouvellement d'une carte toujours active est un autre cas : prolonger sa date n'est pas le défaut décrit ici. Définir et tester séparément perte/vol, révocation, expiration et renouvellement, avec ancien QR invalidé quand nécessaire.

Source : `app/dashboard/cards/page.tsx:324` et index `member_cards_card_number_key`.

### CE/IT : distinguer le nouveau module du catalogue existant

Le nouveau catalogue `/ce-it` renvoie 404 « Module CE/IT non activé ». CE_IT_MODULE_ENABLED est absent de la configuration consultée ; les tables ceit_* et le bucket ceit-documents ne figurent pas dans l'inventaire de production.

Le code propose un studio et une revue scientifique, mais le catalogue annonce payment_available:false. L'adaptateur ne crée aucun checkout FedaPay. La politique de paiement/reversement est désactivée et aucun exécuteur de reversement n'est fourni dans ce lot.

Le catalogue historique `fiches_techniques` existe séparément. Sa publication par une faîtière reste fermée dans le code (`FAITIERE_PUBLISHING=false`). La fiche publiée actuelle coûte 1 000 XOF ; ne pas la confondre avec le tarif cible de 1 500 XOF du nouveau module.

Source : `docs/ce-it/README.md`, `lib/ce-it/server.ts`, `app/api/ce-it/catalogue/route.ts`, `lib/fiches/publishing.ts`.

### AgriTogo : validité scientifique et reproductibilité

- **Rendement** : l'API FAO-33 expose validated_locally:false. Les références de plusieurs cultures et des coefficients par analogie restent à vérifier ; fertilité, ravageurs et variété ne sont pas modélisés. L'audit documentaire annonce le retrait de l'ancien modèle synthétique de l'assistant, mais le serveur conserve encore une route historique /ml/crop-yield qui l'appelle : vérifier/fermer les anciens chemins.
- **Risque financier** : `app/ml/financial_risk.py` complète les données avec des observations synthétiques jusqu'à 300 lignes ; la cible « défaut » des données réelles est déduite de l'absence de cotisations/productions, pas d'impayés de crédit observés. Les métriques sur ce jeu ne valident pas un risque de défaut bancaire.
- **Prévision de prix** : le rapport interne présente un MAPE à 4 semaines de 7,6 % contre 7,5 % pour le naïf, donc pas d'avantage démontré dans cette évaluation. Ce résultat est DOCUMENTÉ, non recalculé ici. Les séries sont trop courtes pour une saisonnalité robuste.
- **Irrigation/météo** : les méthodes et corrections sont décrites, mais les tests `tests/test_agrismart_fao56.py` et `tests/test_yield_estimate.py` cités dans les documents ne figurent pas dans l'arbre main examiné.
- **CI backend** : le workflow unittest couvre uniquement `app.ingestion.cpc` avec `tests/test_cpc_ingestion.py`. Le grand arbre de tests AgentScope hérité ne constitue pas une couverture des parcours métier AgriTogo.
- Les routes directes de calcul et d'agent ne montrent pas de limite distribuée comparable à la façade Next.js. Ajouter limites de taille, budget, concurrence, délai et garde backend, sans considérer les quotas frontaux comme protection universelle.

Sources : [audit des prix](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/docs/PRICE_FORECAST_AUDIT.md), [rendement](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/docs/YIELD_MODEL.md), [risque](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/app/ml/financial_risk.py), [CI](https://github.com/Louistatch/agritogo/blob/7093a84bf3b410aa34cf78e75b9bb74d8faf59d9/.github/workflows/unittest.yml).

### HarooLife : disponibilité et capacité sont distinctes

Le statut GitHub de la dernière livraison du service Railway haroolife-realtime est en échec. En revanche, son instance actuellement publique répond 200 à /health et /ready. Elle annonce un plafond d'admission de 5 000 connexions et n'en avait aucune active lors du contrôle.

Le banc documenté a mesuré 2 000 connexions sur deux relais locaux, pendant environ 30 secondes, sans reproduire Internet, les téléphones physiques ou la base complète. Ni ce banc ni le plafond 5 000 ne prouvent une capacité nationale ou 500 000 connexions.

Les salaires et locations de panneaux du jeu utilisent son économie virtuelle. Ils ne démontrent pas des revenus publicitaires ou du travail rémunéré en argent réel.

Sources : `docs/haroolife-capacity-500k.md`, `lib/haroolife/**`, [état du relais](https://haroolife-realtime-production.up.railway.app/health).

## 5. Exigences supplémentaires pour l'international

Un site accessible depuis l'étranger n'est pas encore une offre internationale exploitée.

| Domaine | Constat | Travail nécessaire |
|---|---|---|
| Pays et territoire | Référentiels et traitements fortement centrés sur le Togo ; cron météo fixé à 5 régions | Pays dans le modèle, subdivisions administratives, coordonnées et référentiels par pays |
| Paiement | Parcours Mobile Money documentaire limité à tg/bj ; XOF ; cartes non proposées pour ces documents | Choisir les pays cibles, activer/recetter leurs moyens de paiement, devise, facture, remboursement et fiscalité |
| Téléphone | E.164 accepté avec indicatif, mais un numéro nu de 8 chiffres est présumé togolais ; achats spécialisés Togo/Bénin | Pays explicite à la saisie, normalisation et contraintes adaptées |
| Langue et accessibilité | Interface principale en français ; vocabulaire et formation locaux | Traduction des parcours complets, des erreurs, de l'assistance et des documents ; accessibilité et essais utilisateurs |
| Agronomie et IA | Cultures, sols, données de marché et rendements calibrés surtout pour le Togo ou non validés | Références et validation par pays ; provenance et incertitude visibles |
| Données personnelles | PostHog, photos, signatures, consentement et sous-traitance à documenter | Cartographie des traitements, responsabilités faîtière/plateforme, droits, durée, transferts, contrats et exigences locales |
| Contrats et identité | CGU annoncent FaîtiereHub SARL immatriculée à Lomé sans numéro RCCM affiché dans le texte examiné | Vérifier l'identité réelle de l'éditeur et les pièces ; cohérence avec AGROCROWN SARLU si cette entité exploite le service |
| Support et exploitation | Pas de preuve d'engagement de rétablissement, restauration ou couverture multi-horaires | SLA réaliste, procédure d'incident, support, responsabilités et continuité |
| Réseau/capacité | Une base principale eu-west-1 ; pas de mesure terrain internationale | Mesures par marché, budgets de latence/coût, quotas par client, tests de charge et reprise |

Le cadre togolais de protection des données existe ; les formalités applicables et les pièces de conformité de l'exploitant doivent être vérifiées auprès de l'IPDCP. Ce rapport ne conclut pas à une conformité ou à une infraction à partir des seules pages légales.

Pour une activité ciblant directement des résidents européens, le RGPD peut s'appliquer à une entreprise située hors de l'Union européenne. Les traceurs de mesure d'audience ne bénéficient pas d'une exemption automatique : les conditions précises doivent être vérifiées. Une simple visite venue d'Europe ne suffit pas à elle seule à qualifier l'ensemble de l'activité.

**Dépendance météo :** le code appelle l'API gratuite Open-Meteo. Son offre gratuite exclut l'utilisation commerciale et ne donne pas de garantie de disponibilité. Vérifier une licence commerciale adaptée — notamment aux API saisonnières — ou une alternative compatible avant de vendre le service météo. La licence des données et les conditions d'accès au service API sont deux sujets distincts.

Références : [IPDCP](https://ipdcp.tg/lipdcp-echange-avec-les-ministeres-et-institutions-sur-la-protection-des-donnees-a-caractere-personnel/), [champ du RGPD — CNIL](https://www.cnil.fr/fr/rgpd-de-quoi-parle-t-on), [traceurs — CNIL](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience), [Open-Meteo](https://open-meteo.com/en/pricing).

## 6. Ordre recommandé de mise à niveau

| Lot | Résultat attendu | Preuve de sortie |
|---|---|---|
| 1. Sécuriser | Dépendances corrigées, routes AgriTogo privées cloisonnées, anciens comptes privilégiés traités | Tests négatifs entre 2 organisations et en accès backend direct ; registre des avis de sécurité |
| 2. Rendre l'exploitation réelle | Cron autorisés, SMS/email reçus, erreurs et files surveillées | Exécutions tracées et alerte de panne démontrée |
| 3. Encaisser réellement | FedaPay live, moyens sélectionnés et recettés, paiements PAYG et documents rapprochés | Reçu prestataire réel = droit/crédit unique ; remboursement et reprise vérifiés |
| 4. Qualifier le terrain | Chaîne Kobo → fiche → carte → impression → scan, noms ambigus et quotas traités | Deux faîtières distinctes, téléphone réel hors ligne, renvoi et interruption réseau |
| 5. Corriger le volume | Listes, recherche, prix, cartes et rapports complets | Au moins 1 001 membres puis jeu représentatif plus grand ; agrégats API = SQL |
| 6. Préparer l'opérateur commercial | Activation, formation, mandats institutionnels, affectation et révocation d'agents | Une institution et deux agents recettés, solde/commission/autorisation cohérents |
| 7. Prouver la continuité et les droits | Sauvegarde/restauration DB + Storage, politique de données et contrats | Rapport de restauration isolée ; pièces et responsables validés |
| 8. Ouvrir les services avancés | CE/IT avec circuit scientifique et paiement ; modèles présentés selon leur validation ; HarooLife qualifié séparément | Critères propres au service, sans déduire sa préparation de la seule compilation |
| 9. Étendre pays par pays | Premier pays voisin choisi avec offre complète | Paiement, données, langue, agronomie et support validés dans ce pays |

Lancement conseillé : proposer d'abord un périmètre national précis — **membres, Kobo, cartes, console opérateur et suivi** — après les corrections bloquantes. Ouvrir ensuite les ventes documentaires et les autres services à mesure que leurs propres preuves sont obtenues. L'abonnement récurrent n'est pas un prérequis du modèle actuel PAYG ; c'est l'ancien écran d'abonnement qui doit être remis en cohérence.

## 7. Limites de l'audit et constats à ne pas confondre

- Aucun paiement, SMS, invitation envoyée, émission de carte, modification de membre, migration ou changement de variable en production n'a été effectué.
- Aucune authentification avec un ancien mot de passe publié, aucun test d'exploitation, aucune charge de production ni lecture d'historique conversationnel privé n'a été tenté.
- Les contrôles HTTP sont ponctuels. Les durées observées depuis cet environnement ne sont pas une mesure de performance sur réseau togolais.
- Les captures et tests navigateur avec réponses simulées ne sont pas une recette Android physique ni un test complet des prestataires.
- Les alertes Supabase « RLS activé sans policy » concernent notamment des tables réservées au serveur ; cela ne signifie pas qu'elles sont publiques.
- Des policies applicables à authenticated concernent aussi les comptes Auth anonymes utilisés par HarooLife ; leur présence seule ne prouve pas une fuite. Les guards et grants doivent être examinés.
- Les colonnes phone des techniciens et coordo_phone des organisations ne sont pas sélectionnables par anon dans les grants vérifiés. L'ancienne alerte d'exposition de ces colonnes n'est donc pas reconduite telle quelle.
- Le global Permissions-Policy refuse le microphone sur certaines pages, mais les pages /verify qui hébergent le chat vocal ont une configuration distincte. L'audit ne conclut pas que la voix est cassée sur ce seul en-tête.
- L'ancienne URL AgriTogo inscrite au README retourne « Application not found », alors que le proxy AgriSmart actuel fonctionne. C'est une documentation d'adresse à actualiser ; pas une preuve de panne générale d'AgriTogo.
- Le second projet Vercel saas du compte tatchida@gmail.com reste non inspecté à cause du 403. Il ne doit être déclaré ni corrigé ni sain par extrapolation du site principal.
- Les pièces légales, bancaires, de sauvegarde et de support peuvent exister en dehors des dépôts examinés : elles sont à apporter, pas à déclarer inexistantes sans vérification.
- Aucune preuve de restauration, de signature de contrat, d'encaissement live ou de capacité nationale n'est créée par ce rapport.

## 8. Contrôles reproductibles sans mutation métier

- GitHub : main, arbre, statuts du commit et jobs CI ; lecture du backend complémentaire à commit figé.
- Vercel : projet, déploiement associé au domaine, inventaire des noms de variables, erreurs runtime 7 jours et drains.
- Supabase : schéma/grants/policies/triggers, migrations enregistrées, advisors, comptages agrégés ; requêtes sous rôle anon dans une transaction READ ONLY.
- HTTP GET : accueil, tarifs, providers FedaPay, catalogue CE/IT, refus des routes privées, prix régionaux, cultures AgriSmart, health/ready du relais.
- Local : `npm run security:check -- --static`, `npm audit --omit=dev --json`.
- Contrôles Supabase de performance : 142 clés étrangères sans index couvrant, 76 cas RLS initplan, 81 policies permissives multiples et 5 groupes d'index identiques. Ce sont des pistes à mesurer et corriger en priorité sur les requêtes critiques, pas une preuve de lenteur ou une invitation à supprimer tous les index.

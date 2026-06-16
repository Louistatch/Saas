import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  TableOfContents, PageBreak, HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, UnderlineType, PageNumber, NumberFormat,
  Footer, Header, ImageRun, convertInchesToTwip,
} from 'docx'
import { writeFileSync } from 'fs'

// ─── Helpers ────────────────────────────────────────────────────────────────

const COLORS = {
  primary: '1B5E20',    // Deep green
  secondary: '2E7D32',
  accent: '43A047',
  gold: 'B8860B',
  dark: '1A1A1A',
  gray: '555555',
  lightGray: 'AAAAAA',
  white: 'FFFFFF',
  bgLight: 'F1F8E9',
  bgGold: 'FFF9C4',
}

function h1(text, opts = {}) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 240 },
    ...opts,
  })
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 180 },
  })
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
  })
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: COLORS.dark, ...opts })],
    spacing: { before: 80, after: 80 },
    alignment: AlignmentType.JUSTIFIED,
  })
}

function pBold(text, color = COLORS.dark) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color })],
    spacing: { before: 80, after: 80 },
  })
}

function bullet(text, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size: 21, color: COLORS.dark })],
    bullet: { level },
    spacing: { before: 60, after: 60 },
  })
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map((text, i) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: String(text),
            bold: isHeader,
            size: isHeader ? 20 : 19,
            color: isHeader ? COLORS.white : COLORS.dark,
          })],
          alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        })],
        shading: isHeader ? { fill: COLORS.primary, type: ShadingType.SOLID } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })
    ),
  })
}

function simpleTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(headers, true),
      ...rows.map(r => tableRow(r, false)),
    ],
  })
}

function hr() {
  return new Paragraph({
    border: { bottom: { color: COLORS.primary, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 200, after: 200 },
  })
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}

function sectionTitle(num, title) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: 32, color: COLORS.gold }),
      new TextRun({ text: title, bold: true, size: 32, color: COLORS.primary }),
    ],
    spacing: { before: 600, after: 300 },
  })
}

function callout(text, color = COLORS.bgLight) {
  return new Paragraph({
    children: [new TextRun({ text, size: 21, italics: true, color: COLORS.secondary })],
    shading: { fill: color.replace('#', ''), type: ShadingType.SOLID },
    spacing: { before: 120, after: 120 },
    indent: { left: 360, right: 360 },
    border: {
      left: { color: COLORS.accent, style: BorderStyle.SINGLE, size: 12 },
    },
  })
}

// ─── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  title: 'FaîtiereHub — Conseil Stratégique Suprême 2026',
  description: 'Rapport stratégique complet à destination des investisseurs et décideurs institutionnels',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22, color: COLORS.dark },
      },
      heading1: {
        run: { bold: true, size: 36, color: COLORS.primary, font: 'Calibri' },
        paragraph: { spacing: { before: 480, after: 240 } },
      },
      heading2: {
        run: { bold: true, size: 28, color: COLORS.secondary, font: 'Calibri' },
        paragraph: { spacing: { before: 360, after: 180 } },
      },
      heading3: {
        run: { bold: true, size: 24, color: COLORS.accent, font: 'Calibri' },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1.2),
            bottom: convertInchesToTwip(1.2),
            left: convertInchesToTwip(1.2),
          },
        },
      },

      // ── Header / Footer ──
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'FaîtiereHub — Conseil Stratégique Suprême 2026', size: 18, color: COLORS.lightGray }),
              ],
              alignment: AlignmentType.RIGHT,
              border: { bottom: { color: COLORS.lightGray, style: BorderStyle.SINGLE, size: 4 } },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Confidentiel — Usage restreint    |    ', size: 18, color: COLORS.lightGray }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLORS.lightGray }),
                new TextRun({ text: ' / ', size: 18, color: COLORS.lightGray }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLORS.lightGray }),
              ],
              alignment: AlignmentType.CENTER,
              border: { top: { color: COLORS.lightGray, style: BorderStyle.SINGLE, size: 4 } },
            }),
          ],
        }),
      },

      children: [

        // ══════════════════════════════════════════════════════════════════
        // PAGE DE COUVERTURE
        // ══════════════════════════════════════════════════════════════════

        new Paragraph({
          children: [new TextRun({ text: '', size: 120 })],
          spacing: { before: 0, after: 0 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '🌿 FAITIEREHUB', bold: true, size: 64, color: COLORS.primary })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 800, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'CONSEIL STRATÉGIQUE SUPRÊME',
            bold: true, size: 40, color: COLORS.gold,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Infrastructure Numérique Agricole du Togo',
            italics: true, size: 28, color: COLORS.secondary,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 600 },
        }),
        hr(),
        new Paragraph({
          children: [new TextRun({ text: 'Rapport Stratégique Complet 2026–2035', bold: true, size: 26, color: COLORS.dark })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Niveau : McKinsey & Company · Bain Capital · Rothschild & Co · Banque Mondiale · FIDA',
            size: 20, color: COLORS.lightGray, italics: true,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 600 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'CONFIDENTIEL — Usage restreint aux décideurs autorisés', bold: true, size: 20, color: 'CC0000' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Juin 2026', size: 22, color: COLORS.gray })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 0 },
        }),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // EXECUTIVE SUMMARY
        // ══════════════════════════════════════════════════════════════════

        h1('RÉSUMÉ EXÉCUTIF'),
        callout('FaîtiereHub est le premier système d\'information agricole intégré du Togo, conçu pour digitaliser l\'ensemble du cycle de vie des coopératives : inscription des membres, cotisations, scoring ATS, matchmaking acheteur-vendeur et intelligence agronomique embarquée.'),
        p('Le Togo compte 7,7 millions d\'habitants dont 65 % dépendent de l\'agriculture. Plus de 3 000 coopératives sont actives, regroupant potentiellement 600 000 producteurs, mais opèrent presque exclusivement sur papier. FaîtiereHub s\'attaque à ce déficit structurel avec une infrastructure SaaS mobile-first, adaptée à la connectivité limitée des zones rurales.'),
        p('Ce document constitue le dossier stratégique complet à destination des investisseurs institutionnels, bailleurs de fonds et décideurs gouvernementaux. Il couvre le diagnostic, le plan directeur, le modèle financier, la théorie du changement, le mémo d\'investissement et la feuille de route opérationnelle sur 10 ans.'),

        h2('Chiffres clés de la thèse d\'investissement'),
        simpleTable(
          ['Indicateur', 'Valeur', 'Horizon'],
          [
            ['TAM (Togo)', '150 M USD', '2035'],
            ['SAM (coopératives actives)', '22 M USD', '2029'],
            ['SOM (cible réaliste)', '6,8 M USD ARR', '2030'],
            ['Objectif membres Year 1', '25 000 membres', 'Fin 2027'],
            ['Breakeven opérationnel', 'Q3 2029', '—'],
            ['Ticket d\'investissement Seed', '500 K USD', '2026'],
            ['Retour sur investissement (IRR)', '34 %', '10 ans'],
            ['Multiplicateur (MOIC)', '6,2×', '2035'],
          ]
        ),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 1 — DIAGNOSTIC STRATÉGIQUE
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('I', 'DIAGNOSTIC STRATÉGIQUE'),

        h2('1.1 Contexte national'),
        p('Le secteur agricole représente 40 % du PIB togolais et 65 % des emplois. Malgré cette dominance économique, la digitalisation agricole reste embryonnaire : moins de 3 % des coopératives disposent d\'un outil de gestion numérique. L\'État togolais a placé l\'agriculture au cœur de son Plan National de Développement 2022–2025, créant un alignement stratégique favorable.'),

        h2('1.2 Analyse des parties prenantes'),
        simpleTable(
          ['Acteur', 'Rôle', 'Influence', 'Posture'],
          [
            ['MAEDR', 'Tutelle réglementaire', 'Très haute', 'Neutre → Favorable'],
            ['CNCA', 'Financement agricole', 'Haute', 'Favorable'],
            ['FENAB/FNGPC', 'Faîtières nationales', 'Haute', 'Championne potentielle'],
            ['Orange Togo', 'Infrastructure Mobile Money', 'Haute', 'Partenaire stratégique'],
            ['Banque Mondiale / IFAD', 'Financement international', 'Très haute', 'En cours d\'approche'],
            ['Union Européenne', 'Subventions innovation', 'Moyenne', 'Favorable'],
            ['Acheteurs (export)', 'Débouchés commerciaux', 'Haute', 'Demandeurs actifs'],
          ]
        ),

        h2('1.3 Analyse concurrentielle'),
        p('FaîtiereHub opère dans un espace quasi-vierge au Togo. Les alternatives existantes sont :'),
        bullet('eSoko (Ghana) : données de prix marchés, sans gestion coopérative — non implanté au Togo'),
        bullet('Twiga Foods (Kenya) : modèle B2B logistique, hors périmètre'),
        bullet('Farmerline (Ghana) : SMS farming tips, sans infrastructure financière'),
        bullet('Systèmes papier des ONG : USAID, FAO — fragmentés, non interopérables'),
        p('Avantage concurrentiel de FaîtiereHub : intégration verticale complète (membres → cartes → cotisations → ATS → matchmaking → paiement → IA agronomique) sur une seule plateforme.'),

        h2('1.4 Analyse de Pareto — 80/20'),
        p('20 % des fonctionnalités génèrent 80 % de la valeur perçue :'),
        bullet('Carte membre numérique avec QR (identité vérifiable)'),
        bullet('Collecte de cotisations via Orange Money'),
        bullet('Score ATS (crédibilité financière du membre)'),
        bullet('Matchmaking acheteur-vendeur (monétisation directe)'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 2 — PLAN DIRECTEUR STRATÉGIQUE 2026-2035
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('II', 'PLAN DIRECTEUR STRATÉGIQUE 2026–2035'),

        h2('2.1 Vision & Mission'),
        callout('Vision : Devenir l\'infrastructure numérique de référence pour l\'agriculture coopérative en Afrique de l\'Ouest d\'ici 2035.'),
        callout('Mission : Donner à chaque producteur africain un identifiant financier, un historique vérifiable et un accès aux marchés.'),

        h2('2.2 Les 5 piliers stratégiques'),
        bullet('Pilier 1 — IDENTITÉ : Carte membre numérique universelle, reconnue par les institutions financières'),
        bullet('Pilier 2 — CONFIANCE : Score ATS comme passeport financier agricole'),
        bullet('Pilier 3 — CONNECTIVITÉ : Réseau acheteurs-vendeurs intégré avec paiement mobile'),
        bullet('Pilier 4 — INTELLIGENCE : IA agronomique embarquée (AgriTogo) pour conseils et alertes'),
        bullet('Pilier 5 — SCALABILITÉ : Architecture multi-tenant prête pour déploiement régional CEDEAO'),

        h2('2.3 Trajectoire temporelle'),
        simpleTable(
          ['Phase', 'Période', 'Objectif clé', 'Revenu cible'],
          [
            ['Fondation', '90 jours (Q3 2026)', '3 faîtières pilotes, 500 membres actifs', '0 (pilote gratuit)'],
            ['Traction', 'An 1 (2027)', '15 coops, 5 000 membres, 1ère cotisation Orange Money', '45 K USD ARR'],
            ['Croissance', 'An 3 (2028)', '40 coops, 25 000 membres, matchmaking actif', '300 K USD ARR'],
            ['Scale', 'An 5 (2030)', '120 coops, 80 000 membres, expansion Ghana/Bénin', '1,2 M USD ARR'],
            ['Domination', 'An 10 (2035)', '400+ coops, 300 000 membres, CEDEAO', '8,5 M USD ARR'],
          ]
        ),

        h2('2.4 Scénarios stratégiques'),
        h3('Scénario A — Optimiste (probabilité : 25 %)'),
        p('Partenariat MAEDR signé en 2026, subvention FIDA obtenue, Orange Money intégré nativement. ARR 2030 : 2,1 M USD. Expansion Ghana dès 2028.'),
        h3('Scénario B — Réaliste (probabilité : 55 %)'),
        p('Croissance organique, 40 coopératives en 2028, cotisations comme principal moteur. ARR 2030 : 1,2 M USD. Breakeven Q3 2029.'),
        h3('Scénario C — Pessimiste (probabilité : 20 %)'),
        p('Résistance au changement forte, déploiement lent. 20 coops en 2028, ARR 2030 : 450 K USD. Breakeven repoussé à 2031.'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 3 — BUSINESS PLAN COMPLET
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('III', 'BUSINESS PLAN COMPLET'),

        h2('3.1 Analyse de marché TAM / SAM / SOM'),
        simpleTable(
          ['Marché', 'Périmètre', 'Taille estimée'],
          [
            ['TAM', 'Togo : 3 000 coops × 200 membres × 50 USD/an', '30 M USD'],
            ['TAM Élargi', 'CEDEAO : 15 pays × facteur 5', '150 M USD'],
            ['SAM', '300 coops actives digitalisables × 200 membres × 50 USD', '3 M USD'],
            ['SOM Year 3', '40 coops × 625 membres × 50 USD', '1,25 M USD'],
            ['SOM Year 5', '120 coops × 667 membres × 50 USD', '4 M USD'],
          ]
        ),

        h2('3.2 Modèle de revenus'),
        simpleTable(
          ['Source', 'Modèle', 'Prix', 'Déclencheur'],
          [
            ['SaaS Coopérative', 'Abonnement mensuel', '150–500 USD/mois', 'Adoption coopérative'],
            ['Frais de transaction', '0,5–1 % du montant payé', 'Variable', 'Cotisation Orange Money'],
            ['Commission matchmaking', '2–3 % de la transaction', 'Variable', 'Vente agrimarket'],
            ['Modules premium', 'Analytique avancée, exports', '50 USD/mois', 'Upsell'],
            ['Données agrégées', 'B2B (assureurs, banques)', '5–20 K USD/an', 'Year 3+'],
            ['Grants publics', 'FAO, IFAD, UE, AFD', '50–300 K USD', 'Projets ciblés'],
          ]
        ),

        h2('3.3 Projections financières sur 10 ans'),
        simpleTable(
          ['Année', 'Coops', 'Membres', 'ARR (USD)', 'Coûts (USD)', 'EBITDA (USD)'],
          [
            ['2026', '3', '500', '0', '120 000', '-120 000'],
            ['2027', '10', '3 000', '45 000', '180 000', '-135 000'],
            ['2028', '25', '12 000', '170 000', '280 000', '-110 000'],
            ['2029 (BE)', '40', '25 000', '380 000', '350 000', '+30 000'],
            ['2030', '75', '50 000', '750 000', '480 000', '+270 000'],
            ['2031', '120', '80 000', '1 200 000', '600 000', '+600 000'],
            ['2033', '220', '150 000', '2 800 000', '900 000', '+1 900 000'],
            ['2035', '400', '300 000', '6 500 000', '1 500 000', '+5 000 000'],
          ]
        ),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 4 — THÉORIE DU CHANGEMENT
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('IV', 'THÉORIE DU CHANGEMENT'),

        h2('4.1 Chaîne de valeur logique'),
        p('INTRANTS → ACTIVITÉS → EXTRANTS → RÉSULTATS → EFFETS → IMPACT'),
        hr(),

        h3('Intrants'),
        bullet('Technologie SaaS (FaîtiereHub)'),
        bullet('Équipe technique et terrain (5 ETP an 1)'),
        bullet('Financement Seed 500 K USD'),
        bullet('Partenariats Orange Money + Africa\'s Talking'),

        h3('Activités'),
        bullet('Onboarding des coopératives (formation terrain)'),
        bullet('Inscription des membres + émission de cartes numériques'),
        bullet('Collecte des cotisations via mobile money'),
        bullet('Calcul et affichage du Score ATS'),
        bullet('Publication d\'annonces sur l\'agrimarket'),

        h3('Extrants'),
        bullet('N membres inscrits avec identité numérique vérifiable'),
        bullet('N FCFA collectés en cotisations digitales'),
        bullet('N transactions matchmaking réalisées'),
        bullet('N alertes agronomiques envoyées'),

        h3('Résultats (12–24 mois)'),
        bullet('Réduction de 60 % du temps de collecte des cotisations'),
        bullet('Augmentation de 40 % du taux de recouvrement'),
        bullet('Accès au crédit facilité via le score ATS'),
        bullet('Prix de vente améliorés grâce à l\'accès direct aux acheteurs'),

        h3('Effets (2–5 ans)'),
        bullet('Renforcement des capacités institutionnelles des coopératives'),
        bullet('Réduction de l\'asymétrie d\'information producteur-acheteur'),
        bullet('Formalisation progressive de l\'épargne agricole'),

        h3('Impact (5–10 ans)'),
        bullet('Augmentation durable des revenus agricoles (+20–35 %)'),
        bullet('Réduction de la pauvreté rurale dans les zones d\'intervention'),
        bullet('Modèle réplicable à l\'échelle CEDEAO'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 5 — MÉMO D'INVESTISSEMENT
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('V', 'MÉMO D\'INVESTISSEMENT'),

        h2('5.1 Structure des levées de fonds'),
        simpleTable(
          ['Round', 'Montant', 'Timing', 'Investisseurs cibles', 'Usage'],
          [
            ['Pré-Seed', '150 K USD', 'Q2 2026', 'Fondateurs + FFF', 'MVP + 3 pilotes'],
            ['Seed', '500 K USD', 'Q4 2026', 'Impact investors, FNFI, CNCA', 'Scale 25K membres'],
            ['Grants', '300 K USD', '2027–2028', 'IFAD, FAO, AFD, UE', 'Formation + impact'],
            ['Série A', '2,5 M USD', 'Q2 2029', 'VC Afrique (Partech, TLcom)', 'Expansion CEDEAO'],
            ['Série B', '8 M USD', '2031', 'PE Impact + DFIs', 'Domination régionale'],
          ]
        ),

        h2('5.2 Utilisation du Seed (500 K USD)'),
        simpleTable(
          ['Poste', 'Montant', 'Proportion'],
          [
            ['Équipe tech (2 devs + 1 PM, 18 mois)', '180 000 USD', '36 %'],
            ['Équipe terrain (5 agents, 12 mois)', '90 000 USD', '18 %'],
            ['Infrastructure cloud + SMS + Mobile Money', '60 000 USD', '12 %'],
            ['Marketing & acquisition coopératives', '50 000 USD', '10 %'],
            ['Juridique + compliance + certifications', '40 000 USD', '8 %'],
            ['Opérations & bureau Lomé', '50 000 USD', '10 %'],
            ['Réserve (6 %)', '30 000 USD', '6 %'],
          ]
        ),

        h2('5.3 Métriques clés (KPIs investisseurs)'),
        bullet('MRR (Monthly Recurring Revenue) — cible 12 000 USD à M18'),
        bullet('CAC (Coût d\'acquisition coopérative) — cible < 800 USD'),
        bullet('LTV (Lifetime Value coopérative) — cible > 8 000 USD (LTV/CAC > 10×)'),
        bullet('Churn annuel — cible < 5 %'),
        bullet('NPS — cible > 50 (early adopters)'),
        bullet('Volume transactions matchmaking — cible 50 K USD/mois à M24'),

        h2('5.4 Retours projetés (Seed 500 K USD)'),
        simpleTable(
          ['Scénario', 'Valorisation 2035', 'Multiple (MOIC)', 'IRR'],
          [
            ['Pessimiste', '4,5 M USD', '2,2×', '8 %'],
            ['Réaliste', '18 M USD', '6,2×', '34 %'],
            ['Optimiste', '45 M USD', '15×', '58 %'],
          ]
        ),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 6 — FEUILLE DE ROUTE OPÉRATIONNELLE
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('VI', 'FEUILLE DE ROUTE OPÉRATIONNELLE'),

        h2('6.1 Plan 90 jours — Actions immédiates'),
        simpleTable(
          ['Semaine', 'Action prioritaire', 'Responsable', 'Critère de succès'],
          [
            ['S1–S2', 'Sélectionner 3 coopératives pilotes (Maritime)', 'CEO + Terrain', '3 MOU signés'],
            ['S3–S4', 'Former les agents de terrain (onboarding FaîtiereHub)', 'CTO + Terrain', '5 agents certifiés'],
            ['S5–S6', 'Inscrire les 500 premiers membres (données + cartes)', 'Terrain', '500 membres actifs'],
            ['S7–S8', 'Première collecte de cotisation Orange Money', 'Product', '1 paiement réel confirmé'],
            ['S9–S10', 'Dashboard KPIs opérationnel (CEO view)', 'CTO', 'Dashboard live'],
            ['S11–S12', 'Revue pilote + ajustements + dossier investisseur', 'CEO', 'Deck Seed finalisé'],
          ]
        ),

        h2('6.2 Jalons 12 mois'),
        bullet('M3 : 3 coopératives en production, 500 membres'),
        bullet('M6 : 10 coopératives, 3 000 membres, ARR 15 K USD'),
        bullet('M9 : Seed levé (500 K USD), équipe 8 personnes'),
        bullet('M12 : 15 coopératives, 5 000 membres, matchmaking lancé, ARR 45 K USD'),

        h2('6.3 Plan de recrutement 36 mois'),
        simpleTable(
          ['Profil', 'Timing', 'Priorité'],
          [
            ['CTO full-stack (Next.js + Supabase)', 'M1', 'Critique'],
            ['Agent terrain (×3, région Maritime)', 'M2', 'Critique'],
            ['Product Manager', 'M4', 'Haute'],
            ['Commercial B2B (acheteurs)', 'M6', 'Haute'],
            ['Data Analyst / IA', 'M9', 'Moyenne'],
            ['Country Manager Ghana', 'M24', 'Expansion'],
          ]
        ),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 7 — CARTOGRAPHIE DES POUVOIRS
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('VII', 'CARTOGRAPHIE DES POUVOIRS'),

        h2('7.1 Matrice Influence × Intérêt'),
        simpleTable(
          ['Acteur', 'Influence', 'Intérêt', 'Stratégie'],
          [
            ['MAEDR', 'Très haute', 'Moyen → Élevé', 'Briefings réguliers, protocole d\'accord'],
            ['CNCA (banque agri)', 'Haute', 'Élevé', 'Intégrer le score ATS comme KYC'],
            ['FENAB', 'Haute', 'Très élevé', 'Co-créer avec eux, les positionner comme champions'],
            ['Orange Togo', 'Haute', 'Élevé', 'Partenariat API Mobile Money exclusif Y1'],
            ['Banque Mondiale', 'Très haute', 'Moyen', 'Documenter l\'impact, rapport semestriel'],
            ['IFAD', 'Haute', 'Élevé', 'Dossier grant Q4 2026'],
            ['FAO Togo', 'Moyenne', 'Élevé', 'Pilote conjoint sur fiches techniques'],
            ['Union Européenne', 'Moyenne', 'Moyen', 'Appels à projets digitalisation rurale'],
            ['Acheteurs locaux', 'Moyenne', 'Très élevé', 'Onboarding prioritaire Y1'],
            ['Exportateurs', 'Moyenne', 'Élevé', 'Programme certif + traçabilité Y2'],
          ]
        ),

        h2('7.2 Risques politiques et mitigation'),
        bullet('Risque : changement de gouvernement → stratégie multi-partis, ancrage institutionnel FENAB'),
        bullet('Risque : réglementation Mobile Money restrictive → diversifier vers TMoney/Moov dès disponible'),
        bullet('Risque : ONG concurrente subventionnée → avantage compétitif prix + intégration verticale'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 8 — STRATÉGIE DE FINANCEMENT
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('VIII', 'STRATÉGIE DE FINANCEMENT'),

        h2('8.1 Mix de financement optimal'),
        p('FaîtiereHub adopte une stratégie de financement hybride combinant capitaux risque impact, subventions non-dilutives et revenus récurrents précoces.'),
        simpleTable(
          ['Source', 'Montant total', 'Dilution', 'Timing'],
          [
            ['Pré-seed (fondateurs)', '150 K USD', '20 %', 'Fait'],
            ['Seed VC impact', '500 K USD', '20 %', 'Q4 2026'],
            ['Grants IFAD/FAO/AFD', '300 K USD', '0 %', '2027–2028'],
            ['Revenu ARR réinvesti', '500 K USD cumulé', '0 %', '2027–2029'],
            ['Série A VC', '2,5 M USD', '25 %', '2029'],
            ['Série B DFIs', '8 M USD', '20 %', '2031'],
          ]
        ),

        h2('8.2 Investisseurs cibles prioritaires'),
        bullet('Partech Africa (Dakar) — VC spécialisé tech africaine, ticket 500 K–5 M USD'),
        bullet('TLcom Capital (Lagos/Nairobi) — impact tech, agriculture'),
        bullet('Oikocredit (Pays-Bas) — financement coopératives, mission alignée'),
        bullet('Lundin Foundation — agriculture, Afrique de l\'Ouest'),
        bullet('FNFI Togo — fonds national financement inclusif'),
        bullet('IFC (World Bank Group) — prêts + equity pour scale'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 9 — PLAN D'EXÉCUTION TERRAIN
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('IX', 'PLAN D\'EXÉCUTION TERRAIN'),

        h2('9.1 Déploiement régional par phases'),
        simpleTable(
          ['Phase', 'Région', 'Période', 'Coops cibles', 'Justification'],
          [
            ['Phase 1', 'Maritime (Lomé + périphérie)', 'Q3–Q4 2026', '5 coops', 'Proximité, connectivité, early adopters'],
            ['Phase 2', 'Plateaux (Kpalimé, Atakpamé)', 'Q1–Q2 2027', '10 coops', 'Cacao, café — marchés export'],
            ['Phase 3', 'Kara + Centrale', 'Q3–Q4 2027', '10 coops', 'Coton, maïs — forte densité coops'],
            ['Phase 4', 'Savanes (Dapaong)', 'Q1–Q2 2028', '5 coops', 'Sésame, mil — zone IFAD'],
            ['Phase 5', 'Saturation nationale', '2028–2030', '40+ coops', 'Passage à l\'échelle'],
          ]
        ),

        h2('9.2 Tiers d\'adoption des coopératives'),
        h3('Tier 1 — Pionnières (0–6 mois)'),
        p('Coopératives avec leadership jeune, smartphone pénétration > 40 %, taille 50–300 membres. Accès gratuit 6 mois, accompagnement intensif, témoignages vidéo.'),
        h3('Tier 2 — Early Majority (6–18 mois)'),
        p('Coopératives membres de faîtières nationales (FENAB, FNGPC). Abonnement réduit 50 % an 1. Formation par les Tier 1.'),
        h3('Tier 3 — Late Majority (18–36 mois)'),
        p('Coopératives rurales reculées. Accès via agents terrain. Version allégée SMS-first pour zones sans internet.'),

        h2('9.3 Acquisition des acheteurs'),
        bullet('Y1 : 5 grossistes Lomé (céréales, légumes) — démarchage direct'),
        bullet('Y1 : 2 exportateurs (café/cacao) — via réseau FENAB'),
        bullet('Y2 : Supermarchés locaux (Hyper U Lomé) — sourcing local certifié'),
        bullet('Y2 : Plateformes régionales (GreenCart, Twiga) — API integration'),
        bullet('Y3 : Export UE (certification GlobalG.A.P. via traçabilité FaîtiereHub)'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // LIVRABLE 10 — RAPPORT FINAL
        // ══════════════════════════════════════════════════════════════════

        sectionTitle('X', 'RAPPORT FINAL — SYNTHÈSE ET RECOMMANDATIONS'),

        h2('10.1 Les 10 priorités absolues'),
        simpleTable(
          ['#', 'Priorité', 'Impact', 'Urgence'],
          [
            ['1', 'Signer 3 MOU avec coopératives pilotes Maritime', 'Critique', 'Immédiate'],
            ['2', 'Finaliser l\'intégration Orange Money (paiement réel)', 'Critique', 'Immédiate'],
            ['3', 'Lancer la levée Seed 500 K USD (deck + data room)', 'Critique', 'Q3 2026'],
            ['4', 'Recruter CTO + 3 agents terrain', 'Très haute', 'Q3 2026'],
            ['5', 'Déposer dossier grant IFAD/FAO', 'Haute', 'Q4 2026'],
            ['6', 'Sécuriser partenariat FENAB/FNGPC', 'Haute', 'Q4 2026'],
            ['7', 'Atteindre 25 000 membres actifs (gating Série A)', 'Critique', 'Fin 2028'],
            ['8', 'Lancer module matchmaking B2B (acheteurs)', 'Haute', 'Q2 2027'],
            ['9', 'Audit sécurité + certification ISO 27001 (bailleurs)', 'Moyenne', '2027'],
            ['10', 'Préparer expansion Ghana/Bénin (Year 3)', 'Moyenne', '2028'],
          ]
        ),

        h2('10.2 Les 10 erreurs fatales à éviter'),
        bullet('1. Construire des fonctionnalités sans utilisateurs réels — valider le terrain d\'abord'),
        bullet('2. Ignorer la résistance au changement des leaders coopératifs seniors'),
        bullet('3. Dépendre d\'un seul bailleur ou d\'un seul partenaire technologique'),
        bullet('4. Négliger la connectivité rurale — prévoir un mode offline-first dès le départ'),
        bullet('5. Sous-estimer les coûts de terrain (formation, déplacement, support)'),
        bullet('6. Brûler la trésorerie avant le breakeven — runway minimum 18 mois en permanence'),
        bullet('7. Oublier la conformité réglementaire BCEAO pour le traitement des paiements'),
        bullet('8. Copier sans adapter — les modèles East Africa (M-Pesa, iShamba) ne s\'importent pas naïvement'),
        bullet('9. Négliger la rétention au profit de l\'acquisition — le churn tue avant la croissance'),
        bullet('10. Scaler trop vite géographiquement avant la maîtrise du marché local'),

        h2('10.3 Les 5 opportunités majeures non exploitées'),
        bullet('CRÉDIT AGRICOLE NUMÉRIQUE : Le score ATS peut devenir un scoring de crédit reconnu par les banques (CNCA) → produit fintech B2B2C'),
        bullet('ASSURANCE PARAMÉTRIQUE : Les données météo + production créent la base d\'un produit assurance-récolte (partenaire Sanlam, NSIA)'),
        bullet('CERTIFICATION TRAÇABILITÉ : L\'historique production → carte → vente crée un certificat d\'origine vérifiable pour l\'export UE'),
        bullet('MARKETPLACE INTRANTS : Envers du matchmaking — vendre semences/engrais aux membres via le réseau (modèle Twiga inversé)'),
        bullet('DATA PLAY : Vendre des insights agrégés anonymisés aux assureurs, banques et gouvernements (revenus B2B purs)'),

        h2('10.4 Les 3 scénarios à horizon 2035'),
        h3('Scénario Rouge — FaîtiereHub reste local'),
        p('Faute de financement ou d\'adoption suffisante, FaîtiereHub devient un outil solide pour 50 coopératives togolaises. ARR stabilisé à 600 K USD. Rentable mais non scalé. Valeur de sortie : 3–5 M USD.'),
        h3('Scénario Jaune — FaîtiereHub devient la référence togolaise'),
        p('Partenariat MAEDR institutionnalisé, 200 coopératives, 100 000 membres. ARR 3 M USD en 2035. Base pour Série A. Valeur 15–25 M USD.'),
        h3('Scénario Vert — FaîtiereHub devient l\'infrastructure CEDEAO'),
        p('Après succès au Togo, déploiement Ghana + Bénin + Côte d\'Ivoire. 600 000 membres, ARR 12 M USD. Acquisition par Mastercard Foundation ou IFC. Valeur 60–100 M USD.'),

        hr(),

        h2('10.5 Le chemin en 7 étapes vers l\'infrastructure nationale'),
        p('La probabilité du Scénario Vert repose sur l\'exécution séquentielle rigoureuse de 7 étapes :'),
        bullet('Étape 1 : Prouver le modèle (3 coops, 500 membres, 1 paiement réel) — Fin 2026'),
        bullet('Étape 2 : Lever le Seed et constituer l\'équipe (8 personnes) — Q4 2026'),
        bullet('Étape 3 : Atteindre la PMF (Product-Market Fit) avec NPS > 50 — M12'),
        bullet('Étape 4 : Passer à 25 000 membres (gating Série A) — Fin 2028'),
        bullet('Étape 5 : Signer un accord institutionnel MAEDR ou FENAB — 2027'),
        bullet('Étape 6 : Lancer les premiers produits FinTech (crédit, assurance) — 2029'),
        bullet('Étape 7 : Expansion CEDEAO avec capital Série A — 2030'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // ANNEXE
        // ══════════════════════════════════════════════════════════════════

        h1('ANNEXES'),

        h2('Annexe A — Architecture technique FaîtiereHub'),
        p('Stack technologique : Next.js 15 (App Router), Supabase (PostgreSQL 17, Auth, Realtime, Storage), Vercel Edge, Orange Money API, Africa\'s Talking SMS, AgriTogo IA (DeepSeek + Gemini).'),
        bullet('Base de données : PostgreSQL 17 avec Row Level Security, 40+ tables'),
        bullet('Authentification : Supabase Auth (email, OTP SMS)'),
        bullet('Paiements : Orange Money (intégré), TMoney/Moov (à venir)'),
        bullet('Notifications : In-app (Realtime) + SMS (Africa\'s Talking) + Push'),
        bullet('IA embarquée : AgriTogo NLP — conseils agronomiques + alertes météo'),
        bullet('Score ATS : algorithme propriétaire 0–1000 (5 dimensions)'),
        bullet('Cartes membres : SVG renderer + QR Code + impression A4'),

        h2('Annexe B — Score ATS — Détail des 5 dimensions'),
        simpleTable(
          ['Dimension', 'Poids', 'Signal mesuré'],
          [
            ['Cotisation', '30 %', 'Régularité et complétude des paiements annuels'],
            ['Production', '25 %', 'Volume et diversification des cultures déclarées'],
            ['Engagement', '20 %', 'Participation réunions, activité plateforme'],
            ['Ancienneté', '15 %', 'Durée d\'appartenance à la coopérative'],
            ['Parcelle', '10 %', 'Surface enregistrée et géolocalisée'],
          ]
        ),

        h2('Annexe C — Glossaire'),
        bullet('ATS : Agricultural Trust Score — score de confiance agricole propriétaire'),
        bullet('MAEDR : Ministère de l\'Agriculture, de l\'Élevage et du Développement Rural'),
        bullet('CNCA : Caisse Nationale de Crédit Agricole'),
        bullet('FENAB : Fédération Nationale des Groupements et Coopératives Agricoles du Bénin (partenaire régional)'),
        bullet('FNGPC : Fédération Nationale des Groupements et Coopératives du Togo'),
        bullet('BCEAO : Banque Centrale des États de l\'Afrique de l\'Ouest'),
        bullet('DFI : Development Finance Institution (BEI, IFC, Proparco)'),
        bullet('ARR : Annual Recurring Revenue'),
        bullet('MOIC : Multiple on Invested Capital'),
        bullet('IRR : Internal Rate of Return (Taux de Rendement Interne)'),

        pageBreak(),

        // ══════════════════════════════════════════════════════════════════
        // SIGNATURE
        // ══════════════════════════════════════════════════════════════════

        new Paragraph({
          children: [new TextRun({ text: '─────────────────────────────────────────', color: COLORS.lightGray })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'FaîtiereHub', bold: true, size: 28, color: COLORS.primary })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'infrastructure numérique agricole — Togo', italics: true, size: 22, color: COLORS.secondary })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'contact@faitierehub.com  ·  www.faitierehub.com', size: 20, color: COLORS.lightGray })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Ce document est confidentiel. Toute reproduction ou diffusion sans autorisation écrite est interdite.',
            size: 18, color: COLORS.lightGray, italics: true,
          })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    },
  ],
})

// ─── Generate file ───────────────────────────────────────────────────────────
const buffer = await Packer.toBuffer(doc)
const outputPath = '/home/user/Saas/FaîtiereHub_Conseil_Stratégique_Suprême_2026.docx'
writeFileSync(outputPath, buffer)
console.log(`✅ Document généré : ${outputPath}`)
console.log(`📄 Taille : ${(buffer.length / 1024).toFixed(1)} Ko`)

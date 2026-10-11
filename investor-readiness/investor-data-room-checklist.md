# Data room — liste de contrôle

Mise à jour : 11 octobre 2026 (skill `data-room-prep`). Statuts : **DISPONIBLE** (pièce existante et
vérifiée), **À PRODUIRE** (l'information existe, le document non), **MANQUANT** (ni l'un ni
l'autre, ou inconnu de l'équipe technique).

> Rien n'a été envoyé à qui que ce soit. Aucune donnée personnelle de membre ne doit figurer dans
> la data room.

## 1. Société
| Pièce | Statut | Source / remarque |
|---|---|---|
| Statuts, immatriculation (RCCM), siège | MANQUANT | À fournir par le fondateur |
| Table de capitalisation (cap table) | MANQUANT | |
| Pactes d'associés, BSPCE ou équivalent | MANQUANT | |
| Cession de la propriété intellectuelle (code, marque, domaine) à la société | MANQUANT | Le dépôt GitHub appartient au compte `Louistatch` : à documenter |
| Propriété du domaine faitierehub.com | MANQUANT | |

## 2. Produit et technique
| Pièce | Statut | Source |
|---|---|---|
| Audit technique | DISPONIBLE | `investor-readiness/technical-audit.md` |
| Architecture | DISPONIBLE | `ARCHITECTURE.md`, `CLAUDE.md` |
| Tests automatisés et CI | DISPONIBLE | `.github/workflows/ci.yml`, `tests/`, `e2e/` |
| Rapport de sécurité (RLS, isolation) | DISPONIBLE (partiel) | `technical-audit.md` ; correctifs en attente de validation |
| Feuille de route | DISPONIBLE | `product-roadmap.md` |
| Inventaire des licences open source | À PRODUIRE | `npx license-checker` |
| Plan de continuité / sauvegardes Supabase | À PRODUIRE | Vérifier l'offre Supabase (PITR) |

## 3. Commercial
| Pièce | Statut | Source |
|---|---|---|
| Registre de traction | DISPONIBLE | `traction-evidence-register.md` |
| Contrat ou convention avec FENOMAT | MANQUANT | Partenaire cité dans `docs/monetization/plan-1m-fcfa-decembre.md` |
| Lettres d'intention d'autres organisations | MANQUANT | |
| Grille tarifaire appliquée | À PRODUIRE | Les prix affichés (`app/pricing`) ne sont pas facturés |
| Pipeline commercial | À PRODUIRE | Demandes d'accès en base (`contact_messages`) |

## 4. Finance
| Pièce | Statut | Source |
|---|---|---|
| Comptes annuels / relevés bancaires | MANQUANT | |
| Relevés des paiements encaissés (FedaPay, CinetPay, Orange Money) | À PRODUIRE | Tables de paiement + relevés prestataires |
| Modèle financier | À PRODUIRE | Hypothèses dans `financial-model-assumptions.md` |
| Utilisation des fonds | À PRODUIRE | Proposition dans `fundraising-strategy.md` |

## 5. Juridique et conformité
| Pièce | Statut | Source |
|---|---|---|
| CGU, politique de confidentialité | À VÉRIFIER | Pages publiques du site |
| Déclaration / conformité IPDCP (loi togolaise n° 2019-014 sur les données personnelles) | MANQUANT | Données de membres, photos, signatures, téléphones |
| Contrats prestataires (Supabase, Vercel, paiements, SMS) | MANQUANT | |

## 6. Risques
Voir la section « Risques » de `technical-audit.md` et de `fundraising-strategy.md`.

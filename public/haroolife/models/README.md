# Modèles 3D HarooLife (optionnels)

Déposez ici des fichiers **GLB** : le village 3D les utilise automatiquement. Un fichier absent = formes simples de repli.

| Fichier | Remplace | Échelle appliquée |
|---|---|---|
| `hut.glb` | case (3 exemplaires dans la Maison des équipes) | ×1,6 |
| `tree.glb` | arbre (place du village, bordure) | ×1,8 |
| `villager.glb` | villageois (un par groupe / participation) | ×1 |

Les échelles se règlent dans `MODELS` (`components/haroolife/village-3d.tsx`).

## Consignes
- Origine au centre du **pied** du modèle, axe Y vers le haut, taille d'environ 1 unité (≈ 1 m).
- Poids : viser **moins de 300 Ko** par fichier (compresser les textures, pas de textures 4K).
- **Licence : CC0 ou équivalent de préférence.** Pour toute licence exigeant une attribution (CC-BY), ajouter la mention dans `CREDITS.md` ici avant de livrer.
- Sources libres connues : packs « Nature Kit » de Kenney et packs de Quaternius (vérifier la licence et le format GLB du pack téléchargé).
- Les fichiers sont servis tels quels depuis `/haroolife/models/` ; aucune variable d'environnement n'est nécessaire en plus de `NEXT_PUBLIC_HAROOLIFE_3D=true`.

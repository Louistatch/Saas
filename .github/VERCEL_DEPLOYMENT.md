# Déploiement Vercel

L’intégration native Vercel ↔ GitHub déploie automatiquement chaque push sur `main`
et affiche son statut sur le commit. Le workflow `CI` vérifie le code séparément.

Cette documentation reste hors de `.github/workflows/` : un fichier YAML contenant
uniquement des commentaires serait interprété comme un workflow invalide et
déclencherait des notifications « No jobs were run ».

[Tableau de bord Vercel](https://vercel.com/issodo052-7639s-projects/saas)

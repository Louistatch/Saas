#!/usr/bin/env bash
#
# scripts/git-cleanup-large-media.sh  (DUP-05)
#
# Purges the 35MB demo-video.mp4 (and any other large media) from the ENTIRE
# Git history using git-filter-repo. This rewrites history — every collaborator
# must re-clone afterwards. Coordinate before running.
#
# Prerequisite:
#   pipx install git-filter-repo        # or: brew install git-filter-repo
#
# Usage:
#   bash scripts/git-cleanup-large-media.sh
#
set -euo pipefail

echo "==> Pre-flight checks"
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "ERROR: git-filter-repo not installed."
  echo "  pipx install git-filter-repo   (or)   brew install git-filter-repo"
  exit 1
fi

# Safety: refuse to run on a dirty tree.
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree not clean. Commit or stash first."
  exit 1
fi

echo "==> 1. Tag a backup of current HEAD (recoverable if needed)"
git tag -f pre-media-cleanup-backup

echo "==> 2. Show the current repo size before cleanup"
du -sh .git

echo "==> 3. Strip large media from ALL history"
# --invert-paths keeps everything EXCEPT the listed paths.
git filter-repo --force --invert-paths \
  --path public/demo-video.mp4 \
  --path-glob '*.mp4' \
  --path-glob '*.mov' \
  --path-glob '*.webm'

echo "==> 4. Expire reflogs and aggressively gc to reclaim space"
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "==> 5. Repo size after cleanup"
du -sh .git

cat <<'NEXT'

==> DONE. Next manual steps:

  1. Verify the build still works:  npm run build
  2. Re-add the remote (filter-repo removes it by design):
       git remote add origin <YOUR_REMOTE_URL>
  3. Force-push the rewritten history (coordinate with the team!):
       git push origin --force --all
       git push origin --force --tags
  4. EVERY collaborator must re-clone — old clones still contain the blob.
  5. Host the video on object storage instead:
       - Vercel Blob:        @vercel/blob put public/demo-video.mp4
       - Cloudflare R2 / S3:  upload + reference the public URL
       - Supabase Storage:    a public 'marketing' bucket
     Then reference it via an env var, e.g. NEXT_PUBLIC_DEMO_VIDEO_URL.

NEXT

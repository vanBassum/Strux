#!/usr/bin/env bash
# THE definition of a complete firmware release: a published (non-draft) GitHub
# release carrying <project>-<board>-factory.bin and <project>-<board>-app.bin for
# every board folder. Used by the final-promotion gate (release-tag.yml) AND by
# the final release that republishes those files (release.yml), so the two can
# never disagree about what promotion needs.
#   release-assets.sh <tag>      exits non-zero, naming what is missing
# Run from the repository root, with GH_TOKEN.
set -euo pipefail
tag=$1
project=$(grep -oP '^project\(\K[A-Za-z0-9_-]+(?=\))' CMakeLists.txt || true)
[ -n "$project" ] || { echo "::error::No project() name in CMakeLists.txt"; exit 1; }
draft=$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft 2>/dev/null || echo missing)
[ "$draft" = false ] || { echo "::error::$tag has no published release (did its build fail?)"; exit 1; }
assets=$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json assets --jq '.assets[].name')
for b in $(ls main/hardware/boards); do
  for f in "$project-$b-factory.bin" "$project-$b-app.bin"; do
    grep -qx "$f" <<<"$assets" || { echo "::error::$tag is missing $f"; exit 1; }
  done
done
echo "$tag: complete"

#!/usr/bin/env bash
# Puts an issue on the Strux pipeline board and sets its Status column.
#   board.sh <issue-number> <Idle|Analysis|Plan review|Build|Acceptation>
# Needs GH_TOKEN with the `project` scope (the AGENT_PAT secret): GITHUB_TOKEN
# cannot reach a user-owned project.
set -euo pipefail
issue=$1 status=$2
owner=vanBassum project=9
project_id=PVT_kwHOAk5Bhs4BmDnx
field_id=PVTSSF_lAHOAk5Bhs4BmDnxzhkuFvg
case $status in
  Idle)          option=5563906c ;;
  Analysis)      option=5f73d7b4 ;;
  "Plan review") option=63538ef1 ;;
  Build)         option=4f816c52 ;;
  Acceptation)   option=2e100057 ;;
  *) echo "::error::Unknown status '$status'"; exit 1 ;;
esac
# item-add is idempotent: an issue already on the board returns its existing item.
item=$(gh project item-add "$project" --owner "$owner" \
  --url "https://github.com/$GITHUB_REPOSITORY/issues/$issue" --format json --jq .id)
gh project item-edit --id "$item" --project-id "$project_id" \
  --field-id "$field_id" --single-select-option-id "$option" > /dev/null
echo "Issue #$issue -> $status"

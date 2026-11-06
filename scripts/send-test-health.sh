#!/usr/bin/env bash
# Posts the sample Health event to the data repo. Needs HABITS_TOKEN (the habits token).
set -euo pipefail

if [ -z "${HABITS_TOKEN:-}" ]; then
  echo "HABITS_TOKEN is not set. Export the habits token first." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $HABITS_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --data @"$root/health-import/fixtures/event.json" \
  https://api.github.com/repos/dhruvmetha/habits-data/dispatches)

echo "HTTP $status"
if [ "$status" != "204" ]; then
  echo "Expected 204. Check the token and its Contents permission." >&2
  exit 1
fi

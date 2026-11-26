#!/usr/bin/env bash
set -euo pipefail

# Clone the private C++ engine into this application without modifying its repository.
# Provide a read-only GitHub token with Contents: Read access to cocomohacomo/sherpa-embed-asr.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${ROOT}/vendor/sherpa-embed-asr"
ENGINE_URL="https://github.com/cocomohacomo/sherpa-embed-asr.git"
ENGINE_REV="294fa2c06f72f01d2dc5345a5cf42a56903fb830"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is required (read-only access to cocomohacomo/sherpa-embed-asr)." >&2
  exit 2
fi

if [[ -e "${DEST}" ]]; then
  echo "Refusing to overwrite existing engine checkout: ${DEST}" >&2
  exit 3
fi

mkdir -p "${ROOT}/vendor"
git init "${DEST}"
git -C "${DEST}" remote add origin "${ENGINE_URL}"

# Use Git's environment-based config and the standard x-access-token Basic scheme.
# The token is never written to git config or passed as a process argument.
AUTH_HEADER="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 | tr -d '\n')"
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
GIT_CONFIG_VALUE_0="${AUTH_HEADER}" \
  git -C "${DEST}" fetch --depth 1 origin "${ENGINE_REV}"
unset AUTH_HEADER

git -C "${DEST}" checkout --detach FETCH_HEAD

ACTUAL="$(git -C "${DEST}" rev-parse HEAD)"
if [[ "${ACTUAL}" != "${ENGINE_REV}" ]]; then
  echo "Engine revision mismatch: expected ${ENGINE_REV}, got ${ACTUAL}" >&2
  exit 4
fi

echo "Checked out sherpa-embed-asr at ${ACTUAL}"
echo "The upstream repository was only fetched; no upstream files were changed."

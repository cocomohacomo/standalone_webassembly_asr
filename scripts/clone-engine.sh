#!/usr/bin/env bash
set -euo pipefail

# Clone the private C++ engine into this application without modifying its repository.
# Provide a read-only GitHub token with Contents: Read access to cocomohacomo/sherpa-embed-asr.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${ROOT}/vendor/sherpa-embed-asr"
ENGINE_URL="https://github.com/cocomohacomo/sherpa-embed-asr.git"
ENGINE_REV="36f8a71e3ed0ea43ca2d9058f62dc0c359e6e04e"

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
# Pass the authorization header through Git's environment-based config so the token
# does not appear in the git process command-line arguments.
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=http.extraheader \
GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer ${GH_TOKEN}" \
  git -C "${DEST}" fetch --depth 1 origin "${ENGINE_REV}"
git -C "${DEST}" checkout --detach FETCH_HEAD

ACTUAL="$(git -C "${DEST}" rev-parse HEAD)"
if [[ "${ACTUAL}" != "${ENGINE_REV}" ]]; then
  echo "Engine revision mismatch: expected ${ENGINE_REV}, got ${ACTUAL}" >&2
  exit 4
fi

echo "Checked out sherpa-embed-asr at ${ACTUAL}"
echo "The upstream repository was only fetched; no upstream files were changed."

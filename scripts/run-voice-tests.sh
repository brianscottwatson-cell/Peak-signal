#!/bin/bash
# Run the voice tests with loopback only.
# Actions injects a credential, and one voice failure path calls the
# GitHub contents API when that credential is set. The test stubs fetch.
# This namespace is what stops a missed stub from leaving the machine.
# Credential variables are cleared before the tests start.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
script="${root}/scripts/run-voice-tests.sh"

if [[ "${VOICE_TESTS_NETNS:-}" != "1" ]]; then
  exec sudo --preserve-env=HOME,PATH unshare --net \
    env VOICE_TESTS_NETNS=1 VOICE_TEST_USER="$(id -un)" HOME="${HOME}" PATH="${PATH}" \
    bash "${script}"
fi

ip link set lo up

exec runuser -u "${VOICE_TEST_USER}" -- env \
  HOME="${HOME}" \
  PATH="${PATH}" \
  GITHUB_TOKEN= \
  GH_TOKEN= \
  GH_ENTERPRISE_TOKEN= \
  GITHUB_ENTERPRISE_TOKEN= \
  ACTIONS_RUNTIME_TOKEN= \
  NPM_TOKEN= \
  NODE_AUTH_TOKEN= \
  bash --noprofile --norc -c '
    set -euo pipefail
    root="$1"
    cd "${root}"
    if [[ ! -d voice/cht/node_modules/express || ! -d voice/cht/node_modules/ws ]]; then
      echo "voice/cht dependencies are not installed" >&2
      exit 1
    fi
    if [[ ! -e voice/node_modules ]]; then
      ln -s cht/node_modules voice/node_modules
    fi
    status=0
    npm test --prefix voice/cht || status=1
    npm test --prefix voice/peak || status=1
    exit "${status}"
  ' bash "${root}"

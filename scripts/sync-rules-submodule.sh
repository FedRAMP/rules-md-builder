#!/usr/bin/env bash

set -euo pipefail

git submodule sync --recursive
git submodule update --init --remote --depth 1 rules

# Keep the submodule working tree focused on the one upstream artifact this repo consumes.
git -C rules sparse-checkout init --no-cone
git -C rules sparse-checkout set --no-cone /fedramp-consolidated-rules.json

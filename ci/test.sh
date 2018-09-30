#!/usr/bin/env bash

# Usage on Semaphore: bash ci/test.sh 10

set -e

NODE_VERSION=${@: -1}

nvm use "$NODE_VERSION"

echo "Testing with NodeJS $(node --version) / $(npm --version) (from '$NODE_VERSION')"

npm install
npm test

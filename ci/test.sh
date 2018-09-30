#!/usr/bin/env bash

# Usage on Semaphore: bash ci/test.sh

set -e

echo "Testing with NodeJS $(node --version) / $(npm --version)"

npm install
npm test

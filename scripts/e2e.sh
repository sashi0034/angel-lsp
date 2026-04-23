#!/usr/bin/env bash

export CODE_TESTS_PATH="$(pwd)/client/out/test"
export CODE_TESTS_WORKSPACE="$(pwd)/client/testFixture"

rm -f "$(pwd)/client/out/test/completion.test.js" "$(pwd)/client/out/test/completion.test.js.map"
rm -f "$(pwd)/client/out/test/diagnostics.test.js" "$(pwd)/client/out/test/diagnostics.test.js.map"

node "$(pwd)/client/out/test/runTest"

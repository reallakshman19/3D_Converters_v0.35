git switch agent/uew-006-master-candidate-comparison
git fetch origin

# Review the exact local scope before staging.
git status --short
git diff --name-only

# Stage only the UEW Work Pack paths.
git add tabs/universal-enrichment-workbench
git add tests/universal-enrichment-workbench-test-helpers.js
git add tests/universal-enrichment-workbench-*.test.js

git diff --cached --name-only
git diff --cached --check

git commit -m "feat: add deterministic master candidate comparison"

# Current main is four commits ahead of the original starting point.
git rebase origin/main

node --test tests/universal-enrichment-workbench-*.test.js
node tests/xml-cii-standalone-static.test.js
node tests/xml-cii-inputxml-enrichment-behavior.test.js
node tests/xml-cii-standalone-preview-diagnostics-audit.test.js
node tests/xml-cii-standalone-weight-match.test.js
node tests/xml-cii-standalone-source-mode-integration.test.js
node tests/xml-cii-standalone-implementation-guard.test.js
git diff --check

git push -u origin agent/uew-006-master-candidate-comparison
git rev-parse HEAD

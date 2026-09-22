#!/bin/bash
# Reproducible Convex-depth audit. Usage: scripts/audit-convex.sh [repo_dir] [name]
REPO="${1:-.}"; NAME="${2:-$(basename "$(cd "$REPO" && pwd)")}"
cd "$REPO" || exit 1
BF=$(find convex -name '*.ts' ! -path '*/_generated/*' ! -name '*.test.ts' 2>/dev/null)
c(){ echo "$BF" | xargs grep -hoE "$1" 2>/dev/null | wc -l | tr -d ' '; }
pq=$(c '=[[:space:]]*query\('); pm=$(c '=[[:space:]]*mutation\('); pa=$(c '=[[:space:]]*action\(')
iq=$(c '=[[:space:]]*internalQuery\('); im=$(c '=[[:space:]]*internalMutation\('); ia=$(c '=[[:space:]]*internalAction\(')
ht=$(c '=[[:space:]]*httpAction\('); htr=$(grep -hoE 'http\.route\(' convex/http.ts 2>/dev/null | wc -l | tr -d ' ')
echo "===== $NAME ($(git rev-parse --short HEAD 2>/dev/null)) ====="
echo "public query/mutation/action : $pq / $pm / $pa"
echo "internal query/mutation/action: $iq / $im / $ia"
echo "httpAction / http.route      : $ht / $htr"
echo "TOTAL functions (+http routes): $((pq+pm+pa+iq+im+ia+ht))  (+$htr routes)"
echo "tables                       : $(grep -hoE 'defineTable\(' convex/schema.ts 2>/dev/null | wc -l | tr -d ' ')"
echo "indexes                      : $(grep -hoE '\.index\(' convex/schema.ts 2>/dev/null | wc -l | tr -d ' ')"
echo "crons                        : $(grep -hoE 'crons\.(interval|cron)\(' convex/crons.ts 2>/dev/null | wc -l | tr -d ' ')"
echo "components (app.use)         : $(grep -hoE 'app\.use\(' convex/convex.config.ts 2>/dev/null | wc -l | tr -d ' ')"
echo "scheduler.runAfter/At        : $(echo "$BF" | xargs grep -hoE 'scheduler\.(runAfter|runAt)\(' 2>/dev/null | wc -l | tr -d ' ')"
echo "test files                   : $(find convex -name '*.test.ts' 2>/dev/null | wc -l | tr -d ' ')"

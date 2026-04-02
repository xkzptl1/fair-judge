#!/usr/bin/env bash
# ----------------------------------------------------------------
# Fair Judge — manual pipeline runner
# Runs the full ingest + discover + promote + analysis sequence
# against the local dev server (which connects to production Supabase).
#
# Usage:
#   ./scripts/run-pipeline.sh
# ----------------------------------------------------------------

set -e

BASE="http://localhost:3000"
NODE="/opt/homebrew/bin/node"

log() { echo "$(date '+%H:%M:%S') $*"; }

# ── Check server ─────────────────────────────────────────────────
if ! curl -s "$BASE" > /dev/null 2>&1; then
  log "Dev server not running. Starting it..."
  "$NODE" node_modules/.bin/next dev > /tmp/fair-judge-dev.log 2>&1 &
  DEV_PID=$!
  for i in {1..30}; do
    curl -s "$BASE" > /dev/null 2>&1 && break
    sleep 1
  done
  log "Dev server ready (PID $DEV_PID)"
  STARTED_SERVER=true
fi

# ── Step 1: Ingest ───────────────────────────────────────────────
log "Step 1/4: Ingesting latest articles..."
INGEST=$(curl -s -X POST "$BASE/api/ingest" -H "Content-Type: application/json")
ADDED=$("$NODE" -e "const r=JSON.parse(process.argv[1]); console.log(r.summary?.totalAdded ?? '?')" "$INGEST" 2>/dev/null || echo "?")
log "  → $ADDED new articles added"

# ── Step 2: Discover ─────────────────────────────────────────────
log "Step 2/4: Discovering new topic candidates..."
DISCOVER=$(curl -s -X POST "$BASE/api/discover" -H "Content-Type: application/json")
CLUSTERS=$("$NODE" -e "const r=JSON.parse(process.argv[1]); console.log(r.clustersFound ?? '?')" "$DISCOVER" 2>/dev/null || echo "?")
log "  → $CLUSTERS clusters found"

# ── Step 3: Enrich ───────────────────────────────────────────────
log "Step 3/4: Enriching candidates with LLM..."
ENRICH=$(curl -s -X POST "$BASE/api/discover/enrich" -H "Content-Type: application/json")
ENRICHED=$("$NODE" -e "const r=JSON.parse(process.argv[1]); console.log(r.enrichment?.enriched ?? '?')" "$ENRICH" 2>/dev/null || echo "?")
log "  → $ENRICHED candidates enriched"

# ── Step 4: Age + Promote + Analysis ────────────────────────────
log "Step 4/4: Aging topics, promoting candidates, generating analysis..."
AGE=$(curl -s -X POST "$BASE/api/discover/age-topics" -H "Content-Type: application/json")
PROMOTED=$("$NODE" -e "const r=JSON.parse(process.argv[1]); console.log(r.autoPromo?.promoted ? 'yes' : 'no')" "$AGE" 2>/dev/null || echo "?")
log "  → auto-promoted: $PROMOTED"

ANALYSIS=$(curl -s -X POST "$BASE/api/ingest/conflict-points" \
  -H "Content-Type: application/json" -d '{}')
PROCESSED=$("$NODE" -e "const r=JSON.parse(process.argv[1]); console.log(r.processed ?? '?')" "$ANALYSIS" 2>/dev/null || echo "?")
log "  → $PROCESSED topics got fresh analysis"

log "Pipeline complete."

if [ "${STARTED_SERVER:-false}" = "true" ]; then
  log "Stopping dev server (PID $DEV_PID)..."
  kill "$DEV_PID" 2>/dev/null || true
fi

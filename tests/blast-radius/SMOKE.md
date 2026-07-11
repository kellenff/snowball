# blast-radius yactt rollout smoke test

Run after PR 2 merges and the operator has installed yactt.

## Prerequisites (one-time)

```bash
gh extension install kellenff/yactt   # or marketplace plugin
deno --version    # expect 2.7.x
```

## Default run (yactt first; falls through to codebase-memory if yactt fails)

```bash
echo '{"gitRoot":"'$(pwd)'","preset":"design","changeSet":{"paths":["README.md"]}}' \
  | node skills/blast-radius/scripts/compute.cjs compute

# Expect:
#   backend: graph | heuristic
#   backend_attempts: ["yactt", ...]   (records what was tried)
#   reason: null | graph-unavailable | repo-not-indexed | ...
```

## Codebase-memory fallback (explicit)

```bash
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory \
  bash -c '<same command>'

# Expect: backend_attempts: ["codebase-memory"]
```

## Heuristic only

```bash
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic \
  bash -c '<same command>'

# Expect: backend: heuristic, status: success, backend_attempts: []
```

## Disable auto-fallback (yactt fails hard, no codebase-memory save)

```bash
SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=0 \
  bash -c '<same command>'

# Expect: backend: heuristic, reason: <yactt-attempt's reason>, no codebase-memory in attempts.
```

## Backward compat

```bash
BLAST_RADIUS_DISABLE_GRAPH=1 bash -c '<same command>'
# Expect: identical envelope to SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic
```

```bash
CBM_CLI_PATH=/path/to/codebase-memory-mcp bash -c '<same command>'
# Expect: codebase-memory CLI redirected to that path; rest of behavior identical.
```

## Cold cache (no yactt installed, no codebase-memory available)

```bash
unset SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND
<same command>
# Expect: backend: heuristic, status: degraded, reason: graph-unavailable,
#          backend_attempts: ["yactt","codebase-memory"]
```

#!/bin/bash
# Tests fixture: returns a fixed codebase-memory CLI JSON shape.
# Used by blast-radius contract tests so compute.cjs can shell out to a
# stand-in codebase-memory-mcp binary on PATH.
case "$2" in
  list_projects)
    echo '{"projects":[{"name":"stub-cbm-project","root_path":"'"$BUN_TEST_GIT_ROOT"'"}]}'
    ;;
  detect_changes)
    echo '{"impacted_symbols":[{"name":"stub-fn-1"},{"name":"stub-fn-2"}]}'
    ;;
  search_graph)
    echo '{"results":[{"qualified_name":"stub.fn_a","in_degree":1},{"qualified_name":"stub.fn_b","in_degree":2}]}'
    ;;
  *)
    echo '{}'
    ;;
esac

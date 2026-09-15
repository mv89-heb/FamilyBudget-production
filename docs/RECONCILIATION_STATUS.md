# Reconciliation status

The production database currently contains legacy bank transactions without fingerprints. Reconciliation must classify these rows before any mutation.

The maintenance tooling is read-only by default and distinguishes safe unique backfills from collision groups. Collision groups must never be auto-deleted or auto-merged.

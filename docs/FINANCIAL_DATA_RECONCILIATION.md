# Financial data reconciliation

The reconciliation tooling is intentionally read-only.

## Classification

- `SAFE_BACKFILL`: a legacy transaction has a unique deterministic identity and can safely receive a fingerprint.
- `ALREADY_MATCHED`: the stored fingerprint matches the deterministic identity.
- `COLLISION`: multiple rows resolve to the same deterministic identity. These rows require business-level review and must not be automatically merged or deleted.

## Production procedure

1. Run `npm run audit:financial-data` against a controlled environment with the production `DATABASE_URL`.
2. Review every `COLLISION` group.
3. Backfill only `SAFE_BACKFILL` rows with a reviewed migration or one-off maintenance operation.
4. Resolve true duplicate rows separately, preserving an audit trail.
5. Re-run the audit and require zero unexpected collisions before declaring the dataset reconciled.

The application does not automatically delete or merge financial records based only on matching date, amount, note, or merchant data.

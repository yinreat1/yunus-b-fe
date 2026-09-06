# ProPOS final QA

## Static checks completed
- App.tsx reviewed: online prop is explicitly passed into PCLayout.
- Product form: min stock defaults to 0 and input validation prevents negative stock/min stock.
- Discount validation: active discount price must be non-negative and strictly below regular price.
- completeSale validates quantities, payment totals, cash/card underpayment, and credit customer requirement.
- Offline sales use a client_ref/queue_id for idempotent replay.
- Stock rollback falls back if the RPC returns false/error.
- Final SQL migration adds client_ref uniqueness and non-negative constraints.
- Trash/restore/partial-return SQL handles split-credit balances.
- React error boundary prevents silent white-screen errors.

## Runtime limitation
Full npm dependency installation/build could not be completed in the sandbox because the package install transport timed out. The delivered source was inspected statically; a local `npm ci && npm run typecheck && npm run build` is still required before production deployment.

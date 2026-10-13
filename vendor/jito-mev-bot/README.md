# Jito analysis provenance

Upstream: https://github.com/jito-labs/mev-bot

Commit: f02016bb646a99a3542cfd54cb7e13160d96289e

The original `analyze/trades.ipynb` is included unchanged for auditability. `LICENSE` is the upstream Apache-2.0 license. `PROVENANCE.json` records SHA-256 digests of both files.

Flowwatch's `hosted/jito-analysis.js` adapts the notebook's record counts, restart-header handling and landed-tip summary into browser JavaScript. Changes include strict CSV/boolean validation, exact integer accounting, grouping estimated values by source mint, separate acceptance/landing counts, and explicit refusal to treat expectedProfit as realized P&L. CSV schema was checked against upstream `src/send-bundle.ts` at the pinned commit.

The upstream execution engine and its dependency tree are not included or invoked. This analytics component supplies no signing, bundle submission, mempool access or trading functionality.

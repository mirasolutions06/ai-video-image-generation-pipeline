# Contributing

Thanks for taking a look at Content Engine. The repo should stay easy to run
locally, honest about paid-provider boundaries, and clear about what is generated
versus curated.

## Local checks

```bash
npm install
npm run check
```

Provider calls are mocked in the test suite; no live API keys are needed for the
standard checks.

## What makes a good change

- Keep dry runs useful: a reader should be able to estimate cost before making
  paid API calls.
- Keep provider adapters isolated to `src/providers/`.
- Keep mode-specific behavior inside `src/modes/`.
- Update `README.md`, `docs/architecture.md`, or `docs/operations.md` when setup,
  commands, providers, or mode behavior changes.
- Add tests for config validation, provider mapping, cost math, versioning, and
  no-key/offline paths.

## Before opening a PR

1. Run `npm run check`.
2. Confirm `.env`, `projects/`, `memory/`, generated outputs, and paid-provider
   artifacts are not staged unless intentionally sanitized examples.
3. Explain which mode or provider changed and how it was verified.

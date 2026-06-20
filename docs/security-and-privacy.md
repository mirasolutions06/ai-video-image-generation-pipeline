# Security & Privacy

This package exists to demonstrate the engine **without** publishing anything
sensitive. This document explains what is excluded and why, how the engine
handles credentials and spend, and where the honest gaps are.

## The public / private boundary

There are two repositories:

- **Private (local):** the full working engine — source code, ~60+ brand project
  folders (~3.6 GB of briefs, reference imagery, and generated stills/video),
  the per-brand memory library, the full director prompt library, internal
  campaign plans, and `.env`.
- **Public (this one):** documentation, the case study, diagrams, a single
  synthetic example config, and a small curated set of the author's own sample
  output frames. No source code, no secrets, no client-confidential work.

This package was assembled in a **separate directory with its own fresh git
history**, not by filtering the private repo. That removes the usual leak vector
where a sanitized fork still carries secrets or media in old commits — there is
no shared history to leak from.

## What is intentionally excluded, and why

| Excluded | Why |
|---|---|
| `.env`, API keys, tokens | Live credentials for paid model providers. Never published. |
| Engine source code | Kept private; the design is documented here instead. |
| `projects/**` (briefs, refs, generated media) | Real brand/client creative work and reference photography. Not mine to publish, and large. |
| `memory/brands/**` | Per-brand library of winning frames — the brand's accumulated visual identity. |
| Full director prompt library | The exact enrichment prompts and reference catalog — the core IP. |
| Internal plans / specs | Roadmap and campaign design notes. |
| The full generated-media library | Only a **small curated set** of the author's own concept frames is published (see the README gallery); the rest — and anything resembling confidential client work — stays private. The example config is synthetic. |

## Credential handling

- **Secrets come only from environment variables**, loaded via `dotenv` at
  startup. There are no credentials in source.
- **Verified:** a scan of the source tree (`src/`, `skills/`, tests, configs)
  for key patterns (Google `AIza…`, OpenAI `sk-…`, `fal_…`, bearer tokens, PEM
  blocks, inline `api_key=`) returns **clean**. Keys appear only as *names*
  (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `FAL_KEY`, `HF_API_KEY`,
  `HF_API_SECRET`, `ELEVENLABS_API_KEY`) in `.env.example` with empty values.
- **Least-privilege validation:** each run computes which providers it will
  actually use and validates **only** those keys. An images run that uses only
  Gemini never requires the OpenAI or fal keys; it refuses to start if its own
  required key is missing, with a clear message rather than a mid-run failure.
- The private repo's `.gitignore` excludes `.env`, `.env.local`, all generated
  output (`projects/*/output/`, caches), `memory/`, logs, and the research
  scratch directory — so secrets and media are never committed in the first
  place.

## Spend safety

Because every run spends real money, "safety" here is mostly about not
overspending and not spending by surprise:

- **Dry-run pricing** — `--dry-run` prices a run from an explicit cost map
  before any API call is made.
- **Per-model, per-resolution costing** — image cost is computed from the actual
  model and output resolution, not a flat estimate, so the dry-run number
  matches reality.
- **Approval gates (operator)** — the director presents estimated cost and a
  shot plan for approval before generating, and by convention pauses runs over
  ~$3 or 10 scenes after the first scene for a visual check.
- **Failure isolation** — one scene's provider error is caught, logged, and
  recorded as a null result with zero cost charged for it; the batch continues.
  No silent retry loop that quietly multiplies spend.

## Content & attribution safety

- The opt-in research tier records source URLs as **attribution** and explicitly
  **does not download or redistribute copyrighted images** — it extracts
  technical recipes (lighting, lens, grade) into prose.
- Generation has documented guidance to keep wardrobe and composition within
  providers' content policies (also a practical necessity — see the
  content-filter failure mode in the case study).

## Threat-model honesty

This is a **single-operator CLI**, and the security posture matches that:

- There is **no untrusted input surface** — the operator writes the config; it
  isn't accepting requests from the internet.
- There is **no auth, no multi-tenancy, no network service**, because there is
  no server.
- The main realistic risks are **credential leakage** (mitigated: env-only, scan
  clean, `.env` git-ignored) and **runaway spend** (mitigated by dry-run and
  gates, though see the gap below).

### Honest gaps

- **Cost ceiling is a convention, not enforced in code.** The >$3 / >10-scene
  pause lives in the director's instructions. A hard, code-level ceiling would
  be a real control; right now a careless config could in principle overspend.
- **`.env` is the only secrets mechanism.** Fine for one machine; if this were
  ever shared or hosted, secrets should move to a managed secret store.
- **No audit beyond per-run JSON.** Each run is recorded, but there's no
  tamper-evident or centralized audit log.

These are listed because the point of this package is to show judgment, and
judgment includes naming what isn't done.

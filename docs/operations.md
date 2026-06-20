# Operations

How the engine is actually run, what running it looks like, and the playbook for
the ways it fails. This is the day-to-day operator view.

## The run loop

```
1. Brief        director turns a one-line brief into config.json
2. Price        npm start -- --project <name> --dry-run   # cost, no spend
3. Approve      operator checks the shot plan + estimate
4. Run          npm start -- --project <name>
5. Review       open output/v{N}/ — keep the good, note the bad
6. Iterate      edit one scene's prompt, re-run → output/v{N+1}/ (v{N} preserved)
7. Tag          promote winners into the brand library (memory/)
```

## Commands

| Command | What it does |
|---|---|
| `npm start -- --project <name>` | Run the pipeline for a project (mode from its config) |
| `npm start -- --project <name> --dry-run` | Estimate cost from the cost map; **no API calls** |
| `npm start -- --project <name> --render` | Video mode only — enable the Remotion render path |
| `npm start -- --project <name> --research` | Run the opt-in web-research tier before config |
| `npm test` | Run the full test suite (58 tests, providers mocked) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run remotion` | Open the Remotion studio for the video render path |

## Cost control in practice

- Every run is priced **before** it spends, from an explicit cost map.
- Image cost is computed per model and per resolution (cheap iteration model vs.
  the pro model at 2K/4K), so estimates match the bill.
- The director gates expensive runs (over ~$3 or 10 scenes) behind a human
  check after scene 1 — generate one, vibe-check, then release the rest.
- Cost is accumulated through the run and written into `run.json`, so every
  output folder records exactly what it cost.

Indicative per-unit costs (from the engine's own cost map; provider pricing
changes, so treat as order-of-magnitude):

| Unit | ~Cost |
|---|---|
| Image — cheap iteration model | ~$0.04 |
| Image — pro model @ 2K / 4K | ~$0.13 / ~$0.24 |
| Image — GPT Image (for text) | ~$0.04–0.19 |
| Video clip 5s (provider-dependent) | ~$0.50–1.50 |
| Voiceover (ElevenLabs) | ~$0.50 |
| Captions (Whisper) | ~$0.02 |
| Director enrichment | $0 (skill, no API call) |

## Output & versioning

- Each run creates `output/v{N}/` — monotonic, never overwriting a prior
  version. Re-running after a fix gives you a new version with the old one
  intact for comparison.
- `run.json` in each version snapshots every prompt, every reference, and the
  total cost — the audit trail and the way to reproduce or diff a run.
- It's written atomically (temp file + rename), so an interrupted run can't leave
  a corrupt manifest.

> **Operational caveat:** re-runs currently re-bill every scene. The inheritance
> machinery exists in the versioning layer but isn't wired into the image
> orchestrator yet, so "only pay for what changed" is not true today. The
> practical workaround is to trim the config to just the scene you're fixing, or
> copy good scenes forward between version folders. See the case study's
> known-gaps section.

## The brand-memory flywheel

- Winners are tagged (`hero`, `lifestyle`, `detail`, `portrait`) into
  `memory/brands/{brand}/library/{tag}/`.
- The next run pulls recent winners from the tag buckets matching each scene's
  intent and feeds them in as visual references.
- Net effect: a brand's look gets *more* consistent run over run, and a returning
  brand starts from its own proven recipe (lighting, lens, grade) instead of a
  blank prompt.

## Concurrency & gates

- **Images run sequentially** (`PARALLEL_LIMIT = 1`) on purpose, so the
  after-scene-1 review gate is meaningful before the rest of the batch spends.
- **Video clips** can specify different providers per clip in one run.
- Gates are operator gates (human approval), not automated — this is a
  human-in-the-loop tool by design.

## Observability

- Structured console logging with explicit levels — `step` / `info` / `success`
  / `error` — so a run reads as a clear timeline.
- `run.json` is the durable record per run.
- There is **no** metrics backend or cross-run dashboard; cost and outcomes live
  in per-run JSON. (Listed as a gap, not a feature.)

## Failure-mode playbook

The underlying models fail in specific, repeatable ways. The operator response
for each:

| Symptom | Likely cause | Response |
|---|---|---|
| "No image data" on wardrobe-heavy prompt | Content-filter false positive (probabilistic) | Rephrase wardrobe as closed/covered; assemble the look across runs |
| Garbled small label / text | Diffusion model mangling small type | Face label forward, enlarge hero, inline exact spelling, re-roll — or route to GPT Image |
| Faces drift between scenes | No style anchor | Keep `anchorScenes` on (default) |
| "No image data" with a real model photo + anchor on | Same-person likeness guard tripped | Set `anchorScenes: false` |
| Airbrushed "AI skin" | Default beauty smoothing | Apply the anti-plastic recipe (pore variation, peach fuzz, subsurface, "no skin smoothing") |
| Product rendered oversized | Scale-less reference | Add explicit size words + an in-frame scale object + a firm one-hand hold |
| Deep skin lightened | High-key washout | Pin "deep complexion, never lightened"; temper high-key with warm fill/rim |
| Same product drawn twice drifts | Model redrawing instead of reusing | Generate standalones, then composite |
| One bad scene in an otherwise good batch | Stochastic defect | Don't drip-roll — batch 3 variants of that scene against a checklist, pick a winner |

## Maintenance reality

The largest ongoing cost is **provider drift** — ten external model APIs change
their parameters, pricing, and behavior independently. The adapter boundary
keeps that contained to one file per provider, but it's the thing most likely to
break a run, which is exactly why provider-adapter contract tests are the top
testing priority (see the case study).

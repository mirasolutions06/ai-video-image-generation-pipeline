# Case Study — Mira Content Engine

How I built a single-operator pipeline that turns a brand brief into
campaign-grade imagery and video by orchestrating ~10 generative models, and
the engineering that the model calls themselves turned out to be the *easy*
part.

This is written to be honest about what works, what is a known gap, and what I
would do next. There are no invented metrics.

> **Context:** this engine is the private generation backend behind
> [Mira Content Studio](https://miracontent.studio) (the live customer-facing
> product). This case study is about the *engine* — the orchestration and ops
> underneath — not the storefront.

---

## 1. Problem

I wanted to produce product-photography-grade stills and short-form video for
brands without booking a studio, a photographer, and a model for every idea.
The naive version of this — "call an image model with a prompt" — produces
stock-looking output that no one would pay for, and it produces *different*
stock-looking output every time, so a brand never develops a consistent look.

The real problems, in order of how much time they took:

1. **Quality.** Off-the-cuff prompts give you "a bottle on a table." Getting
   "amber glass jar with bamboo lid on weathered oak, backlit so the glass
   glows" requires thinking like a photographer — light direction, light
   quality, lens, f-stop, film/color grade, a named stylistic reference — every
   single time.
2. **Consistency.** A brand's third campaign should look like it came from the
   same studio as its first. Independent prompts drift.
3. **Spend.** Every run costs real money, and the failure modes (below) tempt
   you into expensive re-roll spirals.
4. **Reproducibility.** When a frame is good, I need to know exactly what
   produced it; when it's bad, I need to change one thing and re-run without
   destroying the good output.
5. **Model failure modes.** These models fail in specific, repeatable,
   non-obvious ways. Most of the engineering value is in encoding the
   workarounds so I don't rediscover them each time.

## 2. System design

The system separates **direction** (deciding what photograph to make) from
**production** (making it), because they have completely different properties:
direction is knowledge-shaped, cheap, and benefits from being human-reviewable;
production is API-shaped, costs money, and benefits from being deterministic and
idempotent.

```
brief ─▶ Director (markdown skill, $0) ─▶ config.json ─▶ Pipeline (TypeScript CLI) ─▶ output/v{N}/
            │                                                   │
            └── reference library                               └── brand library (memory/) ◀── tag winners
                (photographers, lighting,                                    │
                 lenses, grades, categories)                                 └── fed back as refs next run
```

### The director is markdown, not code

The "photography director" is a structured markdown knowledge base, not a model
call and not a code module. It encodes a reference library (30+ photographers
with style fingerprints, 15+ named lighting setups, lens language, color/film
grades, pose library, an editorial archive) and per-category playbooks
(skincare, fashion, food/CPG, tech, product-marketing, short-form social). It
turns a brief into a config where **every shot is a fully-specified photographic
brief** with hard rules: name the materials exactly, state light direction and
quality, give a lens and f-stop, name a color grade, cite a photographer, keep
the same lighting setup and grade across a batch.

Choosing markdown over code was deliberate. Direction is judgment, not
determinism — encoding it as a knowledge base keeps it editable, reviewable, and
free to run, and it keeps the expensive/deterministic part (the pipeline) small
and testable. The tradeoff is that the director's quality isn't unit-testable
and depends on a capable operator at the controls. I accepted that because the
human is in the loop at the approval gate anyway.

### Three reference tiers

The engine composes context from three tiers, cheapest first:

1. **Skill knowledge** — always on, the markdown library above.
2. **User-supplied refs** — `product.jpg`, `model.jpg`, `style.jpg`,
   `location.jpg` dropped in the project folder. The engine reads material
   physics off them (glass refracts → backlight; matte absorbs → side light;
   metal reflects → large soft source; dark skin needs stronger fill + rim).
3. **Auto-research** — opt-in (`--research`). Web-searches current editorials,
   extracts technical recipes into prose, and uses them as a per-campaign
   reference. Records source URLs as attribution; never downloads or
   redistributes copyrighted images.

### The pipeline

A single CLI (`commander`) loads `config.json`, routes on a discriminated-union
`mode` field (`images` / `video` / `overlay`), validates only the env keys the
chosen providers need, and runs the mode. For images:

- discover and **filter references per scene** using scene tags
  (`hasModel` / `hasProduct` / `isDetail`) so a detail macro doesn't get the
  model reference and a portrait does;
- generate **scene 1 first as a style anchor**, then scenes 2..N with scene 1
  passed back as an anchor image for visual consistency;
- track cost against an explicit cost map as it goes;
- write a **versioned output folder** (`output/v{N}/`) plus a `run.json`
  snapshot (every prompt, every ref, total cost);
- record the run in **brand memory**.

### Provider adapters

Ten provider adapters (image / video / audio) are normalized to one internal
request/result shape (`ImageGenRequest → ImageGenResult`, etc.). Adding a
provider is writing one adapter; the pipeline doesn't change. The render path
(Remotion, for assembling video with captions, music ducking, and transitions)
is **lazy-loaded via dynamic import** so the image hot path never pays to load
React/Remotion.

## 3. Tool / model orchestration

The orchestration choices reflect what each model is actually good and bad at —
learned empirically, encoded as defaults:

- **Image:** Gemini 3 Pro Image is the default for finals (reliable text/detail
  at 2K/4K); Gemini 2.5 Flash Image is the cheap iteration model (~3× cheaper,
  but garbles long words); GPT Image is routed in specifically when rendered
  **text** matters, because diffusion image models still mangle small labels.
- **Video:** providers are selected per clip. Kling preserves the input aspect
  ratio and can do front→back reveal via an end-frame keyframe; Veo Fast rejects
  square; Seedance is cheapest. The config lets a single run mix providers clip
  by clip.
- **Consistency primitives:** *anchor scenes* (scene 1 as a style reference for
  the rest) for look consistency; *brand library refs* (past winners) for
  cross-campaign consistency; Higgsfield "SOUL" IDs for character consistency in
  video.

The **brand library is the closest thing to a moat.** Winning frames are tagged
(`hero`, `lifestyle`, `detail`, `portrait`) and stored per brand. On the next
run, the engine pulls up to three recent winners from the matching tag bucket
and passes them as visual references — so the brand's look compounds instead of
drifting. It's a simple feedback loop, but it's the difference between "an image
generator" and "a brand's studio."

## 4. The core workflows

**Task / shot capture → config.** The director turns a brief into a config of
"clips" (scenes), each a complete photographic brief plus tags. The config is
the contract between judgment and machinery, and it's human-readable and
diffable.

**Daily-driver run loop.** `--dry-run` to price it → approve → run → review the
versioned output → fix one scene's prompt → re-run (new version, old version
preserved) → tag the winners into the brand library.

**Vault / search workflow (brand memory).** `memory/brands/{brand}/` holds a
manifest, a tagged library of winning frames, and per-run records. This is the
searchable institutional memory of a brand's visual language; it's what new runs
read from and write back to.

**Overlay (campaign lockups).** A separate mode composes typographic
text-on-photo using category-tuned presets (jewelry sandwich-lockup, perfume
centered wordmark, performance top-left credit, corner stamp, spec chip) derived
from how real campaigns set type — kept separate from generation because text
rendering wants a different model and a mask, not a diffusion prompt.

## 5. Production / operations thinking

- **Cost is a first-class type.** There's an explicit cost map, a `CostTracker`
  accumulated through a run, a dry-run estimator, and a convention to gate runs
  over ~$3 or 10 scenes behind a human check. Per-image cost is computed from
  the actual model and resolution, not a flat guess.
- **Idempotent, versioned output.** Versions are monotonic (`v1`, `v2`, …);
  `run.json` is written atomically (temp file + rename) so an interrupted run
  can't leave a half-written manifest; re-runs never overwrite prior output.
- **Least-privilege secrets.** A run validates only the keys for the providers
  it uses. Missing key → refuse to start, with a clear message.
- **Failure isolation.** A provider failure on one scene is caught, logged, and
  recorded as a null result; the rest of the batch continues. You get the 7
  frames that worked plus a clear note on the one that didn't, not a dead run.
- **Observability is honest-but-basic:** structured step/info/success/error
  logging to the console and the `run.json` audit trail. There is no metrics
  backend — see gaps.

## 6. Tradeoffs I made on purpose

| Decision | Why | What it costs |
|---|---|---|
| Director as markdown, not code | Editable, free, reviewable judgment | Not unit-testable; depends on operator skill |
| File-based `projects/` + `memory/`, no DB | Simple, inspectable, git-friendly, zero infra | Won't scale to multi-user or concurrent runs |
| Single CLI, human-in-the-loop gates | Spend safety, creative review | Not unattended/automatable as-is |
| 10 provider adapters | Best tool per job, easy to add more | Real maintenance surface as provider APIs drift |
| Images run sequentially (`PARALLEL_LIMIT = 1`) | Lets the after-scene-1 vibe-check gate work | Slower than max throughput |

## 7. Failure modes (the real ones)

These are observed, repeatable behaviors of the underlying models, and the
encoded workarounds are most of the engine's practical value:

- **Content-filter false positives.** Glamour/intimate wardrobe prompts fail
  *probabilistically* as "no image data." Workaround: phrase wardrobe as
  closed/covered and assemble a look across runs.
- **Text/label garbling.** Close-ups render labels perfectly; stacked or
  floating small labels garble. Workaround: face the label forward, enlarge the
  hero, inline the exact spelling, re-roll — or route text to GPT Image.
- **Identity drift & the likeness guard.** Scenes drift in identity without an
  anchor — but using an anchor *and* a real `model.jpg` trips a same-person
  safety guard ("no image data"). Workaround: `anchorScenes: false` when a real
  face reference is present.
- **Plastic AI skin.** Default beauty close-ups look airbrushed. Workaround: an
  anti-plastic recipe (vellus peach fuzz, varying pore size, subsurface
  translucency, "no skin smoothing," documentary-photographer references).
- **Scale collapse.** A scale-less product reference renders oversized.
  Workaround: explicit size words, an in-frame object for scale, forceful
  one-hand holds.
- **Deep skin under high-key.** Bright high-key lighting lightens deep-brown
  skin and drifts identity. Workaround: pin "deep complexion, never lightened" +
  temper the high-key with warm fill/rim.
- **Defects are stochastic, so hedge.** For a problem scene, batch three
  variants in one run against a written checklist and pick a winner, rather than
  drip-rolling one at a time.

## 8. Known gaps (honest)

- **Re-run inheritance isn't wired.** The versioning layer *has* the machinery —
  `run.json` carries a `parentVersion`, scenes carry an `inherited` flag, and a
  `resolveScene` walker follows the parent chain — but the images orchestrator
  always writes `inherited: false` and never sets a parent. So in practice a
  re-run re-bills every scene, even though the README's "only pay for what
  changed" framing implies otherwise. This is the single most misleading gap and
  the first thing I'd close.
- **`--regenerate <n>` is referenced by the director but not implemented in the
  CLI.** The documented "redo scene 5" flow is currently manual.
- **Cost gates are a convention, not enforced in code.** The >$3 / >10-scene
  pause lives in the director's instructions, not in the pipeline. A hard ceiling
  belongs in code.
- **No metrics/analytics backend.** Cost and outcomes live in per-run JSON; there's
  no cross-brand rollup.

## 9. What I'd improve next

1. **Wire inheritance + content-hash caching** so re-runs truly only bill
   changed scenes. The data model already supports it; this is orchestration
   work, and it makes the headline cost claim true.
2. **Implement `--regenerate <n>`** and a hard, code-enforced cost ceiling.
3. **A fake/in-memory provider** to make the full pipeline runnable offline in
   CI, and **provider-adapter contract tests** so a provider's API drift fails a
   test instead of a paid run.
4. **A small cross-run analytics rollup** (cost per brand, success rate per
   failure mode) so the failure-mode playbook is driven by data, not memory.
5. **Externalize secrets** beyond `.env` (a secret manager) before this is ever
   anything but single-operator.

## 10. Testing — current state

The engine **does** have tests: **58 passing tests across 12 files**, unit plus
end-to-end, with every external provider mocked (`@google/genai` and `fetch`),
so the suite costs nothing to run and is deterministic. `tsc --noEmit` is clean.
Coverage is strongest on the deterministic core — cost, versioning, brand
memory, reference filtering, caching, retry, validation — and on
end-to-end mode runs against fake providers.

The smallest useful additions, in priority order:

1. **Provider-adapter contract tests** — assert each adapter maps the internal
   request to the provider's expected shape and parses the response, so silent
   API drift is caught without spending money.
2. **A regression test for the inheritance gap** — once inheritance is wired,
   prove a re-run with one changed prompt bills exactly one scene.
3. **A cost-ceiling test** — once the ceiling is enforced, prove a run that
   would exceed it refuses to start.

---

*Written as a portfolio artifact. The engine is real and in personal use; it has
not been deployed as a service, and no usage or performance numbers are claimed.*

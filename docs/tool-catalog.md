# Tool Catalog

The full surface of the engine, verified against the private repository. This is
the "what's actually in there" reference.

## Pipeline modes (3)

| Mode | Purpose | Config type |
|---|---|---|
| `images` | Product/brand still photography, the hot path | `ProjectConfig` |
| `video` | Short-form video, image-to-video + optional render | `VideoConfig` |
| `overlay` | Typographic text-on-photo campaign lockups | `OverlayConfig` |

Mode is the discriminator of a config union, so one CLI handles all three and
each gets its own validation.

## CLI (1 entry point, 4 flags)

| Flag | Effect |
|---|---|
| `--project <name>` | **Required.** Project folder under `projects/`. |
| `--dry-run` | Estimate cost from the cost map; no API calls. |
| `--render` | Video mode: enable the Remotion render path. |
| `--research` | Run the opt-in web-research reference tier. |

## Provider adapters (10)

Each is normalized to one internal request/result shape; orchestrators never
speak a provider's native protocol.

### Image (2)
| Provider | Notes |
|---|---|
| Google Gemini Image | Default. Pro model for finals (reliable text/detail @ 2K/4K); Flash model for cheap iteration. |
| OpenAI GPT Image | Routed in when rendered **text** matters. |

### Video (selectable per clip)
| Provider | Notes |
|---|---|
| Google Veo / Veo Fast | Veo Fast rejects square aspect. |
| Seedance (direct) | |
| Seedance via fal.ai | Cheapest video path. |
| Kling | Preserves input aspect; end-frame keyframe for reveal motion. |
| Higgsfield | "SOUL" IDs for character consistency across clips. |

### Audio / voice / captions
| Provider | Purpose |
|---|---|
| ElevenLabs (direct + via fal.ai) | Voiceover. |
| fal.ai lip-sync | Sync voice to a talking subject. |
| Whisper (via OpenAI) | Word-level caption timing for the render path. |

> Provider *types* exposed in the config: 2 image providers and 6 video provider
> identifiers (`higgsfield`, `seedance`, `fal-seedance`, `kling`, `veo`,
> `veo-fast`), implemented across 10 adapter modules including the audio/caption
> providers.

## Director skill (markdown knowledge base)

The prompt-engineering "brain." No API call. Full prompt text is private; the
structure:

| Area | Files | Role |
|---|---|---|
| Entry | `SKILL.md` | The three-phase method (understand → translate → generate) and the hard rules. |
| Reference library | `photographers`, `lighting-setups`, `lens-language`, `pose-library`, `color-grades`, `editorial-archive`, `frameworks` | The catalog every prompt draws from. |
| Category playbooks | `fashion`, `food-cpg`, `product-marketing`, `skincare`, `tech`, `tiktok` | Opinionated per-domain defaults. |
| Library / research | `library/HOW-TO`, `research/HOW-TO` | Brand-library usage and the opt-in research workflow. |

## Core library modules (deterministic core)

These are the tested, money-and-state-handling parts of the pipeline:

| Module | Responsibility |
|---|---|
| `cost` | Cost map, `CostTracker`, per-model/per-resolution pricing, dry-run estimates. |
| `versioning` | Monotonic versions, atomic `run.json`, scene inheritance resolver. |
| `memory` | Per-brand manifest, tagged library, run records (the flywheel). |
| `library` | Loads brand-library context for a run. |
| `refs` | Reference discovery + per-scene filtering from scene tags. |
| `validate` | Config + least-privilege env-key validation per mode. |
| `parallel` | Bounded concurrency. |
| `retry` | Explicit retry (no silent error-hiding). |
| `cache` | Content-addressed caching. |
| `logger` | Structured step/info/success/error logging. |
| `fal-client`, `frames`, `overlay-mask`, `text-compose`, `whisper` | Provider/mode helpers (fal transport, frame extraction, overlay masking, type composition, transcription). |

## Render path (Remotion, lazy-loaded)

React/Remotion compositions for assembling video, loaded via dynamic import so
the image hot path never pays for it:

- **Compositions:** YouTube Short, Ad (16×9 / 1×1), Web Hero.
- **Components:** caption track, hook text, lower third, logo, outro, film grain,
  vignette, scene.
- **Helpers:** audio ducking, fonts, transitions, timing, source resolution.

## Tests (12 files, 58 tests, all passing)

| Area | Coverage |
|---|---|
| Core libs | `cost`, `versioning`, `memory`, `library`, `refs`, `validate`, `parallel`, `retry`, `cache` |
| Providers | Gemini image adapter (mocked) |
| End-to-end | Images mode and video mode against mocked providers (tmp workspace) |

All external providers are mocked (`@google/genai`, `fetch`), so the suite costs
nothing and is deterministic. `tsc --noEmit` is clean.

## Configuration knobs (selected)

| Type | Notable fields |
|---|---|
| `ProjectConfig` (images) | `imageProvider`, `imageModel`, `imageSize` (1K/2K/4K), `aspectRatio`, `anchorScenes`, `formats`, `clips[]` |
| `Clip` (scene) | `prompt`, scene tags (`hasModel`/`hasProduct`/`isDetail`), per-clip `refs`, `imageProvider`, `formats` |
| `VideoConfig` | `format`, `videoProvider`, `soulId`, `script`, `voiceId`, `captions`, `hookText`, `music`, `transition`, `clips[]` |
| `OverlayConfig` | `campaign` (brandName/concept/palette/typography), `clips[]` with preset lockups |

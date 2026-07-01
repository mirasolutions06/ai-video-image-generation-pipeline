<div align="center">

# Mira Content Engine

**One line of brief in. Campaign-grade product photography and short-form video out.**
A command-line engine that orchestrates around ten generative image, video, and
audio models behind a single reproducible, cost-controlled pipeline.

[![Live](https://img.shields.io/badge/live-miracontent.studio-000000.svg)](https://miracontent.studio)
![Providers](https://img.shields.io/badge/model%20providers-10-blue.svg)
![Modes](https://img.shields.io/badge/modes-images%20·%20video%20·%20overlay-8A2BE2.svg)
![Proof package](https://img.shields.io/badge/type-proof%20package-lightgrey.svg)

<img src="examples/outputs/sounds-headphones-hero.jpg" alt="On-model lifestyle" height="230"> <img src="examples/outputs/zappy-court-lifestyle.jpg" alt="Product in use" height="230"> <img src="examples/outputs/form-creatine-packshot-pair.jpg" alt="Packshot with text fidelity" height="230">

<sub>All fully AI-generated: real on-model skin · a legible label in motion · crisp packshot text.</sub>

[Live site](https://miracontent.studio) · [Case study](CASE_STUDY.md) · [Architecture](docs/architecture.md)

</div>

> **Honest status:** this is a public **proof package**. It documents the
> architecture, the engineering decisions, and the operational thinking; the
> working code and the brand projects stay in a private repository. The engine is
> real and in use behind [Mira Content Studio](https://miracontent.studio), run
> operator-in-the-loop from the terminal. No usage, revenue, or customer numbers
> are claimed.

## Why

Conventional product photography for a small brand means a studio, a photographer,
a model, a stylist, and a multi-week turnaround for a handful of usable frames. The
naive AI version, "call an image model with a prompt," gives you stock-looking
output no one would pay for, and different stock-looking output every time, so a
brand never develops a consistent look.

The interesting problem was never the API call. It was everything around it:
thinking like a photographer on every single shot (light, lens, grade, a named
reference), keeping a brand visually consistent across dozens of runs, spending
money predictably, and recovering from the specific, repeatable ways these models
fail.

## What it does

| Stage | What happens |
|---|---|
| **Director** | A markdown knowledge base (photographers, lighting, lenses, color grades) turns a brief into a fully specified photographic brief per shot. No API call: this is structured judgment, not a model. |
| **Pipeline** | A TypeScript CLI generates each scene against the chosen provider, with reference filtering, style anchoring, cost tracking, and versioned output. |
| **Brand library** | Winning frames are tagged and stored per brand, then fed back as references on later runs, so a brand's look compounds instead of drifting. |
| **Three modes** | `images` (the hot path), `video`, and `overlay` (typographic campaign lockups), selected by a discriminated-union config. |
| **Cost control** | A dry-run prices every run from an explicit cost map before a penny is spent; runs fail loud rather than silently re-rolling. |

## How it works

```
brief  ->  director (prompt enrichment, $0)  ->  config.json  ->  pipeline  ->  versioned output
                                                                    \ brand library accumulates winners
```

The system separates **direction** (deciding what photograph to make) from
**production** (making it), because they have different properties: direction is
knowledge-shaped, cheap, and human-reviewable; production is API-shaped, costs
money, and benefits from being deterministic and idempotent. Full detail in
[docs/architecture.md](docs/architecture.md).

## What is inside, and what is private

This package contains the architecture docs, the case study, the exhaustive
tool/mode catalog, a synthetic example config, and a curated set of real sample
frames. It does **not** contain the engine source, the brand and client projects,
brand memory, or the proprietary director prompts. See
[docs/security-and-privacy.md](docs/security-and-privacy.md).

## Read more

- [CASE_STUDY.md](CASE_STUDY.md) - the engineering narrative: problem, design, tradeoffs, failure modes.
- [docs/architecture.md](docs/architecture.md) - how the pieces fit, with diagrams.
- [docs/tool-catalog.md](docs/tool-catalog.md) - every mode, provider, and skill file.
- [miracontent.studio](https://miracontent.studio) - the live product this engine powers.

## Contact

Built and operated by Mira Solutions, an AI engineering and automation studio.

mira.solutions06@gmail.com

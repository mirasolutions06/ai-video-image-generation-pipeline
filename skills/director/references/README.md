# Reference library (build your own)

The director writes fully specified photographic briefs by pulling from a
reference library. The **method** ships in this repo ([SKILL.md](../SKILL.md) and
[frameworks.md](frameworks.md)); the **library itself is yours to build**, because
a good one is a curated point of view, not a fixed list.

Create these files and fill them with references you actually want to shoot in.
Each is plain markdown the director reads while composing a scene.

| File | What goes in it | A single entry looks like |
|---|---|---|
| `photographers.md` | Named photographers with a one-line style fingerprint. The director cites at least one per prompt. | `Irving Penn - studio stillness, single soft key, seamless background, quiet negative space.` |
| `lighting-setups.md` | Named lighting recipes you reuse across a batch. | `North-window daylight - large soft key camera-left at 45°, fill 2:1, gentle rim.` |
| `lens-language.md` | Focal lengths and what they do, so the director varies lens by shot type. | `85mm f/2.8 - flattering compression for heroes; shallow but readable depth.` |
| `color-grades.md` | Film stocks and grades you reuse across a batch. | `Kodak Portra 400 - warm mids, soft contrast, lifted blacks.` |
| `pose-library.md` | Model posing direction by shot type. | `Hero portrait - chin slightly down, weight on back foot, hands relaxed.` |
| `editorial-archive.md` | Whole campaigns as conceptual references. | `A quiet-luxury fragrance campaign - one hero, muted palette, lots of air.` |
| `categories/{name}.md` | Opinionated hero / lifestyle / detail defaults per domain (skincare, fashion, food, tech, etc.). | see the structure the director expects in [SKILL.md](../SKILL.md). |

## Why it works this way

The director makes **no API call**. It is structured judgment: it reads your
library, picks one lighting setup and one grade for the whole batch, a lens per
scene, and a photographer to cite, then writes a `config.json` the pipeline runs.
Keeping the library as editable markdown means your look is yours, reviewable, and
free to change, while the expensive part (the pipeline) stays small and testable.

See [`examples/`](../../../examples/) for a complete `config.json` the director
would produce.

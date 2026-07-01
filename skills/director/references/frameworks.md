# Frameworks - Prompt Construction Rules

This is the core grammar for every enriched prompt. Read first, apply always.

## The shot card structure

Every prompt is a shot card with seven slots:

```
1. SHOT  - distance + angle (close-up / mid / wide / overhead / low / three-quarter)
2. SUBJECT - exact materials, color, shape, count
3. SURFACE - what it sits on / in / against
4. LIGHT - direction (where from), quality (hard/soft/diffused/raking), ratio (key:fill)
5. LENS - focal length + f-stop
6. DEPTH - subject sharp + what background does (bokeh / soft / sharp)
7. GRADE - film stock / color grade + photographer reference
```

Every slot is required. A prompt missing any slot is not pro-grade.

## Material physics rule

| Material | Required light strategy | Why |
|---|---|---|
| Glass / liquid / serum | Backlight or 90° side-light | Front light kills transparency |
| Matte (cardboard, wood, paper, matte plastic) | Side-light at 90°, or raking from very low angle | Reveals texture |
| Reflective (metal cap, chrome, glossy packaging) | Large soft source | Hard sources create unwanted hot spots |
| Skin (any tone) | Key 30-45° off-axis, slightly above eye level | Sculpts features |
| Dark skin | Strong fill (1.5:1 ratio), rim light, slightly warmer color temp | Separates from background, flatters tone |
| Light skin | Can handle harder ratios (3:1+) | Dramatic shadows work |
| Fabric (woven, knit) | Side-light to reveal weave | Front light flattens |
| Sheer fabric | Backlight to show translucency | |
| Food (organic, ingredients) | Side-light + slight backlight | Adds depth |

If your prompt's subject material is on this list, the light strategy is decided. Don't deviate.

## SEAL CAM framework (image prompt structure)

Used as a mental checklist when writing prompts.

- **S**ubject - exact materials, count, state
- **E**nvironment - surface, location, props (max 3)
- **A**ction or moment - single frozen instant (or "still life")
- **L**ighting - direction, quality, ratio
- **C**amera - lens + f-stop + distance + angle
- **A**tmosphere - color grade + mood
- **M**ention - photographer / film stock / setup name reference

A prompt covering all 7 slots, with a citation to the catalog, is what we ship.

## BOPA framework (campaign-level coherence)

Used when planning a batch of 6-12 scenes.

- **B**rand - what's the visual identity? Library recipe if known.
- **O**ne-shoot rule - same lighting setup, color grade, surface across all scenes
- **P**hotographer anchor - pick 1-2 photographers as references for the whole batch
- **A**ngles vary - vary lens + shot distance per scene, not light/grade

A batch failing BOPA looks like 8 different shoots stitched together.

## Anti-patterns (do not write)

| Don't | Instead |
|---|---|
| "cinematic lighting" | Name the setup: "clamshell" / "Rembrandt" / "broad short" |
| "beautiful model" | Describe what the light does to the subject |
| "warm tones" | Name the grade: "Kodak Portra 400 grade" |
| "professional photography" | Name a photographer style |
| "high quality" | (delete the word - model already tries) |
| "8k, ultra-detailed, masterpiece" | (delete - Gemini ignores quality boilerplate) |
| "in the style of" + 3 photographers | Pick ONE primary reference; max one secondary |

## Length

200-600 characters. Under 200, you're vague. Over 600, you're losing focus and the model starts dropping detail.

## Tag discipline

Every clip is tagged at config-write time:

| Scene type | Tags |
|---|---|
| Product hero (no person) | `hasProduct: true` |
| Person + product | `hasModel: true, hasProduct: true` |
| Hands holding product / texture closeup | `hasProduct: true, isDetail: true` |
| Portrait (no product) | `hasModel: true` |
| Environment / flatlay (no person, no product visible) | (none - gets style/location only) |

Tags drive smart reference filtering - see `src/lib/refs.ts`.

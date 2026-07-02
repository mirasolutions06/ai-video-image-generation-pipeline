# Examples

Everything here is generic and safe to read: a synthetic brand and sanitized
concept frames. No private project work.

## `example-config.json`

A complete `config.json` for a fictional brand (Klint Ceramics), in images mode.
It shows the config shape and the core rule the director enforces: every prompt is
a fully specified photographic brief, not a keyword list.

```json
{
  "mode": "images",
  "brand": "Klint Ceramics",
  "imageModel": "gemini-3-pro-image-preview",
  "formats": ["square"],
  "anchorScenes": true,
  "clips": [
    {
      "prompt": "Hero still of a matte oatmeal-glaze stoneware pour-over dripper on pale oak, three-quarter front, soft north-window daylight camera-left at 45 degrees (large soft source, fill 2:1), gentle rim, 85mm f/2.8, shallow but readable depth, Kodak Portra 400 grade, in the manner of Irving Penn still-life stillness.",
      "hasProduct": true, "hasModel": false, "isDetail": false
    }
  ]
}
```

Run it (prices first, then generates):

```bash
mkdir -p projects/klint && cp examples/example-config.json projects/klint/config.json
npm start -- --project klint --dry-run    # estimate cost, no spend
npm start -- --project klint              # generate
```

## `outputs/`

A few real frames the engine produced (concept work, fully AI-generated), each
chosen to prove a specific capability: real on-model skin, a legible label in
motion, and crisp small packshot text.

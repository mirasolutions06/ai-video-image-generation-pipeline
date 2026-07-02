# Sample outputs

A small curated set of frames the engine produced, chosen to show range and to
back up specific claims made elsewhere in this package. These are sanitized
concept/spec frames, and every frame is fully AI-generated, then resized for the
web. The full output library and exact private prompts stay out of the repo.

---

### On-model lifestyle: "sounds" (headphones)

![sounds headphones hero](sounds-headphones-hero.jpg)

A deliberate eye-contact hero. Demonstrates the **anti-plastic skin** work
(visible pores, subsurface translucency, real specular highlights) rather than
the airbrushed "AI look," and the smart-ref / anchor handling that keeps a
person consistent and believable. Single soft key, clean seamless background.

### Action lifestyle: "zappy" (tennis-court beverage)

![zappy court lifestyle](zappy-court-lifestyle.jpg)

Scroll-stopping, on-model product-in-use. Shows the engine holding a **legible
product label** ("zappy") at an angle and in motion, with frozen liquid, hard
daylight, and color-blocked styling, and correct product scale in the hand.

### Packshot with text fidelity: "FORM" (creatine), front + back pair

![FORM creatine packshot pair](form-creatine-packshot-pair.jpg)

The hardest thing these models do: **crisp, correct small text.** Brand mark,
"CREATINE", "100% PURE CREATINE MONOHYDRATE", a full SUPPLEMENT FACTS panel,
directions, ingredients, even a barcode and URL, all legible. This is a single
composed image built by the **composite-don't-redraw** technique (each face
generated as a clean standalone, then assembled) so the front and back match
exactly instead of drifting.

---

See [docs/operations.md](../../docs/operations.md) for the failure-mode playbook
behind these (label garbling, plastic skin, scale collapse, pair-shot drift) and
[CASE_STUDY.md](../../CASE_STUDY.md) for why each workaround exists.

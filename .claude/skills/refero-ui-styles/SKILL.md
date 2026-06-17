---
name: refero-ui-styles
description: Apply a real-world, professionally-designed visual style to any website or web app Claude builds by selecting a fitting design system from the Refero Styles library (styles.refero.design) and pulling its exact tokens — colors, typography, spacing, radii, components, and do/don't rules. ALWAYS use this skill whenever building, designing, restyling, or improving the look of a website, web app, landing page, dashboard, marketing page, portfolio, or any frontend/UI, AND whenever the user asks to make a UI "stunning", "beautiful", "polished", "modern", "professional", or "designed". Trigger even when the user never mentions Refero or "design systems" — any "build me a site/app/page" or "make this look good" request qualifies.
---

# Refero UI Styles

The default look of hand-coded UI is generic. This skill fixes that by grounding every build in a **real, professionally-designed style** pulled from Refero Styles — a curated library of 2,000+ design systems distilled from leading product websites. Each style ships a complete, AI-readable `DESIGN.md`: exact colors, type scale, spacing, border radii, component recipes, do/don't rules, and ready-to-paste CSS variables / Tailwind v4 config.

The goal is not to copy a site, but to inherit a coherent, opinionated design language so the result looks intentional instead of templated.

## When to engage

Engage whenever the task involves producing or improving UI — building a website, web app, landing page, dashboard, marketing/portfolio page, or component — and especially when the user signals they care about how it *looks* ("make it stunning / beautiful / modern / clean / premium"). You don't need explicit permission; weave it into how you build.

If the user is doing pure logic/back-end work with no visual surface, skip it.

## Workflow

### Step 1 — Define a quick design brief

In one or two sentences (to yourself), pin down two things:
- **Project type** — fintech app, dev tool, marketing site, health app, e-commerce, portfolio, editorial/content, analytics dashboard, AI product, etc.
- **Mood** — dark & focused, light & airy, bold & playful, editorial & serious, organic & warm, minimal & precise.

Infer this from the user's request. Don't interrogate them with a wall of questions — if the request already implies a direction, just proceed and state your pick in one line. Only ask if genuinely ambiguous, and keep it to a single tap-friendly question.

### Step 2 — Pick a fitting style

Open `references/catalog.md` and choose the entry whose *Best for* and *Vibe* match the brief. The catalog is the fast path — it lets you decide without browsing.

If the catalog has no good match, or the user wants something specific/fresh ("something like Stripe", "a warm bakery vibe", "the latest"), browse the live library instead:
- Catalog homepage: `https://styles.refero.design/`
- Search a vibe/brand: `https://styles.refero.design/?q=SEARCH+TERMS`
- DESIGN.md index: `https://styles.refero.design/ai-agents/design-md-examples`

`web_fetch` any of these to read available styles and their `/style/{id}` links, then pick one.

State your choice to the user in one line and why it fits, e.g. *"Going with the **Mercury** style — a dark, focused fintech look that suits a finance dashboard."*

### Step 3 — Pull the exact tokens (one fetch)

`web_fetch` the chosen style's page:

```
https://styles.refero.design/style/{id}
```

It returns the full `DESIGN.md` as readable markdown. Extract and rely on:
- **Quick Start → CSS Custom Properties** or **Tailwind v4** block (paste-ready tokens)
- **Color Palette** with roles (which color is background vs text vs accent — respect these)
- **Typography** scale, weights, and **Substitute/Fallback** fonts
- **Spacing & Shape** (base unit, section/element gaps, border radii)
- **Components** recipes and the **Do / Don't** list
- **Agent Prompt Guide** if present (it gives quick component prompts)

This is the only network call needed per build. Don't re-browse the catalog once you have a fitting entry.

### Step 4 — Apply the style faithfully

Build the UI using the pulled tokens, not approximations:
- Use the palette by **role** — the named background color for backgrounds, the accent strictly where the style says (often CTAs only).
- Reproduce the **type scale and weights**. Custom brand fonts won't be installed, so use the style's listed **fallback/substitute fonts** (e.g. Inter, Manrope) — load them from Google Fonts if web.
- Match **spacing density, section gaps, and border-radius** values — these carry most of a style's "feel".
- Follow the **Do / Don't rules** explicitly (e.g. "don't use shadows for elevation", "buttons are always pills"). These are what separate a faithful result from a generic one.
- Adapt content to the user's actual project; borrow the *language*, not the source site's copy.

When the deliverable is a coded artifact, drop the CSS-variable / Tailwind tokens into the project so they're reusable.

## Credit efficiency

This skill is designed to cost **one `web_fetch` per build** (the chosen style page). To keep it lean:
- Pick from `references/catalog.md` first — only browse the live site when the catalog genuinely doesn't fit or the user wants something specific.
- Don't fetch multiple style pages "to compare" unless the user asks to see options. Pick one, commit, iterate if they want a different direction.

## Optional: Refero MCP

Refero offers an official MCP connector (`https://refero.design/mcp`) built for AI coding tools that lets the agent search and study designs directly. If the user has it connected, prefer its search/fetch tools over `web_fetch`. The fetch-based workflow above needs no setup and is the default.

## Edge cases

- **A `/style/{id}` fetch fails or 404s:** the catalog stores a compact token summary for several flagship styles — use that as a fallback, or pick a neighbouring catalog entry and fetch it instead.
- **User names a real brand** ("make it like Linear/Stripe/Vercel"): search the library for it (`?q=brand`) — many well-known products are in there — and use the matched style.
- **User wants to see choices first:** present 2–3 catalog entries (name + vibe + best-for) as a quick pick rather than fetching all of them; fetch only the one they choose.
- **Multiple competing vibes:** default to the project-type match over the mood match (a fintech app should read as fintech even if the user said "fun").

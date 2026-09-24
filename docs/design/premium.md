# GameMog design language v2: premium

The owner (23 Sep): "site still feels amateurish in a subtle way … we need elite polish and a
design language that screams premium. Check gamestop.com, model or mimic if necessary, do an
exhaustive comparison and a final do-over."

Everything below was measured on gamestop.com on 23 Sep 2026 at 1440x900 and 375x812. GameMog
takes GameStop's *system* (surfaces, type scale, section anatomy, controls), never its brand:
no logo, no red, no copy, no imagery.

## What makes GameStop read as premium, and where GameMog fell short

| Element | GameStop (measured) | GameMog before | GameMog v2 |
|---|---|---|---|
| Page | `#F2F4F7` cool grey; content on white | `#F7F7F8`, art directly on the page | `#F2F4F7`; every content block is a white surface |
| Surfaces | white cards, radius 8, one soft shadow `0 1px 6px rgba(0,0,0,.15)` | flat; shadows banned | white cards, radius 8, the same single elevation token (hover: a deeper one) |
| Display type | Hubot Sans 40/48, 700, tracking −0.24px for section titles | Figtree 20/700 | Hubot Sans (self-hosted, OFL) 40/48 700 for section titles, 44/48 800 for page titles |
| UI type | Google Sans Flex: subheads 16/500 `#727272`, names 14/600, prices 14/700 `#404040` | Figtree everywhere, Roblox sizes | Figtree: subheads 16/500 `#727272`, names 15/700, meta 12/500 |
| Section anatomy | title, grey subtitle, tab chips, square arrows top right, rail of cards, underlined "View More ›" bottom right | title, (i), "See All" | the same anatomy |
| Tab chips | 31px, radius 6, 13/500; active white, 1.5px `#E4E4E4` border, hairline shadow; inactive grey text | dark 999px pills | GameStop tabs |
| Rail arrows | 40px squares; active black with a white arrow, inactive outlined | chevrons in gutters | 40px squares top right of the section |
| Product card | 159x311 white card, padding 36/8/4, name 14/600 two lines, price 14/700, corner badge | 16:9 art with name under it on the page | white card: 16:9 art flush top, body 12/14/14, name 15/700, meta row, corner badge |
| Badges | tucked into the card's top-left corner, radius `8px 0 4px`, 11/600, green `#087845` | small pills floating on art | tucked corner badges: NEW green `#117A4B`, MOG in GM gold `#F5B82E` on black text |
| Primary CTA | 48px, radius 4, Poppins 14/600, brand red | 30px, radius 8, Roblox blue | 48px, radius 4, 14/700, GameMog black `#0B0B0F` (the brand is black and GM gold, not red) |
| Secondary CTA | outlined, radius 4 | outlined, radius 8 | white, 1.5px `#D5D7DD` border, radius 4 |
| Header | white, 76px: menu, bold logo, 671x40 search, icon actions with 11px labels; category row 14/600; full-width promo strip | one 40px Roblox bar | white 72px: logo, wide search, icon actions, "Create a world"; category row 44px; black promo strip |
| Hero | 534x400 banners, radius 9, carousel | full-width film (kept: the owner's LA billboard) | film kept, radius 8, elevated, title in Hubot Sans |
| Category bubbles | round image bubbles with 13/600 labels | none | "Jump in" bubbles: Classic, Trending, New Mogs, Racing, Create, Library |
| Product page | breadcrumbs 14 `#5F5F5F`; media in a white panel; purchase column; red 48px CTA; option chips with black outline; accordion headings Poppins 20/600 | stage and a bare bar | breadcrumbs; the stage elevated; a white purchase panel (title, credit, 48px Play, actions); section headings Hubot 24/700 |
| Logo and favicon | bold all-caps wordmark; favicon on every tab | a black square with a gold dot; no favicon at all; the footer logo collapsed to grey text | a black crown on a GM-gold tile (lib/brand.ts: the promise and the verb, drawn on a 16px pixel grid) beside GAMEMOG in Hubot Sans 800 at 118% width; favicon.ico, icon.svg and the iPhone icon built from the same mark by `npm run brand:icons` |
| Footer | white, column headings 18/600 uppercase, 14px links, legal row | one line of links | white, four columns with uppercase headings, legal row |
| Motion | hover states, no decorative animation | none | instant hover states only (no transitions: the owner's contract) |

## Tokens

Page `#F2F4F7` · surface `#FFFFFF` · ink `#0B0B0F` · ink-2 `#474A57` · ink-3 `#727272` · line
`#E4E4E4` · brand black `#0B0B0F` · GM gold `#F5B82E` · deal green `#117A4B` (GameStop's `#087845`, a shade calmer to pass the contract's saturation rule) · radius 8 (cards),
6 (chips, inputs), 4 (buttons) · elevation `0 1px 6px rgba(0,0,0,.15)`, hover
`0 6px 18px rgba(0,0,0,.16)`, hairline `0 0 1px rgba(24,24,27,.2), 0 1px 2px rgba(24,24,27,.1)`.

## The design contract

Two rules change, deliberately, because the owner asked for GameStop's system:

- **Shadows:** allowed only through the three elevation tokens above. Any other `box-shadow`
  still fails the build.
- **Type:** Hubot Sans joins Figtree, self-hosted from `@fontsource-variable/hubot-sans` (OFL).

Everything else stands: no gradients in the interface, no frosted glass, no transitions or
animations, no emoji or em dashes, no purple or neon, radii of 8px or less.

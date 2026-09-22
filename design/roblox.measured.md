# roblox.com, measured

Read off `roblox.com/charts` and `roblox.com/games/920587237` at a 1440px
viewport on 2026-09-22, by reading `getComputedStyle` on the live pages. Every
number below is observed, not estimated. When this design changes, re-measure
rather than adjusting by eye.

## Type

| | |
|---|---|
| stack | `Builder Sans` (proprietary) then `Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif` |
| base | 16px / 400 |
| h1 | 32px / 800, line-height 44.8px |
| h2 | 20px / 700, line-height 28px, padding-bottom 5px |
| nav link | 16px / 500, padding 6px 9px |
| tile name | 16px / 700, line-height 22.4px, clamped to 2 lines |
| tile meta | 12px / 500, line-height 18px |
| footer link | 16px / 500 |

We cannot use Builder Sans, so we use the rest of Roblox's own chain. On macOS
that is Helvetica Neue, which is exactly what a Roblox visitor sees when their
custom font fails to load.

## Colour

| token | value | where |
|---|---|---|
| ink | `#202227` | body text, active tab |
| ink-2 | `#494D5A` | metadata, footer links, inactive tab |
| ink-3 | `#6A6F81` | Log In link, placeholders |
| surface | `#F7F7F8` | nav bar, inactive tab |
| fill | `rgba(27,37,75,.08)` | search field |
| line | `rgba(27,37,75,.12)` | dividers, thumbnail placeholder |
| blue | `#335FFF` | Sign Up, Download |
| dark | `#272930` | filter pills |

## Geometry

| | |
|---|---|
| radius | 8px on everything; 999px on filter pills |
| shadows | none anywhere. `box-shadow: none` on every element sampled |
| gutters | 24px |
| nav | 40px tall, `#F7F7F8`, fixed |
| search | 360x28, radius 8 |
| tile thumb | 150x150, radius 8 |
| tile gap | 14px |
| card | 150 wide, 240 tall including a 12px bottom margin |
| section pitch | 312px between consecutive rail headings |
| primary CTA | 300x60, radius 8, `#335FFF`, 16px/600 |
| tab bar | 40px tall, active underlined |
| detail page | 640px media column, 330px info column |

## Structure

The charts page is full-bleed. There is no centred marketing container, no
card wrapping each section, and no border around anything. Sections are a
20px heading, a "See All" link, and a horizontal rail of fixed 150px tiles.
Content sits directly on the page.

The footer is a flat row of links that includes **Terms** and **Privacy**.

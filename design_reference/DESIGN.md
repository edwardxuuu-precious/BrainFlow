# Design System Document: The Editorial Desktop

## 1. Overview & Creative North Star
**Creative North Star: The Digital Curator**

This design system moves beyond the utility of a standard operating system and enters the realm of a high-end digital gallery. It is built on the philosophy of "Invisible Structure"—where the interface disappears to prioritize content, yet remains unmistakably premium through tactile depth and typographic authority.

To break the "template" look, we leverage **intentional asymmetry**. Layouts should not always be centered; use the sidebar as a heavy anchor and allow the content area to breathe with expansive, "unbalanced" white space. We replace rigid grids with a fluid sense of layering, where elements feel like physical objects resting on a luminous, frosted surface.

---

## 2. Colors & Surface Philosophy
The palette is grounded in a sophisticated neutral range, utilizing subtle tonal shifts rather than lines to define architecture.

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts or tonal transitions. To separate a sidebar from a main content area, use a `surface-container-low` background against a `surface` main area.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Hierarchy is achieved through "Tonal Stacking":
- **Base Layer:** `surface` (#f9f9fb)
- **Secondary Containers:** `surface-container-low` (#f3f3f5)
- **Interactive/Floating Elements:** `surface-container-lowest` (#ffffff)

### The Glass & Gradient Rule
To achieve the Sonoma-inspired depth, use **Glassmorphism** for all sidebar and floating navigation components:
- **Sidebar Background:** `rgba(255, 255, 255, 0.72)` with a `20px` backdrop-blur.
- **Signature Gradients:** For primary actions (CTAs), use a subtle linear gradient from `primary` (#0058bc) to `primary-container` (#0070eb) at a 145° angle. This adds "soul" and a liquid-like quality that flat hex codes lack.

---

## 3. Typography: Editorial Authority
We utilize a high-contrast scale to create an editorial feel, moving from massive, airy displays to tight, functional labels.

*   **Display (Large/Medium):** Use for hero moments. The `display-lg` (3.5rem) should feel like a magazine masthead—wide tracking (-0.02em) and significant bottom margin.
*   **The Sidebar Scale:** Sidebar tree items must use `label-md` (0.75rem / 12px-13px equivalent) to mimic the macOS Sonoma aesthetic. This creates a "Pro" feel, signaling high information density.
*   **Body Text:** `body-md` (0.875rem) is our workhorse. Pair it with `title-lg` for a clear, authoritative hierarchy.

All typography uses **Inter** (as the web-standard counterpart to SF Pro), prioritizing optical sizing and legibility.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to create "pop." We use depth to create "presence."

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. This creates a "soft lift" that feels architectural rather than digital.
*   **Ambient Shadows:** For floating menus or modals, use a "Ghost Shadow": `0px 10px 30px rgba(26, 28, 29, 0.06)`. The shadow color must be a tinted version of `on-surface`, never pure black.
*   **The Ghost Border:** If accessibility requires a container edge, use a `0.5px` hairline: `outline-variant` (#c1c6d7) at **20% opacity**. It should be felt, not seen.

---

## 5. Components

### Sidebar Tree Navigation
*   **Style:** `surface-container-low` with glassmorphism.
*   **Items:** `label-md`, tight vertical padding (4px top/bottom).
*   **Selection:** Rounded corners (`DEFAULT`: 0.5rem). Use `primary` (#0058bc) for active states and `surface-container-high` (#e8e8ea) for hover states.
*   **Icons:** SF Symbols style, `thin` or `light` weight strokes to maintain the "high-end" airy feel.

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary-container`). White text. `0.5rem` corner radius.
*   **Secondary:** `surface-container-highest` fill with `on-surface` text. No border.
*   **Tertiary:** Transparent background, `primary` text. Use for low-emphasis actions.

### Cards & Lists
*   **The No-Divider Rule:** Explicitly forbid divider lines. Separate list items using `8pt` vertical spacing or a 2% shift in background color on hover.
*   **Content Cards:** Use `surface-container-lowest` (#ffffff) with a `1rem` (lg) corner radius for a friendly yet professional container.

### Input Fields
*   **Base:** `surface-container-lowest`.
*   **Border:** Ghost Border (0.5px `outline-variant` @ 20%).
*   **Focus State:** A `2px` soft outer glow using `primary` at 30% opacity, rather than a hard border change.

---

## 6. Do’s and Don’ts

### Do:
*   **Use Whitespace as a Tool:** Allow for asymmetric margins. A sidebar can be 280px wide while the main content starts at a 120px offset from the sidebar edge.
*   **Embrace Translucency:** Allow content to scroll behind the sidebar glass effect to create a sense of continuous space.
*   **Scale Icons Softly:** Keep icons at 16px-18px within sidebar items; larger icons break the "Pro" aesthetic.

### Don’t:
*   **No Hard Outlines:** Never use a 100% opaque `outline` for cards or sections. It creates a "boxed-in" feeling that contradicts the Digital Curator ethos.
*   **No Pure Grays:** All neutrals should have a slight blue or cool tint (matching our `surface` tokens) to avoid a "dead" or "unrefined" appearance.
*   **No Crowding:** If a layout feels busy, increase the background tonal shift rather than adding lines.

---

## 7. Signature Layout Component: The "Inspector Panel"
For complex applications, use a secondary "Inspector" sidebar on the right. This panel should use `surface-container-highest` to feel "closer" to the user than the main content, creating a focused work environment that mimics professional creative suites.
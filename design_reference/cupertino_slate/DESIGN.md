# Design System Specification: Editorial Precision

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Atelier."** 

This system rejects the "templated" look of modern SaaS in favor of a bespoke, high-end editorial experience. It draws inspiration from Swiss minimalism and the precision of macOS, where every pixel serves a functional purpose but feels like a deliberate aesthetic choice. We break the grid through **intentional asymmetry**—using large, sweeping areas of `surface` whitespace to frame compact, high-density data modules. By overlapping serif display type with translucent UI layers, we create a sense of depth that feels architectural rather than digital.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a monochromatic spectrum of cold whites and graphite blacks, punctuated by a singular, muted accent.

### Core Palette (Material Design Mapping)
- **Primary (The Accent):** `#545F6E` (Muted Slate Blue) – Used sparingly for focus and intent.
- **Surface (The Canvas):** `#F9F9FB` – Our base "Cold White."
- **On-Surface (The Ink):** `#2D3338` – Softened graphite for high-readability without harsh contrast.
- **Surface-Container-Lowest:** `#FFFFFF` – Pure white for elevated floating elements.
- **Surface-Container-Highest:** `#DDE3E9` – For subtle structural differentiation.

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined through:
1.  **Background Shifts:** Place a `surface-container-low` (#F2F4F6) section directly against the `surface` background.
2.  **Negative Space:** Use the `16` (5.5rem) or `24` (8.5rem) spacing tokens to create mental boundaries without physical lines.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. A `surface-container-lowest` card should sit atop a `surface-container-low` section. This creates "nested depth." The eye perceives hierarchy through the subtle shift in lightness rather than a stroke.

### The "Glass & Gradient" Rule
For floating panels (modals, dropdowns, or navigation rails), use **Glassmorphism**:
- **Background:** `surface` at 70% opacity.
- **Backdrop-blur:** 20px to 40px.
- **Texture:** Apply a 0.5px `outline-variant` (#ACB3B8) at 20% opacity to the edge to catch the light.
- **CTAs:** Use a subtle linear gradient from `primary` (#545F6E) to `primary_dim` (#485362) to give buttons a weighted, tactile "soul."

---

## 3. Typography: The Editorial Contrast
We utilize a high-contrast pairing of a sophisticated serif and a high-precision sans-serif.

- **Display & Headlines (Newsreader Serif):** Used for storytelling and high-level titles. It conveys authority and a "printed" feel. 
    - *Usage:* `display-lg` (3.5rem) should be used with wide letter-spacing (-0.02em) to command attention.
- **UI & Body (Inter/SF Pro Style):** Used for all functional elements, data, and long-form reading. 
    - *Usage:* `body-md` (0.875rem) is the workhorse. It ensures the interface feels technical and precise.

*Hierarchy Note:* Always lead with the Serif to "set the stage," but execute the "work" of the app in the Sans-Serif.

---

## 4. Elevation & Depth
Depth in this system is achieved via **Tonal Layering** and **Ambient Light Simulation**.

### The Layering Principle
Do not use shadows for static elements. Instead, stack the scale:
- Base: `surface`
- Content Block: `surface-container-low`
- Active Component: `surface-container-lowest`

### Ambient Shadows
When an element must float (e.g., a primary modal), use a "Whisper Shadow":
- **Color:** A tinted version of `on-surface` (graphite) at 4% opacity.
- **Blur:** 32px to 64px.
- **Spread:** -4px (to keep the shadow tucked under the element).

### The "Ghost Border" Fallback
If a border is required for accessibility in input fields, use the **Ghost Border**: `outline-variant` at 15% opacity. It should be barely perceptible, serving only as a guide for the eye.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_dim`), white text, `md` (0.75rem) corner radius.
- **Secondary:** `surface-container-high` fill with `on-surface` text. No border.
- **Tertiary:** Text-only with `label-md` styling, using `primary` color only on hover.

### Input Fields
- **Styling:** `surface-container-lowest` background with a 0.5px Ghost Border. 
- **Focus State:** Border opacity increases to 40% with a subtle 2px glow of the `primary` color.
- **Spacing:** Use `3` (1rem) padding for a spacious, premium feel.

### Cards & Lists
- **Rule:** Absolute prohibition of divider lines. 
- **Separation:** Use `spacing-4` (1.4rem) between list items. Use a `surface-container-low` background on hover to define the interactive area.
- **Corner Radius:** Standardize on `md` (0.75rem) for small cards and `xl` (1.5rem) for large layout containers.

### Selection Chips
- **Unselected:** `surface-container-highest` with `on-surface-variant` text.
- **Selected:** `primary` background with `on-primary` text. Use `full` (9999px) rounding.

---

## 6. Do's and Don'ts

### Do:
- **Do** use asymmetrical layouts (e.g., a wide left margin for a headline and a compact right column for data).
- **Do** lean into `surface-container-lowest` (#FFFFFF) to highlight the most important user action.
- **Do** use `0.5px` lines only when absolutely necessary for complex data grids, using `outline-variant` at 10% opacity.

### Don't:
- **Don't** use pure black (#000000). Use Graphite (#1D1D1F or `on-surface`).
- **Don't** use standard "Drop Shadows." Use the Ambient Shadow spec or Tonal Layering.
- **Don't** use vibrant or neon accent colors. Stick to the muted, low-saturation `primary` slate or amber.
- **Don't** crowd the interface. If you feel the need to add a divider, try adding 1rem of whitespace instead.
---
name: Precision Productivity
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#c6c6cd'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#909097'
  outline-variant: '#45464d'
  surface-tint: '#bec6e0'
  primary: '#bec6e0'
  on-primary: '#283044'
  primary-container: '#0f172a'
  on-primary-container: '#798098'
  inverse-primary: '#565e74'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#001c10'
  on-tertiary-container: '#009365'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  display-timer:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  mono-data:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  sidebar-width: 260px
  stack-sm: 4px
  stack-md: 12px
  stack-lg: 24px
---

## Brand & Style

This design system is built for high-velocity desktop environments where focus and clarity are paramount. Drawing inspiration from modern "local-first" utilities, it employs a **Corporate / Modern** aesthetic with heavy influences from **Minimalism**. The interface is designed to disappear, allowing the user's tasks and time data to take center stage. 

The emotional response should be one of "quiet power"—an instrument that feels responsive, reliable, and sophisticated. It avoids unnecessary decoration in favor of structural integrity, utilizing subtle borders and a refined dark-first palette to reduce cognitive load during extended periods of deep work.

## Colors

The color architecture is rooted in a "Deep Slate" foundation to provide a restful environment for long-term usage. 

- **Foundational Neutrals:** The primary background uses a deep charcoal (#0F172A), with layered surfaces using incremental shifts in lightness to define hierarchy.
- **Active States:** An "Electric Blue" serves as the primary action color, while a vibrant "Emerald" is reserved exclusively for active timers and success states, providing a high-contrast visual cue that is instantly recognizable.
- **Project Accents:** A curated set of secondary accents (Indigo, Rose, Teal) allows for semantic categorization of projects without breaking the professional tone of the design system.

## Typography

Typography in this design system prioritizes legibility and technical precision. **Inter** is utilized for body copy and general interface elements due to its exceptional clarity at small sizes. **Geist** is employed for headlines, labels, and crucially, for all numeric data.

A specialized `display-timer` level is defined for the primary time-tracking readout, utilizing Geist’s geometric rigor to ensure numbers remain stable and readable as they increment. For data-heavy views, use the `mono-data` role to ensure tabular alignment of time logs and durations.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy optimized for desktop density. It utilizes a sidebar-and-stage model:
- **Navigation:** A fixed left-hand sidebar (260px) contains global navigation and project lists.
- **Main Stage:** A fluid central area that reflows content based on the window width, maintaining internal gutters of 16px.
- **Density:** The system uses an 8px base grid. For high-productivity views (like log tables), padding should be tightened to 4px or 8px, while focus modes utilize 24px margins to provide visual breathing room.

## Elevation & Depth

This design system eschews heavy shadows in favor of **Tonal Layers** and **Low-contrast outlines**. 

- **Surface Tiers:** Depth is communicated by "lifting" elements with lighter background shades. A modal sits on a surface slightly lighter than the main stage.
- **Borders:** Subtle 1px borders (#FFFFFF with 10% opacity) define the boundaries of containers and inputs. 
- **Backdrop Blurs:** When overlays are necessary, a subtle 8px backdrop blur is used to maintain context of the underlying data while ensuring focus on the active task.

## Shapes

The shape language is controlled and modern. A default roundedness of **0.5rem (8px)** is applied to all standard components like buttons, input fields, and cards. This provides a professional "soft-rectilinear" feel that is neither too sharp/aggressive nor too playful.

Larger containers or sections that house distinct content blocks may use `rounded-lg` (16px) to reinforce the grouping of complex information.

## Components

- **Buttons:** Primary buttons use a solid fill of the secondary color. Ghost buttons with subtle borders are preferred for secondary actions to maintain a low-profile interface.
- **Active Timer Card:** A specialized component featuring a glowing "Emerald" left-border accent and the `display-timer` typography.
- **Inputs:** Dark-field inputs with a 1px border. On focus, the border transitions to the secondary blue with a subtle outer glow.
- **Project Chips:** Small, low-saturation backgrounds with high-saturation text indicators using the accent palette (Indigo, Rose, Teal).
- **Status Indicators:** Icons for "Syncing" vs "Local Only" should be placed in the footer or sidebar, using a pulsing animation for active synchronization.
- **Data Tables:** Row-based lists with hover states that slightly lighten the background color. Use `mono-data` for duration columns to ensure vertical alignment of digits.
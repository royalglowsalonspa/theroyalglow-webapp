# Design System Power Builder

## About this project

This is a design system power builder that documents the design portion of your design system as a Kiro Power. It allows the design-related aspects of a design system to operate separately from the technology underneath it. Rules are authored and enforced in the IDE, independent of your UI framework. The default project it generates is based on shadCN, but the component files can reference any public UI framework (or multiple if needed). Design teams manage standards centrally — styles, patterns, accessibility, and composition rules — while engineering teams choose their own technology stack. The power serves as the rules and guidance layer, usable for prototyping, development, or as a stand-in for the design-oriented aspects of a design system. Core goals: consistency, centralized solutions to common problems, and more efficient execution against user needs.

## Getting started

To scaffold your project, say:

> "Scaffold a new design system project"

The agent asks for a project name, generates the full project structure with pre-loaded content, operational files, hooks, and an initial Kiro Power build. Once the scaffold completes, you can start customizing.

1. Explore `/src` to see the pre-loaded content
2. Update component specs in `/src/design-system/components/` with your own component details
3. Create or update themes in `/src/themes/`
4. Update guidelines, tech references, and copywriting standards in `/src/guidelines/` and `/src/tech/`
5. Build your Kiro Power: trigger the `build-power` hook or say "build my power"
6. Install the generated power from `/dist/kiro/theroyalglow-design-system/`

## What you can do

### Look up component specs

Get the full spec for any of the 57 pre-loaded components — API, variants, accessibility, CSS variables, and composition patterns.

> "Show me the button component spec"

### Check accessibility requirements

Review WCAG and WAI-ARIA requirements for any component or pattern. Each component spec includes ARIA roles, keyboard interaction rules, and contrast requirements.

> "What are the accessibility requirements for dialog?"

### Generate a theme

Create a new theme with light and dark values based on shadCN CSS variables. The agent walks you through each variable group.

> "Generate a dark theme for my project"

### Generate a Storybook config

Set up a complete Storybook with stories for your components, including theme switching and light/dark mode.

> "Generate a Storybook setup for my components"

### Prototype a UI layout

Compose components into layouts using the design guidelines and UI composition rules.

> "Build a dashboard layout using sidebar and card components"

### Build the Kiro Power

Generate the distributable Kiro Power from your `/src` content.

> "Build my power" or trigger the `build-power` hook

### Sync component APIs

Check shadCN for component API updates and refresh your specs.

> "Sync components" or trigger the `manual-sync` hook

### Run an optimization audit

Check all project files against optimization rules — TL;DR sections, code fence tags, heading quality, conciseness, and more.

> "Run optimization audit" or trigger the `optimization-audit` hook

## Project tools

| Tool | Trigger | Purpose |
|------|---------|---------|
| `build-power` hook | User-triggered | Build the Kiro Power output from `/src` content |
| `pre-commit-audit` hook | User-triggered | Quality gate — run before committing changes |
| `manual-sync` hook | User-triggered | Sync component APIs and documentation from external sources |
| `optimization-audit` hook | User-triggered | Audit all project files against optimization.md rules |
| Post-change sequence | Automatic (before commits) | Content quality, structure, component integrity, theme integrity, changelog, TODO audit |

## Technologies

| Technology | How it's used |
|-----------|---------------|
| [shadCN](https://ui.shadcn.com) | Component library. All component specs are based on shadCN's API, variants, and composition patterns |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first CSS framework. Theme variables map to Tailwind utilities |
| [Radix UI](https://radix-ui.com) | Headless primitives underneath shadCN components. Referenced for accessibility patterns |
| [Storybook](https://storybook.js.org) | Component development environment. The power can generate a full Storybook from component specs |
| [Motion](https://motion.dev) | Animation library. Used when CSS transitions aren't sufficient |
| [Lucide](https://lucide.dev) | Icon library (shadCN default). Icon semantics are consistent across themes |

The default content uses shadCN and Tailwind. To use a different component library, refactor the component specs in `/src/design-system/components/` and update `src/tech/technical-guidelines.md`. The operational structure works with any component library.

## Project structure

```
theroyalglow-design-system/
├── README.md              — This file
├── agents.md              — Agent behavior and rules
├── maintenance.md         — Day-to-day lifecycle and procedures
├── build.md               — Build system (Kiro Power format)
├── workflows.md           — Validation workflows
├── optimization.md        — Quality and consistency standards
├── error-recovery.md      — Error recovery procedures
├── index.md               — Navigation and system map
├── mcp-setup.md           — MCP server configuration
├── changes.md             — Change log
├── todos.md               — TODO tracking
├── project-status.md      — Current project status
├── .kiro/hooks/           — Agent hooks (build-power, pre-commit-audit, manual-sync, optimization-audit)
├── /src
│   ├── /design-system
│   │   ├── design-system.md  — Parent record and indexes
│   │   ├── /components       — 57 component specs
│   │   ├── /patterns         — Data Table, Date Picker
│   │   └── /templates        — Calendar, Dashboard, Login, Sidebar
│   ├── /themes
│   │   └── default.md        — New York base theme (light + dark)
│   ├── /guidelines
│   │   ├── /design           — Design heuristics, UI composition rules
│   │   └── /copywriting      — Voice and tone, glossary
│   ├── /tech                 — Technical guidelines, shadCN, Storybook, Motion, Lucide
│   ├── /setup                — MCP server setup
│   └── /workflows            — Power workflows
└── /dist/kiro                — Kiro Power build output
```

## Additional information

- `agents.md` governs all agent behavior and rules
- `workflows.md` has the full validation workflow details with check IDs and pass/fail criteria
- `optimization.md` covers content quality standards
- The TODO system tracks all unknowns centrally in `todos.md`
- Components reference CSS variables only — never hardcoded color values. Themes hold the resolved values.


import { Accordion, Accordions } from 'fumadocs-ui/components/accordion'
import { File, Files, Folder } from 'fumadocs-ui/components/files'
import { Step, Steps } from 'fumadocs-ui/components/steps'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { TypeTable } from 'fumadocs-ui/components/type-table'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'

/**
 * Global MDX component registry for the docs site.
 *
 * `defaultMdxComponents` already provides `Callout`, `Card`, `Cards`, code
 * blocks, links and images. We additionally register the interactive Fumadocs
 * components so every `.mdx` page can use them without a local import:
 *
 * - `<Steps>` / `<Step>`        — numbered walkthroughs (setup, flows)
 * - `<Tabs>` / `<Tab>`          — OS / variant switchers
 * - `<Accordions>` / `<Accordion>` — collapsible FAQ-style sections
 * - `<TypeTable>`               — typed parameter / field tables
 * - `<Files>` / `<Folder>` / `<File>` — file-tree diagrams
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    Accordion,
    Accordions,
    TypeTable,
    File,
    Files,
    Folder,
    ...components,
  }
}

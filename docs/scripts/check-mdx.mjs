// Fast static sanity check for the interactive MDX upgrade.
// Not a full MDX compile (the environment kills long Node builds) — it catches
// the most common breakers: unbalanced component tags, Tabs/Tab count mismatch,
// and missing frontmatter.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'content/docs'
const PAIRED = [
  'Tabs',
  'Tab',
  'Steps',
  'Step',
  'Accordions',
  'Accordion',
  'Cards',
  'Files',
  'Folder',
]
const _SELF_OK = ['Card', 'File', 'TypeTable'] // usually self-closing

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (e.endsWith('.mdx')) out.push(p)
  }
  return out
}

function countOpen(src, tag) {
  // <Tag> or <Tag ...> but not </Tag> and not self-closing <Tag .../>
  const re = new RegExp(`<${tag}(\\s[^>]*?)?>`, 'g')
  const selfClose = new RegExp(`<${tag}(\\s[^>]*?)?/>`, 'g')
  const all = (src.match(re) || []).length
  const self = (src.match(selfClose) || []).length
  return all - self
}
function countClose(src, tag) {
  return (src.match(new RegExp(`</${tag}>`, 'g')) || []).length
}

let problems = 0
const files = walk(ROOT)
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const errs = []

  if (!src.startsWith('---')) errs.push('missing frontmatter')

  for (const tag of PAIRED) {
    const o = countOpen(src, tag)
    const c = countClose(src, tag)
    if (o !== c) errs.push(`<${tag}> open=${o} close=${c}`)
  }

  // Tabs items vs Tab values, per Tabs block (rough: whole file)
  const tabsItems = [...src.matchAll(/<Tabs\s+items=\{(\[[^\]]*\])\}/g)]
  let declaredTabItems = 0
  for (const m of tabsItems) {
    try {
      declaredTabItems += JSON.parse(m[1].replace(/'/g, '"')).length
    } catch {
      errs.push('unparseable Tabs items array')
    }
  }
  const tabValues = (src.match(/<Tab\s+value=/g) || []).length
  if (tabsItems.length && declaredTabItems !== tabValues) {
    errs.push(`Tabs items=${declaredTabItems} but <Tab value> count=${tabValues}`)
  }

  if (errs.length) {
    problems++
    console.log(`FAIL ${f}\n   - ${errs.join('\n   - ')}`)
  }
}

console.log(`\nChecked ${files.length} MDX files — ${problems} with issues.`)
process.exit(problems ? 1 : 0)

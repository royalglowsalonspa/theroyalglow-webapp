import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import lastModified from 'fumadocs-mdx/plugins/last-modified'

export const docs = defineDocs({
  dir: 'content/docs',
})

export const docsV2 = defineDocs({
  dir: 'content/docs-v2',
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
  plugins: [lastModified({ versionControl: 'git' })],
})

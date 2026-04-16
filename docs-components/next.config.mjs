import nextMDX from '@next/mdx'

import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'
import withSearch from './src/mdx/search.mjs'

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
})

const allowedDevOrigins = (
  process.env.DOCS_ALLOWED_DEV_ORIGINS ||
  process.env.NEXT_ALLOWED_DEV_ORIGINS ||
  'http://localhost:3000,http://localhost:3001,http://localhost:3004,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3004,http://localhost:1420,tauri://localhost'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/docs',
  allowedDevOrigins,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  outputFileTracingIncludes: {
    '/**/*': ['./src/app/**/*.mdx'],
  },
}

export default withSearch(withMDX(nextConfig))

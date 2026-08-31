import { Generator, getConfig } from '@tanstack/router-generator'

const config = getConfig(
  {
    routesDirectory: './src/routes',
    generatedRouteTree: './src/routeTree.gen.ts',
    target: 'react',
    autoCodeSplitting: true,
    quoteStyle: 'single',
  },
  process.cwd(),
)

const generator = new Generator({
  root: process.cwd(),
  config,
})

await generator.run()

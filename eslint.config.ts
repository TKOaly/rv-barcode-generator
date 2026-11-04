// @ts-check
import { tanstackConfig } from "@tanstack/eslint-config"
import pluginRouter from "@tanstack/eslint-plugin-router"
import prettier from "eslint-config-prettier"

export default [
  {
    ignores: [
      "dist/",
      "build/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "docker/",
      "drizzle/",
      "routeTree.gen.ts",
      "eslint.config.ts",
    ],
  },
  ...tanstackConfig,
  ...pluginRouter.configs["flat/recommended"],
  {
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "no-shadow": "off",
      "no-empty-pattern": "off",
    },
  },
  prettier,
]

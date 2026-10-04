import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "lib/realtime/useGameChannel.ts"],
    ignores: ["**/*.test.*"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Program:has(ExpressionStatement[directive='use client']) CallExpression[callee.name='fetch']",
        message: "Browser JSON requests must use named methods from lib/http/api.ts.",
      }, {
        selector: "Program:has(ExpressionStatement[directive='use client']) CallExpression[callee.object.name=/^(window|globalThis)$/][callee.property.name='fetch']",
        message: "Browser JSON requests must use named methods from lib/http/api.ts.",
      }],
    },
  },
  {
    files: ["components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.*"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: "Use named methods from lib/http/api.ts." }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

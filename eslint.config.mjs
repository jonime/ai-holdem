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
  {
    files: ["app/**/route.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.object.name='console']:matches([callee.property.name=/^(error|warn)$/], [callee.property.value=/^(error|warn)$/])",
        message: "Server routes must use approved application or provider logging helpers.",
      }, {
        selector: "CallExpression[callee.object.property.name='console']:matches([callee.property.name=/^(error|warn)$/], [callee.property.value=/^(error|warn)$/])",
        message: "Server routes must use approved application or provider logging helpers.",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-context-check/**",
    "playwright-report/**",
    "test-results/**",
    "integration-logs/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

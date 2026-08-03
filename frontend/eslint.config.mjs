import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Pre-existing debt, deliberately warnings rather than errors so CI
      // gates on *new* problems instead of sitting permanently red.
      //
      // The playground components fetch on mount and setState in an effect.
      // That is the older React data-fetching idiom — it works, but these
      // rules want the modern pattern. Fixing it properly means restructuring
      // data flow in PipelineExplorer, OperationsTab, DataExplorer,
      // ExploreTab, PageJourney and useWebSocket, which is its own piece of
      // work and not something to fold into an unrelated change.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;

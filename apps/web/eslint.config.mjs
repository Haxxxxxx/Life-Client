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
    // `import "server-only"` already turns a bad import into a build error.
    // This reports it at lint time instead, where the message can say what to
    // do about it rather than surfacing as a bundler error about a package
    // that cannot be used in a Client Component.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/lib/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/server/*", "**/lib/server/*"],
              message:
                "lib/server/* holds service-account credentials and must stay out of the client bundle. Reach it through a route handler under src/app/api/ instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

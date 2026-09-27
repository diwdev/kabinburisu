import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // PLAN.md §8: ห้ามใช้ dangerouslySetInnerHTML ที่ไหนในโค้ดเลย บังคับด้วย
    // ESLint rule นี้ (defense in depth ต่อ XSS นอกเหนือจาก React escaping ปกติ)
    rules: {
      "react/no-danger": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // public/ is static assets only, never lintable source — needed since
    // scripts/copy-maplibre-worker.mjs (postinstall) copies large minified
    // .mjs library files into public/maplibre/, which ESLint was otherwise
    // trying to parse as our own code (1000+ bogus warnings).
    "public/**",
  ]),
]);

export default eslintConfig;

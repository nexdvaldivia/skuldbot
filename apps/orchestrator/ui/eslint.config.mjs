import { defineConfig, globalIgnores } from "eslint/config";
import sharedConfig from "../../../eslint.config.js";

export default defineConfig([
  ...sharedConfig,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

/**
 * Register @/* path aliases before any other worker imports.
 * Required when running via `tsx` outside Next.js / Vitest.
 */
import path from "path";
import { register } from "tsconfig-paths";

register({
  baseUrl: path.resolve(__dirname, ".."),
  paths: { "@/*": ["./*"] },
});

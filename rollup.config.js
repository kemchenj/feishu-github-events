import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: false
  },
  external: [/^node:/],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    typescript({
      tsconfig: "./tsconfig.build.json"
    })
  ]
};

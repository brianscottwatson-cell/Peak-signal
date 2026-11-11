// api-server tsconfig does not set resolveJsonModule. This lets
// `import seed from "./cht-metrics.json"` typecheck after the file is
// copied to artifacts/api-server/src/ops/. esbuild inlines the JSON.
declare module "*.json" {
  const value: unknown;
  export default value;
}

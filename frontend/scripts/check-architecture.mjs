/** Enforce our documented FSD boundaries by parsing TypeScript/TSX module declarations. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const layers = ["app", "pages", "widgets", "features", "entities", "shared"];
const files = [];
function walk(folder) {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
      files.push(file);
  }
}
walk(root);
const fileSet = new Set(files);
const graph = new Map();
const errors = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
function info(file) {
  const [layer, slice] = relative(file).split("/");
  return layers.includes(layer) ? { layer, slice } : null;
}
function resolve(from, specifier) {
  const target = specifier.startsWith("@/")
    ? path.resolve(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!target) return null;
  const file = [
    target,
    target + ".ts",
    target + ".tsx",
    path.join(target, "index.ts"),
    path.join(target, "index.tsx"),
  ].find((candidate) => fileSet.has(candidate));
  return file ? { target, file } : null;
}
for (const file of files) {
  const source = parse(fs.readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    createImportExpressions: true,
  });
  const imports = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(node.type) &&
      node.source?.type === "StringLiteral"
    )
      imports.push(node.source.value);
    if (node.type === "TSImportType" && node.argument?.type === "StringLiteral")
      imports.push(node.argument.value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(source);
  const edges = [];
  for (const specifier of imports) {
    const target = resolve(file, specifier);
    if (!target) continue;
    edges.push(target.file);
    const from = info(file),
      to = info(target.file);
    if (!from || !to) continue;
    const context = `${relative(file)} → ${specifier}`;
    if (layers.indexOf(to.layer) < layers.indexOf(from.layer))
      errors.push(`Upward import: ${context}`);
    if (
      from.layer === to.layer &&
      !["app", "shared"].includes(from.layer) &&
      from.slice !== to.slice
    )
      errors.push(`Sibling slice import: ${context}`);
    if (
      !["app", "shared"].includes(to.layer) &&
      (from.layer !== to.layer || from.slice !== to.slice)
    ) {
      const publicPath = path.join(root, to.layer, to.slice);
      if (
        target.target !== publicPath &&
        ![
          path.join(publicPath, "index.ts"),
          path.join(publicPath, "index.tsx"),
        ].includes(target.file)
      )
        errors.push(`Private slice import: ${context}`);
    }
  }
  graph.set(file, edges);
}
const visiting = new Set(),
  visited = new Set();
function checkCycles(file, chain = []) {
  if (visiting.has(file)) {
    errors.push(
      `Circular dependency: ${[...chain, file].map(relative).join(" → ")}`,
    );
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const target of graph.get(file) ?? [])
    checkCycles(target, [...chain, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of files) checkCycles(file);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `FSD boundaries and dependency cycles: ${files.length} modules checked.`,
  );

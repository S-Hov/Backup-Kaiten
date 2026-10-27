import { parse } from "@babel/parser";
import type { Plugin } from "vite";

/** Sonner's CSS is imported as a static asset; avoid its duplicate inline style injection under CSP. */
export function externalSonnerStyles(): Plugin {
  return {
    name: "external-sonner-styles",
    enforce: "pre",
    apply: "build",
    transform(code, id) {
      if (!/[/\\]sonner[/\\]dist[/\\]index\.mjs$/.test(id)) return;
      const calls = parse(code, { sourceType: "module" }).program.body.filter(
        (node) =>
          node.type === "ExpressionStatement" &&
          node.expression.type === "CallExpression" &&
          node.expression.callee.type === "Identifier" &&
          node.expression.callee.name === "__insertCSS",
      );
      if (calls.length !== 1)
        throw new Error(
          "Sonner stylesheet injection changed; review the static CSS integration.",
        );
      const call = calls[0];
      return {
        code: code.slice(0, call.start!) + code.slice(call.end!),
        map: null,
      };
    },
  };
}

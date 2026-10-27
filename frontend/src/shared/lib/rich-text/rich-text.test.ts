import { describe, expect, it } from "vitest";
import { renderRichText, safeAssetURL, safeLink } from "./index";

describe("archived rich text", () => {
  it("supports working attachment URLs and keeps traversal and active image types blocked", () => {
    const url =
      "/api/v1/attachments/11111111-1111-4111-8111-111111111111/content";
    expect(safeAssetURL(url)).toBe(url);
    expect(safeAssetURL("/api/v1/attachments/../../.env")).toBeNull();
    expect(
      renderRichText("![Макет](https://files.example/file.png)", {
        "https://files.example/file.png": url,
      }),
    ).toContain(url);
    expect(
      renderRichText('<img src="data:image/svg+xml;base64,PHN2Zz4=">', {}, 2),
    ).not.toContain("<img");
  });
  it("removes active content, inline styles and unsafe links", () => {
    const html = renderRichText(
      '<script>alert(1)</script><style>body{display:none}</style><svg onload="evil()"></svg><p style="color:red" onclick="evil()">Текст <a href="javascript:evil()">ссылка</a></p>',
      {},
      2,
    );
    const node = document.createElement("div");
    node.innerHTML = html;
    expect(
      node.querySelector("script,style,svg,[onclick],[onload],[style],[href]"),
    ).toBeNull();
    expect(node.textContent).toBe("Текст ссылка");
  });
  it("uses only local mapped images and reports unavailable external images", () => {
    const html = renderRichText(
      "![Фото](https://files.example/one.png) ![Нет](https://files.example/two.png)",
      { "https://files.example/one.png": "/assets/snapshot/123/0" },
    );
    const node = document.createElement("div");
    node.innerHTML = html;
    expect(node.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/snapshot/123/0",
    );
    expect(node.querySelectorAll("img")).toHaveLength(1);
    expect(node.textContent).toContain("Изображение не сохранено");
  });
  it("rejects external and traversal asset URLs, even if returned in a map", () => {
    expect(safeAssetURL("//evil.example/file")).toBeNull();
    expect(safeAssetURL("/assets/../../.env")).toBeNull();
    expect(safeAssetURL("/assets\\evil/file")).toBeNull();
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("https://example.com")).toBe("https://example.com");
    expect(
      renderRichText(
        '<img src="https://files.example/photo">',
        { "https://files.example/photo": "https://evil.example/photo" },
        2,
      ),
    ).not.toContain("<img");
  });
});

import DOMPurify from "dompurify";
import { marked } from "marked";

export function safeLink(url?: string | null): string | null {
  if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
      ? url
      : null;
  } catch {
    return null;
  }
}

export function safeAssetURL(url?: string | null): string | null {
  if (!url || !url.startsWith("/assets/") || url.includes("\\")) return null;
  try {
    const parsed = new URL(url, "https://archive.invalid");
    return parsed.origin === "https://archive.invalid" &&
      parsed.pathname.startsWith("/assets/")
      ? url
      : null;
  } catch {
    return null;
  }
}

function imageURL(
  url: string,
  imageMap: Record<string, string>,
): string | null {
  if (
    /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(
      url,
    )
  )
    return url;
  try {
    const path = new URL(url, "https://archive.invalid").pathname;
    const mapped =
      imageMap[url] ||
      imageMap[path] ||
      imageMap["basename:" + decodeURIComponent(path.split("/").pop() ?? "")];
    return safeAssetURL(mapped);
  } catch {
    return null;
  }
}

export function renderRichText(
  text: string,
  imageMap: Record<string, string>,
  type?: number,
): string {
  const html =
    type === 2 || /<\/?(?:p|div|img|ul|br|table|strong)\b/i.test(text)
      ? text
      : marked.parse(text, { async: false, breaks: true });
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS:
      "p br strong b em i u s del a img ul ol li blockquote pre code h1 h2 h3 h4 hr table thead tbody tr th td span div sub sup".split(
        " ",
      ),
    ALLOWED_ATTR: ["href", "src", "alt", "title"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  for (const image of doc.querySelectorAll("img")) {
    const local = imageURL(image.getAttribute("src") ?? "", imageMap);
    if (!local) {
      const placeholder = doc.createElement("span");
      placeholder.className = "missing-image";
      placeholder.textContent = "▧ Изображение не сохранено в архиве";
      image.replaceWith(placeholder);
    } else {
      image.src = local;
      image.loading = "lazy";
      image.alt ||= "Изображение из карточки";
      if (safeAssetURL(local)) image.dataset.preview = local;
    }
  }
  for (const anchor of doc.querySelectorAll("a")) {
    const link = safeLink(anchor.getAttribute("href"));
    if (link) {
      anchor.href = link;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    } else anchor.removeAttribute("href");
  }
  return doc.body.innerHTML;
}

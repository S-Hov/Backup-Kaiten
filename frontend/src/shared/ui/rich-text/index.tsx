import { useMemo } from "react";
import { Empty } from "@/shared/ui";
import { renderRichText } from "@/shared/lib/rich-text";

export function RichText({
  text,
  imageMap,
  type,
  onPreview,
}: {
  text?: string;
  imageMap: Record<string, string>;
  type?: number;
  onPreview: (url: string) => void;
}) {
  const html = useMemo(
    () => renderRichText(text ?? "", imageMap, type),
    [text, imageMap, type],
  );
  if (!text) return <Empty>Описание не заполнено</Empty>;
  return (
    <div
      className="rich-text"
      onClick={(event) => {
        const target = event.target;
        if (target instanceof HTMLImageElement && target.dataset.preview)
          onPreview(target.dataset.preview);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

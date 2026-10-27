import { useEffect, useRef } from "react";
import type { Attachment } from "../../api/types";
import { Empty } from "../../shared/components";
import { fileSize } from "../../shared/format";
import { safeAssetURL } from "../../shared/rich-text";

export function Attachments({
  files,
  onPreview,
  missing = false,
}: {
  files: Attachment[];
  onPreview: (url: string) => void;
  missing?: boolean;
}) {
  if (!files.length)
    return (
      <Empty>
        {missing ? "Данные о вложениях не сохранены" : "Вложений нет"}
      </Empty>
    );
  return (
    <div className="file-grid">
      {files.map((file, index) => {
        const url = safeAssetURL(file.url);
        const download = safeAssetURL(file.downloadUrl);
        return (
          <div
            className={`file-card ${file.status !== "saved" ? "file-unavailable" : ""}`}
            key={`${file.id}:${index}`}
          >
            {file.image && url ? (
              <button
                className="file-preview"
                onClick={() => onPreview(url)}
                aria-label={`Открыть изображение ${file.name}`}
              >
                <img src={url} loading="lazy" alt={file.name} />
              </button>
            ) : (
              <div className="file-placeholder">
                {file.video ? "▷" : file.audio ? "♫" : "▤"}
              </div>
            )}
            <div className="file-caption">
              <strong title={file.name}>{file.name}</strong>
              <small>
                {file.status === "saved"
                  ? fileSize(file.size)
                  : file.status === "external_reference"
                    ? "Внешнее хранилище"
                    : "Не скачано"}
              </small>
              {download && (
                <a href={download} download aria-label={`Скачать ${file.name}`}>
                  ↓
                </a>
              )}
            </div>
            {file.video && url && <video controls preload="none" src={url} />}
            {file.audio && url && <audio controls preload="none" src={url} />}
          </div>
        );
      })}
    </div>
  );
}

export function ImagePreview({
  url,
  files,
  onClose,
}: {
  url: string | null;
  files: Attachment[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (url && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [url]);
  if (!url) return null;
  const file = files.find((item) => item.url === url);
  return (
    <dialog
      ref={dialog}
      className="image-dialog"
      onClose={onClose}
      aria-label="Просмотр вложения"
    >
      <div className="image-dialog-bar">
        <span>{file?.name ?? "Изображение"}</span>
        <button
          className="icon-button"
          onClick={() => dialog.current?.close()}
          aria-label="Закрыть изображение"
        >
          ×
        </button>
      </div>
      <img src={url} alt={file?.name ?? "Просмотр вложения"} />
      <a
        className="text-button"
        href={safeAssetURL(file?.downloadUrl) ?? `${url}?download=1`}
        download
      >
        ↓ Скачать оригинал
      </a>
    </dialog>
  );
}

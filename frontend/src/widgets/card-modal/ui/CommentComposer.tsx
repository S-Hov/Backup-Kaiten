import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cardApi, cardQueries } from "@/entities/card";
import { Icon } from "@/shared/ui/icon";
import { safeLink } from "@/shared/lib/rich-text";
import styles from "./CardModal.module.scss";

function encode(file: File): Promise<{ name: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        data: String(reader.result).split(",")[1] || "",
      });
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
export function CommentComposer({
  cardId,
  disabled,
  onSent,
  disabledReason = "Отправка недоступна",
}: {
  cardId: string;
  disabled: boolean;
  onSent: () => void;
  disabledReason?: string;
}) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const send = useMutation({
    mutationFn: async () =>
      cardApi.comment(cardId, {
        requestId,
        text: [text.trim(), link.trim()].filter(Boolean).join("\n\n"),
        files: await Promise.all(files.map(encode)),
      }),
    retry: false,
    onSuccess: async () => {
      setText("");
      setLink("");
      setFiles([]);
      setShowLink(false);
      setRequestId(crypto.randomUUID());
      setError("");
      onSent();
      await client.invalidateQueries({
        queryKey: cardQueries.detail(cardId).queryKey,
      });
    },
  });
  const locked = disabled || send.isPending;
  function changed() {
    setRequestId(crypto.randomUUID());
    setError("");
    send.reset();
  }
  return (
    <form
      className={styles.composer}
      aria-label="Новый комментарий"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked || (!text.trim() && !link.trim() && !files.length)) return;
        if (link.trim() && !safeLink(link.trim())) {
          setError("Укажите полную ссылку https:// или http://");
          return;
        }
        send.mutate();
      }}
    >
      {files.length > 0 && (
        <ul className={styles.pendingFiles}>
          {files.map((file, index) => (
            <li key={index}>
              <span>{file.name}</span>
              <button
                type="button"
                disabled={locked}
                aria-label={`Убрать файл ${file.name}`}
                onClick={() => {
                  setFiles((current) => current.filter((_, i) => i !== index));
                  changed();
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showLink && (
        <input
          className={styles.linkInput}
          aria-label="Ссылка"
          placeholder="https://…"
          value={link}
          maxLength={2000}
          disabled={locked}
          onChange={(event) => {
            setLink(event.target.value);
            changed();
          }}
        />
      )}
      <textarea
        aria-label="Текст комментария"
        placeholder={disabled ? disabledReason : "Написать сообщение…"}
        value={text}
        maxLength={18000}
        rows={2}
        disabled={locked}
        onChange={(event) => {
          setText(event.target.value);
          changed();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className={styles.composerTools}>
        <label className={styles.attachButton} title="Прикрепить файл">
          <Icon name="attach" size={19} />
          <span className={styles.visuallyHidden}>Прикрепить файл</span>
          <input
            type="file"
            multiple
            disabled={locked}
            className={styles.visuallyHidden}
            aria-label="Прикрепить файл"
            onChange={(event) => {
              const selected = [
                ...files,
                ...Array.from(event.target.files || []),
              ];
              event.target.value = "";
              if (
                selected.length > 10 ||
                selected.reduce((size, file) => size + file.size, 0) >
                  15 * 1024 * 1024
              ) {
                setError("Не более 10 файлов, общий размер до 15 МБ");
                return;
              }
              setFiles(selected);
              changed();
            }}
          />
        </label>
        <button
          type="button"
          disabled={locked}
          title="Добавить ссылку"
          aria-label="Добавить ссылку"
          aria-expanded={showLink}
          onClick={() => setShowLink(!showLink)}
        >
          <Icon name="link" size={18} />
        </button>
        <small>Ctrl + Enter</small>
        <button
          type="submit"
          className={styles.sendButton}
          disabled={locked || (!text.trim() && !link.trim() && !files.length)}
          aria-label="Отправить комментарий"
        >
          <Icon name="send" size={19} />
          {send.isPending ? "Отправка…" : "Отправить"}
        </button>
      </div>
      {(error || send.error) && (
        <p className={styles.composerError} role="alert">
          {error || send.error?.message}
        </p>
      )}
    </form>
  );
}

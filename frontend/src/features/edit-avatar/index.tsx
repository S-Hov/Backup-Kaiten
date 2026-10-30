import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authApi, useSession, sessionKey } from "@/entities/session";
import { Avatar } from "@/shared/ui";
import styles from "./EditAvatar.module.scss";

export function EditAvatar() {
  const user = useSession();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const update = useMutation({
    mutationFn: (value: File | "imported" | "initials") =>
      value instanceof File
        ? authApi.avatar(value)
        : authApi.resetAvatar(value),
    retry: false,
    onSuccess: async (result) => {
      client.setQueryData(sessionKey, (previous: object | undefined) =>
        previous ? { ...previous, ...result } : previous,
      );
      setFile(undefined);
      if (input.current) input.current.value = "";
      toast.success("Аватарка обновлена");
      await client.invalidateQueries();
    },
  });
  if (!user) return null;
  return (
    <div className={styles.editor}>
      <div className={styles.preview}>
        <Avatar
          label={user.name}
          initials={user.initials}
          src={user.avatarUrl}
        />
      </div>
      <div className={styles.controls}>
        <h2>Аватарка</h2>
        <p>
          PNG, JPEG, WebP или GIF до 5 МБ. Изображение обрезается по центру до
          квадрата.
        </p>
        <label>
          Выбрать изображение
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={update.isPending}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              setError("");
              update.reset();
              setFile(undefined);
              if (selected && selected.size > 5 * 1024 * 1024)
                setError("Размер аватарки — не более 5 МБ");
              else setFile(selected);
            }}
          />
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={!file || update.isPending}
            onClick={() => file && update.mutate(file)}
          >
            Сохранить аватарку
          </button>
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate("imported")}
          >
            Вернуть из Kaiten
          </button>
          <button
            type="button"
            disabled={update.isPending || !user.avatarUrl}
            onClick={() => update.mutate("initials")}
          >
            Показывать инициалы
          </button>
        </div>
        {(error || update.error) && (
          <p role="alert">{error || update.error?.message}</p>
        )}
      </div>
    </div>
  );
}

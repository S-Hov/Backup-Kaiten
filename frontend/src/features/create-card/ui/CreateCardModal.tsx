import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cardApi, cardKeys } from "@/entities/card";
import { columnTree, leafColumns } from "@/entities/board";
import type { BoardStructure } from "@/entities/board";
import { Modal } from "@/shared/ui/modal";
import { notify } from "@/shared/ui/notifications";
import styles from "./CreateCardModal.module.scss";

export function CreateCardModal({
  structure,
  onClose,
  onCreated,
}: {
  structure: BoardStructure;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const columns = leafColumns(columnTree(structure.columns));
  const [title, setTitle] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [columnId, setColumn] = useState(columns[0]?.id || "");
  const [laneId, setLane] = useState(structure.lanes[0]?.id || "");
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      cardApi.create(structure.board.id, {
        requestId,
        title: title.trim(),
        columnId,
        laneId: laneId || null,
      }),
    onSuccess: ({ id }) => {
      void client.invalidateQueries({
        queryKey: cardKeys.board(structure.board.id),
      });
      notify.success("Карточка создана");
      onCreated(id);
    },
    // Reuse the request ID on a manual retry; do not retry a write automatically.
    retry: false,
  });
  return (
    <Modal
      labelledBy="create-card-title"
      closeLabel="Закрыть создание карточки"
      size="compact"
      dismissible={!create.isPending}
      onClose={onClose}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!create.isPending && title.trim() && columnId) create.mutate();
        }}
      >
        <header>
          <p>{structure.board.title}</p>
          <h1 id="create-card-title">Новая карточка</h1>
        </header>
        <label>
          Название
          <textarea
            required
            maxLength={500}
            rows={3}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Что нужно сделать?"
            disabled={create.isPending}
          />
        </label>
        <label>
          Колонка
          <select
            required
            value={columnId}
            onChange={(event) => setColumn(event.target.value)}
            disabled={create.isPending}
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </label>
        {structure.lanes.length > 0 && (
          <label>
            Дорожка
            <select
              required
              value={laneId}
              onChange={(event) => setLane(event.target.value)}
              disabled={create.isPending}
            >
              {structure.lanes.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.title || "Основная дорожка"}
                </option>
              ))}
            </select>
          </label>
        )}
        {create.error && (
          <p className={styles.error} role="alert">
            {create.error.message}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose} disabled={create.isPending}>
            Отмена
          </button>
          <button
            className={styles.submit}
            disabled={create.isPending || !title.trim() || !columnId}
          >
            {create.isPending ? "Создаём…" : "Создать карточку"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

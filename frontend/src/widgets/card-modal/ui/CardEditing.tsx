import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cardApi,
  cardKeys,
  cardQueries,
  type CardChanges,
  type CardDetail,
} from "@/entities/card";
import { useSession } from "@/entities/session";
import { Modal } from "@/shared/ui/modal";
import styles from "./InlineEdit.module.scss";

type Changes = Omit<CardChanges, "version">;
type SaveRequest = {
  version: number;
  changes?: Changes;
  location?: { columnId: string; laneId: string | null };
};
type Editing = {
  model: CardDetail | undefined;
  enabled: boolean;
  active: string | null;
  dirty: boolean;
  pending: boolean;
  error: Error | null;
  begin: (id: string) => boolean;
  cancel: () => void;
  setDirty: (dirty: boolean) => void;
  save: (request: SaveRequest) => void;
  beforeClose: () => boolean;
  options: ReturnType<typeof useOptions>;
  feedback: ReactNode;
};
const Context = createContext<Editing | null>(null);
export function useCardEditing() {
  const value = useContext(Context);
  if (!value) throw new Error("Card editing provider is missing");
  return value;
}
function useOptions(boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["working", "board", boardId, "edit-options"],
    queryFn: ({ signal }) => cardApi.editOptions(boardId, signal),
    enabled: enabled && !!boardId,
    meta: { silent: true },
    staleTime: 30_000,
  });
}

export function CardEditingProvider({
  model,
  children,
  onClose,
}: {
  model: CardDetail | undefined;
  children: ReactNode;
  onClose: () => void;
}) {
  const account = useSession();
  const client = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [notice, setNotice] = useState("");
  const boardId = model?.card.board?.id || "";
  const options = useOptions(
    boardId,
    !!active &&
      ["tags", "members", "subscribers", "type", "properties"].some((name) =>
        active.startsWith(name),
      ),
  );
  const mutation = useMutation({
    mutationFn: (request: SaveRequest) => {
      if (!model) throw new Error("Карточка ещё не загружена");
      return request.location
        ? cardApi.move(model.card.id, {
            version: request.version,
            ...request.location,
          })
        : cardApi.update(model.card.id, {
            version: request.version,
            ...request.changes,
          });
    },
    retry: false,
    meta: { silent: true },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: cardQueries.detail(model!.card.id).queryKey,
        }),
        client.invalidateQueries({ queryKey: cardKeys.board(boardId) }),
        client.invalidateQueries({
          queryKey: ["working", "board", boardId, "filter-options"],
        }),
      ]);
      setActive(null);
      setDirty(false);
      setNotice("");
      setDiscard(false);
    },
  });
  const enabled = !!model && !model.card.archived && account?.role !== "viewer";
  function cancel() {
    if (mutation.isPending) return;
    setActive(null);
    setDirty(false);
    setNotice("");
    mutation.reset();
  }
  function beforeClose() {
    if (mutation.isPending) return false;
    if (active) {
      if (dirty) setDiscard(true);
      else cancel();
      return false;
    }
    return true;
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const feedback = (
    <>
      {mutation.error && !active && (
        <p className={`${styles.error} ${styles.notice}`} role="alert">
          {mutation.error.message}
          <button
            type="button"
            aria-label="Закрыть ошибку"
            onClick={() => mutation.reset()}
          >
            ×
          </button>
        </p>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Закрыть подсказку">
            ×
          </button>
        </div>
      )}
      {discard && (
        <Modal
          labelledBy="discard-title"
          size="compact"
          closeLabel="Продолжить изменение"
          onClose={() => setDiscard(false)}
        >
          <div className={styles.discard}>
            <strong id="discard-title">Закрыть карточку без сохранения?</strong>
            <p>Изменение открытого поля не сохранится.</p>
            <div className={styles.actions}>
              <button autoFocus onClick={() => setDiscard(false)}>
                Продолжить редактирование
              </button>
              <button onClick={onClose}>Закрыть без сохранения</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
  return (
    <Context.Provider
      value={{
        model,
        enabled,
        active,
        dirty,
        feedback,
        pending: mutation.isPending,
        error: mutation.error,
        setDirty,
        options,
        beforeClose,
        cancel,
        begin: (id) => {
          if (!enabled || mutation.isPending) return false;
          if (active && active !== id && dirty) {
            setNotice(
              "Сначала сохраните или отмените изменение открытого поля.",
            );
            return false;
          }
          setActive(id);
          setDirty(false);
          setNotice("");
          mutation.reset();
          return true;
        },
        save: (request) => {
          if (!mutation.isPending) mutation.mutate(request);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function EditActions({ disabled = false }: { disabled?: boolean }) {
  const editing = useCardEditing();
  return (
    <>
      {editing.error && (
        <p className={styles.error} role="alert">
          {editing.error.message}
        </p>
      )}
      <div className={styles.actions}>
        <button
          className={styles.save}
          type="submit"
          disabled={disabled || !editing.dirty || editing.pending}
        >
          {editing.pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          disabled={editing.pending}
          onClick={editing.cancel}
        >
          Отмена
        </button>
      </div>
    </>
  );
}

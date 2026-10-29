import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/entities/session";
import { boardQueries } from "@/entities/board";
import { leafColumns, columnTree } from "@/entities/board";
import { KanbanBoard } from "@/widgets/kanban-board";
import { Icon } from "@/shared/ui/icon";
import { useBoardNavigation } from "../model/use-board-navigation";
import { BoardSidebar } from "./BoardSidebar";
import { BoardHeader } from "./BoardHeader";
import { BoardToolbar } from "./BoardToolbar";
import { BoardFilters } from "./BoardFilters";
import styles from "./BoardPage.module.scss";
const CardModal = lazy(() =>
  import("@/widgets/card-modal").then((module) => ({
    default: module.CardModal,
  })),
);
const CreateCardModal = lazy(() =>
  import("@/features/create-card").then((module) => ({
    default: module.CreateCardModal,
  })),
);
function LoadingBoard() {
  return (
    <div className={styles.loading} role="status">
      <span>Загружаем колонки…</span>
      <div className={styles.skeletons}>
        {[1, 2, 3, 4, 5].map((value) => (
          <div key={value}>
            <i />
            <b />
            <b />
            <b />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardPage() {
  const account = useSession();
  const nav = useBoardNavigation();
  const [collapsed, setCollapsed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filterReset, setFilterReset] = useState(0);
  const boards = useQuery(boardQueries.list());
  const selected = nav.board || boards.data?.[0]?.id || "";
  const structure = useQuery({
    ...boardQueries.structure(selected),
    enabled: !!selected && boards.isSuccess,
  });
  const current = boards.data?.find((board) => board.id === selected);
  useEffect(() => {
    document.title = `${current?.title || "Доска"} · Заказы`;
  }, [current?.title]);
  useEffect(() => setCreating(false), [selected]);
  function refresh() {
    void boards.refetch();
    if (selected) void structure.refetch();
  }
  let canAdd = false;
  try {
    canAdd =
      !!structure.data &&
      leafColumns(columnTree(structure.data.columns)).length > 0;
  } catch {
    /* The board widget renders malformed structure errors. */
  }
  const error = boards.error || structure.error;
  return (
    <div className={`${styles.shell} ${collapsed ? styles.compact : ""}`}>
      <BoardSidebar
        boards={boards.data || []}
        selected={selected}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onSelect={nav.selectBoard}
      />
      <div className={styles.content}>
        <BoardHeader
          title={current?.title || "Рабочая доска"}
          search={nav.search}
          resetToken={filterReset}
          onSearch={(search) => nav.update({ search }, true)}
        />
        <BoardToolbar
          view={nav.view}
          archived={nav.archived}
          onView={(view) => nav.update({ view })}
          onArchive={nav.toggleArchive}
          onAdd={() => setCreating(true)}
          canAdd={canAdd && account?.role !== "viewer"}
        />
        <BoardFilters
          search={nav.search}
          tags={nav.tags}
          archived={nav.archived}
          onRemove={(filter, tagId) => {
            if (filter === "search") setFilterReset((value) => value + 1);
            nav.update(
              filter === "tag"
                ? { tags: nav.tags.filter((tag) => tag.id !== tagId) }
                : filter === "search"
                  ? { search: "" }
                  : { archived: false },
            );
          }}
          onClear={() => {
            setFilterReset((value) => value + 1);
            nav.update({ search: "", tags: [], archived: false });
          }}
        />
        <main className={styles.workspace} aria-label="Рабочая доска">
          {error ? (
            <div className={styles.message} role="alert">
              <Icon name="alert" size={30} />
              <h2>Не удалось загрузить доску</h2>
              <p>{error.message}</p>
              <button onClick={refresh}>Повторить запрос</button>
            </div>
          ) : boards.isPending ? (
            <LoadingBoard />
          ) : !boards.data?.length ? (
            <div className={styles.message}>
              <Icon name="board" size={36} />
              <h2>Досок пока нет</h2>
              <p>Доски появятся после загрузки данных.</p>
              <button onClick={refresh}>Обновить</button>
            </div>
          ) : structure.isPending ? (
            <LoadingBoard />
          ) : (
            structure.data && (
              <KanbanBoard
                structure={structure.data}
                view={nav.view}
                filters={{
                  archived: nav.archived,
                  search: nav.search,
                  tags: nav.tags.map((tag) => tag.id),
                }}
                onSelectTag={(tag) => nav.toggleTag(tag)}
                onOpenCard={nav.openCard}
              />
            )
          )}
        </main>
      </div>
      {nav.card && (
        <Suspense fallback={null}>
          <CardModal
            cardId={nav.card}
            onClose={nav.closeCard}
            onOpen={nav.openCard}
          />
        </Suspense>
      )}
      {creating && structure.data && (
        <Suspense fallback={null}>
          <CreateCardModal
            structure={structure.data}
            onClose={() => setCreating(false)}
            onCreated={(card) => {
              setCreating(false);
              nav.update({
                card,
                search: "",
                archived: false,
                tags: [],
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

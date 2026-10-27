import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { number } from "../shared/format";
import { CardDetails } from "../features/cards/CardDetails";

interface Navigation {
  snapshot: string;
  card: number | null;
  query: string;
}
function readLocation(): Navigation {
  const params = new URLSearchParams(window.location.search);
  const card = params.get("card") ?? "";
  return {
    snapshot: params.get("snapshot") ?? "",
    card:
      /^[1-9]\d*$/.test(card) && Number.isSafeInteger(Number(card))
        ? Number(card)
        : null,
    query: params.get("q") ?? "",
  };
}
function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">▤</div>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}

export function App() {
  const [nav, setNav] = useState(readLocation);
  const [search, setSearch] = useState(
    () => nav.query || String(nav.card ?? ""),
  );
  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: ({ signal }) => api.snapshots(signal),
  });
  const current =
    snapshots.data?.find((item) => item.id === nav.snapshot) ??
    snapshots.data?.[0];
  const snapshot = current?.id ?? "";
  const cards = useInfiniteQuery({
    queryKey: ["cards", snapshot, nav.query],
    enabled: !!snapshot,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      api.cards(snapshot, nav.query, pageParam, signal),
    getNextPageParam: (page) =>
      page.items.length > 0 && page.offset + page.items.length < page.total
        ? page.offset + page.items.length
        : undefined,
  });
  const card = useQuery({
    queryKey: ["card", snapshot, nav.card],
    enabled: !!snapshot && nav.card != null,
    queryFn: ({ signal }) => api.card(snapshot, nav.card!, signal),
  });
  const total = cards.data?.pages[0]?.total ?? 0;

  function navigate(next: Navigation) {
    const params = new URLSearchParams();
    if (next.snapshot) params.set("snapshot", next.snapshot);
    if (next.card != null) params.set("card", String(next.card));
    if (next.query) params.set("q", next.query);
    history.pushState({}, "", `?${params}`);
    setNav(next);
  }
  function openCard(id: number) {
    navigate({ ...nav, snapshot, card: id });
  }
  useEffect(() => {
    const back = () => {
      const next = readLocation();
      setNav(next);
      setSearch(next.query || String(next.card ?? ""));
    };
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    document.title =
      card.data && nav.card
        ? `#${card.data.card.id} · ${card.data.card.title} · Архив`
        : "Архив заказов · Kaiten";
  }, [card.data, nav.card]);

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Архив заказов">
          <span className="brand-mark">k</span>
          <b>Архив заказов</b>
          <span className="header-divider" />
          <span className="brand-sub">Kaiten</span>
        </a>
        <div className="archive-pill">
          <span className="dot" />
          Локальная копия
        </div>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-heading">ВАШ АРХИВ</div>
          <label className="small-label" htmlFor="snapshot">
            Резервная копия
          </label>
          <select
            id="snapshot"
            value={snapshot}
            disabled={!current}
            onChange={(event) => {
              setSearch("");
              navigate({ snapshot: event.target.value, card: null, query: "" });
            }}
          >
            <option value="" disabled>
              Выберите копию
            </option>
            {snapshots.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id.slice(0, 10)} · Доска {item.boardId}
              </option>
            ))}
          </select>
          <div className="archive-stats">
            {current ? (
              <>
                <strong>{number(current.cards)}</strong> карточек<span>·</span>
                <strong>{number(current.files)}</strong> файлов
              </>
            ) : (
              "Загрузка…"
            )}
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              const query = search.trim().replace(/^#/, "");
              const id =
                /^[1-9]\d*$/.test(query) && Number.isSafeInteger(Number(query))
                  ? Number(query)
                  : null;
              navigate({ snapshot, query, card: id });
            }}
          >
            <label className="small-label" htmlFor="card-search">
              Номер или название карточки
            </label>
            <div className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                id="card-search"
                placeholder="Например, 14796378"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="submit"
                aria-label="Найти карточку"
                disabled={!current}
              >
                ↵
              </button>
            </div>
          </form>
          <div className="list-heading">
            <span>
              {nav.query ? "РЕЗУЛЬТАТЫ ПОИСКА" : "КАРТОЧКИ · НОВЫЕ СНАЧАЛА"}
            </span>
            <span>{number(total)}</span>
          </div>
          <nav aria-label="Карточки архива">
            {cards.isLoading && (
              <p className="list-empty" role="status">
                Загрузка карточек…
              </p>
            )}
            {cards.error && (
              <p className="list-empty" role="alert">
                {cards.error.message}
                <button onClick={() => cards.refetch()}>Повторить</button>
              </p>
            )}
            {cards.data?.pages
              .flatMap((page) => page.items)
              .map((item) => (
                <button
                  className={`list-card ${item.id === nav.card ? "selected" : ""}`}
                  key={item.id}
                  aria-current={item.id === nav.card ? "true" : undefined}
                  onClick={() => openCard(item.id)}
                >
                  <div>
                    <span>#{item.id}</span>
                    <span className="list-status">
                      {item.archived ? "Архив" : "На доске"}
                    </span>
                  </div>
                  <strong>{item.title || "Без названия"}</strong>
                </button>
              ))}
            {cards.isSuccess && !total && (
              <p className="list-empty">
                Ничего не найдено. Проверьте номер или выберите другую копию.
              </p>
            )}
          </nav>
          {cards.hasNextPage && (
            <button
              className="load-more"
              disabled={cards.isFetchingNextPage}
              onClick={() => cards.fetchNextPage()}
            >
              {cards.isFetchingNextPage ? "Загрузка…" : "Показать ещё"}
            </button>
          )}
          <footer className="sidebar-footer">
            <span className="local-icon">▣</span>
            <div>
              Данные на вашем компьютере
              <small>Просмотр сохранённого состояния</small>
            </div>
          </footer>
        </aside>
        <main id="main-content" aria-live="polite">
          {snapshots.error ? (
            <EmptyState title="Не удалось открыть архив">
              {snapshots.error.message}
              <br />
              <button
                className="text-button"
                onClick={() => snapshots.refetch()}
              >
                Повторить
              </button>
            </EmptyState>
          ) : snapshots.isSuccess && !current ? (
            <EmptyState title="Нет резервных копий для просмотра" />
          ) : nav.card && snapshot ? (
            card.isPending ? (
              <div className="loading-state" role="status">
                <span className="spinner" />
                Читаем карточку…
              </div>
            ) : card.error ? (
              <EmptyState title={`Карточка #${nav.card} не открылась`}>
                {card.error.message}
                <br />
                <button className="text-button" onClick={() => card.refetch()}>
                  Повторить
                </button>
              </EmptyState>
            ) : (
              card.data && (
                <CardDetails
                  key={`${snapshot}:${nav.card}`}
                  model={card.data}
                  onOpen={openCard}
                />
              )
            )
          ) : (
            <EmptyState title="Заказы под рукой">
              Найдите карточку по номеру или выберите её в списке слева.
              <br />
              Описание, файлы и вся история собраны в одном месте.
            </EmptyState>
          )}
        </main>
      </div>
    </>
  );
}

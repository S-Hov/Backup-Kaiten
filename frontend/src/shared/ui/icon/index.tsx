const paths = {
  filter: "M4 5h16M7 12h10M10 19h4M8 3v4M16 10v4M12 17v4",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  calendar: "M4 5h16v16H4zM16 3v4M8 3v4M4 11h16",
  tag: "M3 3h8l10 10-8 8L3 11V3zM7 7h.01",
  maximize: "M4 4h16v16H4z",
  restore: "M8 4h12v12M4 8h12v12H4z",
  panel: "M3 4h18v16H3zM15 4v16",
  attach: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2M5 15l10-10",
  send: "m3 3 19 9-19 9 4-9-4-9zM7 12h15",
  link: "M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2",
  lists: "M3 4h7v16H3zM14 4h7v16h-7zM5 8h3M16 8h3M5 12h3M16 12h3",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
  arrowLeft: "M19 12H5m7-7-7 7 7 7",
  externalLink: "M15 3h6v6m0-6L10 14M10 3H3v18h18v-7",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z",
  file: "M14 2H4v20h16V8l-6-6zm0 0v6h6M8 13h8M8 17h6",
  video: "M3 5h12v14H3zM15 10l6-4v12l-6-4",
  audio: "M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3h3M21 16a3 3 0 1 1-3-3h3",
  checklist: "M9 5h12M9 12h12M9 19h12M2 5l1 1 2-2M2 12l1 1 2-2M2 19l1 1 2-2",
  text: "M4 5h16M4 10h16M4 15h16M4 20h10",
  close: "M6 6l12 12M18 6 6 18",
  board: "M3 4h18v16H3zM9 4v16M15 4v16",
  archive: "M4 8h16v12H4zM3 4h18v4H3zM9 12h6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13.2 3M4.7 14.9a8 8 0 0 0 13.2 3",
  chevron: "m9 5 7 7-7 7",
  menu: "M4 6h16M4 12h16M4 18h16",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  alert: "M12 3 2 21h20L12 3zM12 9v5M12 17v1",
} as const;
export function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof paths;
  size?: number;
}) {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

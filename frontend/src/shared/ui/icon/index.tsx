const paths = {
  maximize: "M4 4h16v16H4z",
  restore: "M8 4h12v12M4 8h12v12H4z",
  panel: "M3 4h18v16H3zM15 4v16",
  attach: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2M5 15l10-10",
  send: "m3 3 19 9-19 9 4-9-4-9zM7 12h15",
  link: "M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2",
  lists: "M3 4h7v16H3zM14 4h7v16h-7zM5 8h3M16 8h3M5 12h3M16 12h3",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
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

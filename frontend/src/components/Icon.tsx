const symbols: Record<string, string> = {
  mark: "◉",
  overview: "▦",
  investigation: "⌁",
  rulebook: "▤",
  settings: "⚙",
  upload: "↑",
  export: "↓",
  search: "⌕",
  flag: "⚑",
  shield: "◇",
  check: "✓",
  arrow: "↗",
  more: "···",
  plus: "+",
  clock: "◷",
};

export function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className={`icon icon-${name}`}>
      {symbols[name] ?? "·"}
    </span>
  );
}

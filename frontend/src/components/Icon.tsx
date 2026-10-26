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
  simulation: "⬡",
  adoption: "⬟",
  play: "▶",
  pause: "⏸",
  stop: "⏹",
  agent: "◈",
  order: "◎",
  violation: "⚠",
  filter: "⧖",
  copy: "⎘",
  tick: "✔",
  cross: "✕",
};

export function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className={`icon icon-${name}`}>
      {symbols[name] ?? "·"}
    </span>
  );
}

// Custom growing-snake generator for the GitHub profile README.
//
// Platane/snk (the common off-the-shelf tool) renders a fixed-length snake;
// it has no concept of the body growing as it eats. This script replaces it
// with a from-scratch renderer: it fetches the real public contribution
// calendar, walks a boustrophedon ("zigzag") path that visits every cell
// exactly once, and grows the snake's segment count by one every time the
// head passes a day that had real contributions.

const USERNAME = "1yajatpatil";
const PITCH = 16; // px between cell centers
const CELL = 12; // px cell size
const START_LENGTH = 4; // snake length before eating anything
const STEP_MS = 55; // time per grid step; lower = faster
const HOLD_FRACTION = 0.03; // pause at the end of a lap before it resets
const SNAKE_COLOR = "#9D00FF";

const PALETTES = {
  light: { bg: "#ebedf0", levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
  dark: { bg: "#161b22", levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] },
};

async function fetchContributions(username) {
  const res = await fetch(`https://github.com/users/${username}/contributions`);
  const html = await res.text();
  const cellPattern = /<td[^>]*data-date="([^"]+)"[^>]*data-level="(\d)"[^>]*>/g;
  const cells = [];
  let m;
  while ((m = cellPattern.exec(html))) {
    cells.push({ date: m[1], level: Number(m[2]) });
  }
  if (cells.length === 0) throw new Error("No contribution cells found — page markup may have changed");
  return cells;
}

function buildGrid(cells) {
  const firstDate = cells.map((c) => c.date).sort()[0];
  const first = new Date(`${firstDate}T00:00:00Z`);
  const byCoord = new Map();
  let maxCol = 0;
  for (const { date, level } of cells) {
    const d = new Date(`${date}T00:00:00Z`);
    const daysSince = Math.round((d - first) / 86400000);
    const col = Math.floor(daysSince / 7);
    const row = d.getUTCDay(); // 0 = Sunday
    byCoord.set(`${col},${row}`, { date, level, col, row });
    if (col > maxCol) maxCol = col;
  }
  return { byCoord, cols: maxCol + 1, rows: 7 };
}

// A randomized backtracking search for a truly organic path turned out
// unreliable on a grid this thin (53 columns by only 7 rows) — it would
// sometimes box itself in and burn seconds of backtracking with no
// guaranteed result, and when it did finish, Warnsdorff's heuristic still
// leaned hard into either long vertical or long horizontal runs because
// that's what the grid's shape rewards.
//
// Instead: weave in small fixed-size blocks. Within each block the snake
// does a tight boustrophedon across every row (so it's constantly turning,
// not a single sweep), and successive blocks alternate which row they start
// on so consecutive blocks connect smoothly. The overall effect reads as
// genuine weaving rather than one long mechanical sweep, and it's a plain
// deterministic construction — always completes, instantly, every run.
function buildPath(grid) {
  const BLOCK_WIDTH = 7;
  const path = [];
  let ascending = true;

  for (let blockStart = 0; blockStart < grid.cols; blockStart += BLOCK_WIDTH) {
    const blockEnd = Math.min(blockStart + BLOCK_WIDTH, grid.cols); // exclusive
    const rowOrder = [];
    for (let r = 0; r < grid.rows; r++) rowOrder.push(ascending ? r : grid.rows - 1 - r);

    rowOrder.forEach((row, idx) => {
      const leftToRight = idx % 2 === 0;
      for (let i = 0; i < blockEnd - blockStart; i++) {
        const col = leftToRight ? blockStart + i : blockEnd - 1 - i;
        const cell = grid.byCoord.get(`${col},${row}`);
        if (cell) path.push(cell);
      }
    });

    ascending = !ascending; // flip so the next block picks up on the same row
  }

  return path;
}

function buildSnakeSchedule(path) {
  // birthStep[i] = the path index at which segment i first becomes visible.
  const birthStep = [];
  for (let i = 0; i < START_LENGTH; i++) birthStep.push(0);
  path.forEach((cell, i) => {
    if (cell.level > 0) birthStep.push(i);
  });
  return birthStep; // length = final snake length
}

function pct(step, totalSteps) {
  const mainRange = 100 * (1 - HOLD_FRACTION);
  return Math.min(mainRange, (step / totalSteps) * mainRange);
}

function fmt(n) {
  return Number(n.toFixed(3));
}

function renderSvg(path, birthStep, palette) {
  const totalSteps = path.length;
  const totalMs = Math.round(totalSteps * STEP_MS * (1 / (1 - HOLD_FRACTION)));
  const width = PITCH * Math.max(...path.map((c) => c.col)) + PITCH + 4;
  const height = PITCH * 7 + 4;

  let css = "";
  let rects = "";

  // Static / eaten-cell dots.
  path.forEach((cell, i) => {
    const x = cell.col * PITCH + 2;
    const y = cell.row * PITCH + 2;
    if (cell.level === 0) {
      rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${palette.bg}"/>`;
      return;
    }
    const color = palette.levels[cell.level];
    const eatenAt = fmt(pct(i, totalSteps));
    const cls = `e${i}`;
    css += `@keyframes ${cls}{0%,${eatenAt}%{fill:${color}}${fmt(eatenAt + 0.05)}%,100%{fill:${palette.bg}}}`;
    css += `.${cls}{animation:${cls} ${totalMs}ms linear infinite;fill:${color}}`;
    rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" class="${cls}"/>`;
  });

  // Snake segments.
  const finalLength = birthStep.length;
  let segs = "";
  for (let i = 0; i < finalLength; i++) {
    const born = birthStep[i];
    const cls = `s${i}`;
    const stops = [];
    for (let t = 0; t < totalSteps; t++) {
      const srcIdx = Math.max(0, t - i);
      const cell = path[srcIdx];
      const visible = t >= born ? 1 : 0;
      const x = cell.col * PITCH + 2;
      const y = cell.row * PITCH + 2;
      stops.push({ p: fmt(pct(t, totalSteps)), x, y, visible });
    }
    // hold at final position through the pause, then the loop wraps to 0%
    const last = stops[stops.length - 1];
    stops.push({ p: fmt(100 * (1 - HOLD_FRACTION)), x: last.x, y: last.y, visible: last.visible });

    let kf = "";
    stops.forEach(({ p, x, y, visible }) => {
      kf += `${p}%{transform:translate(${x}px,${y}px);opacity:${visible}}`;
    });
    css += `@keyframes ${cls}{${kf}}`;
    css += `.${cls}{animation:${cls} ${totalMs}ms linear infinite;opacity:0}`;
    segs += `<rect width="${CELL}" height="${CELL}" rx="3" fill="${SNAKE_COLOR}" class="${cls}"/>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><desc>Custom growing snake, generated from the real contribution graph</desc><style>${css}</style>${rects}${segs}</svg>`;
}

async function main() {
  const cells = await fetchContributions(USERNAME);
  const grid = buildGrid(cells);
  const path = buildPath(grid);
  const birthStep = buildSnakeSchedule(path);

  const fs = require("fs");
  fs.mkdirSync("processed", { recursive: true });
  fs.writeFileSync("processed/github-contribution-grid-snake.svg", renderSvg(path, birthStep, PALETTES.light));
  fs.writeFileSync("processed/github-contribution-grid-snake-dark.svg", renderSvg(path, birthStep, PALETTES.dark));

  console.log(`grid: ${grid.cols}x${grid.rows}, path steps: ${path.length}, final snake length: ${birthStep.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

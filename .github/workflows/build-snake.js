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

// Deterministic fallback: down column 0, up column 1, ... guaranteed to
// visit every cell, but looks like a lawnmower, not a snake.
function buildBoustrophedonPath(grid) {
  const path = [];
  for (let col = 0; col < grid.cols; col++) {
    const down = col % 2 === 0;
    for (let r = 0; r < grid.rows; r++) {
      const row = down ? r : grid.rows - 1 - r;
      const cell = grid.byCoord.get(`${col},${row}`);
      if (cell) path.push(cell);
    }
  }
  return path;
}

// Organic path: a randomized Hamiltonian walk using Warnsdorff's heuristic
// (always step onto the neighbor with the fewest onward options, so the
// snake doesn't wall itself in) with backtracking, so it wanders the board
// like an actual snake game instead of sweeping it in a fixed sweep.
function buildWanderingPath(grid) {
  const key = (col, row) => `${col},${row}`;
  const neighborsOf = (cell) =>
    [
      [cell.col + 1, cell.row],
      [cell.col - 1, cell.row],
      [cell.col, cell.row + 1],
      [cell.col, cell.row - 1],
    ]
      .map(([col, row]) => grid.byCoord.get(key(col, row)))
      .filter(Boolean);

  const total = grid.byCoord.size;
  const visited = new Set();
  const path = [];
  let budget = 400000; // safety cap so a pathological grid can't hang the build

  function dfs(current) {
    if (budget-- <= 0) return false;
    path.push(current);
    visited.add(key(current.col, current.row));
    if (path.length === total) return true;

    const candidates = neighborsOf(current)
      .filter((n) => !visited.has(key(n.col, n.row)))
      .map((n) => ({
        n,
        // Warnsdorff score: how many unvisited exits this neighbor has left.
        score: neighborsOf(n).filter((nn) => !visited.has(key(nn.col, nn.row))).length,
        r: Math.random(),
      }))
      .sort((a, b) => a.score - b.score || a.r - b.r);

    for (const { n } of candidates) {
      if (dfs(n)) return true;
    }

    path.pop();
    visited.delete(key(current.col, current.row));
    return false;
  }

  const start = grid.byCoord.get(key(0, 0)) || [...grid.byCoord.values()][0];
  return dfs(start) ? path : null;
}

function buildPath(grid) {
  return buildWanderingPath(grid) || buildBoustrophedonPath(grid);
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

// Custom growing-snake generator for the GitHub profile README.
//
// Platane/snk (the common off-the-shelf tool) renders a fixed-length snake;
// it has no concept of the body growing as it eats. This script replaces it
// with a from-scratch renderer: it fetches the real public contribution
// calendar and walks the snake directly from one contribution day to the
// next, in date order, growing its segment count by one at every stop.
// Empty days are never visited — there's nothing to eat there — so the
// snake never roams; it only ever heads for the next green dot.

const USERNAME = "1yajatpatil";
const PITCH = 16; // px between cell centers
const CELL = 12; // px cell size
const START_LENGTH = 4; // snake length before eating anything
const STEP_MS = 40; // time per grid step; lower = faster
const HOLD_FRACTION = 0.25; // share of the loop spent on the end-of-lap "HIRE ME" reveal
const SNAKE_COLOR = "#9D00FF";
const MESSAGE = "HIRE ME";

// Classic 5x7 dot-matrix glyphs. 1 = lit pixel, in reading order top to bottom.
const FONT = {
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};

// Lit pixel positions for MESSAGE, relative to its own left edge (column 0).
function buildMessagePixels() {
  const pixels = [];
  let col = 0;
  let width = 0;
  for (const ch of MESSAGE) {
    const glyph = FONT[ch];
    const glyphWidth = glyph[0].length;
    glyph.forEach((rowStr, row) => {
      [...rowStr].forEach((bit, dx) => {
        if (bit === "1") pixels.push({ col: col + dx, row });
      });
    });
    col += glyphWidth + 1; // 1-column gap between characters
    width = col - 1;
  }
  return { pixels, width };
}

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

// Every cell in the calendar, in date order (column = week, row = day).
// Used only for drawing the static background grid.
function buildAllCells(grid) {
  const cells = [];
  for (let col = 0; col < grid.cols; col++) {
    for (let row = 0; row < grid.rows; row++) {
      const cell = grid.byCoord.get(`${col},${row}`);
      if (cell) cells.push(cell);
    }
  }
  return cells;
}

// The snake's actual route: only days with real contributions, in date
// order. Skipping empty days means every step is a bite, so the snake
// heads straight for the next green dot instead of crawling the whole grid.
function buildPath(allCells) {
  return allCells.filter((cell) => cell.level > 0);
}

function buildSnakeSchedule(path) {
  // birthStep[i] = the path index at which segment i first becomes visible.
  // Every path step is a contribution day now, so the snake grows by one
  // segment at each stop.
  const birthStep = [];
  for (let i = 0; i < START_LENGTH; i++) birthStep.push(0);
  path.forEach((_, i) => birthStep.push(i));
  return birthStep; // length = final snake length
}

function pct(step, totalSteps) {
  const mainRange = 100 * (1 - HOLD_FRACTION);
  return Math.min(mainRange, (step / totalSteps) * mainRange);
}

function fmt(n) {
  return Number(n.toFixed(3));
}

function renderSvg(allCells, path, birthStep, palette) {
  const totalSteps = path.length;
  const totalMs = Math.round(totalSteps * STEP_MS * (1 / (1 - HOLD_FRACTION)));
  const gridCols = Math.max(...allCells.map((c) => c.col)) + 1;
  const width = PITCH * gridCols + 4;
  const height = PITCH * 7 + 4;

  // End-of-lap timeline: crawl (0 -> mainEnd), snake fades out, "HIRE ME"
  // wipes on column by column, holds, fades out, then the loop wraps to 0%.
  const mainEnd = 100 * (1 - HOLD_FRACTION);
  const holdSpan = 100 - mainEnd;
  const snakeFadeEnd = mainEnd + holdSpan * 0.12;
  const revealEnd = snakeFadeEnd + holdSpan * 0.52;
  const messageHoldEnd = revealEnd + holdSpan * 0.2;
  const messageFadeEnd = 100;

  let css = "";
  let rects = "";

  // Empty-day background dots (static, never eaten).
  allCells.forEach((cell) => {
    if (cell.level > 0) return;
    const x = cell.col * PITCH + 2;
    const y = cell.row * PITCH + 2;
    rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${palette.bg}"/>`;
  });

  // Contribution dots: lit until the snake's head reaches them, then fade
  // to background color (eaten).
  path.forEach((cell, i) => {
    const x = cell.col * PITCH + 2;
    const y = cell.row * PITCH + 2;
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
    // hold at the final position, then fade out to make room for the message
    const last = stops[stops.length - 1];
    stops.push({ p: fmt(mainEnd), x: last.x, y: last.y, visible: last.visible });
    stops.push({ p: fmt(snakeFadeEnd), x: last.x, y: last.y, visible: 0 });

    let kf = "";
    stops.forEach(({ p, x, y, visible }) => {
      kf += `${p}%{transform:translate(${x}px,${y}px);opacity:${visible}}`;
    });
    css += `@keyframes ${cls}{${kf}}`;
    css += `.${cls}{animation:${cls} ${totalMs}ms linear infinite;opacity:0}`;
    segs += `<rect width="${CELL}" height="${CELL}" rx="3" fill="${SNAKE_COLOR}" class="${cls}"/>`;
  }

  // "HIRE ME" reveal: wipes in column by column once the snake has finished
  // and faded, holds, then fades out right before the loop wraps to 0%.
  const { pixels: msgPixels, width: msgWidth } = buildMessagePixels();
  const msgOffset = Math.max(0, Math.floor((gridCols - msgWidth) / 2));
  let message = "";
  msgPixels.forEach(({ col, row }, i) => {
    const x = (msgOffset + col) * PITCH + 2;
    const y = row * PITCH + 2;
    const revealAt = fmt(revealEnd - ((msgWidth - col) / msgWidth) * (revealEnd - snakeFadeEnd));
    const litAt = fmt(Math.min(revealEnd, revealAt + 0.3));
    const cls = `m${i}`;
    css += `@keyframes ${cls}{0%,${revealAt}%{opacity:0}${litAt}%,${fmt(messageHoldEnd)}%{opacity:1}${fmt(messageFadeEnd)}%{opacity:0}}`;
    css += `.${cls}{animation:${cls} ${totalMs}ms linear infinite;fill:${SNAKE_COLOR};opacity:0}`;
    message += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" class="${cls}"/>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><desc>Custom growing snake, generated from the real contribution graph, spelling out HIRE ME at the end of each lap</desc><style>${css}</style>${rects}${segs}${message}</svg>`;
}

async function main() {
  const cells = await fetchContributions(USERNAME);
  const grid = buildGrid(cells);
  const allCells = buildAllCells(grid);
  const path = buildPath(allCells);
  const birthStep = buildSnakeSchedule(path);

  const fs = require("fs");
  fs.mkdirSync("processed", { recursive: true });
  fs.writeFileSync(
    "processed/github-contribution-grid-snake.svg",
    renderSvg(allCells, path, birthStep, PALETTES.light)
  );
  fs.writeFileSync(
    "processed/github-contribution-grid-snake-dark.svg",
    renderSvg(allCells, path, birthStep, PALETTES.dark)
  );

  console.log(`grid: ${grid.cols}x${grid.rows}, path steps: ${path.length}, final snake length: ${birthStep.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

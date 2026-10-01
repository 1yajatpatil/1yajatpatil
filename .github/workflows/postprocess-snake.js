const fs = require("fs");
const path = require("path");

const SPEED_FACTOR = 0.4; // lower = faster; scales every animation duration uniformly
const dir = "processed";

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".svg")) continue;
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, "utf8");

  // Drop the growth/score bar rects (class="u u0", "u u1", ...), keep the
  // contribution-grid dots (class="c ...") and the snake body (class="s...").
  content = content.replace(/<rect class="u(?: u\d+)?"[^>]*\/>/g, "");

  // Speed up every animation uniformly (keyframe percentages stay relative).
  content = content.replace(/(\d+)ms/g, (_, n) => `${Math.max(1, Math.round(Number(n) * SPEED_FACTOR))}ms`);

  fs.writeFileSync(p, content);
}

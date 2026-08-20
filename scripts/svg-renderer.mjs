import { readFileSync, writeFileSync } from 'fs';

const W = 800;
const H = 400;

function renderShip(ship) {
  if (!ship || !ship.alive) return '';
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);
  const pts = [
    [ship.x + cos * 18, ship.y + sin * 18],
    [ship.x + Math.cos(ship.angle + 2.3) * 14, ship.y + Math.sin(ship.angle + 2.3) * 14],
    [ship.x + Math.cos(ship.angle + Math.PI) * 8, ship.y + Math.sin(ship.angle + Math.PI) * 8],
    [ship.x + Math.cos(ship.angle - 2.3) * 14, ship.y + Math.sin(ship.angle - 2.3) * 14]
  ];
  const points = pts.map(p => p.join(',')).join(' ');
  return `<polygon points="${points}" fill="#0ff" filter="url(#glow)"/>`;
}

function renderAsteroid(ast) {
  const path = [];
  for (let i = 0; i < ast.sides; i++) {
    const angle = (i / ast.sides) * Math.PI * 2;
    const r = ast.radius * ast.vertices[i];
    const x = ast.x + Math.cos(angle + ast.rotation) * r;
    const y = ast.y + Math.sin(angle + ast.rotation) * r;
    path.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  path.push('Z');
  return `<path d="${path.join(' ')}" fill="none" stroke="#888" stroke-width="2"/>`;
}

function renderBullet(b) {
  const alpha = Math.min(1, b.life / 30);
  return `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="3" fill="#ff0" opacity="${alpha.toFixed(2)}"/>`;
}

function renderParticle(p) {
  const alpha = Math.min(1, p.life / 20);
  return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.radius.toFixed(1)}" fill="${p.color}" opacity="${alpha.toFixed(2)}"/>`;
}

function renderCRTOverlay() {
  let lines = '';
  for (let y = 0; y < H; y += 3) {
    lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`;
  }
  return lines;
}

function renderHUD(state) {
  return `
    <text x="20" y="30" fill="#0ff" font-family="monospace" font-size="16" filter="url(#glow)">SCORE: ${state.score || 0}</text>
    <text x="${W / 2}" y="30" fill="#0ff" font-family="monospace" font-size="16" text-anchor="middle" filter="url(#glow)">LEVEL: ${state.level || 1}</text>
    <text x="${W - 20}" y="30" fill="#0ff" font-family="monospace" font-size="16" text-anchor="end" filter="url(#glow)">HIGH: ${state.highScore || 0}</text>
  `;
}

function renderThrustFlame(ship) {
  if (!ship || !ship.alive) return '';
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);
  const flicker = Math.random() * 8;
  const x1 = ship.x + Math.cos(ship.angle + 2.6) * 10;
  const y1 = ship.y + Math.sin(ship.angle + 2.6) * 10;
  const x2 = ship.x - cos * (16 + flicker);
  const y2 = ship.y - sin * (16 + flicker);
  const x3 = ship.x + Math.cos(ship.angle - 2.6) * 10;
  const y3 = ship.y + Math.sin(ship.angle - 2.6) * 10;
  return `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}" fill="#f80" opacity="0.8"/>`;
}

function generateSVG(state) {
  const ship = state.ship || { x: W / 2, y: H / 2, angle: -Math.PI / 2, alive: true };
  const asteroids = state.asteroids || [];
  const bullets = state.bullets || [];
  const particles = state.particles || [];
  const isThrusting = ship.alive && Math.random() > 0.3;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.4)"/>
    </radialGradient>
  </defs>
  
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>
  
  ${asteroids.map(renderAsteroid).join('\n  ')}
  
  ${bullets.map(renderBullet).join('\n  ')}
  
  ${particles.map(renderParticle).join('\n  ')}
  
  ${isThrusting ? renderThrustFlame(ship) : ''}
  ${renderShip(ship)}
  
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  
  <g shape-rendering="crispEdges">
    ${renderCRTOverlay()}
  </g>
  
  ${renderHUD(state)}
  
  <text x="${W / 2}" y="${H - 15}" fill="#555" font-family="monospace" font-size="10" text-anchor="middle">AUTO-PLAY DEMO | Frame ${state.frame || 0}</text>
</svg>`;

  return svg;
}

const statePath = 'game-state.json';
const outputPath = 'asteroids.svg';

let state;
try {
  const raw = readFileSync(statePath, 'utf8');
  state = JSON.parse(raw);
} catch (e) {
  console.error('No game-state.json found, using defaults');
  state = { frame: 0, score: 0, level: 1, ship: null, asteroids: [], bullets: [], particles: [] };
}

const svg = generateSVG(state);
writeFileSync(outputPath, svg);
console.log(`SVG generated: ${outputPath} (${svg.length} bytes)`);

import { readFileSync, writeFileSync } from 'fs';

const W = 800;
const H = 400;

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dist(a, b) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function wrap(obj) {
  if (obj.x < -50) obj.x = W + 50;
  if (obj.x > W + 50) obj.x = -50;
  if (obj.y < -50) obj.y = H + 50;
  if (obj.y > H + 50) obj.y = -50;
}

function circleCollision(a, b) {
  return dist(a, b) < (a.radius || 3) + (b.radius || 3);
}

function createAsteroid(x, y, size, speedMul) {
  const sizes = { large: 40, medium: 20, small: 10 };
  const points = { large: 20, medium: 50, small: 100 };
  const spd = random(0.5, 2) * (speedMul || 1);
  const angle = random(0, Math.PI * 2);
  const verts = [];
  const sides = randomInt(7, 12);
  for (let i = 0; i < sides; i++) verts.push(random(0.7, 1.3));
  return {
    x, y, size,
    radius: sizes[size],
    scoreValue: points[size],
    vx: Math.cos(angle) * spd,
    vy: Math.sin(angle) * spd,
    rotation: 0,
    rotationSpeed: random(-0.02, 0.02),
    vertices: verts,
    sides
  };
}

function spawnAsteroids(count, speedMul) {
  const asteroids = [];
  for (let i = 0; i < count; i++) {
    let x, y;
    const edge = randomInt(0, 3);
    if (edge === 0) { x = random(0, W); y = -50; }
    else if (edge === 1) { x = W + 50; y = random(0, H); }
    else if (edge === 2) { x = random(0, W); y = H + 50; }
    else { x = -50; y = random(0, H); }
    asteroids.push(createAsteroid(x, y, 'large', speedMul));
  }
  return asteroids;
}

function splitAsteroid(ast, speedMul) {
  if (ast.size === 'large') {
    return [
      createAsteroid(ast.x, ast.y, 'medium', speedMul * 1.2),
      createAsteroid(ast.x, ast.y, 'medium', speedMul * 1.2)
    ];
  } else if (ast.size === 'medium') {
    return [
      createAsteroid(ast.x, ast.y, 'small', speedMul * 1.3),
      createAsteroid(ast.x, ast.y, 'small', speedMul * 1.3)
    ];
  }
  return [];
}

function aiDecide(ship, asteroids, powerups) {
  let nearestThreat = null;
  let minThreatDist = Infinity;
  for (const a of asteroids) {
    const d = dist(ship, a);
    if (d < minThreatDist) {
      minThreatDist = d;
      nearestThreat = a;
    }
  }

  let bestTarget = null;
  let bestScore = -Infinity;
  for (const a of asteroids) {
    const d = dist(ship, a);
    const sizeMul = a.size === 'small' ? 3 : a.size === 'medium' ? 2 : 1;
    const score = (sizeMul * 1000) / (d + 1);
    if (score > bestScore) { bestScore = score; bestTarget = a; }
  }

  let targetX, targetY, shouldShoot = false, shouldThrust = false;

  if (minThreatDist < 120 && nearestThreat) {
    targetX = ship.x + (ship.x - nearestThreat.x);
    targetY = ship.y + (ship.y - nearestThreat.y);
    shouldThrust = true;
  } else if (bestTarget) {
    targetX = bestTarget.x;
    targetY = bestTarget.y;
    shouldShoot = dist(ship, bestTarget) < 400;
    shouldThrust = dist(ship, bestTarget) > 200;
  } else {
    targetX = W / 2;
    targetY = H / 2;
    shouldThrust = true;
  }

  const desiredAngle = Math.atan2(targetY - ship.y, targetX - ship.x);
  let angleDiff = desiredAngle - ship.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  return {
    rotateLeft: angleDiff < -0.1,
    rotateRight: angleDiff > 0.1,
    thrust: shouldThrust && Math.abs(angleDiff) < 0.5,
    shoot: shouldShoot && Math.abs(angleDiff) < 0.3 && minThreatDist < 500
  };
}

function simulateFrame(state) {
  const s = { ...state };
  s.frame++;

  if (!s.ship) {
    s.ship = { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, alive: true, radius: 15 };
  }

  if (s.asteroids.length === 0) {
    s.level = (s.level || 1) + 1;
    const count = Math.min(4 + s.level * 2, 20);
    const speedMul = 1 + (s.level - 1) * 0.15;
    s.asteroids = spawnAsteroids(count, speedMul);
  }

  const ai = aiDecide(s.ship, s.asteroids, s.powerups || []);

  if (ai.rotateLeft) s.ship.angle -= 0.07;
  if (ai.rotateRight) s.ship.angle += 0.07;

  if (ai.thrust) {
    s.ship.vx += Math.cos(s.ship.angle) * 0.12;
    s.ship.vy += Math.sin(s.ship.angle) * 0.12;
  }

  s.ship.vx *= 0.99;
  s.ship.vy *= 0.99;

  const speed = Math.sqrt(s.ship.vx ** 2 + s.ship.vy ** 2);
  if (speed > 8) {
    s.ship.vx = (s.ship.vx / speed) * 8;
    s.ship.vy = (s.ship.vy / speed) * 8;
  }

  s.ship.x += s.ship.vx;
  s.ship.y += s.ship.vy;
  wrap(s.ship);

  if (!s.bullets) s.bullets = [];
  if (!s.particles) s.particles = [];

  if (ai.shoot && s.ship.alive) {
    s.bullets.push({
      x: s.ship.x + Math.cos(s.ship.angle) * 20,
      y: s.ship.y + Math.sin(s.ship.angle) * 20,
      vx: Math.cos(s.ship.angle) * 10,
      vy: Math.sin(s.ship.angle) * 10,
      life: 60,
      radius: 3
    });
  }

  for (const b of s.bullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.life--;
  }
  s.bullets = s.bullets.filter(b => b.life > 0 && b.x > -10 && b.x < W + 10 && b.y > -10 && b.y < H + 10);

  for (const a of s.asteroids) {
    a.x += a.vx;
    a.y += a.vy;
    a.rotation += a.rotationSpeed;
    wrap(a);
  }

  const newParticles = [];
  const newAsteroids = [];

  for (let i = s.bullets.length - 1; i >= 0; i--) {
    for (let j = s.asteroids.length - 1; j >= 0; j--) {
      if (circleCollision(s.bullets[i], s.asteroids[j])) {
        const ast = s.asteroids[j];
        s.score = (s.score || 0) + ast.scoreValue;
        for (let p = 0; p < 15; p++) {
          newParticles.push({
            x: ast.x, y: ast.y,
            vx: random(-3, 3), vy: random(-3, 3),
            life: randomInt(15, 30),
            color: '#fff',
            radius: random(1, 2)
          });
        }
        const speedMul = 1 + ((s.level || 1) - 1) * 0.15;
        newAsteroids.push(...splitAsteroid(ast, speedMul));
        s.bullets.splice(i, 1);
        s.asteroids.splice(j, 1);
        break;
      }
    }
  }

  s.asteroids.push(...newAsteroids);

  if (s.ship.alive) {
    for (let j = s.asteroids.length - 1; j >= 0; j--) {
      if (circleCollision(s.ship, s.asteroids[j])) {
        s.ship.alive = false;
        s.respawnTimer = 90;
        for (let p = 0; p < 25; p++) {
          newParticles.push({
            x: s.ship.x, y: s.ship.y,
            vx: random(-4, 4), vy: random(-4, 4),
            life: randomInt(20, 40),
            color: '#0ff',
            radius: random(1, 3)
          });
        }
        const ast = s.asteroids[j];
        const speedMul = 1 + ((s.level || 1) - 1) * 0.15;
        newAsteroids.push(...splitAsteroid(ast, speedMul));
        s.asteroids.splice(j, 1);
        break;
      }
    }
  }

  if (!s.ship.alive) {
    s.respawnTimer = (s.respawnTimer || 90) - 1;
    if (s.respawnTimer <= 0) {
      s.ship = { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, alive: true, radius: 15 };
    }
  }

  for (const p of s.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life--;
  }

  s.particles = [...s.particles.filter(p => p.life > 0), ...newParticles];
  if (s.particles.length > 100) s.particles = s.particles.slice(-100);

  if (s.score > (s.highScore || 0)) s.highScore = s.score;

  return s;
}

const statePath = 'game-state.json';
let state;

try {
  const raw = readFileSync(statePath, 'utf8');
  state = JSON.parse(raw);
} catch {
  state = {
    frame: 0,
    score: 0,
    highScore: 0,
    level: 1,
    ship: { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, alive: true, radius: 15 },
    asteroids: spawnAsteroids(4, 1),
    bullets: [],
    particles: []
  };
}

const newState = simulateFrame(state);
writeFileSync(statePath, JSON.stringify(newState, null, 2));
console.log(`Frame ${newState.frame} | Score: ${newState.score} | Level: ${newState.level}`);

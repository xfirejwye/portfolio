/* ═══════════════════════════════════════════════════════
   FLAPPY BIRD — Vanilla JS / Canvas
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── Canvas Setup ──────────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width;   // 288
const H = canvas.height;  // 512

// ── UI Elements ───────────────────────────────────────────
const startScreen   = document.getElementById('start-screen');
const gameoverScreen= document.getElementById('gameover-screen');
const hud           = document.getElementById('hud');
const scoreDisplay  = document.getElementById('score-display');
const finalScore    = document.getElementById('final-score');
const finalBest     = document.getElementById('final-best');
const startBest     = document.getElementById('start-best');
const medalRow      = document.getElementById('medal-row');
const startBtn      = document.getElementById('start-btn');
const restartBtn    = document.getElementById('restart-btn');

// ── Constants ─────────────────────────────────────────────
const GRAVITY       = 0.22;
const FLAP_VEL      = -5.2;
const MAX_FALL      = 9;
const PIPE_W        = 52;
const PIPE_GAP      = 110;
const BASE_PIPE_SPD = 2;
const GROUND_H      = 112;
const BIRD_X        = 60;
const BIRD_W        = 34;
const BIRD_H        = 24;
const SPAWN_INTERVAL= 92;   // frames between pipe spawns
const DIFFICULTY_INC= 5;    // score threshold to increase speed

// ── State ─────────────────────────────────────────────────
let state   = 'idle';       // 'idle' | 'playing' | 'dead'
let score   = 0;
let best    = parseInt(localStorage.getItem('flappyBest') || '0');
let frame   = 0;
let pipes   = [];
let pipeSpeed = BASE_PIPE_SPD;
let groundOffset = 0;
let rafId   = null;
let flashTimer = 0;

startBest.textContent = best;

// ── Bird Object ───────────────────────────────────────────
const bird = {
  x: BIRD_X,
  y: H / 2 - 60,
  vy: 0,
  wingUp: false,
  wingTick: 0,
  deathRot: 0,

  reset() {
    this.y = H / 2 - 60;
    this.vy = 0;
    this.wingUp = false;
    this.wingTick = 0;
    this.deathRot = 0;
  },

  flap() {
    this.vy = FLAP_VEL;
    playSound('flap');
  },

  update() {
    if (state === 'idle') {
      // Gentle hover
      this.y = H / 2 - 60 + Math.sin(frame * 0.07) * 6;
      this.wingTick++;
      if (this.wingTick > 10) { this.wingTick = 0; this.wingUp = !this.wingUp; }
      return;
    }
    if (state === 'dead') return;

    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    this.y += this.vy;

    this.wingTick++;
    if (this.wingTick > 8) { this.wingTick = 0; this.wingUp = !this.wingUp; }
  },

  draw() {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));

    if (state === 'dead') {
      ctx.rotate(Math.min(Math.PI / 2, this.deathRot));
    } else {
      const angle = Math.max(-0.4, Math.min(1.2, this.vy * 0.055));
      ctx.rotate(angle);
    }

    const bx = -BIRD_W / 2, by = -BIRD_H / 2;

    // Body — yellow ellipse via overlapping rects
    fillPx(bx + 4,  by + 2,  24, 20, '#F5CF00');
    fillPx(bx + 2,  by + 4,  28, 16, '#F5CF00');
    fillPx(bx + 1,  by + 6,  30, 12, '#F5CF00');

    // Orange belly
    fillPx(bx + 8,  by + 12, 14, 8,  '#F09200');
    fillPx(bx + 6,  by + 14, 18, 6,  '#F09200');

    // Wing
    if (this.wingUp) {
      fillPx(bx + 8,  by + 2,  12, 6, '#F5E800');
      fillPx(bx + 6,  by + 2,  16, 4, '#F5E800');
    } else {
      fillPx(bx + 6,  by + 14, 16, 6, '#CF9000');
      fillPx(bx + 8,  by + 16, 12, 6, '#CF9000');
    }

    // Eye white
    fillPx(bx + 18, by + 4,  10, 10, '#FFFFFF');
    fillPx(bx + 17, by + 5,  12, 8,  '#FFFFFF');

    // Pupil
    fillPx(bx + 21, by + 6,  5,  5,  '#000000');

    // Beak upper
    fillPx(bx + 27, by + 8,  7,  4,  '#F09200');
    // Beak lower
    fillPx(bx + 27, by + 10, 7,  4,  '#D07000');
    fillPx(bx + 30, by + 8,  4,  8,  '#F09200');

    ctx.restore();
  },

  /** AABB hitbox (slightly inset for feel) */
  hitbox() {
    return {
      left:   this.x - BIRD_W / 2 + 5,
      right:  this.x + BIRD_W / 2 - 5,
      top:    this.y - BIRD_H / 2 + 5,
      bottom: this.y + BIRD_H / 2 - 5,
    };
  }
};

// ── Pipe System ───────────────────────────────────────────
function spawnPipe() {
  const minTop = 50;
  const maxTop = H - GROUND_H - PIPE_GAP - 50;
  const topH   = minTop + Math.random() * (maxTop - minTop);
  pipes.push({ x: W + 10, topH, scored: false });
}

function updatePipes() {
  if (frame % SPAWN_INTERVAL === 0) spawnPipe();

  for (const p of pipes) {
    p.x -= pipeSpeed;
    if (!p.scored && p.x + PIPE_W < bird.x - BIRD_W / 2) {
      p.scored = true;
      score++;
      scoreDisplay.textContent = score;
      pipeSpeed = BASE_PIPE_SPD + Math.floor(score / DIFFICULTY_INC) * 0.4;
      playSound('score');
    }
  }

  pipes = pipes.filter(p => p.x + PIPE_W > -20);
}

function drawPipe(p) {
  const { x, topH } = p;
  const botY = topH + PIPE_GAP;
  const botH = H - GROUND_H - botY;
  const capH = 16, capExtra = 6;

  // ── Top pipe ──
  // Body
  fillPx(x + 4, 0,           PIPE_W - 8, topH - capH, '#548A22');
  fillPx(x + 4, 0,           8,          topH - capH, '#74BF2E');
  fillPx(x + 4, 0,           2,          topH - capH, 'rgba(255,255,255,0.12)');
  // Cap
  fillPx(x,     topH - capH, PIPE_W,     capH,         '#4CAF1E');
  fillPx(x,     topH - capH, 8,          capH,         '#74BF2E');
  fillPx(x,     topH - capH, 2,          capH,         'rgba(255,255,255,0.12)');
  fillPx(x,     topH - 2,    PIPE_W,     2,            '#2E6010');

  // ── Bottom pipe ──
  // Cap
  fillPx(x,     botY,         PIPE_W,     capH,         '#4CAF1E');
  fillPx(x,     botY,         8,          capH,         '#74BF2E');
  fillPx(x,     botY,         2,          capH,         'rgba(255,255,255,0.12)');
  fillPx(x,     botY,         PIPE_W,     2,            '#2E6010');
  // Body
  fillPx(x + 4, botY + capH, PIPE_W - 8, botH - capH,  '#548A22');
  fillPx(x + 4, botY + capH, 8,          botH - capH,  '#74BF2E');
  fillPx(x + 4, botY + capH, 2,          botH - capH,  'rgba(255,255,255,0.12)');
}

// ── Collision Detection (AABB) ────────────────────────────
function checkCollisions() {
  const hb = bird.hitbox();

  // Ground & ceiling
  if (hb.bottom >= H - GROUND_H || hb.top <= 0) return true;

  // Pipes
  for (const p of pipes) {
    const pLeft  = p.x;
    const pRight = p.x + PIPE_W;
    if (hb.right > pLeft && hb.left < pRight) {
      if (hb.top < p.topH || hb.bottom > p.topH + PIPE_GAP) return true;
    }
  }
  return false;
}

// ── Background Drawing ────────────────────────────────────
function drawBackground() {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  sky.addColorStop(0, '#3AACCB');
  sky.addColorStop(1, '#A8E4F7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - GROUND_H);

  // Clouds
  drawCloud(50  - (frame * 0.28) % (W + 80), 55,  0.9);
  drawCloud(180 - (frame * 0.18) % (W + 80), 38,  0.7);
  drawCloud(320 + (frame * 0.22) % (W + 80) - 380, 90, 1.1);

  // City silhouette
  drawCity();
}

function drawCloud(x, y, sc) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(0,   0,  66, 10);
  ctx.fillRect(-9,  5,  84, 10);
  ctx.fillRect(0,  12,  66,  8);
  ctx.fillRect(9,  -7,  24, 10);
  ctx.fillRect(34, -4,  18, 12);
  ctx.restore();
}

function drawCity() {
  const baseY = H - GROUND_H - 65;
  ctx.fillStyle = 'rgba(80,140,170,0.55)';
  const buildings = [
    [0, 55, 32], [30, 38, 24], [52, 68, 38], [88, 36, 22],
    [108, 52, 30], [136, 44, 26], [160, 72, 42], [200, 50, 28], [226, 40, 22], [246, 60, 42],
  ];
  for (const [bx, bh, bw] of buildings) {
    ctx.fillRect(bx, baseY + (72 - bh), bw, bh);
    // Simple window rows
    ctx.fillStyle = 'rgba(245,207,0,0.55)';
    for (let wy = baseY + (72 - bh) + 8; wy < baseY + 70; wy += 12) {
      for (let wx = bx + 4; wx < bx + bw - 8; wx += 10) {
        ctx.fillRect(wx, wy, 5, 5);
      }
    }
    ctx.fillStyle = 'rgba(80,140,170,0.55)';
  }
}

function drawGround() {
  const gy = H - GROUND_H;

  // Sand / dirt
  fillPx(0, gy,      W, 18,           '#DED895');
  fillPx(0, gy + 18, W, 4,            '#C8B862');
  fillPx(0, gy + 22, W, GROUND_H - 22,'#7D6A2E');

  // Moving grass bumps
  ctx.fillStyle = '#6DBB3A';
  const bw = 24;
  const off = Math.floor(groundOffset) % bw;
  for (let bx = -bw + off; bx < W + bw; bx += bw) {
    ctx.fillRect(bx,     gy - 2, 12, 8);
    ctx.fillRect(bx + 4, gy - 5,  6, 5);
  }
}

// ── Score / UI Overlays ───────────────────────────────────
function drawHudScore() {
  const s = String(score);
  ctx.font = 'bold 36px "Press Start 2P"';
  ctx.textAlign = 'center';
  // Outline
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(s, W / 2 + 2, 62);
  ctx.fillText(s, W / 2 - 2, 62);
  ctx.fillText(s, W / 2,     64);
  // Fill
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(s, W / 2, 60);
}

function showGameOverUI() {
  finalScore.textContent = score;
  finalBest.textContent  = best;

  // Medal
  if      (score >= 40) medalRow.textContent = '🥇';
  else if (score >= 20) medalRow.textContent = '🥈';
  else if (score >= 10) medalRow.textContent = '🥉';
  else                  medalRow.textContent = '';

  show(gameoverScreen);
}

// ── Death Flash ───────────────────────────────────────────
function drawFlash() {
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashTimer / 8})`;
    ctx.fillRect(0, 0, W, H);
    flashTimer--;
  }
}

// ── Sound (Web Audio API — simple tones) ─────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ac  = getAudio();
    const osc = ac.createOscillator();
    const gain= ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    const now = ac.currentTime;

    if (type === 'flap') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'score') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(784, now + 0.1);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now); osc.stop(now + 0.22);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    }
  } catch (e) { /* Silently fail if audio blocked */ }
}

// ── Game State Management ─────────────────────────────────
function startGame() {
  state      = 'playing';
  score      = 0;
  frame      = 0;
  pipes      = [];
  pipeSpeed  = BASE_PIPE_SPD;
  flashTimer = 0;
  bird.reset();
  scoreDisplay.textContent = '0';

  hide(startScreen);
  hide(gameoverScreen);
  show(hud);
}

function killBird() {
  state      = 'dead';
  flashTimer = 8;
  playSound('hit');

  if (score > best) {
    best = score;
    localStorage.setItem('flappyBest', best);
  }

  hide(hud);

  // Brief delay before showing game over panel
  setTimeout(() => {
    showGameOverUI();
  }, 700);
}

function handleInput() {
  if (state === 'idle')    { startGame(); bird.flap(); return; }
  if (state === 'playing') { bird.flap(); return; }
  // 'dead' — handled by button / space after panel shows
}

// ── Main Game Loop ────────────────────────────────────────
function loop() {
  frame++;
  groundOffset += pipeSpeed;

  // Update
  bird.update();

  if (state === 'playing') {
    updatePipes();

    if (bird.deathRot !== undefined && state === 'dead') {
      bird.deathRot += 0.08;
    }

    if (checkCollisions()) {
      killBird();
    }
  }

  if (state === 'dead') {
    bird.deathRot += 0.08;
  }

  // Draw
  drawBackground();
  for (const p of pipes) drawPipe(p);
  drawGround();
  bird.draw();

  if (state === 'playing') drawHudScore();
  drawFlash();

  rafId = requestAnimationFrame(loop);
}

// ── Input Listeners ───────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'dead') {
      // Only restart if gameover panel is visible
      if (!gameoverScreen.classList.contains('active')) return;
      startGame(); bird.flap();
      return;
    }
    handleInput();
  }
});

canvas.addEventListener('click',      handleInput);
canvas.addEventListener('touchstart', e => { e.preventDefault(); handleInput(); }, { passive: false });

startBtn.addEventListener('click',   e => { e.stopPropagation(); startGame(); bird.flap(); });
restartBtn.addEventListener('click', e => { e.stopPropagation(); startGame(); bird.flap(); });

// ── Helpers ───────────────────────────────────────────────
function fillPx(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function show(el) {
  el.style.display = 'flex';
  // Force reflow then add active
  requestAnimationFrame(() => el.classList.add('active'));
}

function hide(el) {
  el.classList.remove('active');
  el.style.display = 'none';
}

// ── Boot ──────────────────────────────────────────────────
show(startScreen);
loop();

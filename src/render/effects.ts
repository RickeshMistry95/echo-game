/** Short lived visual effects: sparks, rings, floating text, screen shake. Purely cosmetic. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  maxR: number;
  life: number;
  max: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
}

export class Effects {
  reducedMotion = false;
  shake = 0;
  flash = 0;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  // Cosmetic randomness only (never feeds back into the simulation).
  private seed = 1;

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  burst(x: number, y: number, color: string, count = 10, speed = 130): void {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const v = speed * (0.35 + this.rand() * 0.65);
      const life = 0.35 + this.rand() * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1.5 + this.rand() * 2, color });
    }
  }

  ring(x: number, y: number, color: string, maxR = 60, life = 0.5): void {
    this.rings.push({ x, y, maxR, life, max: life, color });
  }

  text(x: number, y: number, text: string, color = '#ffffff'): void {
    this.texts.push({ x, y, text, life: 0.9, max: 0.9, color });
  }

  addShake(v: number): void {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, v);
  }

  addFlash(v: number): void {
    if (!this.reducedMotion) this.flash = Math.max(this.flash, v);
  }

  clear(): void {
    this.particles.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 28 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return { x: (this.rand() - 0.5) * this.shake, y: (this.rand() - 0.5) * this.shake };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + (r.maxR - 6) * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.5));
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

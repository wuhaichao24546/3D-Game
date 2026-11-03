import * as THREE from 'three';

// 程序化画布贴图（零下载，构建时生成）
export function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, repeat = true, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// 木板墙
export const woodTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry(3);
  for (let x = 0; x < w; x += 32) {
    g.fillStyle = hsl(26 + r() * 6, 35 + r() * 10, 22 + r() * 9);
    g.fillRect(x, 0, 32, h);
    g.strokeStyle = 'rgba(20,10,4,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, h); g.stroke();
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '30,16,6' : '140,100,60'},${0.12 + r() * 0.18})`;
      g.lineWidth = 1;
      const gx = x + 4 + r() * 24;
      g.beginPath(); g.moveTo(gx, 0);
      g.bezierCurveTo(gx + r() * 6 - 3, h * 0.3, gx + r() * 6 - 3, h * 0.7, gx, h);
      g.stroke();
    }
  }
  for (let i = 0; i < 6; i++) { // 木节
    g.fillStyle = 'rgba(25,12,5,0.5)';
    g.beginPath(); g.ellipse(r() * w, r() * h, 3, 6, 0, 0, 6.3); g.fill();
  }
});

// 茅草屋顶
export const thatchTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry(9);
  g.fillStyle = '#6e5430'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4200; i++) {
    const x = r() * w, y = r() * h, len = 10 + r() * 22;
    g.strokeStyle = hsl(34 + r() * 14, 35 + r() * 30, 22 + r() * 34, 0.85);
    g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + len); g.stroke();
  }
  for (let y = 0; y < h; y += 32) { // 层叠束线
    g.fillStyle = 'rgba(30,20,8,0.35)'; g.fillRect(0, y + 28, w, 4);
  }
  for (let i = 0; i < 30; i++) { // 苔痕
    g.fillStyle = hsl(85 + r() * 25, 30, 28, 0.25);
    g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 10, 0, 6.3); g.fill();
  }
});

// 青瓦（带苔）
export const tileTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry(21);
  g.fillStyle = '#1e2624'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {
    for (let x = (y / 16) % 2 ? -10 : 0; x < w; x += 20) {
      const gr = g.createLinearGradient(x, 0, x + 18, 0);
      const l = 26 + r() * 10;
      gr.addColorStop(0, hsl(170, 8, l - 10)); gr.addColorStop(0.5, hsl(170, 10, l + 6)); gr.addColorStop(1, hsl(170, 8, l - 12));
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(x + 1, y, 18, 18, 7); g.fill();
    }
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = hsl(80 + r() * 30, 40, 30 + r() * 12, 0.45);
    g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 7, 0, 6.3); g.fill();
  }
});

// 竹编墙/篮
export const wovenTex = () => canvasTex(128, 128, (g, w, h) => {
  const r = mulberry(5);
  g.fillStyle = '#7d6236'; g.fillRect(0, 0, w, h);
  const s = 8;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const horiz = ((x + y) / s) % 2 === 0;
    const gr = horiz ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
    const l = 44 + r() * 10;
    gr.addColorStop(0, hsl(40, 42, l - 14)); gr.addColorStop(0.5, hsl(42, 48, l + 6)); gr.addColorStop(1, hsl(40, 42, l - 16));
    g.fillStyle = gr; g.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
});

// 窗棂
export const latticeTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#120a05'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6a4a2c'; g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 12.8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
  }
  g.strokeRect(1, 1, w - 2, h - 2);
}, false);

// 鳞片（龙/麒麟）
export const scaleTex = (base, edge, hi) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  const s = 22;
  for (let y = -s; y < h + s; y += s * 0.55) {
    const off = Math.round(y / (s * 0.55)) % 2 ? s / 2 : 0;
    for (let x = -s; x < w + s; x += s) {
      const gr = g.createRadialGradient(x + off, y - 3, 1, x + off, y, s * 0.62);
      gr.addColorStop(0, hi); gr.addColorStop(0.6, base); gr.addColorStop(1, edge);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x + off, y, s * 0.58, 0, Math.PI); g.fill();
    }
  }
});

// 白虎毛纹
export const tigerTex = () => canvasTex(512, 256, (g, w, h) => {
  const r = mulberry(77);
  g.fillStyle = '#efebe3'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = `rgba(${200 + r() * 55},${195 + r() * 55},${185 + r() * 55},0.5)`;
    const x = r() * w, y = r() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 6); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * w + r() * 8;
    g.fillStyle = 'rgba(70,48,40,0.85)';
    g.beginPath();
    g.moveTo(x, 0);
    const wob = 10 + r() * 10;
    for (let y = 0; y <= h * (0.45 + r() * 0.4); y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * wob, y);
    for (let y = h * 0.5; y >= 0; y -= 16) g.lineTo(x + 6 + Math.sin(y * 0.05 + i) * wob * 0.6, y);
    g.closePath(); g.fill();
  }
});

// 白虎/麒麟身上的金色灵纹（自发光贴图）
export const runeLinesTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const r = mulberry(31);
  g.strokeStyle = '#ffd27a'; g.lineCap = 'round'; g.lineWidth = 3; g.shadowColor = '#ffcc66'; g.shadowBlur = 8;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    let x = r() * w, y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const nx = x + (r() - 0.5) * 90, ny = y + (r() - 0.5) * 70;
      g.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
    g.beginPath(); g.arc(x, y, 5, 0, 6.3); g.stroke();
  }
}, true, false);

// 梅花鹿白斑
export const deerTex = () => canvasTex(256, 128, (g, w, h) => {
  const r = mulberry(13);
  g.fillStyle = '#ecebe8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(r() * w, r() * h * 0.6, 2 + r() * 3, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(200,196,190,0.35)';
    g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 4, 0, 6.3); g.fill();
  }
});

// 阵纹法阵（白色线稿，材质着色 + 叠加混合）
const GLYPHS = '道法自然乾坤坎离震巽艮兑天地玄黄宇宙洪荒日月星辰灵';
export const runeCircleTex = (seed = 1) => canvasTex(1024, 1024, (g, w) => {
  const c = w / 2, r = mulberry(seed);
  g.translate(c, c);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.shadowColor = '#fff'; g.shadowBlur = 10;
  const ring = (rad, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); };
  ring(500, 6); ring(482, 2); ring(400, 4); ring(380, 2); ring(250, 4); ring(232, 2); ring(110, 3);
  g.font = 'bold 54px "KaiTi","STKaiti","Noto Serif CJK SC",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 24; i++) {
    g.save(); g.rotate((i / 24) * Math.PI * 2);
    g.fillText(GLYPHS[(i + seed) % GLYPHS.length], 0, -441);
    g.restore();
  }
  for (let i = 0; i < 8; i++) { // 八卦爻
    g.save(); g.rotate((i / 8) * Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const broken = r() < 0.5;
      g.lineWidth = 10;
      g.beginPath();
      if (broken) { g.moveTo(-50, -280 - k * 26); g.lineTo(-10, -280 - k * 26); g.moveTo(10, -280 - k * 26); g.lineTo(50, -280 - k * 26); } else { g.moveTo(-50, -280 - k * 26); g.lineTo(50, -280 - k * 26); }
      g.stroke();
    }
    g.restore();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 2; i++) { // 两个交错方形 → 八角星
    g.save(); g.rotate(i * Math.PI / 4);
    g.strokeRect(-170, -170, 340, 340);
    g.restore();
  }
  for (let i = 0; i < 48; i++) {
    g.save(); g.rotate((i / 48) * Math.PI * 2);
    g.lineWidth = 2; g.beginPath(); g.moveTo(0, -380); g.lineTo(0, -400); g.stroke();
    g.restore();
  }
  // 太极
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, -35, 35, -Math.PI / 2, Math.PI / 2); g.arc(0, 35, 35, -Math.PI / 2, Math.PI / 2, true); g.stroke();
  g.beginPath(); g.arc(0, -35, 8, 0, 6.3); g.fill();
}, false);

// 符箓（悬挂的灵符）
export const talismanTex = (bg, fg) => canvasTex(64, 192, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg;
  g.font = 'bold 34px "KaiTi","STKaiti","Noto Serif CJK SC",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  ['敕', '令', '镇'].forEach((ch, i) => g.fillText(ch, w / 2, 40 + i * 50));
}, false);

// 冲天符光（竖排金色符文）
export const glyphColumnTex = () => canvasTex(128, 512, (g, w, h) => {
  g.shadowColor = '#fff'; g.shadowBlur = 16; g.fillStyle = '#fff';
  g.font = 'bold 92px "KaiTi","STKaiti","Noto Serif CJK SC",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  ['敕', '令', '玄', '天'].forEach((ch, i) => g.fillText(ch, w / 2, 70 + i * 120));
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 20); g.moveTo(w / 2, h - 30); g.lineTo(w / 2, h); g.stroke();
}, false);

// 垂柳枝条
export const willowTex = () => canvasTex(128, 256, (g, w, h) => {
  const r = mulberry(17);
  for (let i = 0; i < 16; i++) {
    const x0 = 4 + r() * (w - 8), len = h * (0.6 + r() * 0.4), sway = (r() - 0.5) * 18;
    g.strokeStyle = hsl(80, 40, 30, 0.9); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + sway, len * 0.5, x0 + sway * 0.6, len); g.stroke();
    for (let y = 4; y < len; y += 5) {
      const t = y / len, x = x0 + sway * (2 * t * (1 - t)) * 1 + sway * 0.6 * t * t;
      g.fillStyle = hsl(78 + r() * 18, 50 + r() * 20, 36 + r() * 22, 0.95);
      g.beginPath(); g.ellipse(x + (r() < 0.5 ? -3 : 3), y, 1.6, 4.5, (r() - 0.5) * 1.2, 0, 6.3); g.fill();
    }
  }
}, false);

// 火羽（凤凰/烈焰）
export const flameFeatherTex = () => canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,250,210,1)');
  gr.addColorStop(0.3, 'rgba(255,190,70,0.95)');
  gr.addColorStop(0.7, 'rgba(255,90,20,0.7)');
  gr.addColorStop(1, 'rgba(180,30,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, h);
  g.bezierCurveTo(-4, h * 0.6, w * 0.15, h * 0.2, w / 2, 0);
  g.bezierCurveTo(w * 0.85, h * 0.2, w + 4, h * 0.6, w / 2, h);
  g.fill();
  g.strokeStyle = 'rgba(255,255,230,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * 0.08); g.stroke();
  for (let y = h * 0.15; y < h; y += 14) {
    g.strokeStyle = 'rgba(255,230,160,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.15, y - 12); g.moveTo(w / 2, y); g.lineTo(w * 0.85, y - 12); g.stroke();
  }
}, false);

// 羽片通用生成：stops 为 [位置(0=根,1=尖), 颜色] 纵向色带
const featherBlade = (stops, { barbD = '60,8,4', barbL = '255,200,120', shaft0 = 'rgba(255,240,200,0.95)', shaft1 = 'rgba(255,190,110,0.75)', shaftT = 'rgba(255,160,60,0)', edge = 'rgba(90,14,6,0.55)' } = {}) => canvasTex(96, 320, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.beginPath();
  // 羽形：根窄、中鼓、尖收
  g.moveTo(w / 2, h);
  g.bezierCurveTo(w * 0.08, h * 0.78, w * 0.1, h * 0.3, w * 0.42, h * 0.06);
  g.quadraticCurveTo(w * 0.5, 0, w * 0.58, h * 0.06);
  g.bezierCurveTo(w * 0.9, h * 0.3, w * 0.92, h * 0.78, w / 2, h);
  g.fill();
  // 羽枝：细密斜纹
  g.save();
  g.clip();
  for (let y = h * 0.05; y < h; y += 9) {
    const a = 0.1 + 0.25 * (y / h);
    g.strokeStyle = `rgba(${barbD},${a * 0.5})`;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(w / 2, y); g.lineTo(w * 0.06, y + 16);
    g.moveTo(w / 2, y); g.lineTo(w * 0.94, y + 16);
    g.stroke();
    g.strokeStyle = `rgba(${barbL},${a * 0.35})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(w / 2, y + 4); g.lineTo(w * 0.14, y + 19);
    g.moveTo(w / 2, y + 4); g.lineTo(w * 0.86, y + 19);
    g.stroke();
  }
  // 羽轴：根亮渐隐
  const shaft = g.createLinearGradient(0, h, 0, 0);
  shaft.addColorStop(0, shaft0);
  shaft.addColorStop(0.4, shaft1);
  shaft.addColorStop(1, shaftT);
  g.strokeStyle = shaft; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * 0.04); g.stroke();
  g.restore();
  // 羽缘深线收形
  g.strokeStyle = edge; g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(w / 2, h);
  g.bezierCurveTo(w * 0.08, h * 0.78, w * 0.1, h * 0.3, w * 0.42, h * 0.06);
  g.quadraticCurveTo(w * 0.5, 0, w * 0.58, h * 0.06);
  g.bezierCurveTo(w * 0.9, h * 0.3, w * 0.92, h * 0.78, w / 2, h);
  g.stroke();
}, false);

// 火凤羽（写实：绯红羽身、金橙羽尖、羽轴羽枝）
export const phoenixFeatherTex = () => featherBlade([
  [0, 'rgba(74,10,6,1)'],      // 根 暗绯
  [0.35, 'rgba(150,26,10,1)'], // 下 绯红
  [0.65, 'rgba(216,70,16,1)'], // 中 橙红
  [0.88, 'rgba(246,150,44,1)'],// 上 金橙
  [1, 'rgba(255,214,110,1)'],  // 尖 鎏金
]);

// 白虎羽（灰褐羽根、雪白羽身、淡金羽尖）
export const whiteFeatherTex = () => featherBlade([
  [0, 'rgba(64,58,48,1)'],
  [0.3, 'rgba(148,140,124,1)'],
  [0.58, 'rgba(228,224,212,1)'],
  [0.85, 'rgba(252,248,236,1)'],
  [1, 'rgba(255,224,148,1)'],
], {
  barbD: '96,84,64', barbL: '255,252,240',
  shaft0: 'rgba(255,246,220,0.95)', shaft1: 'rgba(240,220,170,0.7)', shaftT: 'rgba(220,200,150,0)',
  edge: 'rgba(130,110,80,0.5)',
});

// 鬃毛绺（龙/麒麟鬃尾：束状毛发，根部实、梢端散）— root/mid/tip 为 'r,g,b'
export const maneStrandTex = ({ root = '40,52,48', mid = '214,236,226', tip = '232,246,240' } = {}) => canvasTex(64, 256, (g, w, h) => {
  const R = mulberry(7);
  for (let s = 0; s < 16; s++) {
    const x0 = w * (0.12 + 0.76 * (s / 15)) + (R() - 0.5) * 6;
    const sway = (R() - 0.5) * w * 0.5;
    const c = 0.7 + R() * 0.3;
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, `rgba(${root},1)`);
    gr.addColorStop(0.5, `rgba(${mid},${c})`);
    gr.addColorStop(1, `rgba(${tip},0)`);
    g.strokeStyle = gr;
    g.lineWidth = 2.5 + R() * 2.5;
    g.beginPath();
    g.moveTo(x0, h);
    g.bezierCurveTo(x0 + sway * 0.3, h * 0.62, x0 + sway, h * 0.3, x0 + sway * 1.3, h * 0.04 + R() * h * 0.1);
    g.stroke();
  }
}, false);

// 龙背鳍膜：半透明膜+放射鳍条
export const dragonFinTex = () => canvasTex(96, 224, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(120,180,160,0.35)');
  gr.addColorStop(0.55, 'rgba(190,238,222,0.6)');
  gr.addColorStop(1, 'rgba(240,255,246,0.9)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w * 0.06, h);
  // 扇形膜顶：波浪状
  g.bezierCurveTo(w * 0.02, h * 0.5, w * 0.22, h * 0.12, w * 0.4, h * 0.05);
  g.quadraticCurveTo(w * 0.55, h * 0.14, w * 0.66, h * 0.04);
  g.quadraticCurveTo(w * 0.8, h * 0.12, w * 0.94, h * 0.06);
  g.bezierCurveTo(w * 0.98, h * 0.4, w * 0.96, h * 0.7, w * 0.9, h);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  // 鳍条
  for (let i = 0; i < 6; i++) {
    const x = w * (0.16 + i * 0.14);
    g.strokeStyle = 'rgba(255,255,250,0.5)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(w * 0.5, h); g.lineTo(x, h * 0.08); g.stroke();
  }
  // 膜缘
  g.strokeStyle = 'rgba(235,255,246,0.85)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(w * 0.06, h);
  g.bezierCurveTo(w * 0.02, h * 0.5, w * 0.22, h * 0.12, w * 0.4, h * 0.05);
  g.quadraticCurveTo(w * 0.55, h * 0.14, w * 0.66, h * 0.04);
  g.quadraticCurveTo(w * 0.8, h * 0.12, w * 0.94, h * 0.06);
  g.stroke();
  g.restore();
}, false);

// 小火苗精灵
export const flameTex = () => canvasTex(64, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.55);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.bezierCurveTo(w * 0.9, h * 0.45, w, h * 0.85, w / 2, h);
  g.bezierCurveTo(0, h * 0.85, w * 0.1, h * 0.45, w / 2, 0);
  g.fill();
}, false);

// 浮雕石墙（端坐仙人像）
export const reliefTex = () => canvasTex(512, 256, (g, w, h) => {
  const r = mulberry(41);
  g.fillStyle = '#6d6c66'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '40,40,36' : '160,158,150'},${0.08 + r() * 0.12})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
  }
  g.strokeStyle = 'rgba(40,40,36,0.7)'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
  for (let i = 0; i < 5; i++) {
    const cx = 60 + i * 98, by = 225;
    const fig = (dx, dy, col) => {
      g.fillStyle = col;
      g.beginPath(); g.arc(cx + dx, 80 + dy, 16, 0, 6.3); g.fill(); // 头
      g.beginPath(); g.ellipse(cx + dx, 58 + dy, 8, 10, 0, 0, 6.3); g.fill(); // 发髻
      g.beginPath();
      g.moveTo(cx - 14 + dx, 98 + dy); g.lineTo(cx + 14 + dx, 98 + dy);
      g.lineTo(cx + 40 + dx, by + dy); g.lineTo(cx - 40 + dx, by + dy); g.closePath(); g.fill();
    };
    fig(3, 3, 'rgba(30,30,28,0.75)');
    fig(0, 0, 'rgba(150,148,140,0.9)');
    g.strokeStyle = 'rgba(60,60,55,0.6)'; g.lineWidth = 2;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(cx - 8 - k * 6, 110 + k * 25); g.lineTo(cx + 8 + k * 6, 110 + k * 25); g.stroke(); }
  }
  for (let i = 0; i < 40; i++) { // 苔藓
    g.fillStyle = hsl(90 + r() * 20, 35, 30, 0.4);
    g.beginPath(); g.arc(r() * w, r() < 0.6 ? r() * 40 : r() * h, 3 + r() * 10, 0, 6.3); g.fill();
  }
});

// 竖向渐变（光柱/水柱）
export const columnGradTex = () => canvasTex(4, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0.4)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, false);

// 彩虹弧
export const rainbowTex = () => canvasTex(512, 256, (g, w, h) => {
  const cols = ['255,60,60', '255,160,40', '255,240,80', '80,230,120', '70,170,255', '150,90,255'];
  g.lineWidth = 7;
  cols.forEach((c, i) => {
    g.strokeStyle = `rgba(${c},0.55)`;
    g.beginPath(); g.arc(w / 2, h, h * 0.92 - i * 7, Math.PI, 0); g.stroke();
  });
}, false);

// 雷剑剑身：暗钢底 + 回纹刻槽 + 蓝紫雷纹（发光层单独输出）
export function thunderSwordTex() {
  const drawBase = (g, w, h) => {
    const r = mulberry(88);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#1a2030'); gr.addColorStop(0.5, '#2e3a52'); gr.addColorStop(1, '#151c2a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 锻纹噪点
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${140 + r() * 60},${170 + r() * 60},${220},${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    // 中央剑脊亮线
    g.fillStyle = 'rgba(150,180,230,0.35)'; g.fillRect(w / 2 - 1.5, 0, 3, h);
    // 回纹刻槽（连续方折纹）
    g.strokeStyle = 'rgba(8,10,18,0.85)'; g.lineWidth = 3;
    const cell = 14;
    g.beginPath();
    for (let y = 8; y < h - 8; y += cell * 1.6) {
      const x0 = w * 0.18, x1 = w * 0.82;
      g.moveTo(x0, y); g.lineTo(x1 - cell, y); g.lineTo(x1 - cell, y + cell);
      g.lineTo(x0 + cell, y + cell); g.lineTo(x0 + cell, y + cell * 0.45);
      g.lineTo(x1 - cell * 1.6, y + cell * 0.45);
    }
    g.stroke();
    // 边缘暗纹
    g.strokeStyle = 'rgba(10,12,22,0.6)'; g.lineWidth = 1.4;
    g.strokeRect(3, 2, w - 6, h - 4);
  };
  const drawGlow = (g, w, h) => {
    const r = mulberry(97);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    // 主干闪电：自上而下的折线 + 分叉
    const bolt = (x, y0, y1, seg, lw, alpha) => {
      g.strokeStyle = `rgba(140,190,255,${alpha})`; g.lineWidth = lw;
      g.shadowColor = 'rgba(120,160,255,0.9)'; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(x, y0);
      let y = y0;
      while (y < y1) {
        y += (y1 - y0) / seg;
        x += (r() - 0.5) * w * 0.3;
        g.lineTo(x, Math.min(y, y1));
        if (r() < 0.3) { // 分叉
          const bx = x + (r() - 0.5) * w * 0.5, by = y + r() * h * 0.08;
          g.moveTo(x, y); g.lineTo(bx, by); g.moveTo(x, y);
        }
      }
      g.stroke(); g.shadowBlur = 0;
    };
    bolt(w * 0.5, 0, h, 9, 2.2, 0.95);
    bolt(w * 0.28, h * 0.15, h * 0.85, 7, 1.2, 0.7);
    bolt(w * 0.74, h * 0.1, h * 0.9, 8, 1.4, 0.75);
  };
  return {
    map: canvasTex(96, 512, drawBase, false),
    emissive: canvasTex(96, 512, drawGlow, false, false),
  };
}

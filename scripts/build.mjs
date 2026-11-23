// Builds the profile header: the last year of contributions as particles.
// Days with a contribution are green squares (logic). Days without are dots (creative).
// Output is plain SVG + CSS: no JavaScript, fonts or external requests.
//
//   GITHUB_TOKEN=... node scripts/build.mjs        live data
//   node scripts/build.mjs --data calendar.json    saved GraphQL response
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LOGIN = "individual11";
const NAME = ["DAVID", "VOGELEER"];
const TAGLINE = ["I build teams, products, and software.", "Once, I even built a catapult!"];
const TYPE = JSON.parse(readFileSync(new URL("../assets/type.json", import.meta.url)));

// Same palette as individual11.com
const INK = "#0a0a0a";
const PAPER = "#f2f0e9";
const ACID = "#22ff66";
const BONE = "#ede6d6";
const GHOST = "#1b1b1a";
const HEAT = { 1: ACID, 2: ACID, 3: "#9dffbd", 4: "#e4ffec" };

/* ---------- data ---------- */

async function calendar() {
  const i = process.argv.indexOf("--data");
  let json;
  if (i > 0) json = JSON.parse(readFileSync(process.argv[i + 1]));
  else {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `bearer ${process.env.GITHUB_TOKEN}`, "user-agent": "profile-header" },
      body: JSON.stringify({
        query: `{ user(login: "${LOGIN}") { contributionsCollection { contributionCalendar {
          weeks { contributionDays { weekday contributionCount contributionLevel } } } } } }`,
      }),
    });
    if (!res.ok) throw new Error(`GitHub API said ${res.status}`);
    json = await res.json();
  }
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const days = cal.weeks.flatMap((w, col) =>
    w.contributionDays.map((d, n) => ({
      col,
      // the first week can start midweek
      row: d.weekday ?? (col === 0 ? 7 - w.contributionDays.length + n : n),
      level: LEVEL[d.contributionLevel],
    })),
  );
  return { days, weeks: cal.weeks.length };
}

/* ---------- helpers ---------- */

const r1 = (n) => +n.toFixed(1);
const r3 = (n) => +n.toFixed(3);

/** Seeded, so the same data always builds the same file. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const advance = (ch, face, track) => (TYPE[face][ch] ?? TYPE[face]["?"])[0] + track;
const measure = (text, face, size, track = 0) =>
  ([...text].reduce((w, ch) => w + advance(ch, face, track), -track) * size) / 1000;

function text(str, face, size, x, y, fill, track = 0) {
  let pen = 0;
  let out = "";
  for (const ch of str) {
    const d = (TYPE[face][ch] ?? TYPE[face]["?"])[1];
    if (d) out += `<path transform="translate(${r1(pen)})" d="${d}"/>`;
    pen += advance(ch, face, track);
  }
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r3(size / 1000)})" fill="${fill}">${out}</g>`;
}

const box = (x, y, w, h, fill, extra = "") =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"${extra}/>`;

/** The site's card: ink border, hard ink shadow, thin rim around the shadow. */
function card(x, y, w, h, { fill, rim, line = 4, drop = 8 }) {
  return (
    box(x + drop - 2, y + drop - 2, w + 4, h + 4, rim) +
    box(x + drop, y + drop, w, h, INK) +
    box(x, y, w, h, INK) +
    box(x + line, y + line, w - line * 2, h - line * 2, fill)
  );
}

/* ---------- the 11 ---------- */

/** A "1" in a unit box: stem on the right, flag on the left. */
const ONE = [[0.36, 0], [1, 0], [1, 1], [0.36, 1], [0.36, 0.245], [0, 0.325], [0, 0.125]];

function inOne(px, py) {
  let hit = false;
  for (let i = 0, j = ONE.length - 1; i < ONE.length; j = i++) {
    const [xi, yi] = ONE[i];
    const [xj, yj] = ONE[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function cells(rect, pitch, hex) {
  const pts = [];
  const py = hex ? pitch * 0.866 : pitch;
  // anchor to the right edge so the stem stays crisp
  for (let row = 0, y = rect.y + py / 2; y <= rect.y + rect.h - py / 2 + 0.5; y += py, row++)
    for (let x = rect.x + rect.w - pitch / 2 - (hex && row % 2 ? pitch / 2 : 0); x > rect.x; x -= pitch)
      if (inOne((x - rect.x) / rect.w, (y - rect.y) / rect.h)) pts.push([x, y]);
  return pts;
}

/** The finest grid that still needs no more than n particles. */
function pack(rect, n, hex) {
  let best = null;
  for (let pitch = 5; pitch < 80; pitch += 0.1) {
    const pts = cells(rect, pitch, hex);
    if (pts.length && pts.length <= n && (!best || pts.length > best.pts.length)) best = { pitch, pts };
  }
  return best;
}

/* ---------- header ---------- */

function header({ days, weeks }, L) {
  const rand = rng(11);
  const on = days.filter((d) => d.level > 0);
  const off = days.filter((d) => d.level === 0);

  const pitch = L.cal.w / weeks;
  const cell = pitch * 0.76;
  const at = (d) => [L.cal.x + (d.col + 0.5) * pitch, L.cal.y + (d.row + 0.5) * pitch];

  const left = { x: L.eleven.x, y: L.eleven.y, w: L.eleven.one, h: L.eleven.h };
  const right = { ...left, x: L.eleven.x + L.eleven.one + L.eleven.gap };
  const sq = pack(left, on.length, false);
  const dot = pack(right, off.length, true);

  // Both sides fill left to right, so paths cross as little as possible.
  const byCol = (a, b) => a[0] - b[0] || b[1] - a[1];
  sq.pts.sort(byCol);
  dot.pts.sort(byCol);

  const squares = on
    .map((d, i) => {
      const [x, y] = at(d);
      const [tx, ty] = sq.pts[Math.min(sq.pts.length - 1, Math.floor((i * sq.pts.length) / on.length))];
      const v = `--x:${r1(x)}px;--y:${r1(y)}px;--a:${r1(tx)}px;--b:${r1(ty)}px;--w:${r3((d.col / weeks) * 0.7 + rand() * 0.25)}s`;
      return `<rect class="l" style="${v}" x="${r1(-cell / 2)}" y="${r1(-cell / 2)}" width="${r1(cell)}" height="${r1(cell)}" fill="${HEAT[d.level]}"/>`;
    })
    .join("");

  const R = cell * 0.5;
  const dots = off
    .map((d, i) => {
      const [x, y] = at(d);
      const [tx, ty] = dot.pts[Math.min(dot.pts.length - 1, Math.floor((i * dot.pts.length) / off.length))];
      const j = dot.pitch * 0.1;
      const size = dot.pitch * (0.3 + rand() * 0.14);
      const v =
        `--x:${r1(x)}px;--y:${r1(y)}px;--a:${r1(tx + (rand() - 0.5) * 2 * j)}px;--b:${r1(ty + (rand() - 0.5) * 2 * j)}px;` +
        `--s:${r3(size / R)};--e:${r1((rand() - 0.5) * dot.pitch * 0.4)}px;--f:${r1((rand() - 0.5) * dot.pitch * 0.4)}px;--w:${r3(rand() * 0.9)}s`;
      return `<g class="x" style="${v}"><circle class="y" r="${r1(R)}" fill="${BONE}"/></g>`;
    })
    .join("");

  const ghosts = days
    .map((d) => {
      const [x, y] = at(d);
      return `M${r1(x - cell / 2)} ${r1(y - cell / 2)}h${r1(cell)}v${r1(cell)}h${r1(-cell)}z`;
    })
    .join("");

  // name card
  const n = L.name;
  const lineH = n.size * 0.86;
  const nameW = Math.max(...NAME.map((s) => measure(s, "display", n.size, -20))) + n.size * 0.28 + 8;
  const nameH = lineH * 2 + n.size * 0.2 + 8;
  const name =
    card(n.x, n.y, nameW, nameH, { fill: PAPER, rim: ACID }) +
    NAME.map((s, i) =>
      text(s, "display", n.size, n.x + 4 + n.size * 0.14, n.y + 4 + n.size * 0.12 + lineH * i + lineH * 0.83, INK, -20),
    ).join("");

  // tagline strip
  const t = L.tag;
  const widest = (size) => Math.max(...TAGLINE.map((s) => measure(s, "mono", size)));
  const size = Math.min(t.size, (t.max - 8) / (widest(1) + 1.5));
  const tagW = widest(size) + size * 1.5 + 8;
  const tagH = size * (0.95 + TAGLINE.length * 1.32) + 8;
  const tag =
    `<g transform="rotate(-1.2 ${r1(t.x + tagW / 2)} ${r1(t.y + tagH / 2)})">` +
    card(t.x, t.y, tagW, tagH, { fill: ACID, rim: PAPER }) +
    TAGLINE.map((s, i) => text(s, "mono", size, t.x + 4 + size * 0.75, t.y + 4 + size * (1.48 + i * 1.32), INK)).join("") +
    "</g>";

  // footer bar
  const f = L.foot;
  const fy = L.h - f.h;
  const base = fy + 2 + f.h / 2 + f.size * 0.35;
  const hint = `// last 12 months: ${on.length} days on, ${off.length} days off`;
  const foot =
    box(0, fy, L.w, f.h, INK) +
    box(0, fy, L.w, 4, ACID) +
    (f.site ? text("INDIVIDUAL11.COM", "mono", f.size, L.pad, base, PAPER, 80) : "") +
    text(hint, "mono", f.size, f.site ? L.w - L.pad - measure(hint, "mono", f.size) : L.pad, base, ACID);

  const k = r3((sq.pitch * 0.84) / cell);
  const css = `
.l{transform:translate(var(--a),var(--b)) scale(${k});animation:l 16s var(--w) infinite both steps(12,end)}
.x{transform:translateX(var(--a));animation:x 16s var(--w) infinite both}
.y{transform:translateY(var(--b)) scale(var(--s));animation:y 16s var(--w) infinite both}
@keyframes l{0%,9%{transform:translate(var(--x),var(--y)) scale(1)}19%{transform:translate(var(--a),var(--y)) scale(${k})}31%,74%{transform:translate(var(--a),var(--b)) scale(${k})}83%{transform:translate(var(--a),var(--y)) scale(${k})}93%,100%{transform:translate(var(--x),var(--y)) scale(1)}}
@keyframes x{0%,9%{transform:translateX(var(--x));animation-timing-function:cubic-bezier(.75,0,.2,1)}32%,74%{transform:translateX(var(--a));animation-timing-function:ease-in-out}45%{transform:translateX(calc(var(--a) + var(--e)))}60%{transform:translateX(calc(var(--a) - var(--e)))}74%{animation-timing-function:cubic-bezier(.8,0,.3,1)}93%,100%{transform:translateX(var(--x))}}
@keyframes y{0%,9%{transform:translateY(var(--y)) scale(1);animation-timing-function:cubic-bezier(.2,.7,.2,1)}32%,74%{transform:translateY(var(--b)) scale(var(--s));animation-timing-function:ease-in-out}45%{transform:translateY(calc(var(--b) + var(--f))) scale(var(--s))}60%{transform:translateY(calc(var(--b) - var(--f))) scale(var(--s))}74%{animation-timing-function:cubic-bezier(.4,0,.1,1)}93%,100%{transform:translateY(var(--y)) scale(1)}}
@media (prefers-reduced-motion:reduce){.l,.x,.y{animation:none}}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}" role="img" aria-label="${NAME.join(" ")}. ${TAGLINE.join(" ")}">` +
    `<style>${css}</style>` +
    box(0, 0, L.w, L.h, INK) +
    `<path d="${ghosts}" fill="${GHOST}"/>` +
    squares + dots + name + tag + foot +
    "</svg>"
  );
}

const WIDE = {
  w: 1200, h: 620, pad: 48,
  name: { x: 48, y: 48, size: 116 },
  tag: { x: 80, y: 296, size: 25, max: 720 },
  eleven: { x: 852, y: 48, one: 136, gap: 28, h: 330 },
  cal: { x: 48, y: 418, w: 1104 },
  foot: { h: 44, size: 15, site: true },
};
const NARROW = {
  w: 640, h: 800, pad: 32,
  name: { x: 28, y: 32, size: 90 },
  tag: { x: 44, y: 232, size: 26, max: 552 },
  eleven: { x: 196, y: 350, one: 112, gap: 24, h: 270 },
  cal: { x: 28, y: 650, w: 584 },
  foot: { h: 46, size: 16, site: false },
};

/* ---------- buttons ---------- */

function button(label) {
  const size = 18;
  const w = measure(label, "mono", size) + size * 2 + 8;
  const h = 52;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w + 10)} ${h + 10}" width="${r1(w + 10)}" height="${h + 10}" role="img" aria-label="${label}">` +
    card(0, 0, w, h, { fill: PAPER, rim: ACID, drop: 6 }) +
    text(label, "mono", size, 4 + size, h / 2 + size * 0.36, INK) +
    "</svg>"
  );
}

/* ---------- write ---------- */

const data = await calendar();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/header.svg", header(data, WIDE));
writeFileSync("dist/header-narrow.svg", header(data, NARROW));
for (const [file, label] of [["site", "INDIVIDUAL11.COM →"], ["linkedin", "LINKEDIN ↗"], ["blog", "BLOG ↗"]])
  writeFileSync(`assets/btn-${file}.svg`, button(label));
console.log(`${data.days.filter((d) => d.level).length} days on, ${data.days.filter((d) => !d.level).length} off`);

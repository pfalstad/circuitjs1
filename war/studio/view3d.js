// 3D view of the running circuit, built from the simulator's element list.
// The scene is rebuilt only when the circuit changes (the simulator's analyze
// hook); every frame just reads currents and voltages and updates materials,
// LED glow and the moving current dots in place.

import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const S = 1 / 16;                     // CircuitJS pixels -> world units (one grid cell = 1)
const BODY_Y = 0.45;                  // height of lying-down part bodies above the board
const BAND_COLORS = [0x111111, 0x7a3b12, 0xd11f1f, 0xf07a10, 0xf2d21b,
                     0x1f9e3a, 0x2050d8, 0x8a2be2, 0x8a8a8a, 0xf5f5f5];
const GOLD = 0xc9a43a, SILVER = 0xbfc4c9;
const SKIP = new Set(["TextElm", "BoxElm", "ScopeElm", "LineElm", "GraphicElm"]);

// 4.7 kΩ -> yellow, violet, red, gold
export function resistorBands(ohms) {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exp);
  if (digits >= 100) { digits = Math.round(digits / 10); exp += 1; }
  const mult = exp === -1 ? GOLD : exp === -2 ? SILVER : BAND_COLORS[Math.min(Math.max(exp, 0), 9)];
  return [BAND_COLORS[Math.floor(digits / 10)], BAND_COLORS[digits % 10], mult, GOLD];
}

const PREFIX = { p: 1e-12, n: 1e-9, "µ": 1e-6, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 };
// Reads "R = 4.7 kΩ" style lines from an element's info text.
function infoValue(lines, label) {
  for (const line of lines) {
    const m = String(line).match(new RegExp("^" + label + "\\s*=\\s*(-?[\\d.]+)\\s*([pnµumkMG]?)"));
    if (m) return parseFloat(m[1]) * (PREFIX[m[2]] || 1);
  }
  return NaN;
}

// Diverging blue-grey-red scale for node voltage, readable in the dark theme.
const NEG = new THREE.Color(0x3b82f6), MID = new THREE.Color(0x6b7280), POS = new THREE.Color(0xef4444);
function voltageColor(v, range, out) {
  const t = Math.max(-1, Math.min(1, v / range));
  return t >= 0 ? out.copy(MID).lerp(POS, t) : out.copy(MID).lerp(NEG, -t);
}

export class CircuitView3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1115);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    // Keep re-framing on resize until the user moves the camera themselves.
    this.userMoved = false;
    this.controls.addEventListener("start", () => { this.userMoved = true; });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun, this.sun.target);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.showVoltage = true;
    this.items = [];              // per element: { elm, kind, ... } updated every frame
    this.dots = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoverCb = null;
    this.mats = this.makeMaterials();

    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.domElement.addEventListener("pointermove", (e) => this.onPointer(e));
    this.renderer.domElement.addEventListener("pointerleave", () => this.hoverCb?.(null));
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  makeMaterials() {
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
    return {
      board: std(0x0e5a3a, { roughness: 0.8 }),
      copper: std(0xd08a4a, { metalness: 0.6, roughness: 0.35 }),
      lead: std(0xc8ccd0, { metalness: 0.8, roughness: 0.3 }),
      resistor: std(0xd9c39a),
      capBlue: std(0x2457b8),
      capTop: std(0xb9c2cc, { metalness: 0.5 }),
      inductor: std(0xb5651d, { metalness: 0.5, roughness: 0.4 }),
      black: std(0x1b1b1f, { roughness: 0.6 }),
      battery: std(0x2b2f36),
      batteryLabel: std(0xe0a526),
      plusCap: std(0xc0392b),
      switchBase: std(0x30343b),
      switchLever: std(0xd0d4da, { metalness: 0.4 }),
      generic: std(0x55606e),
      ground: std(0x7f8c8d, { metalness: 0.5 }),
      dot: new THREE.MeshBasicMaterial({ color: 0xffe066 }),
    };
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved && this.lastBox) this.fit(this.lastBox);
  }

  clear() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // Per-element materials (LEDs, voltage-coloured traces) are owned by the
      // element; shared materials live in this.mats and are kept.
      if (o.material && o.userData.ownMaterial) o.material.dispose();
    });
    this.root.clear();
    this.items = [];
    this.dots = null;
  }

  // Rebuild from the simulator's current element list.
  build(sim) {
    this.clear();
    this.sim = sim;
    const els = sim.getElements();
    const pts = [];
    const pinUse = new Map();
    const parts = [];
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      const type = e.getType();
      const n = e.getPostCount();
      if (SKIP.has(type) || n === 0) continue;
      const posts = [];
      for (let j = 0; j < n; j++) {
        const p = e.getPost(j);
        const v = new THREE.Vector3(p[0] * S, 0, p[1] * S);
        posts.push(v);
        pts.push(v);
        const k = p[0] + "," + p[1];
        pinUse.set(k, v);
      }
      parts.push({ e, type, posts });
    }
    if (!pts.length) { this.fit(new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 0, 5))); return; }

    const box = new THREE.Box3().setFromPoints(pts);
    const margin = 3;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const board = new THREE.Mesh(new THREE.BoxGeometry(size.x + 2 * margin, 0.3, size.z + 2 * margin), this.mats.board);
    board.position.set(center.x, -0.15, center.z);
    board.receiveShadow = true;
    this.root.add(board);

    for (const v of pinUse.values()) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20), this.mats.copper);
      pad.position.set(v.x, 0.02, v.z);
      this.root.add(pad);
    }

    // LED colours are not in the element API, but the exported circuit lists
    // them in element order.
    this.ledColors = [];
    try {
      const text = sim.exportCircuit();
      for (const m of text.matchAll(/<LED\b[^>]*?cr="([\d.]+)"[^>]*?cg="([\d.]+)"[^>]*?cb="([\d.]+)"/g))
        this.ledColors.push(new THREE.Color(+m[1], +m[2], +m[3]).getHex());
    } catch { /* keep the default colour */ }

    const dotPaths = [];
    for (const p of parts) {
      const item = this.addPart(p);
      if (item) {
        this.items.push(item);
        if (item.path) dotPaths.push(item);
      }
    }
    this.buildDots(dotPaths);
    if (this.userMoved) this.lastBox = box;
    else this.fit(box);
  }

  resetView() {
    this.userMoved = false;
    if (this.lastBox) this.fit(this.lastBox);
  }

  addPart({ e, type, posts }) {
    const g = new THREE.Group();
    g.userData.elm = e;
    this.root.add(g);
    const item = { e, type, group: g };

    if (type === "WireElm" || type === "RoutedWireElm") {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd08a4a, metalness: 0.5, roughness: 0.4 });
      const t = this.trace(posts[0], posts[1], mat);
      t.userData.ownMaterial = true;
      g.add(t);
      item.traceMat = mat;
      item.path = [posts[0], posts[1]];
      item.lift = 0.08;
      return item;
    }
    if (posts.length === 1) {
      if (type === "GroundElm") g.add(this.groundSymbol(posts[0]));
      else g.add(this.pin(posts[0]));
      return item;
    }
    if (posts.length === 2) {
      const [a, b] = posts;
      item.path = [a, b];
      item.lift = BODY_Y;
      switch (type) {
        case "ResistorElm":
          this.lyingBody(g, a, b, 0.22, 2.0, this.mats.resistor, resistorBands(infoValue(e.getInfo(), "R")));
          break;
        case "CapacitorElm": case "PolarCapacitorElm":
          this.standingCan(g, a, b, this.mats.capBlue);
          break;
        case "InductorElm":
          this.lyingBody(g, a, b, 0.32, 2.0, this.mats.inductor);
          break;
        case "DiodeElm": case "ZenerElm":
          this.lyingBody(g, a, b, 0.16, 1.3, this.mats.black, null, true);
          break;
        case "LEDElm":
          item.led = this.led(g, a, b, e);
          break;
        case "DCVoltageElm": case "VoltageElm": case "ACVoltageElm": case "BatteryElm":
          this.battery(g, a, b, type === "ACVoltageElm" || (type === "VoltageElm" && !/^voltage source/i.test(String(e.getInfo()[0]))));
          break;
        case "SwitchElm": case "PushSwitchElm":
          item.lever = this.switchPart(g, a, b);
          break;
        case "LampElm":
          item.led = this.led(g, a, b, e, 0xfff1c1);
          break;
        default:
          this.lyingBody(g, a, b, 0.25, 1.6, this.mats.generic);
      }
      return item;
    }
    // Three or more pins: a package sitting at the centre of its pins.
    const c = posts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(posts.length);
    const isOpAmp = /OpAmp/.test(type);
    const body = isOpAmp
      ? new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.2), this.mats.black)
      : new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 24, 1, false, 0, Math.PI), this.mats.black);
    body.position.set(c.x, isOpAmp ? 0.55 : 0.75, c.z);
    if (!isOpAmp) body.rotation.y = Math.PI / 2;
    body.castShadow = true;
    g.add(body);
    for (const p of posts) g.add(this.leg(p, new THREE.Vector3(c.x + (p.x - c.x) * 0.25, body.position.y - 0.2, c.z + (p.z - c.z) * 0.25)));
    return item;
  }

  cyl(a, b, r, mat, segs = 12) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(len, 1e-3), segs), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }

  trace(a, b, mat) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + 0.24, 0.06, 0.24), mat);
    m.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
    m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    m.receiveShadow = true;
    return m;
  }

  leg(from, to) {
    const g = new THREE.Group();
    const knee = new THREE.Vector3(from.x, to.y, from.z);
    g.add(this.cyl(from, knee, 0.04, this.mats.lead, 6));
    g.add(this.cyl(knee, to, 0.04, this.mats.lead, 6));
    return g;
  }

  pin(p) {
    return this.cyl(p, p.clone().setY(0.5), 0.07, this.mats.lead, 8);
  }

  groundSymbol(p) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const w = 0.9 - i * 0.3;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.1), this.mats.ground);
      bar.position.set(p.x, 0.06, p.z + 0.35 + i * 0.2);
      g.add(bar);
    }
    return g;
  }

  // A part lying flat between two pins, with leads bent down into the board.
  lyingBody(g, a, b, r, maxLen, mat, bands, cathodeBand) {
    const dir = b.clone().sub(a);
    const len = Math.min(maxLen, dir.length() * 0.6);
    dir.normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(BODY_Y);
    const e1 = mid.clone().addScaledVector(dir, -len / 2), e2 = mid.clone().addScaledVector(dir, len / 2);
    const body = this.cyl(e1, e2, r, mat, 20);
    body.castShadow = true;
    g.add(body);
    const ring = (t, color, w = 0.12) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const c = this.cyl(e1.clone().lerp(e2, t - w / len / 2), e1.clone().lerp(e2, t + w / len / 2), r * 1.04, m, 20);
      c.userData.ownMaterial = true;
      g.add(c);
    };
    if (bands) [0.2, 0.33, 0.46, 0.8].forEach((t, i) => ring(t, bands[i]));
    if (cathodeBand) ring(0.85, SILVER, 0.18);
    g.add(this.leg(a, e1), this.leg(b, e2));
  }

  standingCan(g, a, b, mat) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 24), mat);
    can.position.set(mid.x, 0.85, mid.z);
    can.castShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.03, 24), this.mats.capTop);
    top.position.set(mid.x, 1.51, mid.z);
    g.add(can, top);
    const dir = b.clone().sub(a).normalize().multiplyScalar(0.2);
    g.add(this.leg(a, mid.clone().sub(dir).setY(0.2)), this.leg(b, mid.clone().add(dir).setY(0.2)));
  }

  led(g, a, b, e, color) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const col = color ?? this.ledColors.shift() ?? 0xff3030;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.2 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.set(mid.x, 1.1, mid.z);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.7, 24), mat);
    cylinder.position.set(mid.x, 0.75, mid.z);
    dome.userData.ownMaterial = true;
    const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), glowMat);
    glow.position.set(mid.x, 1.0, mid.z);
    glow.userData.ownMaterial = true;
    g.add(cylinder, dome, glow);
    const dir = b.clone().sub(a).normalize().multiplyScalar(0.2);
    g.add(this.leg(a, mid.clone().sub(dir).setY(0.4)), this.leg(b, mid.clone().add(dir).setY(0.4)));
    return { mat, glowMat, color: new THREE.Color(col) };
  }

  battery(g, a, b, ac) {
    const dir = b.clone().sub(a);
    const len = Math.min(2.6, dir.length() * 0.7);
    dir.normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(0.55);
    const e1 = mid.clone().addScaledVector(dir, -len / 2), e2 = mid.clone().addScaledVector(dir, len / 2);
    const body = this.cyl(e1, e2, 0.5, ac ? this.mats.generic : this.mats.battery, 28);
    body.castShadow = true;
    g.add(body);
    const label = this.cyl(e1.clone().lerp(e2, 0.55), e1.clone().lerp(e2, 0.95), 0.51, ac ? this.mats.capTop : this.mats.batteryLabel, 28);
    g.add(label);
    if (!ac) g.add(this.cyl(e2, e2.clone().addScaledVector(dir, 0.15), 0.18, this.mats.plusCap, 16)); // + terminal (pin 2)
    g.add(this.leg(a, e1), this.leg(b, e2.clone().addScaledVector(dir, ac ? 0 : 0.15)));
  }

  switchPart(g, a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.8), this.mats.switchBase);
    base.position.set(mid.x, 0.3, mid.z);
    base.rotation.y = -Math.atan2(dir.z, dir.x);
    base.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(mid.x, 0.5, mid.z);
    pivot.rotation.y = base.rotation.y;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), this.mats.switchLever);
    lever.position.y = 0.35;
    pivot.add(lever);
    g.add(base, pivot, this.leg(a, mid.clone().addScaledVector(dir, -0.6).setY(0.15)), this.leg(b, mid.clone().addScaledVector(dir, 0.6).setY(0.15)));
    return pivot;
  }

  buildDots(paths) {
    const list = [];
    for (const item of paths) {
      const [a, b] = item.path;
      const len = a.distanceTo(b);
      const n = Math.max(1, Math.round(len / 1.5));
      for (let k = 0; k < n; k++) list.push({ item, a, b, len, phase: k / n });
    }
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), this.mats.dot, list.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    this.dots = { mesh, list, m: new THREE.Matrix4(), p: new THREE.Vector3() };
  }

  fit(box) {
    this.lastBox = box;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Distance at which the board (plus margin) fills the view, for either the
    // vertical or the horizontal field of view, whichever is tighter.
    const extent = Math.max(size.x, size.z, 8) + 8;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const r = (extent / 2) / Math.tan(Math.min(vfov, hfov) / 2);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0.1, 0.8, 0.6).normalize().multiplyScalar(r));
    this.camera.near = 0.1;
    this.camera.far = r * 20;
    this.camera.updateProjectionMatrix();
    this.sun.position.set(center.x + r, r * 2, center.z + r * 0.6);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.2; cam.right = cam.top = r * 1.2; cam.far = r * 6;
    cam.updateProjectionMatrix();
    this.controls.update();
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const running = this.sim && this.sim.isRunning();
    try {
      for (const it of this.items) {
        if (it.traceMat) {
          if (this.showVoltage) voltageColor(it.e.getVoltage(0), 10, it.traceMat.color);
          else it.traceMat.color.set(0xd08a4a);
        }
        if (it.led) {
          const amps = Math.abs(it.e.getCurrent());
          const k = Math.min(1, amps / 0.01);
          it.led.mat.emissiveIntensity = 0.2 + 2.5 * k;
          it.led.glowMat.opacity = 0.35 * k;
        }
        if (it.lever) {
          // An open switch carries no current; tilt the lever to show it.
          const closed = Math.abs(it.e.getCurrent()) > 1e-9 || it.e.getVoltageDiff() === 0;
          it.lever.rotation.z = closed ? -0.5 : 0.5;
        }
      }
      if (this.dots) {
        const { mesh, list, m, p } = this.dots;
        for (let i = 0; i < list.length; i++) {
          const d = list[i];
          const amps = running ? d.item.e.getCurrent() : 0;
          const speed = Math.sign(amps) * Math.min(6, 1.2 * Math.log10(1 + Math.abs(amps) * 1e4));
          d.phase = (((d.phase + (speed * dt) / d.len) % 1) + 1) % 1;
          p.copy(d.a).lerp(d.b, d.phase);
          p.y = d.item.lift;
          const visible = Math.abs(amps) > 1e-6 ? 1 : 0;
          m.makeScale(visible, visible, visible).setPosition(p);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    } catch (err) {
      // The simulator can be mid-reload; skip this frame and try again.
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onPointer(ev) {
    if (!this.hoverCb) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.root.children, true)
      .map((h) => { let o = h.object; while (o && !o.userData.elm) o = o.parent; return o; })
      .find(Boolean);
    if (!hit) return this.hoverCb(null);
    try {
      this.hoverCb({ x: ev.clientX - r.left, y: ev.clientY - r.top, lines: Array.from(hit.userData.elm.getInfo()) });
    } catch { this.hoverCb(null); }
  }
}

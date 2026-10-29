// Signature 3D element: a few stacked satin rings/discs around a glowing core.
// Purely decorative — it never encodes a score, a coverage or a collection state.
// Renders on demand only: entry animation, pointer tilt and return to rest, plus a sweep
// while a real synchronization is running. Nothing moves while the user just reads.

import {
  AdditiveBlending,
  AmbientLight,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";

export type RadarHandle = { setPointer(x: number, y: number): void; leave(): void; setSyncing(on: boolean): void; setActive(on: boolean): void; dispose(): void };

const REST = { x: -0.95, y: 0.28 };
const AMPLITUDE = 0.14;

export function createRadar(canvas: HTMLCanvasElement, opts: { dark: boolean; syncing: boolean }): RadarHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const size = () => {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 7.2);

  const accent = new Color(opts.dark ? "#5fe3d3" : "#1aa59a");
  const ringColor = new Color(opts.dark ? "#9fb1c7" : "#8494a8");
  const discColor = new Color(opts.dark ? "#2b3a4e" : "#dfe7ef");

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const track = <T extends BufferGeometry | Material>(x: T): T => {
    ("isMaterial" in x ? (materials as unknown[]) : (geometries as unknown[])).push(x);
    return x;
  };

  const ringMat = track(new MeshStandardMaterial({ color: ringColor, roughness: 0.42, metalness: 0.35 }));
  const accentRingMat = track(new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 }));
  const discMat = track(new MeshStandardMaterial({ color: discColor, roughness: 0.55, metalness: 0.15, transparent: true, opacity: 0.8, side: DoubleSide }));

  const radar = new Group();
  const layers: Mesh[] = [];
  // Discs (planes of the radar) and rings, slightly separated in depth.
  [
    [1.75, -0.22],
    [1.15, 0.02],
  ].forEach(([r, z]) => {
    const m = new Mesh(track(new CylinderGeometry(r, r, 0.05, 72, 1, false)), discMat);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    radar.add(m);
    layers.push(m);
  });
  [
    [1.8, 0.032, -0.22, ringMat],
    [1.2, 0.03, 0.02, ringMat],
    [0.62, 0.04, 0.24, accentRingMat],
  ].forEach(([r, t, z, mat]) => {
    const m = new Mesh(track(new TorusGeometry(r as number, t as number, 12, 128)), mat as Material);
    m.position.z = z as number;
    radar.add(m);
    layers.push(m);
  });

  const core = new Mesh(track(new IcosahedronGeometry(0.26, 3)), track(new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 })));
  core.position.z = 0.36;
  radar.add(core);
  const halo = new Mesh(track(new CircleGeometry(0.62, 48)), track(new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false })));
  halo.position.z = 0.3;
  radar.add(halo);
  const sweep = new Mesh(track(new CircleGeometry(1.75, 48, 0, 0.7)), track(new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })));
  sweep.position.z = 0.05;
  radar.add(sweep);
  scene.add(radar);
  const baseZ = layers.map((m) => m.position.z);

  scene.add(new AmbientLight(0xffffff, opts.dark ? 0.55 : 0.9));
  const key = new DirectionalLight(0xffffff, opts.dark ? 1.4 : 1.8);
  key.position.set(3, 4, 6);
  scene.add(key);
  const glow = new PointLight(accent, 6, 6, 2);
  glow.position.set(0, 0, 1.2);
  scene.add(glow);

  // State: entry progress, target/current tilt, sync sweep.
  const start = performance.now();
  const ENTRY_MS = 900;
  let target = { ...REST };
  const current = { x: REST.x - 0.5, y: REST.y - 0.6 };
  let syncing = opts.syncing;
  let active = true;
  let raf = 0;

  const frame = (now: number) => {
    raf = 0;
    const t = Math.min(1, (now - start) / ENTRY_MS);
    const e = 1 - (1 - t) ** 3;
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    radar.rotation.x = current.x;
    radar.rotation.y = current.y;
    radar.scale.setScalar(0.82 + 0.18 * e);
    layers.forEach((m, i) => (m.position.z = baseZ[i] * (0.4 + 0.6 * e))); // layers separate during entry
    if (syncing) sweep.rotation.z -= 0.035;
    renderer.render(scene, camera);
    const settling = Math.abs(target.x - current.x) > 0.0008 || Math.abs(target.y - current.y) > 0.0008;
    if (active && (t < 1 || settling || syncing)) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (active && !raf) raf = requestAnimationFrame(frame);
  };

  size();
  const ro = new ResizeObserver(() => {
    size();
    kick();
  });
  ro.observe(canvas);
  kick();

  return {
    setPointer(x, y) {
      target = { x: REST.x + y * AMPLITUDE, y: REST.y + x * AMPLITUDE };
      kick();
    },
    leave() {
      target = { ...REST };
      kick();
    },
    setSyncing(on) {
      syncing = on;
      kick();
    },
    setActive(on) {
      active = on;
      if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else kick();
    },
    dispose() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// DCYM Rastreador V1 — modelo 3D a escala (1 unidad = 100 mm).
// Cuadricóptero sobre marco Tarot 650, hélices de 15", batería 6S3P Li-ion.
// Cada pieza corresponde a un componente real de la lista de materiales.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const PARTS = {
  marco:      { name: "Marco Tarot 650", role: "Estructura plegable de fibra de carbono, 650 mm entre motores." },
  motores:    { name: "Motores Tarot 4114 320KV", role: "Motores de bajo KV y alta eficiencia, pensados para hélices grandes y vuelos largos." },
  helices:    { name: "Hélices Tarot 1555 de carbono", role: "Hélices de 15 pulgadas: giran lento y mueven mucho aire con poca energía." },
  esc:        { name: "Variadores Hobbywing XRotor 40A", role: "Controlan la velocidad de cada motor según las órdenes del piloto automático." },
  pixhawk:    { name: "Piloto automático Pixhawk 6C", role: "El cerebro de vuelo: estabiliza el dron y ejecuta rutas por GPS con ArduPilot." },
  gps:        { name: "GPS M10 con brújula", role: "Posición precisa para volar rutas automáticas y regresar a casa." },
  rpi:        { name: "Raspberry Pi 5", role: "Computador a bordo: toma las imágenes y las envía al servidor de IA." },
  camara:     { name: "Cámara Raspberry Pi Module 3 Wide", role: "Cámara de 12 MP y 120° que mira el potrero; sus imágenes alimentan la IA." },
  modem:      { name: "Módem 4G SIM7600G-H", role: "Conexión a internet por red celular para transmitir en vivo al centro de monitoreo." },
  lidar:      { name: "Sensor LiDAR TF-Luna", role: "Mide la altura real sobre el terreno para volar bajo con seguridad." },
  telemetria: { name: "Radio de telemetría SiK 915 MHz", role: "Enlace directo con la estación en tierra, independiente del 4G." },
  receptor:   { name: "Receptor ELRS", role: "Recibe los mandos del control remoto para despegue, aterrizaje y emergencias." },
  bateria:    { name: "Batería 6S3P Li-ion 21700", role: "18 celdas de litio-ion de alta densidad: más energía por gramo que una LiPo." },
  tren:       { name: "Tren de aterrizaje", role: "Patas del marco Tarot que protegen la cámara y la batería al aterrizar." },
};

const ARM_R = 3.25;   // radio de motor (650 mm de diagonal)
const DIAG = [45, 135, 225, 315].map(a => THREE.MathUtils.degToRad(a));

// Tejido de carbono 2x2 (twill): franjas cruzadas con brillo suave, como el real.
function carbonTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#121315"; g.fillRect(0, 0, 256, 256);
  const s = 16;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const horiz = ((i + j) % 4) < 2;
    const x = i * s, y = j * s;
    const grad = horiz ? g.createLinearGradient(x, y, x, y + s) : g.createLinearGradient(x, y, x + s, y);
    grad.addColorStop(0, "#16181a"); grad.addColorStop(.45, "#34383d"); grad.addColorStop(.55, "#3a3f44"); grad.addColorStop(1, "#141517");
    g.fillStyle = grad; g.fillRect(x + .5, y + .5, s - 1, s - 1);
    g.strokeStyle = "rgba(255,255,255,.035)"; g.lineWidth = 1;
    for (let k = 3; k < s; k += 4) {
      g.beginPath();
      if (horiz) { g.moveTo(x, y + k); g.lineTo(x + s, y + k); } else { g.moveTo(x + k, y); g.lineTo(x + k, y + s); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function labelTexture(draw, w = 512, h = 256) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createDroneViewer(container, opts = {}) {
  const o = Object.assign({ interactive: true, autoRotate: true, transparent: false, exploded: false, zoom: false }, opts);

  // Fondo: siempre transparente; el color de estudio claro lo pone el CSS del visor.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!o.preserve });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = o.interactive ? "pan-y" : "auto";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(7.4, 4.4, 8.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  // En la portada la rueda del mouse debe mover la página, no alejar el dron.
  controls.enableZoom = !!o.zoom;
  controls.minDistance = 5;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = o.autoRotate;
  controls.autoRotateSpeed = 0.9;
  controls.enabled = o.interactive;

  // luces de estudio
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8c, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(5, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe6f0ff, 0.9);
  fill.position.set(-7, 4, -5);
  scene.add(fill);
  const front = new THREE.DirectionalLight(0xffffff, 0.6);
  front.position.set(6, 2, -8);
  scene.add(front);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.07;
  ground.receiveShadow = true;
  scene.add(ground);
  if (!o.transparent) {
    const grid = new THREE.GridHelper(40, 40, 0xaebbb4, 0xc9d3ce);
    grid.position.y = -2.065;
    grid.material.transparent = true; grid.material.opacity = 0.55;
    scene.add(grid);
  }

  // ---------------------------------------------------------------- materiales
  const carbonTex = carbonTexture();
  const partMats = {};    // id -> [materiales propios de la pieza]
  const partObjs = {};    // id -> [objetos que se mueven en la vista explosionada]
  const meshes = [];
  const M = (part, params) => {
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 0.8 }, params));
    (partMats[part] ||= []).push(m);
    m.userData.base = { emissive: m.emissive.clone(), ei: m.emissiveIntensity, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
    return m;
  };
  // carbono brillante con barniz (clearcoat), como las placas y tubos reales
  const carbonMat = (part, rx = 4, ry = 4) => {
    const t = carbonTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
    return M(part, { map: t, color: 0xffffff, metalness: 0.15, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12 });
  };
  const anodized = (part, color) => M(part, { color, metalness: 0.85, roughness: 0.32 });
  const plastic = (part, color, rough = 0.55) => M(part, { color, metalness: 0, roughness: rough });

  let exploded = 0, explodeTarget = 0;
  const root = new THREE.Group();
  scene.add(root);

  function add(part, obj, explode = [0, 0, 0], parent = root) {
    obj.userData.part = part;
    obj.userData.home = obj.position.clone();
    obj.userData.explode = new THREE.Vector3(...explode);
    obj.traverse(ch => {
      if (ch.isMesh) {
        ch.castShadow = true; ch.receiveShadow = true;
        ch.userData.part = part;
        meshes.push(ch);
      }
    });
    (partObjs[part] ||= []).push(obj);
    parent.add(obj);
    return obj;
  }
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const rbox = (w, h, d, r, mat) => {  // caja con bordes redondeados
    const sh = new THREE.Shape();
    const x = -w / 2, z = -d / 2;
    sh.moveTo(x + r, z); sh.lineTo(x + w - r, z); sh.quadraticCurveTo(x + w, z, x + w, z + r);
    sh.lineTo(x + w, z + d - r); sh.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
    sh.lineTo(x + r, z + d); sh.quadraticCurveTo(x, z + d, x, z + d - r);
    sh.lineTo(x, z + r); sh.quadraticCurveTo(x, z, x + r, z);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: Math.min(r, h * .25), bevelSize: Math.min(r, h * .25) * .8, bevelSegments: 2, curveSegments: 6 });
    geo.rotateX(Math.PI / 2); geo.translate(0, h / 2, 0);
    return new THREE.Mesh(geo, mat);
  };
  const cyl = (rt, rb, h, mat, seg = 28) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  const tube = (from, to, r, mat, seg = 18) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const m = cyl(r, r, a.distanceTo(b), mat, seg);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };
  const wire = (pts, r, mat) => {  // cable que sigue una curva suave
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 8), r, 8, false), mat);
  };
  const screw = (mat) => { const s = cyl(0.028, 0.028, 0.02, mat, 6); return s; };

  // placa de carbono con agujeros de alivianamiento (como las del Tarot 650)
  function plateGeo(R, holeR, nHoles, centerHole) {
    const sh = new THREE.Shape();
    const n = 8;
    for (let i = 0; i <= n; i++) {           // octágono con esquinas redondeadas
      const a0 = (i / n) * Math.PI * 2 + Math.PI / 8;
      const p = [Math.cos(a0) * R, Math.sin(a0) * R];
      i === 0 ? sh.moveTo(...p) : sh.lineTo(...p);
    }
    for (let i = 0; i < nHoles; i++) {
      const a = (i / nHoles) * Math.PI * 2 + Math.PI / nHoles;
      const h = new THREE.Path(); h.absarc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, holeR, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    if (centerHole) { const h = new THREE.Path(); h.absarc(0, 0, centerHole, 0, Math.PI * 2, true); sh.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1, curveSegments: 20 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  const steel = () => M("marco", { color: 0xd4d8dc, metalness: 1, roughness: 0.28 });

  // ---------------------------------------------------------------- marco
  {
    const g = new THREE.Group();
    const plate = carbonMat("marco", 1.2, 1.2);
    const armMat = carbonMat("marco", 1, 10);
    const blackAlu = anodized("marco", 0x26282b);
    const redAlu = anodized("marco", 0xb3202a);
    const silver = steel();
    const orange = plastic("marco", 0xff6a1a, 0.5);

    const lower = new THREE.Mesh(plateGeo(1.1, 0.13, 8, 0.2), plate); lower.position.y = 0.045; g.add(lower);
    const upper = new THREE.Mesh(plateGeo(1.1, 0.13, 8, 0.2), plate); upper.position.y = 0.345; g.add(upper);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const s = cyl(0.035, 0.035, 0.3, silver, 12); s.position.set(Math.cos(a) * 0.95, 0.21, Math.sin(a) * 0.95); g.add(s);
      for (const y of [0.385, 0.03]) { const sc = screw(silver); sc.position.set(Math.cos(a) * 0.95, y, Math.sin(a) * 0.95); g.add(sc); }
    }
    // cubierta superior para la electrónica de visión
    const deck = new THREE.Mesh(plateGeo(0.78, 0.09, 6, 0), plate); deck.position.set(-0.25, 0.85, 0); g.add(deck);
    for (const [x, z] of [[0.2, 0.42], [0.2, -0.42], [-0.7, 0.42], [-0.7, -0.42]]) {
      const s = cyl(0.028, 0.028, 0.48, silver, 10); s.position.set(x, 0.61, z); g.add(s);
    }
    for (const a of DIAG) {
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const p = (r, y = 0.2) => dir.clone().multiplyScalar(r).setY(y).toArray();
      g.add(tube(p(0.75), p(ARM_R + 0.1), 0.08, armMat, 24));
      // bisagra plegable de aluminio con seguro rojo
      const hinge = rbox(0.38, 0.22, 0.26, 0.04, blackAlu); hinge.position.set(...p(1.08, 0.2)); hinge.rotation.y = -a; g.add(hinge);
      const lock = rbox(0.14, 0.05, 0.2, 0.02, redAlu); lock.position.set(...p(1.12, 0.36)); lock.rotation.y = -a; g.add(lock);
      // soporte de motor: abrazadera + placa en cruz
      const clamp = rbox(0.24, 0.16, 0.2, 0.04, blackAlu); clamp.position.set(...p(ARM_R - 0.02, 0.2)); clamp.rotation.y = -a; g.add(clamp);
      const mount = new THREE.Mesh(plateGeo(0.26, 0.04, 4, 0.05), plate);
      mount.position.set(...p(ARM_R, 0.27)); mount.rotation.y = -a + Math.PI / 4; g.add(mount);
      const cap = cyl(0.082, 0.082, 0.04, blackAlu, 20); cap.rotation.z = Math.PI / 2;
      cap.position.set(...p(ARM_R + 0.12)); cap.rotation.y = 0; cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(cap);
      if (dir.x > 0) g.add(tube(p(2.4), p(2.72), 0.086, orange));   // cinta naranja: frente del dron
    }
    add("marco", g);
  }

  // ---------------------------------------------------------------- tren de aterrizaje
  {
    const legMat = carbonMat("tren", 1, 8);
    const joint = plastic("tren", 0x1f2124, 0.6);
    const foam = plastic("tren", 0x2b2d30, 0.95);
    for (const a of DIAG) {
      const g = new THREE.Group();
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const top = d.clone().multiplyScalar(1.02).setY(0.02), bot = d.clone().multiplyScalar(1.6).setY(-1.93);
      g.add(tube(top.toArray(), bot.toArray(), 0.065, legMat, 20));
      const j = rbox(0.2, 0.14, 0.2, 0.04, joint); j.position.copy(top).setY(-0.02); j.rotation.y = -a; g.add(j);
      const foot = cyl(0.12, 0.14, 0.13, foam, 20); foot.position.copy(bot).setY(-2.0); g.add(foot);
      add("tren", g, d.clone().multiplyScalar(0.3).setY(-0.7).toArray());
    }
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      const z = s * 1.52 * Math.SQRT1_2, x = 1.52 * Math.SQRT1_2;
      g.add(tube([x, -1.6, z], [-x, -1.6, z], 0.045, legMat, 16));
      add("tren", g, [0, -0.7, s * 0.2]);
    }
  }

  // ---------------------------------------------------------------- motores, hélices, ESC y cables
  const props = [];
  {
    const bellMat = anodized("motores", 0x1a1c1f);
    const bellTop = M("motores", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#1a1c1f"; g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, R = w / 2;
        g.fillStyle = "#a8642f";                 // ventanas: se ve el bobinado de cobre
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2;
          g.beginPath(); g.moveTo(cx + Math.cos(a) * R * .3, cy + Math.sin(a) * R * .3);
          g.arc(cx, cy, R * .82, a + .12, a + .78); g.arc(cx, cy, R * .3, a + .78, a, true); g.fill();
        }
        g.fillStyle = "#26292d"; g.beginPath(); g.arc(cx, cy, R * .3, 0, 7); g.fill();
        g.strokeStyle = "#3a3e43"; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R * .93, 0, 7); g.stroke();
      }, 256, 256), metalness: 0.85, roughness: 0.32,
    });
    const bellSide = M("motores", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#1a1c1f"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#d9dde1"; g.font = "bold 46px Arial";
        for (const x of [60, 560]) g.fillText("4114  KV320", x, 82);
        g.fillStyle = "#b3202a"; g.fillRect(0, 108, w, 10);
      }, 1024, 128), metalness: 0.8, roughness: 0.35,
    });
    const copper = M("motores", { color: 0xb87333, metalness: 1, roughness: 0.3 });
    const alu = M("motores", { color: 0xcfd4d8, metalness: 1, roughness: 0.22 });
    const baseMat = anodized("motores", 0x222427);

    const bladeMat = M("helices", { map: (() => { const t = carbonTex.clone(); t.needsUpdate = true; t.repeat.set(6, 1); return t; })(), color: 0xffffff, metalness: 0.1, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    const hubMat = M("helices", { color: 0xd6dade, metalness: 1, roughness: 0.2 });

    const escBody = plastic("esc", 0x16181b, 0.45);
    const escLabel = M("esc", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#16181b"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#c9a227"; g.fillRect(0, 0, 120, h);
        g.fillStyle = "#16181b"; g.font = "bold 54px Arial"; g.fillText("HW", 22, 150);
        g.fillStyle = "#ffffff"; g.font = "bold 66px Arial"; g.fillText("XRotor", 150, 115);
        g.fillStyle = "#c9a227"; g.font = "bold 74px Arial"; g.fillText("40A", 150, 205);
        g.fillStyle = "#8c9196"; g.font = "30px Arial"; g.fillText("2-6S  MULTIROTOR", 300, 205);
      }), roughness: 0.4, clearcoat: 0.5,
    });
    const wBlack = plastic("esc", 0x111214, 0.5), wRed = plastic("esc", 0xc0262d, 0.5);

    // pala de 15": perfil afinado con torsión real (más ángulo en la raíz que en la punta)
    function bladeGeometry() {
      const sh = new THREE.Shape();
      sh.moveTo(0.12, -0.07);
      sh.bezierCurveTo(0.35, -0.16, 0.7, -0.17, 1.2, -0.12);
      sh.bezierCurveTo(1.6, -0.08, 1.85, -0.05, 1.9, -0.01);
      sh.quadraticCurveTo(1.92, 0.02, 1.88, 0.03);
      sh.bezierCurveTo(1.5, 0.05, 0.9, 0.08, 0.5, 0.09);
      sh.bezierCurveTo(0.3, 0.09, 0.15, 0.08, 0.12, 0.06);
      sh.lineTo(0.12, -0.07);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 });
      geo.translate(0, 0, -0.008);
      const pos = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const t = THREE.MathUtils.clamp(v.x / 1.9, 0, 1);
        const ang = THREE.MathUtils.degToRad(24 * (1 - t) + 7 * t);
        const y = v.y * Math.cos(ang) - v.z * Math.sin(ang), z = v.y * Math.sin(ang) + v.z * Math.cos(ang);
        pos.setXYZ(i, v.x, y, z * (1 - 0.35 * t));
      }
      geo.computeVertexNormals();
      geo.rotateX(-Math.PI / 2);
      return geo;
    }
    const bladeCW = bladeGeometry();
    const bladeCCW = bladeCW.clone(); bladeCCW.scale(1, 1, -1); bladeCCW.computeVertexNormals();

    DIAG.forEach((a, i) => {
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const at = d.clone().multiplyScalar(ARM_R);

      const motor = new THREE.Group();
      const base = cyl(0.2, 0.215, 0.07, baseMat, 32); base.position.y = 0.33; motor.add(base);
      const winding = cyl(0.19, 0.19, 0.12, copper, 32); winding.position.y = 0.43; motor.add(winding);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.2, 48, 1, false), [bellSide, bellTop, bellMat]);
      bell.position.y = 0.58; motor.add(bell);
      const shaft = cyl(0.035, 0.035, 0.1, alu, 16); shaft.position.y = 0.72; motor.add(shaft);
      for (let k = 0; k < 4; k++) {   // tornillos de la base
        const sc = cyl(0.022, 0.022, 0.02, alu, 6); const an = k / 4 * Math.PI * 2 + Math.PI / 4;
        sc.position.set(Math.cos(an) * 0.14, 0.37, Math.sin(an) * 0.14); motor.add(sc);
      }
      motor.position.set(at.x, 0, at.z);
      add("motores", motor, d.clone().multiplyScalar(0.55).setY(0.85).toArray());

      const prop = new THREE.Group();
      const ccw = i % 2 === 1;
      for (const k of [0, 1]) {
        const b = new THREE.Mesh(ccw ? bladeCCW : bladeCW, bladeMat);
        b.rotation.y = k * Math.PI;
        prop.add(b);
      }
      const hub = cyl(0.12, 0.12, 0.06, hubMat, 32); prop.add(hub);
      const spinner = cyl(0.045, 0.07, 0.07, hubMat, 6); spinner.position.y = 0.06; prop.add(spinner);
      prop.position.set(at.x, 0.78, at.z);
      prop.rotation.y = i * 0.7;
      prop.userData.spin = ccw ? -1 : 1;
      props.push(prop);
      add("helices", prop, d.clone().multiplyScalar(0.6).setY(1.8).toArray());

      // ESC bajo el brazo, con sus 3 cables al motor y la alimentación al centro
      const esc = new THREE.Group();
      const body = rbox(0.62, 0.085, 0.24, 0.035, escBody); esc.add(body);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.2), escLabel); label.rotation.x = -Math.PI / 2; label.position.y = 0.066; esc.add(label);
      esc.position.copy(d.clone().multiplyScalar(1.95)).setY(0.04);
      esc.rotation.y = -a;
      const wires = new THREE.Group();
      for (const [k, off] of [[0, -0.05], [1, 0], [2, 0.05]]) {
        const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(off);
        const p0 = d.clone().multiplyScalar(2.27).add(side).setY(0.09), p1 = d.clone().multiplyScalar(2.9).add(side).setY(0.12), p2 = at.clone().add(side.clone().multiplyScalar(1.2)).setY(0.3);
        wires.add(wire([p0.toArray(), p1.toArray(), p2.toArray()], 0.012, wBlack));
      }
      for (const [mat, off] of [[wRed, -0.04], [wBlack, 0.04]]) {
        const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(off);
        const p0 = d.clone().multiplyScalar(1.63).add(side).setY(0.08), p1 = d.clone().multiplyScalar(1.2).add(side).setY(0.1), p2 = d.clone().multiplyScalar(0.7).add(side).setY(0.2);
        wires.add(wire([p0.toArray(), p1.toArray(), p2.toArray()], 0.016, mat));
      }
      add("esc", esc, d.clone().multiplyScalar(0.3).setY(-0.7).toArray());
      add("esc", wires, d.clone().multiplyScalar(0.3).setY(-0.7).toArray());
    });
  }

  // ---------------------------------------------------------------- Pixhawk 6C (caja de aluminio)
  {
    const shell = anodized("pixhawk", 0x5d636a);
    const top = M("pixhawk", {
      map: labelTexture((g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#6b7178"); gr.addColorStop(1, "#555b62");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = "#f2f4f6"; g.lineWidth = 12; g.lineCap = "round";
        g.beginPath(); g.moveTo(340, 128); g.lineTo(470, 128); g.moveTo(430, 90); g.lineTo(472, 128); g.lineTo(430, 166); g.stroke();
        g.fillStyle = "#f2f4f6"; g.font = "bold 58px Arial"; g.fillText("PIXHAWK", 30, 112);
        g.font = "bold 66px Arial"; g.fillStyle = "#ffffff"; g.fillText("6C", 30, 196);
        g.fillStyle = "#c8ccd0"; g.font = "26px Arial"; g.fillText("HOLYBRO", 140, 192);
      }), metalness: 0.75, roughness: 0.35,
    });
    const port = plastic("pixhawk", 0xf1f1ea, 0.4);
    const pad = plastic("pixhawk", 0x2a2c2f, 0.95);
    const g = new THREE.Group();
    const b = rbox(0.85, 0.13, 0.44, 0.05, shell); g.add(b);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), top); label.rotation.x = -Math.PI / 2; label.position.y = 0.1; g.add(label);
    for (let k = 0; k < 5; k++) { const pt = box(0.06, 0.05, 0.035, port); pt.position.set(-0.3 + k * 0.15, 0.06, 0.23); g.add(pt); }
    for (let k = 0; k < 4; k++) { const pt = box(0.06, 0.05, 0.035, port); pt.position.set(-0.25 + k * 0.17, 0.06, -0.23); g.add(pt); }
    const foam = box(0.6, 0.03, 0.34, pad); foam.position.y = -0.11; g.add(foam);
    g.position.set(0.32, 0.505, 0);
    add("pixhawk", g, [0.45, 1.0, 0]);
  }

  // ---------------------------------------------------------------- Raspberry Pi 5 (placa con disipador activo)
  {
    const pcb = M("rpi", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#1c7a3f"; g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2;
        for (let k = 0; k < 40; k++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
        g.fillStyle = "#e8e8e8"; g.font = "bold 22px Arial"; g.fillText("Raspberry Pi 5", 24, h - 22);
        g.fillStyle = "#d4af37"; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
      }, 512, 340), roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3,
    });
    const metal = M("rpi", { color: 0xcfd3d7, metalness: 1, roughness: 0.25 });
    const black = plastic("rpi", 0x141517, 0.5);
    const fanMat = M("rpi", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#121314"; g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        g.fillStyle = "#26282b";
        for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, w * .46, a, a + .45); g.fill(); }
        g.fillStyle = "#1a1b1d"; g.beginPath(); g.arc(cx, cy, w * .15, 0, 7); g.fill();
        g.fillStyle = "#c51a4a"; g.beginPath(); g.arc(cx, cy, w * .06, 0, 7); g.fill();
      }, 256, 256), roughness: 0.5,
    });
    const gold = M("rpi", { color: 0xd4af37, metalness: 1, roughness: 0.3 });
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.025, 0.56), [pcb, pcb, pcb, pcb, pcb, pcb]); g.add(board);
    // puertos USB y Ethernet (lado corto), tira GPIO y disipador con ventilador
    for (const [z, hh] of [[-0.18, 0.16], [0.02, 0.16], [0.2, 0.13]]) { const u = box(0.17, hh, 0.14, metal); u.position.set(-0.36, hh / 2 + 0.012, z); g.add(u); }
    const gpio = box(0.52, 0.09, 0.05, black); gpio.position.set(0.05, 0.057, -0.245); g.add(gpio);
    const pins = box(0.5, 0.02, 0.035, gold); pins.position.set(0.05, 0.11, -0.245); g.add(pins);
    const sink = box(0.34, 0.1, 0.32, black); sink.position.set(0.12, 0.065, 0.04); g.add(sink);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 32), [black, fanMat, black]); fan.position.set(0.12, 0.125, 0.04); g.add(fan);
    for (const x of [-0.38, 0.38]) for (const z of [-0.24, 0.24]) { const s = cyl(0.02, 0.02, 0.12, metal, 8); s.position.set(x, -0.07, z); g.add(s); }
    g.position.set(-0.3, 0.995, 0.05);
    add("rpi", g, [0, 1.55, 0.3]);
  }

  // ---------------------------------------------------------------- módem 4G
  {
    const body = M("modem", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#17191b"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#ffffff"; g.font = "bold 50px Arial"; g.fillText("SIM7600G-H", 70, 104);
        g.font = "bold 44px Arial"; g.fillText("4G DONGLE", 90, 166);
        g.fillStyle = "#2ecc71"; g.fillRect(w - 70, 0, 70, h);
        g.fillStyle = "#2ecc71"; g.fillRect(0, 0, 54, h);
      }), roughness: 0.4, clearcoat: 0.4,
    });
    const plain = plastic("modem", 0x17191b, 0.45);
    const metal = M("modem", { color: 0xcfd3d7, metalness: 1, roughness: 0.25 });
    const goldM = M("modem", { color: 0xd4af37, metalness: 1, roughness: 0.3 });
    const rubber = plastic("modem", 0x0f1011, 0.8);
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.3), [plain, plain, body, plain, plain, plain]); g.add(d);
    const usb = box(0.13, 0.045, 0.12, metal); usb.position.x = -0.54; g.add(usb);
    const sma = cyl(0.04, 0.04, 0.08, goldM, 12); sma.position.set(0.42, 0.1, 0); g.add(sma);
    const joint = cyl(0.045, 0.045, 0.09, metal, 12); joint.rotation.x = Math.PI / 2; joint.position.set(0.42, 0.17, 0); g.add(joint);
    g.add(tube([0.42, 0.2, 0], [0.62, 1.05, -0.12], 0.04, rubber, 14));
    g.position.set(-0.42, 0.93, -0.52);
    add("modem", g, [-0.3, 1.3, -0.8]);
  }

  // ---------------------------------------------------------------- GPS M10 en mástil plegable
  {
    const mast = carbonMat("gps", 1, 6);
    const clampM = anodized("gps", 0x26282b);
    const pcb = M("gps", { color: 0x1d4f9a, metalness: 0.1, roughness: 0.45, clearcoat: 0.6 });
    const patch = M("gps", { color: 0xe3d3b0, metalness: 0.1, roughness: 0.6 });
    const silverP = M("gps", { color: 0xd8dbdf, metalness: 1, roughness: 0.3 });
    const g = new THREE.Group();
    const base = rbox(0.18, 0.08, 0.18, 0.03, clampM); g.add(base);
    g.add(tube([0, 0.05, 0], [0, 1.05, 0], 0.03, mast, 14));
    const plat = rbox(0.34, 0.03, 0.34, 0.05, clampM); plat.position.y = 1.05; g.add(plat);
    const board = box(0.22, 0.02, 0.22, pcb); board.position.y = 1.08; g.add(board);
    const pt = box(0.17, 0.045, 0.17, patch); pt.position.y = 1.11; g.add(pt);
    const dot = cyl(0.02, 0.02, 0.012, silverP, 12); dot.position.y = 1.14; g.add(dot);
    g.position.set(-0.9, 0.865, 0.48);
    add("gps", g, [-0.5, 1.9, 0.4]);
  }

  // ---------------------------------------------------------------- cámara Module 3 Wide (al frente, inclinada)
  {
    const pcb = M("camara", { color: 0x1c7a3f, metalness: 0.1, roughness: 0.45, clearcoat: 0.6 });
    const holder = plastic("camara", 0x121314, 0.5);
    const glass = M("camara", { color: 0x1d2a44, metalness: 0.3, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0 });
    const bracket = carbonMat("camara", 1, 1);
    const g = new THREE.Group();
    const arm = box(0.04, 0.3, 0.32, bracket); arm.position.set(-0.06, 0.12, 0); g.add(arm);
    const head = new THREE.Group();
    head.add(box(0.025, 0.25, 0.24, pcb));
    const sq = box(0.05, 0.12, 0.12, holder); sq.position.x = 0.035; head.add(sq);
    const barrel = cyl(0.05, 0.055, 0.07, holder, 28); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.09; head.add(barrel);
    const lens = cyl(0.036, 0.036, 0.008, glass, 28); lens.rotation.z = Math.PI / 2; lens.position.x = 0.127; head.add(lens);
    head.rotation.z = -0.6;   // mira hacia adelante y abajo
    g.add(head);
    g.position.set(1.12, -0.1, 0);
    add("camara", g, [1.4, -0.4, 0]);
  }

  // ---------------------------------------------------------------- LiDAR TF-Luna (mira al suelo)
  {
    const body = plastic("lidar", 0x161718, 0.45);
    const lensA = M("lidar", { color: 0x3a1f4f, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
    const lensB = M("lidar", { color: 0x0a0a0b, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
    const g = new THREE.Group();
    g.add(rbox(0.35, 0.14, 0.21, 0.04, body));
    const e1 = cyl(0.05, 0.05, 0.02, lensA, 24); e1.position.set(-0.08, -0.075, 0); g.add(e1);
    const e2 = cyl(0.05, 0.05, 0.02, lensB, 24); e2.position.set(0.08, -0.075, 0); g.add(e2);
    g.position.set(0.55, -0.03, 0.42);
    add("lidar", g, [0.3, -1.3, 0.5]);
  }

  // ---------------------------------------------------------------- radio de telemetría SiK
  {
    const shell = M("telemetria", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#26292d"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#f2f2f2"; g.font = "bold 46px Arial"; g.fillText("TELEMETRY RADIO", 34, 104);
        g.fillStyle = "#c51a4a"; g.font = "bold 40px Arial"; g.fillText("915 MHz", 34, 170);
        g.fillStyle = "#9aa0a6"; g.font = "28px Arial"; g.fillText("Holybro SiK V3", 250, 170);
      }), metalness: 0.7, roughness: 0.35,
    });
    const plain = anodized("telemetria", 0x26292d);
    const goldM = M("telemetria", { color: 0xd4af37, metalness: 1, roughness: 0.3 });
    const rubber = plastic("telemetria", 0x0f1011, 0.8);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.28), [plain, plain, shell, plain, plain, plain]));
    const sma = cyl(0.035, 0.035, 0.08, goldM, 12); sma.rotation.z = Math.PI / 2; sma.position.x = -0.31; g.add(sma);
    g.add(tube([-0.35, 0, 0], [-0.4, -0.85, 0], 0.035, rubber, 14));
    g.position.set(-0.75, -0.03, -0.38);
    add("telemetria", g, [-1.3, -0.6, -0.5]);
  }

  // ---------------------------------------------------------------- receptor ELRS
  {
    const body = plastic("receptor", 0x1b1d20, 0.4);
    const ant = plastic("receptor", 0xf2f2f2, 0.5);
    const g = new THREE.Group();
    g.add(rbox(0.22, 0.06, 0.14, 0.02, body));
    g.add(wire([[0, 0, 0.07], [0.02, 0, 0.25], [0.12, -0.03, 0.45]], 0.01, ant));
    g.add(wire([[0, 0, 0.07], [-0.02, 0, 0.25], [-0.12, -0.03, 0.45]], 0.01, ant));
    g.position.set(-0.85, 0.42, -0.25);
    add("receptor", g, [-1.2, 0.6, -0.6]);
  }

  // ---------------------------------------------------------------- batería 6S3P Li-ion 21700
  {
    const cellWrap = M("bateria", { color: 0x2f6fb4, metalness: 0.2, roughness: 0.35, clearcoat: 0.8 });
    const cellEnd = M("bateria", { color: 0xd9dde1, metalness: 1, roughness: 0.25 });
    const nickel = M("bateria", { color: 0xbfc4c8, metalness: 1, roughness: 0.35 });
    const shrink = M("bateria", { color: 0x7fb6e6, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false });
    const label = M("bateria", {
      map: labelTexture((g, w, h) => {
        g.fillStyle = "#f4f6f7"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#0f2a40"; g.font = "bold 64px Arial"; g.fillText("6S3P Li-ion", 26, 92);
        g.fillStyle = "#1d5fa8"; g.font = "bold 40px Arial"; g.fillText("21700 · 22,2 V · 13,5 Ah", 26, 156);
        g.fillStyle = "#ff6a1a"; g.fillRect(26, 190, 460, 12);
        g.fillStyle = "#5b6770"; g.font = "28px Arial"; g.fillText("DCYM · Rastreador V1", 26, 238);
      }), roughness: 0.5,
    });
    const strap = plastic("bateria", 0x1a1b1d, 0.85);
    const strapRed = plastic("bateria", 0xb3202a, 0.6);
    const xt60 = plastic("bateria", 0xf2c200, 0.45);
    const wRed = plastic("bateria", 0xc0262d, 0.5), wBlack = plastic("bateria", 0x111214, 0.5), wWhite = plastic("bateria", 0xeeeeee, 0.5);
    const g = new THREE.Group();
    const cellGeo = new THREE.CylinderGeometry(0.103, 0.103, 0.66, 24);
    const capGeo = new THREE.CylinderGeometry(0.098, 0.098, 0.02, 24);
    for (let ix = 0; ix < 6; ix++) for (let iy = 0; iy < 3; iy++) {
      const x = -0.525 + ix * 0.21, y = -0.21 + iy * 0.21;
      const c = new THREE.Mesh(cellGeo, cellWrap); c.rotation.x = Math.PI / 2; c.position.set(x, y, 0); g.add(c);
      for (const z of [-0.335, 0.335]) { const e = new THREE.Mesh(capGeo, cellEnd); e.rotation.x = Math.PI / 2; e.position.set(x, y, z); g.add(e); }
    }
    for (const z of [-0.35, 0.35]) for (let ix = 0; ix < 6; ix++) { const n = box(0.17, 0.6, 0.008, nickel); n.position.set(-0.525 + ix * 0.21, 0, z); g.add(n); }
    const wrapBox = box(1.34, 0.68, 0.74, shrink); g.add(wrapBox);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.44), label); lab.position.set(0, 0, 0.372); g.add(lab);
    for (const x of [-0.38, 0.38]) {
      const s = box(0.1, 0.7, 0.76, strap); s.position.x = x; g.add(s);
      const r = box(0.101, 0.71, 0.03, strapRed); r.position.set(x, 0, 0.38); g.add(r);
    }
    // conector XT60 y cable de balanceo
    const conn = rbox(0.16, 0.08, 0.1, 0.02, xt60); conn.position.set(0.55, 0.42, -0.2); g.add(conn);
    g.add(wire([[0.6, 0.15, -0.37], [0.62, 0.3, -0.3], [0.55, 0.42, -0.25]], 0.022, wRed));
    g.add(wire([[0.5, 0.15, -0.37], [0.52, 0.3, -0.3], [0.5, 0.42, -0.25]], 0.022, wBlack));
    g.add(wire([[0.66, 0.42, -0.2], [0.7, 0.48, -0.12], [0.68, 0.6, 0]], 0.022, wRed));
    g.add(wire([[-0.6, 0.2, -0.37], [-0.7, 0.32, -0.3], [-0.68, 0.36, -0.15]], 0.01, wWhite));
    const bal = box(0.12, 0.04, 0.05, wWhite); bal.position.set(-0.68, 0.37, -0.12); g.add(bal);
    g.position.set(-0.05, -0.47, 0);
    add("bateria", g, [0, -1.5, 0]);
  }

  root.position.y = 0.0;

  // ---------------------------------------------------------------- interacción
  explodeTarget = exploded = o.exploded ? 1 : 0;
  let spinning = !!o.spin, selected = null, hovered = null;
  const listeners = { select: [], hover: [], rotate: [] };
  const emit = (ev, ...a) => listeners[ev].forEach(f => f(...a));

  function paint() {
    for (const [id, mats] of Object.entries(partMats)) {
      const isSel = selected === id, isHov = hovered === id, dim = selected && !isSel;
      for (const m of mats) {
        const b = m.userData.base;
        m.emissive.copy(isSel || isHov ? new THREE.Color(0x00e67e) : b.emissive);
        m.emissiveIntensity = isSel ? 0.16 : isHov ? 0.12 : b.ei;
        m.transparent = dim ? true : b.transparent;
        m.opacity = dim ? 0.1 : b.opacity;
        m.depthWrite = dim ? false : b.depthWrite;
        m.needsUpdate = true;
      }
    }
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false).find(h => !selected || h.object.userData.part === selected || !h.object.material.transparent);
    return hit ? hit.object.userData.part : null;
  }
  if (o.interactive) {
    let downAt = null;
    renderer.domElement.addEventListener("pointerdown", e => {
      downAt = [e.clientX, e.clientY];
      if (controls.autoRotate) { controls.autoRotate = false; emit("rotate", false); }
    });
    renderer.domElement.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      const p = pick(e);
      if (p !== hovered) { hovered = p; paint(); emit("hover", p, e); renderer.domElement.style.cursor = p ? "pointer" : "grab"; }
      else if (p) emit("hover", p, e);
    });
    renderer.domElement.addEventListener("pointerleave", () => { hovered = null; paint(); emit("hover", null); });
    renderer.domElement.addEventListener("pointerup", e => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
      const p = pick(e);
      api.select(p === selected ? null : p);
    });
  }

  // ---------------------------------------------------------------- ciclo de render
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // en pantallas angostas se aleja la cámara para que entre el dron completo
    baseZoom = Math.min(1, 0.62 * (w / h));
    camera.zoom = baseZoom * (1 - 0.3 * exploded);
    camera.updateProjectionMatrix();
  }
  let baseZoom = 1;
  new ResizeObserver(resize).observe(container);
  resize();

  let visible = true, raf = 0, last = performance.now();
  // static: sin animación continua (para generar imágenes); se dibuja con renderOnce()
  if (!o.static) new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); }).observe(container);

  function frame(dt) {
    exploded += (explodeTarget - exploded) * Math.min(1, dt * 5);
    const e = exploded * exploded * (3 - 2 * exploded);
    const z = baseZoom * (1 - 0.3 * e);
    if (Math.abs(camera.zoom - z) > 1e-4) { camera.zoom = z; camera.updateProjectionMatrix(); }
    for (const objs of Object.values(partObjs)) for (const ob of objs) {
      ob.position.copy(ob.userData.home).addScaledVector(ob.userData.explode, e);
    }
    if (spinning) for (const p of props) p.rotation.y += p.userData.spin * dt * 28;
    controls.update();
    renderer.render(scene, camera);
  }
  function loop() {
    raf = 0;
    if (!visible) return;
    const now = performance.now();
    frame(Math.min(0.05, (now - last) / 1000)); last = now;
    raf = requestAnimationFrame(loop);
  }
  if (!o.static) loop();

  const api = {
    renderer, scene, camera, controls, parts: PARTS,
    on(ev, f) { listeners[ev].push(f); return api; },
    select(id) {
      selected = id && PARTS[id] ? id : null;
      paint(); emit("select", selected);
    },
    setExploded(v) { explodeTarget = v ? 1 : 0; },
    setSpin(v) { spinning = !!v; },
    setAutoRotate(v) { controls.autoRotate = !!v; },
    resetView() { camera.position.set(7.4, 4.4, 8.2); controls.target.set(0, -0.2, 0); },
    only(id) {  // muestra solo una pieza (para fotos de producto)
      for (const [pid, objs] of Object.entries(partObjs)) for (const ob of objs) ob.visible = !id || pid === id;
    },
    renderOnce() { exploded = explodeTarget; resize(); frame(0.016); },
  };
  return api;
}

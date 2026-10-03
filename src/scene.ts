import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Heraeus 1 kg cast gold bar, length × width × thickness:
// https://www.heraeus-precious-metals.com/en/precious-metal-trading/precious-metals-as-investment/precious-metal-bars/trd-ps-detail/85100015-DE/
const GOLD_BAR_DIMENSIONS_MM = { length: 116, width: 51, thickness: 9.2 };
// Keep the existing scene framing using one uniform scale for every physical dimension.
const SCENE_UNITS_PER_MM = 4.05 / GOLD_BAR_DIMENSIONS_MM.length;

function createGoldBarGeometry(): THREE.ExtrudeGeometry {
  const width = GOLD_BAR_DIMENSIONS_MM.width * SCENE_UNITS_PER_MM;
  const length = GOLD_BAR_DIMENSIONS_MM.length * SCENE_UNITS_PER_MM;
  const thickness = GOLD_BAR_DIMENSIONS_MM.thickness * SCENE_UNITS_PER_MM;
  const bevel = 1.4 * SCENE_UNITS_PER_MM;
  const radius = 5 * SCENE_UNITS_PER_MM - bevel;
  // The bevel expands the outline, so inset it to retain the physical outer dimensions.
  const x = width / 2 - bevel, y = length / 2 - bevel;
  const outline = new THREE.Shape();
  outline.moveTo(-x + radius, -y);
  outline.lineTo(x - radius, -y);
  outline.absarc(x - radius, -y + radius, radius, -Math.PI / 2, 0, false);
  outline.lineTo(x, y - radius);
  outline.absarc(x - radius, y - radius, radius, 0, Math.PI / 2, false);
  outline.lineTo(-x + radius, y);
  outline.absarc(-x + radius, y - radius, radius, Math.PI / 2, Math.PI, false);
  outline.lineTo(-x, -y + radius);
  outline.absarc(-x + radius, -y + radius, radius, Math.PI, Math.PI * 1.5, false);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: thickness - 2 * bevel, steps: 1, curveSegments: 16,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2 + bevel, 0);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const groups = geometry.groups.slice(); geometry.clearGroups();
  // Stamp only the upper cap; the underside and rounded rim remain plain gold.
  for (const group of groups) {
    if (group.materialIndex === 1) { geometry.addGroup(group.start, group.count, 1); continue; }
    let start = group.start, material = normals.getY(start) > .9 ? 0 : 1;
    for (let i = group.start; i < group.start + group.count; i++) {
      uv.setXY(i, .5 + positions.getX(i) / width, .5 - positions.getZ(i) / length);
      const next = normals.getY(i) > .9 ? 0 : 1;
      if (next !== material) { geometry.addGroup(start, i - start, material); start = i; material = next; }
    }
    geometry.addGroup(start, group.start + group.count - start, material);
  }
  return geometry;
}

export async function initGoldScene(container: HTMLElement): Promise<void> {
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x080908);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080908);
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 50);
  camera.position.set(5.6, 6.9, 9.1); camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableZoom = false;
  controls.enableDamping = !motionQuery.matches; controls.dampingFactor = .065;
  controls.rotateSpeed = .6; controls.autoRotate = !motionQuery.matches;
  controls.autoRotateSpeed = .25; controls.saveState();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(); const environment = pmrem.fromScene(room, .03);
  scene.environment = environment.texture; scene.environmentIntensity = .8;
  room.dispose(); pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffeed0, 5.5); key.position.set(-4, 6, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffcd6b, 4.5); rim.position.set(4, 2, -5); scene.add(rim);
  const edge = new THREE.DirectionalLight(0xffffff, 2.4); edge.position.set(-3, -2, 4); scene.add(edge);
  const glow = new THREE.PointLight(0xffab23, 14, 15, 2); glow.position.set(0, -1, -1); scene.add(glow);
  const group = new THREE.Group(); group.rotation.set(.08, -.38, -.23); scene.add(group);
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xe7b746, metalness: 1, roughness: .27,
    clearcoat: .12, clearcoatRoughness: .25, envMapIntensity: 1.2, emissive: 0x6f3905, emissiveIntensity: .08 });
  const geometry = createGoldBarGeometry();
  const canvas = document.createElement('canvas'); canvas.width = 1024;
  canvas.height = Math.round(canvas.width * GOLD_BAR_DIMENSIONS_MM.length / GOLD_BAR_DIMENSIONS_MM.width);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7b746'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const stampCanvas = document.createElement('canvas'); stampCanvas.width = canvas.width; stampCanvas.height = canvas.height;
  const stamp = stampCanvas.getContext('2d')!;
  stamp.fillStyle = '#b8b8b8'; stamp.fillRect(0, 0, stampCanvas.width, stampCanvas.height);
  // Small surface variations suggest a cast finish; dark height-map letters are recessed.
  const grain = stamp.getImageData(0, 0, stampCanvas.width, stampCanvas.height);
  let seed = 17;
  for (let i = 0; i < grain.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const pixel = i / 4, x = pixel % stampCanvas.width, y = Math.floor(pixel / stampCanvas.width);
    const shade = 184 + Math.sin(x * .018 + Math.sin(y * .009)) * 2
      + Math.sin(y * .013 + Math.cos(x * .012)) * 2 + (seed % 3) - 1;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = shade;
  }
  stamp.putImageData(grain, 0, 0);
  for (const context of [ctx, stamp]) {
    context.textAlign = 'center';
    context.fillStyle = context === stamp ? '#202020' : '#bd9435';
    context.filter = context === stamp ? 'blur(2px)' : 'none';
    context.font = 'bold 270px Georgia'; context.fillText('Au', 512, canvas.height * .37);
    context.font = 'bold 68px Georgia'; context.fillText('F I N E   G O L D', 512, canvas.height * .51);
    context.font = 'bold 125px Georgia'; context.fillText('999.9', 512, canvas.height * .62);
    context.font = 'bold 84px Georgia'; context.fillText('1000 g', 512, canvas.height * .8);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const stampTexture = new THREE.CanvasTexture(stampCanvas);
  stampTexture.anisotropy = texture.anisotropy;
  const face = gold.clone(); face.map = texture; face.color.set(0xffffff); face.roughness = .3;
  // Bump strength controls the shading of the stamp shoulders, not the bar's dimensions.
  face.bumpMap = stampTexture; face.bumpScale = .75;
  group.add(new THREE.Mesh(geometry, [face, gold]));
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 256;
  const haloContext = haloCanvas.getContext('2d')!;
  const gradient = haloContext.createRadialGradient(128, 128, 5, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(212,144,38,.16)'); gradient.addColorStop(.45, 'rgba(140,92,22,.045)'); gradient.addColorStop(1, 'rgba(100,60,10,0)');
  haloContext.fillStyle = gradient; haloContext.fillRect(0, 0, 256, 256);
  const haloTexture = new THREE.CanvasTexture(haloCanvas);
  const haloMaterial = new THREE.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Sprite(haloMaterial); halo.scale.set(10, 7, 1); halo.position.set(0, -.3, -2); scene.add(halo);
  // Canvas anti-aliasing does not apply to the offscreen buffers used for bloom.
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  const composer = new EffectComposer(renderer, sceneTarget);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .22, .65, 1.05);
  const output = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output);
  let frame = 0, lastFrame = 0, visible = true, disposed = false, interacted = false;
  let previousRenderTime = performance.now();
  function draw() { if (!disposed) composer.render(); }
  function resize() {
    const { width, height } = container.getBoundingClientRect(); if (!width || !height) return;
    renderer.setSize(width, height); composer.setSize(width, height); camera.aspect = width / height;
    camera.zoom = width < 741 ? .52 : 1.08;
    camera.setViewOffset(width, height, 0, height * .1, width, height);
    camera.updateProjectionMatrix(); draw();
  }
  function animate(time: number) {
    frame = requestAnimationFrame(animate); if (time - lastFrame < 33) return; lastFrame = time;
    controls.update(Math.min((time - previousRenderTime) / 1000, .1)); previousRenderTime = time;
    if (!motionQuery.matches) { group.position.y = Math.sin(time * .00055) * .08; glow.intensity = 14 + Math.sin(time * .0007) * 1.4; }
    draw();
  }
  function updateAnimation() {
    cancelAnimationFrame(frame); if (disposed) return;
    if (!document.hidden && visible && !motionQuery.matches) { previousRenderTime = performance.now(); frame = requestAnimationFrame(animate); } else draw();
  }
  function startInteraction() { interacted = true; controls.autoRotate = false; container.dataset.interacted = 'true'; }
  controls.addEventListener('change', () => { if (motionQuery.matches) draw(); });
  controls.addEventListener('start', startInteraction);
  function onKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault(); startInteraction();
    if (event.key === 'Home') { group.rotation.set(.08, -.38, -.23); controls.reset(); resize(); }
    else {
      const amount = Math.PI / 18;
      if (event.key === 'ArrowLeft') group.rotation.y -= amount;
      if (event.key === 'ArrowRight') group.rotation.y += amount;
      if (event.key === 'ArrowUp') group.rotation.x -= amount;
      if (event.key === 'ArrowDown') group.rotation.x += amount;
    }
    draw();
  }
  function onMotionChange() { controls.autoRotate = !motionQuery.matches && !interacted; controls.enableDamping = !motionQuery.matches; updateAnimation(); }
  const observer = new ResizeObserver(resize); observer.observe(container);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateAnimation(); }); intersection.observe(container);
  container.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', updateAnimation);
  motionQuery.addEventListener('change', onMotionChange);
  resize(); updateAnimation();
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); controls.dispose();
    container.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', updateAnimation); motionQuery.removeEventListener('change', onMotionChange);
    geometry.dispose(); texture.dispose(); stampTexture.dispose(); gold.dispose(); face.dispose(); environment.dispose(); haloTexture.dispose(); haloMaterial.dispose(); bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose();
  }, { once: true });
}

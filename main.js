// ====================== Our Cute World - Improved Client ======================
const socket = io({ transports: ['websocket', 'polling'] });

// DOM
const loginScreen = document.getElementById('login-screen');
const gameUI = document.getElementById('game-ui');
const nameInput = document.getElementById('name-input');
const passwordInput = document.getElementById('password-input');
const colorInput = document.getElementById('color-input');
const joinBtn = document.getElementById('join-btn');
const loginError = document.getElementById('login-error');
const scoreValue = document.getElementById('score-value');
const onlineCount = document.getElementById('online-count');
const emoteBar = document.getElementById('emote-bar');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const emoteToggle = document.getElementById('emote-toggle');
const hint = document.getElementById('hint');

// State
let myId = null;
let myScore = 0;
const otherPlayers = {};
let hearts = {};
let localPlayer = null;
let isJoined = false;
let playerCount = 1;

// Three.js
let scene, camera, renderer, clock;
const keys = {};
const moveSpeed = 7;
let yaw = 0;
let isPointerLocked = false;

// Touch / Joystick
let joystickActive = false;
let joystickVec = { x: 0, y: 0 };
const joystickBase = document.getElementById('joystick-base');
const joystickThumb = document.getElementById('joystick-thumb');

// Camera
const camDistance = 7;
const camHeight = 3.8;

// ---------- Init ----------
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe4ec);
  scene.fog = new THREE.Fog(0xffe4ec, 25, 70);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Lighting - soft and cute
  const ambient = new THREE.AmbientLight(0xfff0f5, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff5e6, 0.85);
  sun.position.set(15, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  // Soft fill light
  const fill = new THREE.DirectionalLight(0xffc0cb, 0.25);
  fill.position.set(-10, 10, -10);
  scene.add(fill);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0xb8e0c8, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  createWorld();

  // Events
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Mouse look (desktop)
  renderer.domElement.addEventListener('click', () => {
    if (isJoined && !isTouchDevice()) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
  });
  document.addEventListener('mousemove', onMouseMove);

  // Touch look (drag anywhere except UI)
  let lastTouchX = 0;
  renderer.domElement.addEventListener('touchstart', e => {
    if (e.touches.length === 1) lastTouchX = e.touches[0].clientX;
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && !joystickActive) {
      const dx = e.touches[0].clientX - lastTouchX;
      yaw -= dx * 0.006;
      lastTouchX = e.touches[0].clientX;
    }
  }, { passive: true });

  // Joystick
  setupJoystick();

  // Emotes
  document.querySelectorAll('#emote-bar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const emote = btn.dataset.emote;
      socket.emit('emote', emote);
      showLocalEmote(emote);
      emoteBar.classList.remove('visible');
    });
  });
  emoteToggle.addEventListener('click', () => {
    emoteBar.classList.toggle('visible');
  });

  // Chat
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      socket.emit('chat', chatInput.value.trim());
      chatInput.value = '';
    }
  });

  // Fade hint
  setTimeout(() => hint.classList.add('fade'), 6000);
}

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(e) {
  if (!isPointerLocked) return;
  yaw -= e.movementX * 0.0022;
}

// ---------- Joystick ----------
function setupJoystick() {
  const zone = document.getElementById('joystick-zone');
  const base = joystickBase;
  const thumb = joystickThumb;
  const maxDist = 32;

  function handleStart(e) {
    e.preventDefault();
    joystickActive = true;
    const touch = e.touches ? e.touches[0] : e;
    updateJoystick(touch);
  }
  function handleMove(e) {
    if (!joystickActive) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    updateJoystick(touch);
  }
  function handleEnd() {
    joystickActive = false;
    joystickVec.x = 0;
    joystickVec.y = 0;
    thumb.style.transform = 'translate(-50%, -50%)';
  }

  function updateJoystick(touch) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickVec.x = dx / maxDist;
    joystickVec.y = dy / maxDist;
  }

  zone.addEventListener('touchstart', handleStart, { passive: false });
  zone.addEventListener('touchmove', handleMove, { passive: false });
  zone.addEventListener('touchend', handleEnd);
  zone.addEventListener('touchcancel', handleEnd);
}

// ---------- World ----------
function createWorld() {
  // Trees
  const treePos = [
    [-14, -11], [16, -9], [-18, 13], [11, 16],
    [-7, -18], [20, 4], [-4, 20], [7, -16],
    [-22, -5], [14, 22], [-12, 8], [22, -14]
  ];
  treePos.forEach(([x, z]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
    );
    trunk.position.set(x, 1.1, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x7ec850 })
    );
    leaves.position.set(x, 3.4, z);
    leaves.castShadow = true;
    scene.add(leaves);
  });

  // Picnic blanket (cute checkered)
  const blanketGroup = new THREE.Group();
  blanketGroup.position.set(0, 0.02, -7);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const col = (i + j) % 2 === 0 ? 0xff6b9d : 0xffffff;
      const sq = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide })
      );
      sq.rotation.x = -Math.PI / 2;
      sq.position.set(-2.25 + i * 1.5, 0, -2.25 + j * 1.5);
      blanketGroup.add(sq);
    }
  }
  scene.add(blanketGroup);

  // Little basket on picnic
  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.35, 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xd4a574 })
  );
  basket.position.set(1.2, 0.3, -7);
  basket.castShadow = true;
  scene.add(basket);

  // Flowers
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * 55;
    const z = (Math.random() - 0.5) * 55;
    if (Math.abs(x) < 5 && Math.abs(z + 7) < 5) continue;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5),
      new THREE.MeshStandardMaterial({ color: 0x4caf50 })
    );
    stem.position.set(x, 0.28, z);
    scene.add(stem);

    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({
        color: [0xff6b9d, 0xffb6c1, 0xffd700, 0xda70d6, 0xff8fab][i % 5]
      })
    );
    petal.position.set(x, 0.65, z);
    scene.add(petal);
  }

  // Cute path stones leading to picnic
  for (let i = 0; i < 8; i++) {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 + Math.random() * 0.2, 0.5, 0.12, 7),
      new THREE.MeshStandardMaterial({ color: 0xe8d5c4 })
    );
    stone.position.set((Math.random() - 0.5) * 1.5, 0.06, -1 - i * 0.9);
    stone.rotation.y = Math.random() * Math.PI;
    scene.add(stone);
  }
}

// ---------- Cute Avatar ----------
function createAvatar(color, name) {
  const group = new THREE.Group();

  // Body (rounder, cuter)
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 8, 16),
    bodyMat
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xffe0bd })
  );
  head.position.y = 1.95;
  head.castShadow = true;
  group.add(head);

  // Eyes (bigger & cuter)
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePupil = new THREE.MeshBasicMaterial({ color: 0x2c2c2c });

  [-0.13, 0.13].forEach(x => {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), eyeWhite);
    white.position.set(x, 2.0, 0.34);
    group.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyePupil);
    pupil.position.set(x, 2.0, 0.41);
    group.add(pupil);
  });

  // Blush
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8fab, transparent: true, opacity: 0.55 });
  [-0.24, 0.24].forEach(x => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), blushMat);
    b.position.set(x, 1.88, 0.3);
    group.add(b);
  });

  // Soft smile
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.08, 0.018, 8, 12, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xc45c6a })
  );
  smile.position.set(0, 1.82, 0.36);
  smile.rotation.x = Math.PI;
  group.add(smile);

  // Name tag
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 16, 10, 224, 44, 14);
  ctx.fill();
  ctx.font = 'bold 26px Segoe UI, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 12), 128, 40);

  const tex = new THREE.CanvasTexture(canvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  label.scale.set(2.2, 0.55, 1);
  label.position.y = 2.7;
  group.add(label);

  // Emote bubble
  const eCanvas = document.createElement('canvas');
  eCanvas.width = 128;
  eCanvas.height = 128;
  const eTex = new THREE.CanvasTexture(eCanvas);
  const eSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: eTex, transparent: true }));
  eSprite.scale.set(1.1, 1.1, 1);
  eSprite.position.y = 3.25;
  eSprite.visible = false;
  group.add(eSprite);

  group.userData = { eSprite, eCanvas, eTex, body };
  return group;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function updateEmoteSprite(group, emote) {
  const { eSprite, eCanvas, eTex } = group.userData;
  if (!emote) {
    eSprite.visible = false;
    return;
  }
  const ctx = eCanvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = '78px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icons = { wave: '👋', heart: '💖', dance: '💃', hug: '🤗', kiss: '😘', happy: '😊' };
  ctx.fillText(icons[emote] || '✨', 64, 64);
  eTex.needsUpdate = true;
  eSprite.visible = true;
}

// ---------- Hearts ----------
function createHeartMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff4d6d,
    emissive: 0x661122,
    emissiveIntensity: 0.35,
    roughness: 0.4
  });
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), mat);
  s1.position.set(-0.16, 0.16, 0);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), mat);
  s2.position.set(0.16, 0.16, 0);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.55, 12), mat);
  cone.position.y = -0.18;
  cone.rotation.x = Math.PI;
  g.add(s1, s2, cone);
  g.scale.set(0.75, 0.75, 0.75);
  return g;
}

function addHeart(data) {
  const mesh = createHeartMesh();
  mesh.position.set(data.x, data.y, data.z);
  mesh.userData.id = data.id;
  scene.add(mesh);
  hearts[data.id] = mesh;
}

function removeHeart(id) {
  if (hearts[id]) {
    scene.remove(hearts[id]);
    delete hearts[id];
  }
}

// ---------- Players ----------
function addOtherPlayer(data) {
  const avatar = createAvatar(data.color, data.name);
  avatar.position.set(data.x, 0, data.z);
  avatar.rotation.y = data.rotY || 0;
  scene.add(avatar);
  otherPlayers[data.id] = {
    mesh: avatar,
    data: { ...data },
    targetPos: new THREE.Vector3(data.x, 0, data.z),
    targetRot: data.rotY || 0
  };
  updateOnlineCount();
}

function removeOtherPlayer(id) {
  if (otherPlayers[id]) {
    scene.remove(otherPlayers[id].mesh);
    delete otherPlayers[id];
    updateOnlineCount();
  }
}

function updateOnlineCount() {
  playerCount = 1 + Object.keys(otherPlayers).length;
  onlineCount.textContent = playerCount;
}

// ---------- Movement & Camera ----------
function updateLocalPlayer(dt) {
  if (!localPlayer || !isJoined) return;

  let mx = 0, mz = 0;

  // Keyboard
  if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

  // Joystick
  if (joystickActive) {
    mx += joystickVec.x;
    mz += joystickVec.y;
  }

  // Normalize
  const len = Math.sqrt(mx * mx + mz * mz);
  if (len > 1) { mx /= len; mz /= len; }

  if (len > 0.05) {
    const speed = moveSpeed * dt;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    localPlayer.position.addScaledVector(right, mx * speed);
    localPlayer.position.addScaledVector(forward, mz * speed);

    // Face movement direction slightly
    localPlayer.rotation.y = yaw;
  }

  // Bounds
  localPlayer.position.x = Math.max(-40, Math.min(40, localPlayer.position.x));
  localPlayer.position.z = Math.max(-40, Math.min(40, localPlayer.position.z));
  localPlayer.position.y = 0;

  // Smooth third-person camera
  const idealOffset = new THREE.Vector3(
    Math.sin(yaw) * camDistance,
    camHeight,
    Math.cos(yaw) * camDistance
  );
  const idealPos = localPlayer.position.clone().add(idealOffset);
  camera.position.lerp(idealPos, 0.12);
  camera.lookAt(
    localPlayer.position.x,
    localPlayer.position.y + 1.6,
    localPlayer.position.z
  );

  // Send position
  socket.emit('move', {
    x: localPlayer.position.x,
    y: 0,
    z: localPlayer.position.z,
    rotY: yaw
  });

  // Collect hearts
  Object.values(hearts).forEach(h => {
    if (localPlayer.position.distanceTo(h.position) < 1.6) {
      socket.emit('collectHeart', h.userData.id);
    }
  });
}

function showLocalEmote(emote) {
  if (localPlayer) updateEmoteSprite(localPlayer, emote);
  setTimeout(() => {
    if (localPlayer) updateEmoteSprite(localPlayer, null);
  }, 2800);
}

// ---------- Loop ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (isJoined) {
    updateLocalPlayer(dt);

    // Smooth remote players
    Object.values(otherPlayers).forEach(p => {
      p.mesh.position.lerp(p.targetPos, 0.18);
      p.mesh.rotation.y += (p.targetRot - p.mesh.rotation.y) * 0.18;
    });

    // Float + spin hearts
    const t = clock.elapsedTime;
    Object.values(hearts).forEach((h, i) => {
      h.position.y = 1.15 + Math.sin(t * 2.2 + i * 0.7) * 0.28;
      h.rotation.y += dt * 1.8;
    });
  }

  renderer.render(scene, camera);
}

// ---------- Socket ----------
socket.on('joinFailed', data => {
  loginError.textContent = data.message || 'Could not join';
});

socket.on('joined', data => {
  myId = data.id;
  isJoined = true;
  loginScreen.classList.add('hidden');
  gameUI.classList.remove('hidden');

  const myData = data.players[myId];
  localPlayer = createAvatar(myData.color, myData.name);
  localPlayer.position.set(myData.x, 0, myData.z);
  scene.add(localPlayer);

  Object.values(data.players).forEach(p => {
    if (p.id !== myId) addOtherPlayer(p);
  });

  data.hearts.forEach(h => addHeart(h));
  updateOnlineCount();
  addChatMessage('System', 'Welcome to our cute world 💕');
});

socket.on('playerJoined', data => {
  if (data.id !== myId) {
    addOtherPlayer(data);
    addChatMessage('System', `${data.name} joined 💕`);
  }
});

socket.on('playerLeft', id => {
  const p = otherPlayers[id];
  if (p) {
    addChatMessage('System', `${p.data.name} left`);
    removeOtherPlayer(id);
  }
});

socket.on('playerMoved', data => {
  const p = otherPlayers[data.id];
  if (p) {
    p.targetPos.set(data.x, 0, data.z);
    p.targetRot = data.rotY;
  }
});

socket.on('playerEmote', data => {
  if (data.id === myId) return;
  const p = otherPlayers[data.id];
  if (p) updateEmoteSprite(p.mesh, data.emote);
});

socket.on('heartCollected', data => {
  removeHeart(data.heartId);
  if (data.playerId === myId) {
    myScore = data.score;
    scoreValue.textContent = myScore;
  }
});

socket.on('heartSpawned', data => addHeart(data));

socket.on('chat', data => addChatMessage(data.name, data.text));

function addChatMessage(name, text) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<strong>${name}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  while (chatMessages.children.length > 25) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

// ---------- Login ----------
joinBtn.addEventListener('click', tryJoin);
passwordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tryJoin();
});

function tryJoin() {
  const name = nameInput.value.trim() || 'Player';
  const password = passwordInput.value;
  const color = colorInput.value;

  if (!password) {
    loginError.textContent = 'Please enter the password';
    return;
  }
  loginError.textContent = 'Connecting...';
  socket.emit('join', { name, password, color });
}

// Start
initThree();
animate();

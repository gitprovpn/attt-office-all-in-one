const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '';

const els = {
  spriteLayer: document.getElementById('spriteLayer'),
  staffDetail: document.getElementById('staffDetail'),
  projectList: document.getElementById('projectList'),
  messageList: document.getElementById('messageList'),
  projectCount: document.getElementById('projectCount'),
  lastUpdated: document.getElementById('lastUpdated'),
  staffSelect: document.getElementById('staffSelect'),
  zoneSelect: document.getElementById('zoneSelect'),
  statusInput: document.getElementById('statusInput'),
  tokenInput: document.getElementById('tokenInput'),
  adminForm: document.getElementById('adminForm'),
  refreshBtn: document.getElementById('refreshBtn'),
  simulateBtn: document.getElementById('simulateBtn'),
  resetBtn: document.getElementById('resetBtn')
};

const spriteCache = new Map();
const spriteState = new Map();
let state = null;
let activeStaffId = null;
let animationFrameId = 0;
let animationStarted = false;
let lastStaffSignature = '';

const ADMIN_ZONES = [
  { id: 'governance', name: 'governance' },
  { id: 'audit', name: 'audit' },
  { id: 'defense', name: 'defense' },
  { id: 'redteam', name: 'redteam' },
  { id: 'warroom', name: 'warroom' }
];

const ROOM_SLOTS = {
  governance: [
    { x: 18.2, y: 21.8, facing: 1 },
    { x: 27.3, y: 21.8, facing: -1 }
  ],
  audit: [
    { x: 43.6, y: 24.5, facing: 1 },
    { x: 55.6, y: 24.5, facing: -1 }
  ],
  defense: [
    { x: 77.8, y: 25.0, facing: 1 },
    { x: 87.0, y: 25.0, facing: -1 }
  ],
  relax: [
    { x: 18.0, y: 58.5, facing: 1 },
    { x: 28.0, y: 58.5, facing: -1 }
  ],
  redteam: [
    { x: 18.0, y: 82.0, facing: 1 },
    { x: 27.8, y: 82.0, facing: -1 }
  ],
  warroom: [
    { x: 74.5, y: 69.2, facing: 1 },
    { x: 84.0, y: 69.2, facing: -1 }
  ],
  default: [
    { x: 50.0, y: 50.0, facing: 1 },
    { x: 56.0, y: 50.0, facing: -1 }
  ]
};

const STATUS_ZONE_RULES = [
  { zone: 'warroom', keywords: ['critical', 'sev', 'incident', 'breach', 'war room', 'major', 'escalat', 'escalation', 'urgent', 'khan cap', 'su co', 'canh bao do', 'p1', 'p0'] },
  { zone: 'redteam', keywords: ['redteam', 'red team', 'pentest', 'phishing', 'exploit', 'attack simulation', 'adversary', 'tlpt', 'xam nhap', 'tan cong', 'tấn công', 'recon'] },
  { zone: 'defense', keywords: ['defense', 'soc', 'monitor', 'monitoring', 'siem', 'edr', 'blue team', 'va remediation', 'remediation', 'patch', 'hardening', 'vulnerability', 'defender', 'waf', 'firewall', 'logging', 'alert'] },
  { zone: 'audit', keywords: ['audit', 'stage 2', 'stage2', 'evidence', 'checklist', 'internal audit', 'rehearsal', 'review', 'compliance review', 'assessment', 'attestation'] },
  { zone: 'governance', keywords: ['governance', 'policy', 'risk', 'register', 'iso', 'isms', 'procedure', 'standard', 'compliance', 'owner', 'scope', 'soa', 'management review'] },
  { zone: 'relax', keywords: ['idle', 'break', 'lunch', 'offline', 'oof', 'done', 'completed', 'completed task', 'waiting', 'standby', 'relax', 'rest', 'nghi', 'nghỉ', 'xong', 'roi', 'rồi'] }
];

bootstrap();

async function bootstrap() {
  bindEvents();
  await loadState();
  startSpriteLoop();
}

function bindEvents() {
  els.refreshBtn?.addEventListener('click', loadState);
  els.simulateBtn?.addEventListener('click', handleSimulate);
  els.resetBtn?.addEventListener('click', handleReset);
  els.adminForm?.addEventListener('submit', handleAdminSubmit);
}

async function loadState() {
  try {
    const data = await api('/api/state');
    state = data;
    if (!activeStaffId && state.staff.length) activeStaffId = state.staff[0].id;
    render();
  } catch (error) {
    if (els.staffDetail) {
      els.staffDetail.innerHTML = `<div class="status-bad">Không tải được dữ liệu từ Worker: ${escapeHtml(error.message)}</div>`;
    }
  }
}

function render() {
  if (!state) return;
  const positioned = assignRoomSlots(state.staff);
  renderSprites(positioned);
  renderStaffOptions();
  renderProjectList();
  renderMessages();
  renderStaffDetail();
  if (els.projectCount) els.projectCount.textContent = `${state.projects.length} dự án`;
  if (els.lastUpdated) els.lastUpdated.textContent = `Updated: ${formatDateTime(state.meta?.lastUpdated)}`;
}

function renderSprites(positionedStaff) {
  if (!els.spriteLayer) return;

  const signature = JSON.stringify(
    positionedStaff.map((person) => ({
      id: person.id,
      zoneId: person.behaviorZoneId || person.zoneId,
      status: person.status,
      active: person.id === activeStaffId,
      x: person.targetX,
      y: person.targetY,
      facing: person.facing,
      project: projectForStaff(person.id)?.id || ''
    }))
  );

  if (signature !== lastStaffSignature) {
    const existingIds = new Set(positionedStaff.map((p) => p.id));

    spriteState.forEach((sprite, id) => {
      if (!existingIds.has(id)) {
        sprite.root.remove();
        spriteState.delete(id);
      }
    });

    positionedStaff.forEach((person, index) => {
      let sprite = spriteState.get(person.id);

      if (!sprite) {
        const root = document.createElement('button');
        root.type = 'button';
        root.className = `agent-sprite ${person.id === activeStaffId ? 'active' : ''}`;
        root.dataset.staffId = person.id;
        root.style.left = `${person.targetX}%`;
        root.style.top = `${person.targetY}%`;

        const badge = document.createElement('div');
        badge.className = 'agent-badge';

        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'agent-canvas-wrap';

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        canvas.className = 'agent-canvas';
        canvasWrap.appendChild(canvas);

        const shadow = document.createElement('div');
        shadow.className = 'agent-shadow';

        root.appendChild(badge);
        root.appendChild(canvasWrap);
        root.appendChild(shadow);
        els.spriteLayer.appendChild(root);

        root.addEventListener('click', () => {
          activeStaffId = person.id;
          render();
        });

        prepareSprite(person.id, canvas, person.color || '#79aefc');

        sprite = {
          id: person.id,
          canvas,
          root,
          badge,
          shadow,
          wobbleOffset: index * 0.47,
          currentX: person.targetX,
          currentY: person.targetY,
          targetX: person.targetX,
          targetY: person.targetY,
          facing: person.facing,
          targetFacing: person.facing,
          moving: false,
          fallbackColor: person.color || '#79aefc',
          roomSlotIndex: person.roomSlotIndex || 0
        };
        spriteState.set(person.id, sprite);
      }

      sprite.targetX = person.targetX;
      sprite.targetY = person.targetY;
      sprite.targetFacing = person.facing;
      sprite.roomSlotIndex = person.roomSlotIndex || 0;
      sprite.root.classList.toggle('active', person.id === activeStaffId);
      sprite.badge.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(projectLabel(person.id))}</span>`;
      sprite.root.setAttribute('aria-label', `${person.name} - ${projectLabel(person.id)}`);
    });

    lastStaffSignature = signature;
  } else {
    positionedStaff.forEach((person) => {
      const sprite = spriteState.get(person.id);
      if (!sprite) return;
      sprite.root.classList.toggle('active', person.id === activeStaffId);
      sprite.badge.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(projectLabel(person.id))}</span>`;
    });
  }
}

function assignRoomSlots(staff) {
  const grouped = new Map();

  for (const person of staff) {
    const zoneKey = resolveBehaviorZone(person);
    if (!grouped.has(zoneKey)) grouped.set(zoneKey, []);
    grouped.get(zoneKey).push({ ...person, behaviorZoneId: zoneKey });
  }

  const positioned = [];

  for (const [zoneKey, people] of grouped.entries()) {
    const slots = ROOM_SLOTS[zoneKey] || ROOM_SLOTS.default;
    const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    sortedPeople.forEach((person, index) => {
      const slot = slots[index % slots.length] || ROOM_SLOTS.default[0];
      const overflowRow = Math.floor(index / slots.length);
      const offsetY = overflowRow * 4.8;
      const offsetX = overflowRow * (index % 2 === 0 ? -2.4 : 2.4);

      positioned.push({
        ...person,
        roomSlotIndex: index % slots.length,
        targetX: slot.x + offsetX,
        targetY: slot.y + offsetY,
        facing: slot.facing
      });
    });
  }

  return positioned;
}

function resolveBehaviorZone(person) {
  // nếu user chọn zone → ưu tiên luôn
  if (person.zoneId) return person.zoneId;

  const project = projectForStaff(person.id);

  const text = [
    person.status,
    project?.name
  ].join(' ').toLowerCase();

  if (text.includes('incident')) return 'warroom';
  if (text.includes('pentest')) return 'redteam';
  if (text.includes('audit')) return 'audit';
  if (text.includes('soc')) return 'defense';
  if (text.includes('policy')) return 'governance';
  if (text.includes('idle')) return 'relax';

  return 'relax';
}

function normalizeZoneId(zoneId) {
  return String(zoneId || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function prepareSprite(staffId, canvas, fallbackColor) {
  const existing = spriteCache.get(staffId);
  if (existing) {
    existing.canvases.add(canvas);
    if (!existing.loading) drawCompositeToCanvas(existing, canvas, 0, false, fallbackColor);
    return existing;
  }

  const entry = {
    id: staffId,
    basePath: `./assets/experts/${staffId}`,
    layers: [],
    canvases: new Set([canvas]),
    frameCount: 1,
    frameWidth: 32,
    frameHeight: 32,
    loading: true,
    failed: false,
    fallbackColor
  };
  spriteCache.set(staffId, entry);

  const files = ['body.png', 'outfit.png', 'hair.png'];
  Promise.all(files.map((file) => loadImage(`${entry.basePath}/${file}`)))
    .then((images) => {
      entry.layers = images;
      const base = images[0];
      const frameCount = base.width > base.height ? Math.max(1, Math.round(base.width / base.height)) : 1;
      entry.frameCount = frameCount;
      entry.frameWidth = Math.max(1, Math.floor(base.width / frameCount));
      entry.frameHeight = base.height;
      entry.loading = false;
      entry.failed = false;
      entry.canvases.forEach((item) => drawCompositeToCanvas(entry, item, 0, false, fallbackColor));
    })
    .catch(() => {
      entry.loading = false;
      entry.failed = true;
      entry.canvases.forEach((item) => drawFallbackSprite(item, fallbackColor, false));
    });

  return entry;
}

function startSpriteLoop() {
  if (animationStarted) return;
  animationStarted = true;

  const tick = (ts) => {
    const t = ts / 1000;

    spriteState.forEach((sprite, staffId) => {
      const entry = spriteCache.get(staffId);
      const dx = sprite.targetX - sprite.currentX;
      const dy = sprite.targetY - sprite.currentY;
      const distance = Math.hypot(dx, dy);
      const isMoving = distance > 0.05;
      sprite.moving = isMoving;

      if (isMoving) {
        const smooth = Math.min(0.16, 0.09 + distance * 0.035);
        sprite.currentX += dx * smooth;
        sprite.currentY += dy * smooth;
      } else {
        sprite.currentX = sprite.targetX;
        sprite.currentY = sprite.targetY;
      }

      const facing = sprite.targetFacing || sprite.facing || 1;
      sprite.facing = facing;

      const bob = isMoving
        ? Math.abs(Math.sin(t * 11 + sprite.wobbleOffset)) * 1.5
        : Math.sin(t * 2.2 + sprite.wobbleOffset) * 1.2;

      sprite.root.style.left = `${sprite.currentX}%`;
      sprite.root.style.top = `${sprite.currentY}%`;
      sprite.root.style.setProperty('--sprite-bob', `${bob.toFixed(2)}px`);
      sprite.root.style.setProperty('--sprite-flip', facing < 0 ? -1 : 1);
      sprite.root.classList.toggle('moving', isMoving);
      sprite.root.classList.toggle('slot-left', sprite.roomSlotIndex === 0);
      sprite.root.classList.toggle('slot-right', sprite.roomSlotIndex === 1);

      if (!entry) return;
      if (entry.failed) {
        drawFallbackSprite(sprite.canvas, sprite.fallbackColor, facing < 0);
      } else if (!entry.loading) {
        drawCompositeToCanvas(entry, sprite.canvas, t + sprite.wobbleOffset, isMoving, sprite.fallbackColor, facing < 0);
      }
    });

    animationFrameId = window.requestAnimationFrame(tick);
  };

  animationFrameId = window.requestAnimationFrame(tick);
  window.addEventListener('beforeunload', () => {
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
  }, { once: true });
}

function drawCompositeToCanvas(entry, canvas, t, isMoving, fallbackColor, flip = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  if (!entry.layers.length) {
    drawFallbackSprite(canvas, fallbackColor, flip);
    return;
  }

  const frame = resolveFrameIndex(entry.frameCount, t, isMoving);
  const sx = frame * entry.frameWidth;
  const sy = 0;

  if (flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
  }

  for (const img of entry.layers) {
    ctx.drawImage(
      img,
      sx,
      sy,
      entry.frameWidth,
      entry.frameHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  if (flip) ctx.restore();
}

function resolveFrameIndex(frameCount, t, isMoving) {
  if (frameCount <= 1) return 0;

  if (frameCount >= 12) {
    if (isMoving) return Math.floor(t * 9) % Math.min(frameCount, 8);
    return 8 + (Math.floor(t * 2.5) % Math.max(1, frameCount - 8));
  }

  const fps = isMoving ? 7 : 2.5;
  return Math.floor(t * fps) % frameCount;
}

function drawFallbackSprite(canvas, color = '#79aefc', flip = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  if (flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
  }

  ctx.fillStyle = '#121c2a';
  ctx.fillRect(10, 3, 12, 9);
  ctx.fillStyle = '#e6c7ab';
  ctx.fillRect(11, 4, 10, 8);
  ctx.fillStyle = color;
  ctx.fillRect(8, 13, 16, 11);
  ctx.fillStyle = '#0c1118';
  ctx.fillRect(11, 24, 4, 6);
  ctx.fillRect(17, 24, 4, 6);

  if (flip) ctx.restore();
}

function renderStaffDetail() {
  const person = state?.staff.find((item) => item.id === activeStaffId);
  if (!person || !els.staffDetail) {
    if (els.staffDetail) els.staffDetail.textContent = 'Không có dữ liệu nhân sự.';
    return;
  }

  const manualZone = zoneForStaff(person);
  const behaviorZone = zoneForStaff({ ...person, zoneId: resolveBehaviorZone(person) });
  const projects = state.projects.filter((item) => item.ownerId === person.id || item.contributors.includes(person.id));
  const latestMessage = state.messages.find((msg) => msg.from === person.id || msg.to === person.id);

  els.staffDetail.innerHTML = `
    <div class="detail-hero">
      <div class="detail-sprite-preview">
        <canvas id="detailPreviewCanvas" width="32" height="32"></canvas>
      </div>
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <div class="muted">${escapeHtml(person.role || '')}</div>
      </div>
    </div>

    <div class="meta-grid pixel-grid">
      <div class="box"><span>Zone</span>${escapeHtml(behaviorZone.name || resolveBehaviorZone(person))}</div>
      <div class="box"><span>Projects</span>${projects.length}</div>
      <div class="box wide"><span>Status</span>${escapeHtml(person.status || '')}</div>
      <div class="box wide"><span>Manual zone</span>${escapeHtml(manualZone.name || person.zoneId || '')}</div>
    </div>

    <div class="project-tags">
      ${projects.map((project) => `<span class="tag">${escapeHtml(project.name)}</span>`).join('') || '<span class="tag">Chưa có dự án</span>'}
    </div>

    ${latestMessage ? `
      <div class="message-card focus-card">
        <div class="message-card-head">Trao đổi gần nhất</div>
        <p>${escapeHtml(latestMessage.text)}</p>
      </div>
    ` : ''}
  `;

  const previewCanvas = document.getElementById('detailPreviewCanvas');
  if (previewCanvas) prepareSprite(person.id, previewCanvas, person.color || '#79aefc');
}

function renderProjectList() {
  if (!els.projectList || !state) return;

  els.projectList.innerHTML = state.projects.map((project) => {
    const owner = state.staff.find((item) => item.id === project.ownerId);
    const contributors = Array.isArray(project.contributors)
      ? project.contributors
          .map((id) => state.staff.find((item) => item.id === id)?.name || id)
          .join(', ')
      : '';

    return `
      <article class="project-card">
        <div class="project-card-head">
          <h3>${escapeHtml(project.name)}</h3>
          <span class="tag ${healthClass(project.health)}">${escapeHtml(project.health || 'Normal')}</span>
        </div>
        <p>${escapeHtml(project.description || '')}</p>
        <div class="project-meta">
          <span class="tag">Owner: ${escapeHtml(owner ? owner.name : project.ownerId || 'N/A')}</span>
          ${project.type ? `<span class="tag">${escapeHtml(project.type)}</span>` : ''}
          ${project.stage ? `<span class="tag">${escapeHtml(project.stage)}</span>` : ''}
          ${contributors ? `<span class="tag">PIC: ${escapeHtml(contributors)}</span>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderMessages() {
  if (!els.messageList || !state) return;

  els.messageList.innerHTML = state.messages.slice(0, 8).map((message) => {
    const from = state.staff.find((item) => item.id === message.from);
    const to = state.staff.find((item) => item.id === message.to);
    const project = state.projects.find((item) => item.id === message.projectId);

    return `
      <article class="message-card">
        <div class="message-card-head">${escapeHtml(from ? from.name : message.from)} → ${escapeHtml(to ? to.name : message.to)}</div>
        <p>${escapeHtml(message.text || '')}</p>
        <div class="message-meta">
          ${project ? `<span class="tag">${escapeHtml(project.name)}</span>` : ''}
          <span class="tag">${formatDateTime(message.createdAt)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderStaffOptions() {
  if (!els.staffSelect || !els.zoneSelect || !state) return;

  const currentStaff = els.staffSelect.value;
  els.staffSelect.innerHTML = state.staff.map((person) => `<option value="${person.id}">${person.name}</option>`).join('');
  els.zoneSelect.innerHTML = ADMIN_ZONES.map((zone) => `<option value="${zone.id}">${zone.name}</option>`).join('');
  els.staffSelect.value = currentStaff || activeStaffId || state.staff[0]?.id || '';
  syncAdminFields();
  els.staffSelect.onchange = syncAdminFields;
}

function syncAdminFields() {
  const person = state?.staff.find((item) => item.id === els.staffSelect?.value);
  if (!person) return;

  if (els.statusInput) els.statusInput.value = person.status || '';
  if (els.zoneSelect) {
    const allowed = new Set(ADMIN_ZONES.map((z) => z.id));
    els.zoneSelect.value = allowed.has(person.zoneId) ? person.zoneId : 'governance';
  }
}

async function handleAdminSubmit(event) {
  event.preventDefault();

  const payload = {
    id: els.staffSelect?.value,
    status: els.statusInput?.value.trim() || '',
    zoneId: els.zoneSelect?.value || 'governance'
  };

  try {
    await api('/api/staff', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    activeStaffId = payload.id;
    await loadState();
  } catch (error) {
    alert(`Lưu thất bại: ${error.message}`);
  }
}

async function handleSimulate() {
  try {
    await api('/api/simulate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    await loadState();
  } catch (error) {
    alert(`Mô phỏng thất bại: ${error.message}`);
  }
}

async function handleReset() {
  if (!confirm('Reset dữ liệu về seed mặc định?')) return;

  try {
    await api('/api/reset', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    await loadState();
  } catch (error) {
    alert(`Reset thất bại: ${error.message}`);
  }
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = els.tokenInput?.value.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function api(path, options = {}) {
  if (!API_BASE || API_BASE.includes('YOUR-WORKER')) {
    throw new Error('Chưa cấu hình API_BASE trong index.html');
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function zoneForStaff(person) {
  const zoneId = normalizeZoneId(person.zoneId);
  const builtinNames = {
    governance: 'Governance',
    audit: 'Audit',
    defense: 'Defense',
    redteam: 'Red Team',
    warroom: 'War Room',
    relax: 'Relax'
  };

  return state?.zones?.find((item) => normalizeZoneId(item.id) === zoneId) || {
    x: 50,
    y: 50,
    name: builtinNames[zoneId] || person.zoneId
  };
}

function projectForStaff(staffId) {
  return state?.projects?.find((item) => item.ownerId === staffId || (Array.isArray(item.contributors) && item.contributors.includes(staffId)));
}

function projectLabel(staffId) {
  const project = projectForStaff(staffId);
  return project ? project.name : 'Chưa gán dự án';
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('vi-VN');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function healthClass(health) {
  const normalized = String(health || '').toLowerCase();
  if (normalized.includes('risk')) return 'status-risk';
  if (normalized.includes('attention')) return 'status-bad';
  return 'status-good';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

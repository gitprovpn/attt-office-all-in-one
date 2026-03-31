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
let lastRenderSignature = '';

bootstrap();

async function bootstrap() {
  bindEvents();
  await loadState();
  startSpriteLoop();
}

function bindEvents() {
  els.refreshBtn.addEventListener('click', loadState);
  els.simulateBtn.addEventListener('click', handleSimulate);
  els.resetBtn.addEventListener('click', handleReset);
  els.adminForm.addEventListener('submit', handleAdminSubmit);
}

async function loadState() {
  try {
    const data = await api('/api/state');
    state = data;
    if (!activeStaffId && state.staff.length) activeStaffId = state.staff[0].id;
    render();
  } catch (error) {
    els.staffDetail.innerHTML = `<div class="status-bad">Không tải được dữ liệu từ Worker: ${escapeHtml(error.message)}</div>`;
  }
}

function render() {
  renderSprites();
  renderStaffOptions();
  renderProjectList();
  renderMessages();
  renderStaffDetail();
  els.projectCount.textContent = `${state.projects.length} dự án`;
  els.lastUpdated.textContent = `Updated: ${formatDateTime(state.meta.lastUpdated)}`;
}

function renderSprites() {
  const signature = JSON.stringify(
    state.staff.map((person) => ({
      id: person.id,
      zoneId: person.zoneId,
      status: person.status,
      active: person.id === activeStaffId,
      project: projectForStaff(person.id)?.id || ''
    }))
  );

  if (signature !== lastRenderSignature) {
    els.spriteLayer.innerHTML = '';
    spriteState.clear();

    state.staff.forEach((person, index) => {
      const zone = zoneForStaff(person);
      const root = document.createElement('button');
      root.type = 'button';
      root.className = `agent-sprite ${person.id === activeStaffId ? 'active' : ''}`;
      root.dataset.staffId = person.id;
      root.style.left = `calc(${zone.x}% + ${zoneOffsetX(index)}px)`;
      root.style.top = `calc(${zone.y}% + ${zoneOffsetY(index)}px)`;

      const badge = document.createElement('div');
      badge.className = 'agent-badge';
      badge.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(projectLabel(person.id))}</span>`;

      const shadow = document.createElement('div');
      shadow.className = 'agent-shadow';

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'agent-canvas-wrap';

      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      canvas.className = 'agent-canvas';
      canvasWrap.appendChild(canvas);

      const pin = document.createElement('div');
      pin.className = 'agent-pin';
      pin.style.setProperty('--agent-accent', person.color || '#79aefc');

      root.appendChild(badge);
      root.appendChild(canvasWrap);
      root.appendChild(shadow);
      root.appendChild(pin);
      els.spriteLayer.appendChild(root);

      root.addEventListener('click', () => {
        activeStaffId = person.id;
        render();
      });

      prepareSprite(person.id, canvas, person.color);

      spriteState.set(person.id, {
        canvas,
        root,
        wobbleOffset: index * 0.55,
        accent: person.color || '#79aefc',
        fallbackColor: person.color || '#79aefc'
      });
    });

    lastRenderSignature = signature;
  } else {
    state.staff.forEach((person) => {
      const node = els.spriteLayer.querySelector(`[data-staff-id="${person.id}"]`);
      if (!node) return;
      node.classList.toggle('active', person.id === activeStaffId);
      const badge = node.querySelector('.agent-badge');
      if (badge) {
        badge.innerHTML = `<strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(projectLabel(person.id))}</span>`;
      }
    });
  }
}

function prepareSprite(staffId, canvas, fallbackColor) {
  const key = staffId;
  const existing = spriteCache.get(key);
  if (existing) {
    existing.canvases.add(canvas);
    if (!existing.loading) drawCompositeToCanvas(existing, canvas, performance.now() / 1000, fallbackColor);
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
  spriteCache.set(key, entry);

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
      entry.canvases.forEach((item) => drawCompositeToCanvas(entry, item, performance.now() / 1000, fallbackColor));
    })
    .catch(() => {
      entry.loading = false;
      entry.failed = true;
      entry.canvases.forEach((item) => drawFallbackSprite(item, fallbackColor));
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
      if (!entry) return;
      if (entry.failed) {
        drawFallbackSprite(sprite.canvas, sprite.fallbackColor);
      } else if (!entry.loading) {
        drawCompositeToCanvas(entry, sprite.canvas, t + sprite.wobbleOffset, sprite.fallbackColor);
      }

      const hop = Math.sin(t * 2.1 + sprite.wobbleOffset) * 2;
      sprite.root.style.transform = `translate(-50%, -50%) translateY(${hop.toFixed(2)}px)`;
    });

    animationFrameId = window.requestAnimationFrame(tick);
  };

  animationFrameId = window.requestAnimationFrame(tick);
  window.addEventListener('beforeunload', () => {
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
  }, { once: true });
}

function drawCompositeToCanvas(entry, canvas, t, fallbackColor) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  if (!entry.layers.length) {
    drawFallbackSprite(canvas, fallbackColor);
    return;
  }

  const frame = resolveFrameIndex(entry.frameCount, t);
  const sx = frame * entry.frameWidth;
  const sy = 0;

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
}

function resolveFrameIndex(frameCount, t) {
  if (frameCount <= 1) return 0;
  const fps = frameCount >= 8 ? 7 : 4;
  const index = Math.floor(t * fps) % frameCount;
  return index;
}

function drawFallbackSprite(canvas, color = '#79aefc') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#121c2a';
  ctx.fillRect(10, 3, 12, 9);
  ctx.fillStyle = '#e6c7ab';
  ctx.fillRect(11, 4, 10, 8);
  ctx.fillStyle = color;
  ctx.fillRect(8, 13, 16, 11);
  ctx.fillStyle = '#0c1118';
  ctx.fillRect(11, 24, 4, 6);
  ctx.fillRect(17, 24, 4, 6);
}

function zoneForStaff(person) {
  const zone = state.zones.find((item) => item.id === person.zoneId);
  return zone || { x: 50, y: 50, name: person.zoneId };
}

function zoneOffsetX(index) {
  const pattern = [-14, 12, -10, 10, -6, 8];
  return pattern[index % pattern.length];
}

function zoneOffsetY(index) {
  const pattern = [8, -4, 5, -8, 10, -6];
  return pattern[index % pattern.length];
}

function renderStaffDetail() {
  const person = state.staff.find((item) => item.id === activeStaffId);
  if (!person) {
    els.staffDetail.textContent = 'Không có dữ liệu nhân sự.';
    return;
  }

  const zone = zoneForStaff(person);
  const projects = state.projects.filter((item) => item.ownerId === person.id || item.contributors.includes(person.id));
  const latestMessage = state.messages.find((msg) => msg.from === person.id || msg.to === person.id);

  els.staffDetail.innerHTML = `
    <div class="detail-hero">
      <div class="detail-sprite-preview" style="--agent-accent:${escapeHtml(person.color || '#79aefc')}">
        <canvas id="detailPreviewCanvas" width="32" height="32"></canvas>
      </div>
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <div class="muted">${escapeHtml(person.role)}</div>
      </div>
    </div>

    <div class="meta-grid pixel-grid">
      <div class="box"><span>Zone</span>${escapeHtml(zone.name || person.zoneId)}</div>
      <div class="box"><span>Projects</span>${projects.length}</div>
      <div class="box wide"><span>Status</span>${escapeHtml(person.status)}</div>
      <div class="box wide"><span>Latest chat</span>${latestMessage ? formatDateTime(latestMessage.createdAt) : 'N/A'}</div>
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
  els.projectList.innerHTML = state.projects.map((project) => {
    const owner = state.staff.find((item) => item.id === project.ownerId);
    const contributors = project.contributors
      .map((id) => state.staff.find((item) => item.id === id)?.name || id)
      .join(', ');

    return `
      <article class="project-card">
        <div class="project-card-head">
          <h3>${escapeHtml(project.name)}</h3>
          <span class="tag ${healthClass(project.health)}">${escapeHtml(project.health)}</span>
        </div>
        <p>${escapeHtml(project.description)}</p>
        <div class="project-meta">
          <span class="tag">Owner: ${escapeHtml(owner ? owner.name : project.ownerId)}</span>
          <span class="tag">${escapeHtml(project.type)}</span>
          <span class="tag">${escapeHtml(project.stage)}</span>
          ${contributors ? `<span class="tag">PIC: ${escapeHtml(contributors)}</span>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderMessages() {
  els.messageList.innerHTML = state.messages.slice(0, 8).map((message) => {
    const from = state.staff.find((item) => item.id === message.from);
    const to = state.staff.find((item) => item.id === message.to);
    const project = state.projects.find((item) => item.id === message.projectId);
    return `
      <article class="message-card">
        <div class="message-card-head">${escapeHtml(from ? from.name : message.from)} → ${escapeHtml(to ? to.name : message.to)}</div>
        <p>${escapeHtml(message.text)}</p>
        <div class="message-meta">
          <span class="tag">${escapeHtml(project ? project.name : message.projectId)}</span>
          <span class="tag">${formatDateTime(message.createdAt)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderStaffOptions() {
  const currentStaff = els.staffSelect.value;
  els.staffSelect.innerHTML = state.staff.map((person) => `<option value="${person.id}">${person.name}</option>`).join('');
  els.zoneSelect.innerHTML = state.zones.map((zone) => `<option value="${zone.id}">${zone.name}</option>`).join('');
  els.staffSelect.value = currentStaff || activeStaffId || state.staff[0].id;
  syncAdminFields();
  els.staffSelect.onchange = syncAdminFields;
}

function syncAdminFields() {
  const person = state.staff.find((item) => item.id === els.staffSelect.value);
  if (!person) return;
  els.statusInput.value = person.status || '';
  els.zoneSelect.value = person.zoneId;
}

async function handleAdminSubmit(event) {
  event.preventDefault();
  const payload = {
    id: els.staffSelect.value,
    status: els.statusInput.value.trim(),
    zoneId: els.zoneSelect.value
  };

  try {
    await api('/api/staff', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    await loadState();
    activeStaffId = payload.id;
    render();
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
  const token = els.tokenInput.value.trim();
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

function projectForStaff(staffId) {
  return state.projects.find((item) => item.ownerId === staffId || item.contributors.includes(staffId));
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

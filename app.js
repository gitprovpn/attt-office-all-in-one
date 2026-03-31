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

let state = null;
let activeStaffId = null;

bootstrap();

async function bootstrap() {
  bindEvents();
  await loadState();
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
  const zoneMap = Object.fromEntries(state.zones.map((zone) => [zone.id, zone]));
  els.spriteLayer.innerHTML = state.staff.map((person, index) => {
    const zone = zoneMap[person.zoneId] || { x: 50, y: 50 };
    const offset = (index % 2 === 0 ? -1 : 1) * 1.6;
    const top = `calc(${zone.y}% + ${offset}px)`;
    const left = `calc(${zone.x}% + ${offset * 2}px)`;
    const project = state.projects.find((item) => item.ownerId === person.id || item.contributors.includes(person.id));
    const labelProject = project ? project.name : 'Chưa gán dự án';
    return `
      <button class="sprite ${person.id === activeStaffId ? 'active' : ''}" data-staff-id="${person.id}" style="top:${top};left:${left}">
        <div class="sprite-label"><strong>${escapeHtml(person.name)}</strong>${escapeHtml(labelProject)}</div>
        <div class="sprite-body" style="background:${person.color}"></div>
      </button>
    `;
  }).join('');

  els.spriteLayer.querySelectorAll('.sprite').forEach((node) => {
    node.addEventListener('click', () => {
      activeStaffId = node.dataset.staffId;
      renderSprites();
      renderStaffDetail();
      els.staffSelect.value = activeStaffId;
    });
  });
}

function renderStaffDetail() {
  const person = state.staff.find((item) => item.id === activeStaffId);
  if (!person) {
    els.staffDetail.textContent = 'Không có dữ liệu nhân sự.';
    return;
  }
  const zone = state.zones.find((item) => item.id === person.zoneId);
  const projects = state.projects.filter((item) => item.ownerId === person.id || item.contributors.includes(person.id));
  const latestMessage = state.messages.find((msg) => msg.from === person.id || msg.to === person.id);
  els.staffDetail.innerHTML = `
    <div class="staff-name">
      <div class="avatar" style="background:${person.color}">${escapeHtml(person.avatar || person.name[0])}</div>
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <div class="muted">${escapeHtml(person.role)}</div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="box"><span>Zone</span>${escapeHtml(zone ? zone.name : person.zoneId)}</div>
      <div class="box"><span>Projects</span>${projects.length}</div>
      <div class="box"><span>Status</span>${escapeHtml(person.status)}</div>
      <div class="box"><span>Latest chat</span>${latestMessage ? formatDateTime(latestMessage.createdAt) : 'N/A'}</div>
    </div>
    <div class="project-tags">
      ${projects.map((project) => `<span class="tag">${escapeHtml(project.name)}</span>`).join('') || '<span class="tag">Chưa có dự án</span>'}
    </div>
    ${latestMessage ? `<div class="project-item" style="margin-top:12px;"><h3>Trao đổi gần nhất</h3><p>${escapeHtml(latestMessage.text)}</p></div>` : ''}
  `;
}

function renderProjectList() {
  els.projectList.innerHTML = state.projects.map((project) => {
    const owner = state.staff.find((item) => item.id === project.ownerId);
    return `
      <article class="project-item">
        <h3>${escapeHtml(project.name)}</h3>
        <p>${escapeHtml(project.description)}</p>
        <div class="project-meta">
          <span class="tag">Owner: ${escapeHtml(owner ? owner.name : project.ownerId)}</span>
          <span class="tag">${escapeHtml(project.type)}</span>
          <span class="tag">${escapeHtml(project.stage)}</span>
          <span class="tag ${healthClass(project.health)}">${escapeHtml(project.health)}</span>
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
      <article class="message-item">
        <p>${escapeHtml(message.text)}</p>
        <div class="message-meta">
          <span class="tag">${escapeHtml(from ? from.name : message.from)} → ${escapeHtml(to ? to.name : message.to)}</span>
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
    throw new Error('Chưa cấu hình API_BASE trong frontend/index.html');
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
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

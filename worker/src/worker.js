import seed from '../data/seed.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'ATTT Office Worker', timestamp: new Date().toISOString() });
      }

      if (url.pathname === '/api/state' && request.method === 'GET') {
        const state = await loadState(env);
        return json(state);
      }

      if (url.pathname === '/api/reset' && request.method === 'POST') {
        assertAdmin(request, env);
        await saveState(env, clone(seed));
        return json({ ok: true, message: 'State reset to seed data.' });
      }

      if (url.pathname === '/api/staff' && request.method === 'POST') {
        assertAdmin(request, env);
        const payload = await request.json();
        const state = await loadState(env);
        const idx = state.staff.findIndex((item) => item.id === payload.id);
        if (idx === -1) return json({ ok: false, error: 'Staff not found.' }, 404);
        state.staff[idx] = { ...state.staff[idx], ...payload };
        state.meta.lastUpdated = new Date().toISOString();
        await saveState(env, state);
        return json({ ok: true, item: state.staff[idx] });
      }

      if (url.pathname === '/api/projects' && request.method === 'POST') {
        assertAdmin(request, env);
        const payload = await request.json();
        const state = await loadState(env);
        const idx = state.projects.findIndex((item) => item.id === payload.id);
        if (idx >= 0) {
          state.projects[idx] = { ...state.projects[idx], ...payload };
        } else {
          state.projects.unshift(payload);
        }
        state.meta.lastUpdated = new Date().toISOString();
        await saveState(env, state);
        return json({ ok: true, item: payload });
      }

      if (url.pathname === '/api/messages' && request.method === 'POST') {
        assertAdmin(request, env);
        const payload = await request.json();
        const state = await loadState(env);
        const message = {
          id: payload.id || `m-${crypto.randomUUID()}`,
          from: payload.from,
          to: payload.to,
          projectId: payload.projectId,
          text: payload.text,
          createdAt: payload.createdAt || new Date().toISOString()
        };
        state.messages.unshift(message);
        state.meta.lastUpdated = new Date().toISOString();
        await saveState(env, state);
        return json({ ok: true, item: message });
      }

      if (url.pathname === '/api/simulate' && request.method === 'POST') {
        assertAdmin(request, env);
        const state = await loadState(env);
        const next = generateSimulation(state);
        state.messages.unshift(next.message);
        state.staff = state.staff.map((person) => person.id === next.staff.id ? next.staff : person);
        state.meta.lastUpdated = new Date().toISOString();
        await saveState(env, state);
        return json({ ok: true, message: next.message, staff: next.staff });
      }

      return json({ ok: false, error: 'Not found' }, 404);
    } catch (error) {
      return json({ ok: false, error: error.message || 'Unexpected error' }, error.status || 500);
    }
  }
};

function assertAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) {
    return;
  }
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (token !== expected) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

async function loadState(env) {
  if (env.OFFICE_KV) {
    const raw = await env.OFFICE_KV.get('state', 'json');
    if (raw) return raw;
    const initial = clone(seed);
    await env.OFFICE_KV.put('state', JSON.stringify(initial));
    return initial;
  }
  return clone(seed);
}

async function saveState(env, state) {
  if (env.OFFICE_KV) {
    await env.OFFICE_KV.put('state', JSON.stringify(state));
  }
}

function generateSimulation(state) {
  const staff = pick(state.staff);
  const projectId = pick(staff.projectIds);
  const project = state.projects.find((item) => item.id === projectId) || state.projects[0];
  const peerId = pick(state.staff.filter((item) => item.id !== staff.id)).id;
  const actionTemplates = [
    `Đang cập nhật tiến độ cho dự án ${project.name}`,
    `Đang phối hợp rà soát bằng chứng cho ${project.name}`,
    `Đang follow-up owner của dự án ${project.name}`,
    `Đang chuẩn hóa trạng thái và next action cho ${project.name}`
  ];
  const messageTemplates = [
    `Mình vừa cập nhật trạng thái mới cho ${project.name}, nhờ bạn review giúp phần next action.`,
    `Cho mình confirm lại owner và ETA của ${project.name} để mình chốt dashboard nhé.`,
    `Mình đã đẩy bản cập nhật của ${project.name}, bạn xem lại giúp mình evidence còn thiếu nhé.`,
    `Phần việc của ${project.name} đã rõ hơn rồi, mình sẽ theo dõi tiếp các hạng mục ưu tiên cao.`
  ];

  const updatedStaff = { ...staff, status: pick(actionTemplates) };
  const message = {
    id: `m-${crypto.randomUUID()}`,
    from: staff.id,
    to: peerId,
    projectId: project.id,
    text: pick(messageTemplates),
    createdAt: new Date().toISOString()
  };

  return { staff: updatedStaff, message };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS
    }
  });
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

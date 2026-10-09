// 해 뜨는 집 — 예약 API (저장소는 밖에서 넣어 줘요: Netlify Blobs 또는 시험용 가짜 저장소)
import crypto from 'node:crypto';

export const CONFIG = {
  closedWeekday: 3, // 수요일 휴무
  winterMonths: [12, 1, 2],
  minDays: 2, // 최소 2일 전 신청
  maxAdvanceDays: 90,
  types: { class: '강습', rental: '장비 대여', tour: '체험' },
  classCourses: ['물 적응 · 물 공포 완화', '스노클링', '입문 프리다이빙', '고급 프리다이빙', '서핑', '수중 안전 교육'],
  tourCourses: ['얕은 곳 · 불가사리 마을 산책', '중간 깊이 · 해초 숲 거북이 마중', '깊은 곳 · 푸른 벼랑과 고래 노래'],
  items: ['마스크', '스노클', '오리발', '구명조끼', '래시가드', '웨트슈트', '서프보드'],
  slots: {
    class: { normal: ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'], winter: ['11:00', '13:00', '14:00', '15:00'] },
    tour: { normal: ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'], winter: ['11:00', '13:00', '14:00', '15:00'] },
  },
};
const LEVELS = ['상', '중', '하'];
const LEARNED = ['있어요', '없어요'];
const STATUSES = ['접수', '확정', '취소'];
const MAX_RESERVATIONS = 3000;

const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}
const isWinter = (d) => CONFIG.winterMonths.includes(d.getUTCMonth() + 1);
function str(v, max, required = true) {
  if (typeof v !== 'string') v = v == null ? '' : String(v);
  v = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  if (required && !v) return null;
  if (v.length > max) return null;
  return v;
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validate(b) {
  if (!b || typeof b !== 'object') return { error: '요청이 올바르지 않아요.' };
  const type = b.type;
  if (!CONFIG.types[type]) return { error: '예약 종류가 올바르지 않아요.' };
  const name = str(b.name, 20);
  if (!name) return { error: '이름(성명)을 적어 주세요.' };

  const d = parseDate(b.date);
  if (!d) return { error: '날짜를 골라 주세요.' };
  const today = parseDate(todayKST());
  const diff = Math.round((d - today) / 86400e3);
  if (diff < CONFIG.minDays) return { error: '예약은 최소 2일 전에 신청해야 해요.' };
  if (diff > CONFIG.maxAdvanceDays) return { error: `${CONFIG.maxAdvanceDays}일 이내로만 예약할 수 있어요.` };
  if (d.getUTCDay() === CONFIG.closedWeekday) return { error: '수요일은 쉬는 날이에요.' };

  const r = { type, name, date: b.date, course: '', slot: '', species: '', learned: '', level: '', note: '', items: [], size: '' };
  if (type === 'rental') {
    const items = Array.isArray(b.items) ? [...new Set(b.items)] : [];
    if (!items.length || !items.every((i) => CONFIG.items.includes(i))) return { error: '빌려갈 품목을 하나 이상 골라 주세요.' };
    r.items = items;
    const size = str(b.size, 80, false);
    if (size === null) return { error: '사이즈 메모가 너무 길어요. (80자 이내)' };
    r.size = size; r.course = '장비 대여'; r.slot = '-';
  } else {
    const species = str(b.species, 20);
    if (!species) return { error: '종족을 적어 주세요.' };
    r.species = species;
    const list = type === 'class' ? CONFIG.classCourses : CONFIG.tourCourses;
    if (!list.includes(b.course)) return { error: '코스를 골라 주세요.' };
    r.course = b.course;
    const slots = CONFIG.slots[type][isWinter(d) ? 'winter' : 'normal'];
    if (!slots.includes(b.slot)) return { error: '시간을 다시 골라 주세요.' };
    r.slot = b.slot;
    if (!LEARNED.includes(b.learned)) return { error: '수영을 배운 적이 있는지 골라 주세요.' };
    if (!LEVELS.includes(b.level)) return { error: '수영 실력(상·중·하)을 골라 주세요.' };
    r.learned = b.learned; r.level = b.level;
    const note = str(b.note, 300);
    if (!note) return { error: "기타 사항을 적어 주세요. 없으면 '없음'이라고 적어 주세요." };
    r.note = note;
  }
  return { r };
}

// 공개 명단에는 기타 사항·수영 실력 같은 개인적인 내용을 빼고 내려보냄
const publicView = (r) => ({ type: r.type, name: r.name, species: r.species, course: r.course, items: r.items, size: r.size, date: r.date, slot: r.slot, status: r.status });

/**
 * store: { all(): Promise<record[]>, get(id), put(record), remove(id), count() }
 * env:   { ADMIN_PASSWORD }
 */
export function createHandler({ store, env }) {
  const limits = new Map(); // 서버가 쉬었다 깨면 초기화되는 임시 제한 (보조 수단)
  function limited(key, max, windowMs) {
    const now = Date.now();
    const arr = (limits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { limits.set(key, arr); return true; }
    arr.push(now); limits.set(key, arr); return false;
  }

  const password = () => env.ADMIN_PASSWORD || '';
  const tokenKey = () => sha('hj-token-v1:' + password());
  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto.createHmac('sha256', tokenKey()).update(body).digest('base64url');
    return body + '.' + mac;
  }
  function verify(token) {
    if (!password()) return false;
    const [body, mac] = String(token).split('.');
    if (!body || !mac) return false;
    const want = crypto.createHmac('sha256', tokenKey()).update(body).digest('base64url');
    const a = Buffer.from(mac), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return typeof p.exp === 'number' && p.exp > Date.now(); }
    catch (e) { return false; }
  }
  const authed = (req) => { const m = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || ''); return !!m && verify(m[1]); };

  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  async function readJson(req) {
    const text = await req.text();
    if (text.length > 20000) throw new Error('too large');
    return text ? JSON.parse(text) : {};
  }

  return async function handle(req, { ip } = {}) {
    const who = ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    const p = (new URL(req.url).pathname.replace(/\/+$/, '') || '/');
    try {
      if (p === '/api/config' && req.method === 'GET') return json(200, CONFIG);

      // 공개 명단 (취소된 예약은 빼고)
      if (p === '/api/reservations' && req.method === 'GET') {
        const all = await store.all();
        return json(200, { items: all.filter((r) => r.status !== '취소').map(publicView) });
      }

      // 예약하기
      if (p === '/api/reservations' && req.method === 'POST') {
        if (limited('post:' + who, 20, 3600e3)) return json(429, { error: '잠시 후 다시 시도해 주세요.' });
        const body = await readJson(req);
        if (body && body.website) return json(201, { code: 'HJ-000000' }); // 스팸 봇용 미끼 칸
        if ((await store.count()) >= MAX_RESERVATIONS) return json(503, { error: '지금은 예약을 받을 수 없어요.' });
        const { r, error } = validate(body);
        if (error) return json(400, { error });
        r.id = crypto.randomBytes(4).toString('hex');
        r.code = 'HJ-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        r.status = '접수';
        r.createdAt = new Date().toISOString();
        await store.put(r);
        return json(201, { code: r.code });
      }

      // 카냐 로그인
      if (p === '/api/admin/login' && req.method === 'POST') {
        if (!password()) return json(503, { error: '카냐 비밀번호(ADMIN_PASSWORD)가 아직 설정되지 않았어요.' });
        if (limited('login:' + who, 8, 600e3)) return json(429, { error: '시도가 너무 많아요. 10분 뒤에 다시 해 주세요.' });
        const body = await readJson(req);
        if (!safeEqual(body.password || '', password())) { await sleep(600); return json(401, { error: '비밀번호가 맞지 않아요.' }); }
        return json(200, { token: sign({ exp: Date.now() + 8 * 3600e3 }) });
      }

      if (p.startsWith('/api/admin/')) {
        if (!authed(req)) return json(401, { error: '로그인이 필요해요.' });
        if (p === '/api/admin/reservations' && req.method === 'GET') return json(200, { items: await store.all() });
        const m = /^\/api\/admin\/reservations\/([0-9a-f]{8})$/.exec(p);
        if (m) {
          const rec = await store.get(m[1]);
          if (!rec) return json(404, { error: '없는 예약이에요.' });
          if (req.method === 'PATCH') {
            const body = await readJson(req);
            if (!STATUSES.includes(body.status)) return json(400, { error: '상태가 올바르지 않아요.' });
            rec.status = body.status; await store.put(rec);
            return json(200, { ok: true });
          }
          if (req.method === 'DELETE') { await store.remove(m[1]); return json(200, { ok: true }); }
        }
        return json(404, { error: 'Not found' });
      }

      return json(404, { error: 'Not found' });
    } catch (e) {
      return json(400, { error: '요청을 처리할 수 없어요.' });
    }
  };
}

// Netlify Function: /api/* 로 들어오는 요청을 처리하고, 예약은 Netlify Blobs 에 저장해요.
import { getStore } from '@netlify/blobs';
import { createHandler } from '../lib/handler.mjs';

// 예약 하나가 저장소의 항목 하나예요. 동시에 예약해도 서로 덮어쓰지 않아요.
// 예약 직후 명단에 바로 보이도록 항상 '강한 일관성'으로 읽어요.
const open = () => getStore({ name: 'reservations', consistency: 'strong' });

const store = {
  async all() {
    const s = open();
    const { blobs } = await s.list();
    const rows = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' })));
    return rows.filter(Boolean);
  },
  async count() { const { blobs } = await open().list(); return blobs.length; },
  async get(id) { return open().get(id, { type: 'json' }); },
  async put(rec) { await open().setJSON(rec.id, rec); },
  async remove(id) { await open().delete(id); },
};

const handle = createHandler({ store, env: process.env });

export default async (req, context) => handle(req, { ip: context && context.ip });

export const config = { path: '/api/*' };

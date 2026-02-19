import { Hono } from 'hono';
import { getDb } from '../../shared/db';

const health = new Hono();

health.get('/', (c) => {
  try {
    getDb().query('SELECT 1').get();
    return c.json({ status: 'ok', db: 'ok', ts: new Date().toISOString() });
  } catch (err) {
    return c.json({ status: 'error', db: String(err) }, 500);
  }
});

export default health;

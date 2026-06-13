import 'dotenv/config'
import pool from './postgres.js'
import redis from './redis.js'

const STATUSES = ['free', 'free', 'free', 'occupied', 'occupied', 'away', 'abandoned'];

async function mock() {
  console.log('Generating mock data...')
  
  // ensure we're connected to redis
  await redis.connect().catch(e => console.log('Redis already connected or error', e));
  
  const { rows } = await pool.query('SELECT id FROM desks');
  let count = 0;
  
  const AWAY_TTL = parseInt(process.env.AWAY_TTL_SECONDS || '1200', 10);
  const CHECKIN_TTL = parseInt(process.env.CHECKIN_TTL_SECONDS || '7200', 10);
  
  for (const desk of rows) {
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    let checkin_at = null;
    let away_at = null;
    
    // Clear redis keys for this desk
    await redis.del(`away:${desk.id}`);
    await redis.del(`checkin:${desk.id}`);
    await redis.del(`grace:${desk.id}`);
    
    if (status !== 'free') {
      const checkinMinsAgo = Math.floor(Math.random() * 120) + 10;
      checkin_at = new Date(Date.now() - checkinMinsAgo * 60000);
      
      if (status === 'away') {
        const awayMinsAgo = Math.floor(Math.random() * 15) + 1;
        away_at = new Date(Date.now() - awayMinsAgo * 60000);
        
        const elapsed = Math.floor((Date.now() - away_at.getTime()) / 1000);
        const remaining = Math.max(AWAY_TTL - elapsed, 1);
        await redis.set(`away:${desk.id}`, '1', 'EX', remaining);
      } else if (status === 'abandoned') {
        const awayMinsAgo = Math.floor(Math.random() * 30) + 20; 
        away_at = new Date(Date.now() - awayMinsAgo * 60000);
      } else if (status === 'occupied') {
        const elapsed = Math.floor((Date.now() - checkin_at.getTime()) / 1000);
        const remaining = Math.max(CHECKIN_TTL - elapsed, 1);
        await redis.set(`checkin:${desk.id}`, '1', 'EX', remaining);
      }
    }

    await pool.query(
      'UPDATE desks SET status = $1, checkin_at = $2, away_at = $3, state_at = NOW() WHERE id = $4',
      [status, checkin_at, away_at, desk.id]
    );
    count++;
  }
  
  console.log(`Successfully added mock data for ${count} desks!`)
  process.exit(0)
}

mock().catch(err => {
  console.error('Mock failed:', err)
  process.exit(1)
})

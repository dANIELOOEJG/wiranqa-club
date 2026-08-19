const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());

// Conexión a PostgreSQL en la nube (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) return console.error('❌ Error conectando a PostgreSQL:', err.stack);
  console.log('✅ Conectado a PostgreSQL (Supabase)');
  release();
});

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'WIRANQA Backend running' });
});

// Obtener puntos de un usuario
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const result = await pool.query('SELECT points FROM users WHERE device_id = $1', [deviceId]);
    if (result.rows.length === 0) return res.json({ points: 0 });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Escanear QR
app.post('/api/scan', async (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const bottleResult = await pool.query('SELECT * FROM bottles WHERE unique_code = $1', [code]);
    if (bottleResult.rows.length === 0) {
      return res.status(404).json({ message: '❌ Esta WIRANQA no pertenece a nuestro lote.' });
    }
    
    const bottle = bottleResult.rows[0];
    if (bottle.is_redeemed) {
      return res.status(400).json({ message: '⚠️ Esta WIRANQA ya fue disfrutada.' });
    }

    await pool.query(
      `UPDATE bottles SET is_redeemed = true, redeemed_by = $1, redeemed_at = NOW() WHERE id = $2`,
      [deviceId, bottle.id]
    );

    const userResult = await pool.query(
      `INSERT INTO users (device_id, points) VALUES ($1, 1) ON CONFLICT (device_id) DO UPDATE SET points = users.points + 1 RETURNING points`,
      [deviceId]
    );

    res.json({ 
      success: true, 
      message: `✅ ¡Has ganado 1 estrella!`, 
      data: userResult.rows[0] 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
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

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'WIRANQA Backend running' });
});

// --- RUTAS DE USUARIO Y ESCANEO ---

// Obtener puntos de un usuario
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const result = await pool.query('SELECT points FROM users WHERE device_id = $1', [deviceId]);
    if (result.rows.length === 0) return res.json({ points: 0 });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error en /api/user:', err.message);
    res.status(500).json({ error: 'Error al obtener puntos', details: err.message });
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
    console.error('❌ Error en /api/scan:', err.message);
    res.status(500).json({ error: 'Error al procesar el escaneo', details: err.message });
  }
});

// --- RUTAS DE CATÁLOGO Y CANJE DE PREMIOS ---

// Obtener lista de premios activos
app.get('/api/rewards', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rewards WHERE is_active = true');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error en /api/rewards:', err.message);
        res.status(500).json({ error: 'Error al cargar premios', details: err.message });
    }
});

// Canjear un premio
app.post('/api/redeem', async (req, res) => {
    const { deviceId, rewardId } = req.body;
    if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

    try {
        // 1. Obtener el costo del premio
        const rewardResult = await pool.query('SELECT cost FROM rewards WHERE id = $1 AND is_active = true', [rewardId]);
        if (rewardResult.rows.length === 0) {
            return res.status(404).json({ message: 'Premio no disponible' });
        }
        const cost = rewardResult.rows[0].cost;

        // 2. Verificar saldo del usuario
        const userResult = await pool.query('SELECT points FROM users WHERE device_id = $1', [deviceId]);
        if (userResult.rows.length === 0 || userResult.rows[0].points < cost) {
            return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });
        }

        // 3. Descontar puntos
        await pool.query(
            'UPDATE users SET points = points - $1 WHERE device_id = $2',
            [cost, deviceId]
        );

        // 4. Devolver nuevo saldo
        const newBalance = await pool.query('SELECT points FROM users WHERE device_id = $1', [deviceId]);
        res.json({ 
            success: true, 
            message: `🎉 ¡Has canjeado tu premio! Te quedan ${newBalance.rows[0].points} estrellas.`,
            data: newBalance.rows[0]
        });

    } catch (err) {
        console.error('❌ Error en /api/redeem:', err.message);
        res.status(500).json({ error: 'Error al canjear el premio', details: err.message });
    }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
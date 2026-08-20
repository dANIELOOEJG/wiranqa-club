const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE SEGURIDAD Y CORS (SOLUCIÓN DEFINITIVA) ---
app.use(helmet({ crossOriginResourcePolicy: false }));

// Middleware CORS manual (Permite cualquier origen y soluciona el error 400)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware para parsear JSON (Aumentamos el límite para evitar errores de carga)
app.use(express.json({ limit: '10mb' }));

// --- CONEXIÓN A SUPABASE ---
const supabaseUrl = 'https://qwjjrwiurhyoszhlsdgd.supabase.co';
const supabaseKey = 'sb_publishable_mnBY2b4fmjt9NdwmtBBt2A_L-avhMjm';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  headers: { 'apikey': supabaseKey }
});

console.log('✅ Conectado a Supabase vía API REST');

// --- FUNCIÓN AUXILIAR PARA CALCULAR NIVELES ---
const getLevel = (points) => {
  if (points >= 100) return { title: 'LEYENDA AYACUCHANA', emoji: '🏆', notification: '🎉 ¡Has alcanzado el nivel máximo! Eres una leyenda.' };
  if (points >= 50) return { title: 'MAESTRO WIRANQERO', emoji: '🍺', notification: '🔥 ¡Eres un Maestro WIRANQERO! Sigue así.' };
  if (points >= 25) return { title: 'WIRANQERO EXPERTO', emoji: '⭐', notification: '🌟 ¡Has llegado a Experto! Cada vez más cerca de la leyenda.' };
  if (points >= 10) return { title: 'WIRANQERO NOVATO', emoji: '🌱', notification: '🌱 ¡Bienvenido al club! Sigue escaneando para subir de nivel.' };
  return { title: 'Descubre WIRANQA', emoji: '🍺', notification: '🍺 Escanea tu primera botella y comienza tu viaje.' };
};

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'WIRANQA Backend running' });
});

// --- RUTAS DE USUARIO Y ESCANEO ---

// Obtener puntos y nivel de un usuario
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }
    
    const points = data ? data.points : 0;
    const levelInfo = getLevel(points);
    
    res.json({ points, level: levelInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Escanear QR
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const deviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';

  if (!code || !deviceId) {
    return res.status(400).json({ message: 'Datos incompletos' });
  }

  try {
    // 1. Verificar si la botella existe y no ha sido canjeada
    const { data: bottle, error: bottleError } = await supabase
      .from('bottles')
      .select('*')
      .eq('unique_code', code)
      .single();

    if (bottleError || !bottle) {
      return res.status(404).json({ message: '❌ Esta WIRANQA no pertenece a nuestro lote.' });
    }

    if (bottle.is_redeemed) {
      return res.status(400).json({ message: '⚠️ Esta WIRANQA ya fue disfrutada.' });
    }

    // 2. Marcar la botella como usada
    const { error: updateError } = await supabase
      .from('bottles')
      .update({ is_redeemed: true, redeemed_by: deviceId, redeemed_at: new Date().toISOString() })
      .eq('id', bottle.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // 3. Sumar puntos al usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({ device_id: deviceId, points: 1 }, { onConflict: 'device_id' })
      .select('points')
      .single();

    let finalPoints = 1;
    let levelInfo = getLevel(1);

    if (userError) {
      // Si falla el upsert, intentamos sumar 1 al existente
      const { data: existingUser } = await supabase
        .from('users')
        .select('points')
        .eq('device_id', deviceId)
        .single();

      if (existingUser) {
        finalPoints = existingUser.points + 1;
        const { data: updatedUser } = await supabase
          .from('users')
          .update({ points: finalPoints })
          .eq('device_id', deviceId)
          .select('points')
          .single();
        levelInfo = getLevel(finalPoints);
        return res.json({ 
          success: true, 
          message: `✅ ¡Has ganado 1 estrella!`, 
          data: { points: finalPoints, level: levelInfo } 
        });
      }
      return res.status(500).json({ error: userError.message });
    }

    finalPoints = userData.points;
    levelInfo = getLevel(finalPoints);

    res.json({ 
      success: true, 
      message: `✅ ¡Has ganado 1 estrella!`, 
      data: { points: finalPoints, level: levelInfo } 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- RUTAS DE CATÁLOGO Y CANJE DE PREMIOS ---

// Obtener lista de premios activos
app.get('/api/rewards', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('is_active', true);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Canjear un premio
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    // 1. Obtener el costo del premio
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select('cost')
      .eq('id', rewardId)
      .eq('is_active', true)
      .single();

    if (rewardError || !reward) {
      return res.status(404).json({ message: 'Premio no disponible' });
    }
    const cost = reward.cost;

    // 2. Verificar saldo del usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .single();

    if (userError || !user || user.points < cost) {
      return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });
    }

    // 3. Descontar puntos
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ points: user.points - cost })
      .eq('device_id', deviceId)
      .select('points')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({
      success: true,
      message: `🎉 ¡Has canjeado tu premio! Te quedan ${updatedUser.points} estrellas.`,
      data: updatedUser
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
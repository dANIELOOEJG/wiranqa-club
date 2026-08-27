const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- SEGURIDAD Y CORS ---
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '10mb' }));

// --- CONEXIÓN A SUPABASE ---
const supabaseUrl = 'https://qwjjrwiurhyoszhlsdgd.supabase.co';
const supabaseKey = 'sb_publishable_mnBY2b4fmjt9NdwmtBBt2A_L-avhMjm';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  headers: { 'apikey': supabaseKey }
});

console.log('✅ Conectado a Supabase vía API REST');

// --- NIVELES DE CLIENTE ---
const getLevel = (points) => {
  if (points >= 100) return { id: 5, title: '🏆 LEYENDA AYACUCHANA', defaultNickname: 'Leyenda WIRANQA' };
  if (points >= 50) return { id: 4, title: '🍺 MAESTRO WIRANQERO', defaultNickname: 'Maestro Cervecero' };
  if (points >= 25) return { id: 3, title: '⭐ WIRANQERO EXPERTO', defaultNickname: 'Experto en Lúpulo' };
  if (points >= 10) return { id: 2, title: '🌱 WIRANQERO NOVATO', defaultNickname: 'Nuevo Catador' };
  return { id: 1, title: '🍺 Descubre WIRANQA', defaultNickname: 'Viajero WIRANQA' };
};

// --- FUNCIÓN AUXILIAR PARA BUSCAR RESTAURANTE POR QR ---
const getRestaurantByQR = async (code) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('current_qr_code', code)
    .single();
  return { data, error };
};

// --- RUTAS DE USUARIO (CLIENTE) ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'WIRANQA Backend running' });
});

app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('points, nickname, name, dni, email')
      .eq('device_id', deviceId)
      .single();

    const { data: history } = await supabase
      .from('history')
      .select('*, restaurants(name)')
      .eq('device_id', deviceId)
      .order('redeemed_at', { ascending: false });

    const points = user ? user.points : 0;
    const levelInfo = getLevel(points);

    res.json({
      points,
      nickname: user ? user.nickname : levelInfo.defaultNickname,
      level: levelInfo,
      name: user ? user.name : null,
      dni: user ? user.dni : null,
      email: user ? user.email : null,
      history: history || []
    });
  } catch (err) {
    console.error('❌ Error en /api/user:', err.message);
    res.status(500).json({ error: 'Error interno al obtener usuario' });
  }
});

app.post('/api/user/update', async (req, res) => {
  const { deviceId, nickname } = req.body;
  if (!deviceId || !nickname) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase.from('users').update({ nickname }).eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, email } = req.body;
  if (!deviceId || !name || !dni || !email) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase.from('users').update({ name, dni, email }).eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- RUTA DE ESCANEO (CON RESTAURANTE) ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    // 1. Buscar si el código pertenece a un restaurante (QR de local)
    const restaurantResult = await getRestaurantByQR(code);
    
    if (restaurantResult.data) {
      // ✅ Si es un QR de restaurante, registramos en restaurant_logs
      const { error: logError } = await supabase
        .from('restaurant_logs')
        .insert({ restaurant_id: restaurantResult.data.id, action_type: 'scan', client_device_id: deviceId });

      if (logError) return res.status(500).json({ message: `Error al registrar en local: ${logError.message}` });

      // Sumar estrella al cliente
      const { data: existingUser } = await supabase.from('users').select('points').eq('device_id', deviceId).maybeSingle();
      let finalPoints = 1;
      if (existingUser) {
        finalPoints = existingUser.points + 1;
        await supabase.from('users').update({ points: finalPoints }).eq('device_id', deviceId);
      } else {
        await supabase.from('users').insert({ device_id: deviceId, points: 1, nickname: getLevel(1).defaultNickname });
      }

      // Guardar en historial del cliente con restaurante
      await supabase.from('history').insert({ device_id: deviceId, unique_code: code, restaurant_id: restaurantResult.data.id, action_type: 'scan' });

      const { data: history } = await supabase.from('history').select('*, restaurants(name)').eq('device_id', deviceId).order('redeemed_at', { ascending: false });

      res.json({
        success: true,
        message: `✅ ¡Has ganado 1 estrella en ${restaurantResult.data.name}!`,
        data: { points: finalPoints, level: getLevel(finalPoints), history: history || [] }
      });
    } else {
      // ✅ Si NO es QR de restaurante, es una botella normal
      const { data: bottle } = await supabase.from('bottles').select('*').eq('unique_code', code).single();
      if (!bottle) return res.status(404).json({ message: '❌ Esta WIRANQA no pertenece a nuestro lote.' });
      if (bottle.is_redeemed) return res.status(400).json({ message: '⚠️ Esta WIRANQA ya fue disfrutada.' });

      await supabase.from('bottles').update({ is_redeemed: true }).eq('id', bottle.id);
      
      const { data: existingUser } = await supabase.from('users').select('points').eq('device_id', deviceId).maybeSingle();
      let finalPoints = 1;
      if (existingUser) {
        finalPoints = existingUser.points + 1;
        await supabase.from('users').update({ points: finalPoints }).eq('device_id', deviceId);
      } else {
        await supabase.from('users').insert({ device_id: deviceId, points: 1, nickname: getLevel(1).defaultNickname });
      }

      await supabase.from('history').insert({ device_id: deviceId, unique_code: code, action_type: 'scan' });
      const { data: history } = await supabase.from('history').select('*').eq('device_id', deviceId).order('redeemed_at', { ascending: false });

      res.json({
        success: true,
        message: '✅ ¡Has ganado 1 estrella!',
        data: { points: finalPoints, level: getLevel(finalPoints), history: history || [] }
      });
    }
  } catch (err) {
    console.error('❌ Error crítico en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor al procesar el escaneo' });
  }
});

// --- RUTA DE CANJE (CON RESTAURANTE) ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId, restaurantId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const { data: reward } = await supabase.from('rewards').select('cost, name').eq('id', rewardId).single();
    if (!reward) return res.status(404).json({ message: 'Premio no disponible' });

    const { data: user } = await supabase.from('users').select('points').eq('device_id', deviceId).single();
    if (!user || user.points < reward.cost) return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });

    await supabase.from('users').update({ points: user.points - reward.cost }).eq('device_id', deviceId);
    
    // Registrar canje en historial del cliente
    await supabase.from('history').insert({ device_id: deviceId, unique_code: `Canje: ${reward.name}`, restaurant_id: restaurantId || null, action_type: 'redeem' });

    // Registrar canje en restaurant_logs si aplica
    if (restaurantId) {
      await supabase.from('restaurant_logs').insert({ restaurant_id: restaurantId, action_type: 'redeem', client_device_id: deviceId });
    }

    const { data: updatedUser } = await supabase.from('users').select('points').eq('device_id', deviceId).single();

    res.json({
      success: true,
      message: `🎉 ¡Has canjeado tu premio! Te quedan ${updatedUser.points} estrellas.`,
      data: updatedUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA PARA LOGIN DE RESTAURANTES ---
app.post('/api/restaurant/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    res.json({ success: true, restaurant: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA PARA RESETEAR QR DEL RESTAURANTE ---
app.post('/api/restaurant/reset-qr', async (req, res) => {
  const { restaurantId } = req.body;
  if (!restaurantId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    // Generamos un nuevo código QR único
    const newCode = `WIRANQA-REST-${restaurantId}-${Date.now()}`;
    await supabase.from('restaurants').update({ current_qr_code: newCode }).eq('id', restaurantId);

    res.json({ success: true, newQrCode: newCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA PARA VER ESTADÍSTICAS DEL RESTAURANTE ---
app.get('/api/restaurant/stats/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  try {
    const { data: scans } = await supabase
      .from('restaurant_logs')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('action_type', 'scan');

    const { data: redeems } = await supabase
      .from('restaurant_logs')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('action_type', 'redeem');

    res.json({
      totalScans: scans ? scans.length : 0,
      totalRedeems: redeems ? redeems.length : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
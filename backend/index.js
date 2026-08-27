const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '10mb' }));

const supabaseUrl = 'https://qwjjrwiurhyoszhlsdgd.supabase.co';
const supabaseKey = 'sb_publishable_mnBY2b4fmjt9NdwmtBBt2A_L-avhMjm';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  headers: { 'apikey': supabaseKey }
});

console.log('✅ Conectado a Supabase vía API REST');

const getLevel = (points) => {
  if (points >= 100) return { id: 5, title: '🏆 LEYENDA AYACUCHANA', defaultNickname: 'Leyenda WIRANQA' };
  if (points >= 50) return { id: 4, title: '🍺 MAESTRO WIRANQERO', defaultNickname: 'Maestro Cervecero' };
  if (points >= 25) return { id: 3, title: '⭐ WIRANQERO EXPERTO', defaultNickname: 'Experto en Lúpulo' };
  if (points >= 10) return { id: 2, title: '🌱 WIRANQERO NOVATO', defaultNickname: 'Nuevo Catador' };
  return { id: 1, title: '🍺 Descubre WIRANQA', defaultNickname: 'Viajero WIRANQA' };
};

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

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

// --- RUTA PARA CREAR NUEVO QR ÚNICO (RESETEO) ---
app.post('/api/restaurant/generate-qr', async (req, res) => {
  const { restaurantId } = req.body;
  if (!restaurantId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    // Generar código único con la fecha actual
    const newCode = `WIRANQA-LOCAL-${restaurantId}-${Date.now()}`;
    
    const { error } = await supabase
      .from('restaurants')
      .update({ current_qr_code: newCode })
      .eq('id', restaurantId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, newQrCode: newCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA PARA VER ESTADÍSTICAS DEL RESTAURANTE ---
app.get('/api/restaurant/stats/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  try {
    const { data: logs } = await supabase
      .from('history')
      .select('action_type')
      .eq('restaurant_id', restaurantId);

    const totalScans = logs.filter(l => l.action_type === 'scan').length;
    const totalRedeems = logs.filter(l => l.action_type === 'redeem').length;
    const totalClients = new Set(logs.filter(l => l.action_type === 'scan').map(l => l.device_id)).size;

    res.json({ totalScans, totalRedeems, totalClients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA PARA VER CLIENTES QUE ESCANEARON EN EL RESTAURANTE ---
app.get('/api/restaurant/clients/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  try {
    const { data } = await supabase
      .from('history')
      .select('device_id, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    const uniqueClients = [...new Set(data.map(item => item.device_id))];
    res.json(uniqueClients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTA PARA EL CLIENTE ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    const { data: history } = await supabase
      .from('history')
      .select('*, restaurants(name)')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false });

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
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA PARA ESCANEAR QR DEL LOCAL (ÚNICO E IRREPETIBLE POR CLIENTE) ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    // 1. Buscar restaurante por su QR
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('current_qr_code', code)
      .single();

    if (!restaurant) return res.status(404).json({ message: '❌ Este QR ya no es válido. El local generó uno nuevo.' });

    // 2. Verificar si el cliente YA escaneó este QR
    const { data: existingScan } = await supabase
      .from('history')
      .select('*')
      .eq('device_id', deviceId)
      .eq('restaurant_id', restaurant.id)
      .eq('action_type', 'scan')
      .maybeSingle();

    if (existingScan) return res.status(400).json({ message: `⚠️ Ya escaneaste el QR de ${restaurant.name}. Pide el nuevo QR al local.` });

    // 3. Registrar el escaneo
    await supabase
      .from('history')
      .insert({ device_id: deviceId, restaurant_id: restaurant.id, action_type: 'scan' });

    // 4. Sumar estrella al cliente
    const { data: existingUser } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .maybeSingle();

    let finalPoints = 1;
    if (existingUser) {
      finalPoints = existingUser.points + 1;
      await supabase.from('users').update({ points: finalPoints }).eq('device_id', deviceId);
    } else {
      await supabase.from('users').insert({ device_id: deviceId, points: 1, nickname: getLevel(1).defaultNickname });
    }

    // 5. Devolver datos actualizados
    const { data: history } = await supabase
      .from('history')
      .select('*, restaurants(name)')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      message: `✅ ¡Has ganado 1 estrella en ${restaurant.name}!`,
      data: { points: finalPoints, level: getLevel(finalPoints), history: history || [] }
    });
  } catch (err) {
    console.error('❌ Error crítico en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// --- RUTA PARA CANJEAR PREMIO (EN EL LOCAL ELEGIDO) ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId, restaurantId } = req.body;
  if (!deviceId || !rewardId || !restaurantId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const { data: reward } = await supabase.from('rewards').select('cost').eq('id', rewardId).single();
    if (!reward) return res.status(404).json({ message: 'Premio no disponible' });

    const { data: user } = await supabase.from('users').select('points').eq('device_id', deviceId).single();
    if (!user || user.points < reward.cost) return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });

    await supabase.from('users').update({ points: user.points - reward.cost }).eq('device_id', deviceId);
    
    // Registrar el canje en el local
    await supabase.from('history').insert({ device_id: deviceId, restaurant_id: restaurantId, action_type: 'redeem' });

    const { data: updatedUser } = await supabase.from('users').select('points').eq('device_id', deviceId).single();

    res.json({
      success: true,
      message: `🎉 ¡Has canjeado tu premio en el local! Te quedan ${updatedUser.points} estrellas.`,
      data: updatedUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA PARA LISTAR RESTAURANTES (PARA QUE EL CLIENTE ELIJA EL LOCAL) ---
app.get('/api/restaurants', async (req, res) => {
  try {
    const { data } = await supabase.from('restaurants').select('id, name');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
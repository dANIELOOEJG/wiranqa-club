const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
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

// --- ESCANEO DEL QR DEL RESTAURANTE ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('current_qr_code', code)
      .maybeSingle();

    if (!restaurant) {
      return res.status(404).json({ message: '❌ Este QR ya no es válido. El restaurante generó uno nuevo.' });
    }

    // Registrar consumo
    await supabase.from('history').insert({
      device_id: deviceId,
      restaurant_id: restaurant.id,
      action_type: 'scan'
    });

    // Sumar estrella
    const { data: existingUser } = await supabase.from('users').select('points').eq('device_id', deviceId).maybeSingle();
    let finalPoints = 1;
    if (existingUser) {
      finalPoints = existingUser.points + 1;
      await supabase.from('users').update({ points: finalPoints }).eq('device_id', deviceId);
    } else {
      await supabase.from('users').insert({ device_id: deviceId, points: 1, nickname: getLevel(1).defaultNickname });
    }

    // Devolver datos actualizados
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

// --- LOGIN DEL RESTAURANTE ---
app.post('/api/restaurant/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase.from('restaurants').select('*').eq('username', username).eq('password', password).single();
  if (error || !data) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  res.json({ success: true, restaurant: data });
});

// --- GENERAR NUEVO QR (CON IMAGEN) ---
app.post('/api/restaurant/generate-qr', async (req, res) => {
  const { restaurantId } = req.body;
  
  // Generamos un código único
  const newCode = `WIRANQA-LOCAL-${restaurantId}-${Date.now()}`;
  
  // Actualizar la base de datos
  const { error } = await supabase.from('restaurants').update({ current_qr_code: newCode }).eq('id', restaurantId);
  if (error) return res.status(500).json({ error: error.message });

  // Generar la imagen QR en formato Base64
  const qrDataUrl = await QRCode.toDataURL(`https://wiranqa-club-sepia.vercel.app/?code=${newCode}`, {
    width: 200,
    margin: 2
  });

  // Devolver el código y la imagen
  res.json({ 
    success: true, 
    newQrCode: newCode, 
    newQrImage: qrDataUrl 
  });
});

// --- ESTADÍSTICAS DEL RESTAURANTE ---
app.get('/api/restaurant/stats/:restaurantId', async (req, res) => {
  const { restaurantId } = req.params;
  const { data: logs } = await supabase.from('history').select('action_type').eq('restaurant_id', restaurantId);
  const totalScans = logs.filter(l => l.action_type === 'scan').length;
  const totalRedeems = logs.filter(l => l.action_type === 'redeem').length;
  const totalClients = new Set(logs.filter(l => l.action_type === 'scan').map(l => l.device_id)).size;
  res.json({ totalScans, totalRedeems, totalClients });
});

// --- LISTAR RESTAURANTES ---
app.get('/api/restaurants', async (req, res) => {
  const { data } = await supabase.from('restaurants').select('id, name');
  res.json(data);
});

// --- DATOS DEL CLIENTE ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { data: user } = await supabase.from('users').select('*').eq('device_id', deviceId).single();
  const { data: history } = await supabase.from('history').select('*, restaurants(name)').eq('device_id', deviceId).order('created_at', { ascending: false });
  const points = user ? user.points : 0;
  const levelInfo = getLevel(points);
  res.json({ points, nickname: user ? user.nickname : levelInfo.defaultNickname, level: levelInfo, name: user ? user.name : null, dni: user ? user.dni : null, email: user ? user.email : null, history: history || [] });
});

// --- ACTUALIZAR APODO ---
app.post('/api/user/update', async (req, res) => {
  const { deviceId, nickname } = req.body;
  if (!deviceId || !nickname) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase.from('users').update({ nickname }).eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- REGISTRO ---
app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, email } = req.body;
  if (!deviceId || !name || !dni || !email) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase.from('users').update({ name, dni, email }).eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- CANJE ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId, restaurantId } = req.body;
  if (!deviceId || !rewardId || !restaurantId) return res.status(400).json({ error: 'Datos incompletos' });
  const { data: reward } = await supabase.from('rewards').select('cost').eq('id', rewardId).single();
  if (!reward) return res.status(404).json({ message: 'Premio no disponible' });
  const { data: user } = await supabase.from('users').select('points').eq('device_id', deviceId).single();
  if (!user || user.points < reward.cost) return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });
  await supabase.from('users').update({ points: user.points - reward.cost }).eq('device_id', deviceId);
  await supabase.from('history').insert({ device_id: deviceId, restaurant_id: restaurantId, action_type: 'redeem' });
  const { data: updatedUser } = await supabase.from('users').select('points').eq('device_id', deviceId).single();
  res.json({ success: true, message: `🎉 ¡Has canjeado tu premio en el local! Te quedan ${updatedUser.points} estrellas.`, data: updatedUser });
});

// --- PREMIOS ---
app.get('/api/rewards', async (req, res) => {
  try {
    const { count } = await supabase.from('rewards').select('*', { count: 'exact', head: true });
    if (count === 0) {
      await supabase.from('rewards').insert([
        { name: 'Cerveza WIRANQA', cost: 6 },
        { name: 'Vaso Shop WIRANQA', cost: 6, description: 'Vaso de vidrio de 350ml' },
        { name: 'Combo Amigos (4 personas)', cost: 40, description: '1 ronda gratis de vasos shop' },
        { name: 'Combo Amigos (5+ personas)', cost: 100, description: '1 ronda gratis de vasos shop' }
      ]);
    }
    const { data } = await supabase.from('rewards').select('*');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
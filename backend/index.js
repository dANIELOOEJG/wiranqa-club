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

const levelLegend = {
  1: { title: 'Descubre WIRANQA', emoji: '🍺', desc: 'El inicio de tu viaje cervecero.' },
  2: { title: 'WIRANQERO NOVATO', emoji: '🌱', desc: 'Estás empezando a disfrutar del buen sabor.' },
  3: { title: 'WIRANQERO EXPERTO', emoji: '⭐', desc: 'Ya sabes lo que es una buena cerveza artesanal.' },
  4: { title: 'MAESTRO WIRANQERO', emoji: '🍺', desc: 'Un conocedor del lúpulo y la malta.' },
  5: { title: 'LEYENDA AYACUCHANA', emoji: '🏆', desc: 'Eres parte de la historia de WIRANQA.' }
};

const getLevel = (points) => {
  if (points >= 100) return { id: 5, ...levelLegend[5], defaultNickname: 'Leyenda WIRANQA' };
  if (points >= 50) return { id: 4, ...levelLegend[4], defaultNickname: 'Maestro Cervecero' };
  if (points >= 25) return { id: 3, ...levelLegend[3], defaultNickname: 'Experto en Lúpulo' };
  if (points >= 10) return { id: 2, ...levelLegend[2], defaultNickname: 'Nuevo Catador' };
  return { id: 1, ...levelLegend[1], defaultNickname: 'Viajero WIRANQA' };
};

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user } = await supabase.from('users').select('points, nickname, name, dni, email').eq('device_id', deviceId).single();
    const { data: history } = await supabase.from('history').select('unique_code, redeemed_at').eq('device_id', deviceId).order('redeemed_at', { ascending: false });

    const formattedHistory = (history || []).map(item => {
      let displayName = 'Botella WIRANQA';
      if (item.unique_code.includes('Vaso')) displayName = 'Vaso Shop WIRANQA';
      if (item.unique_code.includes('Combo')) displayName = 'Combo Amigos';
      if (item.unique_code.includes('Canje')) displayName = 'Canje: ' + item.unique_code.replace('Canje: ', '');
      return { ...item, displayName };
    });

    const points = user ? user.points : 0;
    const levelInfo = getLevel(points);

    const stats = {
      totalBottles: formattedHistory.filter(h => h.displayName === 'Botella WIRANQA').length,
      totalShops: formattedHistory.filter(h => h.displayName === 'Vaso Shop WIRANQA').length,
      totalCombos: formattedHistory.filter(h => h.displayName === 'Combo Amigos').length,
      totalRedeems: formattedHistory.filter(h => h.displayName.includes('Canje')).length
    };

    res.json({
      points,
      nickname: user ? user.nickname : levelInfo.defaultNickname,
      level: levelInfo,
      name: user ? user.name : null,
      dni: user ? user.dni : null,
      email: user ? user.email : null,
      history: formattedHistory,
      stats
    });
  } catch (err) {
    console.error('❌ Error en /api/user:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/user/update', async (req, res) => {
  const { deviceId, nickname } = req.body;
  if (!deviceId || !nickname) return res.status(400).json({ error: 'Datos incompletos' });
  await supabase.from('users').update({ nickname }).eq('device_id', deviceId);
  res.json({ success: true });
});

app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, email } = req.body;
  if (!deviceId || !name || !dni || !email) return res.status(400).json({ error: 'Datos incompletos' });
  await supabase.from('users').update({ name, dni, email }).eq('device_id', deviceId);
  res.json({ success: true });
});

app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';
  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    const { data: bottle } = await supabase.from('bottles').select('*').eq('unique_code', code).single();
    if (!bottle) return res.status(404).json({ message: '❌ Esta WIRANQA no pertenece a nuestro lote.' });
    if (bottle.is_redeemed) return res.status(400).json({ message: '⚠️ Esta WIRANQA ya fue disfrutada.' });

    await supabase.from('bottles').update({ is_redeemed: true }).eq('id', bottle.id);
    await supabase.from('history').insert({ device_id: deviceId, unique_code: code });

    const { data: existingUser } = await supabase.from('users').select('points').eq('device_id', deviceId).maybeSingle();
    let finalPoints = 1;
    if (existingUser) {
      finalPoints = existingUser.points + 1;
      await supabase.from('users').update({ points: finalPoints }).eq('device_id', deviceId);
    } else {
      await supabase.from('users').insert({ device_id: deviceId, points: 1, nickname: getLevel(1).defaultNickname });
    }

    const { data: history } = await supabase.from('history').select('unique_code, redeemed_at').eq('device_id', deviceId).order('redeemed_at', { ascending: false });
    const formattedHistory = (history || []).map(item => {
      let displayName = 'Botella WIRANQA';
      if (item.unique_code.includes('Vaso')) displayName = 'Vaso Shop WIRANQA';
      if (item.unique_code.includes('Combo')) displayName = 'Combo Amigos';
      if (item.unique_code.includes('Canje')) displayName = 'Canje: ' + item.unique_code.replace('Canje: ', '');
      return { ...item, displayName };
    });

    res.json({
      success: true,
      message: `✅ ¡Has ganado 1 estrella!`,
      data: { points: finalPoints, level: getLevel(finalPoints), history: formattedHistory }
    });
  } catch (err) {
    console.error('❌ Error crítico en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

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

app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const { data: reward } = await supabase.from('rewards').select('cost, name').eq('id', rewardId).single();
    if (!reward) return res.status(404).json({ message: 'Premio no disponible' });

    const { data: user } = await supabase.from('users').select('points').eq('device_id', deviceId).single();
    if (!user || user.points < reward.cost) return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });

    await supabase.from('users').update({ points: user.points - reward.cost }).eq('device_id', deviceId);
    // Guardar en el historial como canje
    await supabase.from('history').insert({ device_id: deviceId, unique_code: `Canje: ${reward.name}` });

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

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
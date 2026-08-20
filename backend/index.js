const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE SEGURIDAD Y CORS ---
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

// --- 5 NIVELES DE WIRANQERO ---
const getLevel = (points) => {
  if (points >= 100) return { id: 5, title: '🏆 LEYENDA AYACUCHANA', defaultNickname: 'Leyenda WIRANQA' };
  if (points >= 50) return { id: 4, title: '🍺 MAESTRO WIRANQERO', defaultNickname: 'Maestro Cervecero' };
  if (points >= 25) return { id: 3, title: '⭐ WIRANQERO EXPERTO', defaultNickname: 'Experto en Lúpulo' };
  if (points >= 10) return { id: 2, title: '🌱 WIRANQERO NOVATO', defaultNickname: 'Nuevo Catador' };
  return { id: 1, title: '🍺 Descubre WIRANQA', defaultNickname: 'Viajero WIRANQA' };
};

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

// --- RUTAS DE USUARIO ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('points, nickname, name, dni, email')
      .eq('device_id', deviceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: `Error al obtener el usuario: ${error.message}` });
    }

    const { data: history, error: historyError } = await supabase
      .from('history')
      .select('unique_code, redeemed_at')
      .eq('device_id', deviceId)
      .order('redeemed_at', { ascending: false });

    if (historyError) {
      console.warn('⚠️ Error al cargar el historial:', historyError.message);
    }

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
    res.status(500).json({ error: 'Error interno del servidor al obtener usuario' });
  }
});

// --- ACTUALIZAR APODO ---
app.post('/api/user/update', async (req, res) => {
  const { deviceId, nickname } = req.body;
  if (!deviceId || !nickname) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase
    .from('users')
    .update({ nickname })
    .eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- REGISTRAR USUARIO ---
app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, email } = req.body;
  if (!deviceId || !name || !dni || !email) return res.status(400).json({ error: 'Datos incompletos' });
  const { error } = await supabase
    .from('users')
    .update({ name, dni, email })
    .eq('device_id', deviceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- ESCANEAR QR (CON TRANSACCIONES Y VALIDACIÓN ROBUSTA) ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

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

    // 2. Marcar la botella como usada y sumar punto en transacción
    // Primero, actualizamos la botella
    const { error: updateError } = await supabase
      .from('bottles')
      .update({ is_redeemed: true, redeemed_by: deviceId, redeemed_at: new Date().toISOString() })
      .eq('id', bottle.id);

    if (updateError) {
      return res.status(500).json({ message: `Error al marcar la botella: ${updateError.message}` });
    }

    // 3. Manejar el usuario y los puntos
    const { data: existingUser } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .maybeSingle();

    let finalPoints = 1;
    let defaultNickname = getLevel(1).defaultNickname;
    let userError = null;

    if (existingUser) {
      // Actualizar usuario existente
      finalPoints = existingUser.points + 1;
      const { error: updateUserError } = await supabase
        .from('users')
        .update({ points: finalPoints })
        .eq('device_id', deviceId);
      userError = updateUserError;
    } else {
      // Crear nuevo usuario
      defaultNickname = getLevel(1).defaultNickname;
      const { error: insertUserError } = await supabase
        .from('users')
        .insert({ device_id: deviceId, points: 1, nickname: defaultNickname });
      userError = insertUserError;
    }

    if (userError) {
      // Si falla la suma de puntos, revertimos la botella (en una BD real haríamos un rollback)
      // En Supabase, intentamos desmarcar la botella para no dejar datos inconsistentes
      await supabase
        .from('bottles')
        .update({ is_redeemed: false, redeemed_by: null, redeemed_at: null })
        .eq('id', bottle.id);
      return res.status(500).json({ message: `Error al actualizar puntos: ${userError.message}` });
    }

    // 4. Insertar en el historial
    await supabase
      .from('history')
      .insert({ device_id: deviceId, unique_code: code, redeemed_at: new Date().toISOString() });

    // 5. Obtener el historial actualizado
    const { data: history, error: historyError } = await supabase
      .from('history')
      .select('unique_code, redeemed_at')
      .eq('device_id', deviceId)
      .order('redeemed_at', { ascending: false });

    if (historyError) {
      console.warn('⚠️ Error al cargar el historial post-escaneo:', historyError.message);
    }

    const levelInfo = getLevel(finalPoints);

    res.json({
      success: true,
      message: `✅ ¡Has ganado 1 estrella!`,
      data: { points: finalPoints, level: levelInfo, history: history || [] }
    });
  } catch (err) {
    console.error('❌ Error crítico en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor al procesar el escaneo' });
  }
});

// --- CATÁLOGO DE PREMIOS ---
app.get('/api/rewards', async (req, res) => {
  try {
    // Insertar premios si no existen (para asegurar que el catálogo esté siempre disponible)
    const { count } = await supabase.from('rewards').select('*', { count: 'exact', head: true });
    if (count === 0) {
      await supabase.from('rewards').insert([
        { name: 'Cerveza WIRANQA', cost: 6 },
        { name: 'Vaso Shop WIRANQA', cost: 6 },
        { name: 'Combo Amigos (4 personas)', cost: 40, description: '1 ronda gratis de vasos shop' },
        { name: 'Combo Amigos (5+ personas)', cost: 100, description: '1 ronda gratis de vasos shop' }
      ]);
    }

    const { data, error } = await supabase.from('rewards').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CANJEAR PREMIO ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const { data: reward } = await supabase
      .from('rewards')
      .select('cost')
      .eq('id', rewardId)
      .single();

    if (!reward) return res.status(404).json({ message: 'Premio no disponible' });
    const cost = reward.cost;

    const { data: user } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .single();

    if (!user || user.points < cost) return res.status(400).json({ message: '❌ No tienes suficientes estrellas.' });

    await supabase
      .from('users')
      .update({ points: user.points - cost })
      .eq('device_id', deviceId);

    const { data: updatedUser } = await supabase
      .from('users')
      .select('points')
      .eq('device_id', deviceId)
      .single();

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

app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
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

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

// --- RUTA PARA ESCANEAR QR (ÚNICO) ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    const { data: qr, error } = await supabase
      .from('dynamic_qrs')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (!qr) return res.status(404).json({ message: '❌ Este QR no está registrado.' });
    if (qr.is_used) return res.status(400).json({ message: '⚠️ Este QR ya fue escaneado.' });

    // Marcar como usado
    await supabase.from('dynamic_qrs').update({ is_used: true, used_by: deviceId }).eq('id', qr.id);

    // Obtener o crear tarjeta del cliente
    let { data: activeCard } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', false)
      .maybeSingle();

    if (!activeCard) {
      const { data: newCard, error: cardError } = await supabase
        .from('loyalty_cards')
        .insert({ device_id: deviceId, current_progress: 0, total_slots: 8 })
        .select('*')
        .single();
      if (cardError) return res.status(500).json({ message: `Error: ${cardError.message}` });
      activeCard = newCard;
    }

    // Sumar progreso
    const newProgress = activeCard.current_progress + 1;
    const isCompleted = newProgress >= activeCard.total_slots;

    const { data: updatedCard } = await supabase
      .from('loyalty_cards')
      .update({ current_progress: newProgress, is_completed: isCompleted })
      .eq('id', activeCard.id)
      .select('*')
      .single();

    // Registrar historial
    await supabase.from('history').insert({ device_id: deviceId, action_type: 'scan', qr_code: code });

    res.json({
      success: true,
      message: isCompleted ? '🎉 ¡Tarjeta llena! Ya puedes canjear tu premio.' : `🍺 ¡Has consumido 1 WIRANQA! Llevas ${newProgress} de ${activeCard.total_slots}.`,
      data: { card: updatedCard }
    });

  } catch (err) {
    console.error('❌ Error en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// --- REGISTRO DE USUARIO (VALIDACIÓN ÚNICA) ---
app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, phone, email } = req.body;
  if (!deviceId || !name || !dni || !phone || !email) return res.status(400).json({ error: 'Todos los campos son obligatorios' });

  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .or(`dni.eq.${dni},phone.eq.${phone},email.eq.${email}`)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.dni === dni) return res.status(409).json({ error: 'Este DNI ya está registrado.' });
      if (existingUser.phone === phone) return res.status(409).json({ error: 'Este número de celular ya está registrado.' });
      if (existingUser.email === email) return res.status(409).json({ error: 'Este correo ya está registrado.' });
    }

    const { error } = await supabase.from('users').update({ name, dni, phone, email }).eq('device_id', deviceId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: '✅ Registro completado exitosamente.' });

  } catch (err) {
    console.error('❌ Error en /api/user/register:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- OBTENER DATOS DEL USUARIO ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user } = await supabase.from('users').select('*').eq('device_id', deviceId).maybeSingle();
    const { data: activeCard } = await supabase.from('loyalty_cards').select('*').eq('device_id', deviceId).eq('is_completed', false).maybeSingle();
    const { data: completedCards } = await supabase.from('loyalty_cards').select('*').eq('device_id', deviceId).eq('is_completed', true);

    res.json({
      points: user?.points || 0,
      nickname: user?.nickname || 'Viajero WIRANQA',
      name: user?.name || null,
      dni: user?.dni || null,
      phone: user?.phone || null,
      email: user?.email || null,
      activeCard: activeCard || null,
      totalCompletedCards: completedCards?.length || 0
    });
  } catch (err) {
    console.error('❌ Error en /api/user:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- CANJEAR TARJETA ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    let { data: activeCard } = await supabase.from('loyalty_cards').select('*').eq('device_id', deviceId).eq('is_completed', true).maybeSingle();
    if (!activeCard) return res.status(400).json({ message: '❌ No tienes una tarjeta llena.' });

    await supabase.from('loyalty_cards').update({ redeemed_at: new Date().toISOString() }).eq('id', activeCard.id);
    const { data: newCard } = await supabase.from('loyalty_cards').insert({ device_id: deviceId, current_progress: 0, total_slots: 8 }).select('*').single();

    await supabase.from('history').insert({ device_id: deviceId, action_type: 'redeem', qr_code: `PREMIUM-${rewardId}` });

    res.json({ success: true, message: '🎉 ¡Premio canjeado! Se te ha otorgado una nueva tarjeta en blanco.', data: { newCard } });
  } catch (err) {
    console.error('❌ Error en /api/redeem:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- OBTENER PREMIOS ---
app.get('/api/rewards', async (req, res) => {
  try {
    const { data } = await supabase.from('rewards').select('*');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUTAS DE ADMIN ---

// 1. Obtener el QR actual (si no existe, lo genera)
app.get('/api/admin/current-qr', async (req, res) => {
  try {
    const { data } = await supabase.from('dynamic_qrs').select('*').eq('is_used', false).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!data) {
      const newCode = `WIRANQA-ADMIN-${Date.now()}`;
      const { error } = await supabase.from('dynamic_qrs').insert({ code: newCode });
      if (error) return res.status(500).json({ error: error.message });
      const qrImage = await QRCode.toDataURL(`https://wiranqa-club-sepia.vercel.app/?code=${newCode}`);
      return res.json({ code: newCode, qrImage });
    }

    const qrImage = await QRCode.toDataURL(`https://wiranqa-club-sepia.vercel.app/?code=${data.code}`);
    res.json({ code: data.code, qrImage });
  } catch (err) {
    console.error('❌ Error en /api/admin/current-qr:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Generar un nuevo QR (El anterior muere)
app.post('/api/admin/generate-new-qr', async (req, res) => {
  try {
    await supabase.from('dynamic_qrs').update({ is_used: true }).eq('is_used', false);

    const newCode = `WIRANQA-ADMIN-${Date.now()}`;
    const { error: insertError } = await supabase.from('dynamic_qrs').insert({ code: newCode });
    if (insertError) return res.status(500).json({ error: insertError.message });

    const QRCode = require('qrcode');
    const qrImage = await QRCode.toDataURL(`https://wiranqa-club-sepia.vercel.app/?code=${newCode}`);

    res.json({ success: true, newCode, qrImage });
  } catch (err) {
    console.error('❌ Error en /api/admin/generate-new-qr:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
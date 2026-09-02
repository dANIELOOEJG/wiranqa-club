const express = require('express');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const { z } = require('zod');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS dinámico desde .env ---
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '10mb' }));

// --- Supabase desde variables de entorno ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  headers: { 'apikey': supabaseKey }
});
console.log('✅ Conectado a Supabase vía API REST');

// --- ESQUEMAS ZOD ---
const scanSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  deviceId: z.string().min(1, 'El deviceId es obligatorio')
});

const registerSchema = z.object({
  deviceId: z.string().min(1, 'deviceId obligatorio'),
  name: z.string().min(1, 'Nombre obligatorio'),
  dni: z.string().regex(/^\d{8,9}$/, 'DNI debe tener 8 o 9 dígitos'),
  phone: z.string().regex(/^\d{9}$/, 'Teléfono debe tener 9 dígitos'),
  email: z.string().email('Correo electrónico inválido')
});

const redeemSchema = z.object({
  deviceId: z.string().min(1, 'deviceId obligatorio'),
  rewardId: z.string().min(1, 'rewardId obligatorio')
});

// --- HEALTH ---
app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

// --- ESCANEAR QR ---
app.post('/api/scan', async (req, res) => {
  try {
    const { code, deviceId } = scanSchema.parse(req.body);

    const { data: qr, error } = await supabase
      .from('dynamic_qrs')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!qr) return res.status(404).json({ message: '❌ Este QR no está registrado.' });
    if (qr.is_used) return res.status(400).json({ message: '⚠️ Este QR ya fue escaneado.' });

    await supabase.from('dynamic_qrs').update({ is_used: true, used_by: deviceId }).eq('id', qr.id);

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
      if (cardError) throw new Error(cardError.message);
      activeCard = newCard;
    }

    const newProgress = activeCard.current_progress + 1;
    const isCompleted = newProgress >= activeCard.total_slots;

    const { data: updatedCard } = await supabase
      .from('loyalty_cards')
      .update({ current_progress: newProgress, is_completed: isCompleted })
      .eq('id', activeCard.id)
      .select('*')
      .single();

    await supabase.from('history').insert({ device_id: deviceId, action_type: 'scan', qr_code: code });

    res.json({
      success: true,
      message: isCompleted ? '🎉 ¡Tarjeta llena! Ya puedes canjear tu premio.' : `🍺 ¡Has consumido 1 WIRANQA! Llevas ${newProgress} de ${activeCard.total_slots}.`,
      data: { card: updatedCard }
    });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
    }
    console.error('❌ Error en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// --- REGISTRO DE USUARIO (con UPSERT) ---
app.post('/api/user/register', async (req, res) => {
  try {
    const { deviceId, name, dni, phone, email } = registerSchema.parse(req.body);

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

    // UPSERT: si device_id existe, actualiza; si no, crea
    const { error } = await supabase
      .from('users')
      .upsert({ device_id: deviceId, name, dni, phone, email }, { onConflict: 'device_id' });

    if (error) throw new Error(error.message);
    res.json({ success: true, message: '✅ Registro completado exitosamente.' });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
    }
    console.error('❌ Error en /api/user/register:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- OBTENER DATOS DEL USUARIO (con validación de deviceId) ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId || deviceId.trim() === '') {
    return res.status(400).json({ error: 'deviceId es requerido' });
  }
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

// --- CANJEAR TARJETA (con verificación de canje duplicado) ---
app.post('/api/redeem', async (req, res) => {
  try {
    const { deviceId, rewardId } = redeemSchema.parse(req.body);

    let { data: activeCard } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', true)
      .maybeSingle();

    if (!activeCard) return res.status(400).json({ message: '❌ No tienes una tarjeta llena.' });
    if (activeCard.redeemed_at) return res.status(400).json({ message: '❌ Esta tarjeta ya fue canjeada.' });

    await supabase.from('loyalty_cards').update({ redeemed_at: new Date().toISOString() }).eq('id', activeCard.id);

    const { data: newCard } = await supabase
      .from('loyalty_cards')
      .insert({ device_id: deviceId, current_progress: 0, total_slots: 8 })
      .select('*')
      .single();

    await supabase.from('history').insert({ device_id: deviceId, action_type: 'redeem', qr_code: `PREMIUM-${rewardId}` });

    res.json({ success: true, message: '🎉 ¡Premio canjeado! Se te ha otorgado una nueva tarjeta en blanco.', data: { newCard } });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
    }
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

// --- ADMIN: Obtener QR actual ---
app.get('/api/admin/current-qr', async (req, res) => {
  try {
    const { data } = await supabase.from('dynamic_qrs').select('*').eq('is_used', false).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!data) {
      const newCode = `WIRANQA-ADMIN-${Date.now()}`;
      const { error } = await supabase.from('dynamic_qrs').insert({ code: newCode });
      if (error) throw new Error(error.message);
      const frontendUrl = process.env.FRONTEND_URL || 'https://wiranqa.com';
      const qrImage = await QRCode.toDataURL(`${frontendUrl}/?code=${newCode}`);
      return res.json({ code: newCode, qrImage });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://wiranqa.com';
    const qrImage = await QRCode.toDataURL(`${frontendUrl}/?code=${data.code}`);
    res.json({ code: data.code, qrImage });

  } catch (err) {
    console.error('❌ Error en /api/admin/current-qr:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- ADMIN: Generar nuevo QR ---
app.post('/api/admin/generate-new-qr', async (req, res) => {
  try {
    await supabase.from('dynamic_qrs').update({ is_used: true }).eq('is_used', false);

    const newCode = `WIRANQA-ADMIN-${Date.now()}`;
    const { error: insertError } = await supabase.from('dynamic_qrs').insert({ code: newCode });
    if (insertError) throw new Error(insertError.message);

    const frontendUrl = process.env.FRONTEND_URL || 'https://wiranqa.com';
    const qrImage = await QRCode.toDataURL(`${frontendUrl}/?code=${newCode}`);

    res.json({ success: true, newCode, qrImage });

  } catch (err) {
    console.error('❌ Error en /api/admin/generate-new-qr:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
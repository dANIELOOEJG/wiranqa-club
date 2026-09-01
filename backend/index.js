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

// --- FUNCIÓN AUXILIAR PARA GENERAR QR ÚNICO ---
const generateUniqueQR = async () => {
  const newCode = `WIRANQA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const { error } = await supabase
    .from('dynamic_qrs')
    .insert({ code: newCode });
  
  if (error) {
    console.error('❌ Error generando QR:', error.message);
    return null;
  }
  return newCode;
};

// --- RUTA DE SALUD ---
app.get('/health', (req, res) => res.json({ status: 'ok', message: 'WIRANQA Backend running' }));

// --- RUTA PARA ESCANEAR QR (ÚNICO Y DINÁMICO) ---
app.post('/api/scan', async (req, res) => {
  const rawCode = req.body.code;
  const rawDeviceId = req.body.deviceId;
  const code = rawCode ? rawCode.trim() : '';
  const deviceId = rawDeviceId ? rawDeviceId.trim() : '';

  if (!code || !deviceId) return res.status(400).json({ message: 'Datos incompletos' });

  try {
    // 1. Buscar el QR en la tabla dynamic_qrs
    const { data: qr, error } = await supabase
      .from('dynamic_qrs')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    // 2. Si el QR no existe o ya fue usado
    if (!qr) return res.status(404).json({ message: '❌ Este QR no está registrado.' });
    if (qr.is_used) return res.status(400).json({ message: '⚠️ Este QR ya fue escaneado. Usa el nuevo QR.' });

    // 3. Si es válido: marcar como usado y generar un QR nuevo
    const { error: updateError } = await supabase
      .from('dynamic_qrs')
      .update({ is_used: true, used_by: deviceId })
      .eq('id', qr.id);

    if (updateError) return res.status(500).json({ message: `Error al marcar QR: ${updateError.message}` });

    // Generar nuevo QR para el próximo cliente
    const newQRCode = await generateUniqueQR();
    if (!newQRCode) return res.status(500).json({ message: 'Error generando nuevo QR' });

    // 4. Obtener o crear la tarjeta activa del cliente
    let { data: activeCard } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', false)
      .maybeSingle();

    if (!activeCard) {
      // Crear tarjeta nueva (si no existe una activa)
      const { data: newCard, error: cardError } = await supabase
        .from('loyalty_cards')
        .insert({ device_id: deviceId, current_progress: 0, total_slots: 8 })
        .select('*')
        .single();
      if (cardError) return res.status(500).json({ message: `Error creando tarjeta: ${cardError.message}` });
      activeCard = newCard;
    }

    // 5. Sumar progreso a la tarjeta
    const newProgress = activeCard.current_progress + 1;
    const isCompleted = newProgress >= activeCard.total_slots;

    const { data: updatedCard, error: progressError } = await supabase
      .from('loyalty_cards')
      .update({ current_progress: newProgress, is_completed: isCompleted })
      .eq('id', activeCard.id)
      .select('*')
      .single();

    if (progressError) return res.status(500).json({ message: `Error actualizando tarjeta: ${progressError.message}` });

    // 6. Registrar en historial
    await supabase.from('history').insert({ device_id: deviceId, action_type: 'scan', qr_code: code });

    // 7. Responder al cliente con los datos
    res.json({
      success: true,
      message: isCompleted ? '🎉 ¡Tarjeta llena! Ya puedes canjear tu premio.' : `🍺 ¡Has consumido 1 WIRANQA! Llevas ${newProgress} de ${activeCard.total_slots}.`,
      data: {
        card: updatedCard,
        newQRCode: newQRCode // Devolvemos el QR nuevo para que el admin lo muestre/use
      }
    });

  } catch (err) {
    console.error('❌ Error crítico en /api/scan:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// --- RUTA PARA REGISTRAR CLIENTE (VALIDACIÓN ÚNICA) ---
app.post('/api/user/register', async (req, res) => {
  const { deviceId, name, dni, phone, email } = req.body;
  if (!deviceId || !name || !dni || !phone || !email) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    // Verificar unicidad de DNI, Teléfono y Email
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

    // Actualizar datos del usuario
    const { error } = await supabase
      .from('users')
      .update({ name, dni, phone, email })
      .eq('device_id', deviceId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: '✅ Registro completado exitosamente.' });

  } catch (err) {
    console.error('❌ Error en /api/user/register:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA PARA OBTENER DATOS DEL USUARIO (Incluye Tarjeta) ---
app.get('/api/user/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    const { data: activeCard } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', false)
      .maybeSingle();

    const { data: completedCards } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', true);

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

// --- RUTA PARA CANJEAR TARJETA LLENA ---
app.post('/api/redeem', async (req, res) => {
  const { deviceId, rewardId } = req.body;
  if (!deviceId || !rewardId) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    // 1. Obtener tarjeta activa
    let { data: activeCard } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('device_id', deviceId)
      .eq('is_completed', true)
      .maybeSingle();

    if (!activeCard) return res.status(400).json({ message: '❌ No tienes una tarjeta llena para canjear.' });

    // 2. Marcar tarjeta como canjeada
    await supabase
      .from('loyalty_cards')
      .update({ redeemed_at: new Date().toISOString() })
      .eq('id', activeCard.id);

    // 3. Crear tarjeta nueva en blanco
    const { data: newCard } = await supabase
      .from('loyalty_cards')
      .insert({ device_id: deviceId, current_progress: 0, total_slots: 8, is_completed: false })
      .select('*')
      .single();

    // 4. Registrar en historial
    await supabase.from('history').insert({ device_id: deviceId, action_type: 'redeem', qr_code: `PREMIUM-${rewardId}` });

    res.json({
      success: true,
      message: '🎉 ¡Premio canjeado! Se te ha otorgado una nueva tarjeta en blanco.',
      data: { newCard }
    });
  } catch (err) {
    console.error('❌ Error en /api/redeem:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA DE ADMIN (VER TODO) ---
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const { data: qrs } = await supabase.from('dynamic_qrs').select('*').order('created_at', { ascending: false });
    const { data: cards } = await supabase.from('loyalty_cards').select('*').order('created_at', { ascending: false });
    const { data: users } = await supabase.from('users').select('*');
    const { data: history } = await supabase.from('history').select('*').order('created_at', { ascending: false });

    const availableQrs = qrs.filter(q => !q.is_used).length;
    const usedQrs = qrs.filter(q => q.is_used).length;
    const completedCards = cards.filter(c => c.is_completed).length;

    res.json({
      availableQrs,
      usedQrs,
      completedCards,
      totalUsers: users.length,
      qrs,
      cards,
      history
    });
  } catch (err) {
    console.error('❌ Error en /api/admin/dashboard:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTA PARA ADMIN: GENERAR QR NUEVOS ---
app.post('/api/admin/generate-qrs', async (req, res) => {
  const { quantity } = req.body;
  const amount = quantity || 1;

  try {
    const qrs = [];
    for (let i = 0; i < amount; i++) {
      const code = `WIRANQA-${Date.now()}-${Math.floor(Math.random() * 10000)}-${i}`;
      qrs.push({ code });
    }

    const { error } = await supabase.from('dynamic_qrs').insert(qrs);
    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, message: `✅ ${amount} QR generados.` });
  } catch (err) {
    console.error('❌ Error en /api/admin/generate-qrs:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 WIRANQA Backend en línea en http://localhost:${PORT}`);
});
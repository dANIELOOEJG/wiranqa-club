import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import QrReader from 'react-qr-scanner';

function App() {
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState('Desconocido');
  const [scanning, setScanning] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [level, setLevel] = useState({ id: 1, title: 'Descubre WIRANQA', emoji: '🍺', desc: 'El inicio de tu viaje cervecero.' });
  const [view, setView] = useState('home');
  const [rewards, setRewards] = useState([]);
  const [history, setHistory] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [nickname, setNickname] = useState('Viajero WIRANQA');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [userData, setUserData] = useState({ name: '', dni: '', email: '' });
  const [isRegistered, setIsRegistered] = useState(false);

  // --- ESTADO PARA EL PANEL DEL RESTAURANTE ---
  const [restaurantView, setRestaurantView] = useState(false);
  const [restaurantLogged, setRestaurantLogged] = useState(false);
  const [restaurantData, setRestaurantData] = useState(null);
  const [restaurantStats, setRestaurantStats] = useState({ totalScans: 0, totalRedeems: 0, totalClients: 0 });
  const [restaurantLogin, setRestaurantLogin] = useState({ username: '', password: '' });
  const [newQrCode, setNewQrCode] = useState('');
  const [newQrImage, setNewQrImage] = useState(null); // 🔥 Nueva imagen del QR
  const [showLoginError, setShowLoginError] = useState(false);

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cameraMode = isMobile ? 'environment' : 'user';
  const isProcessing = useRef(false);

  const getDeviceId = () => {
    let id = localStorage.getItem('wiranqa_device_id');
    if (!id) {
      id = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('wiranqa_device_id', id);
    }
    return id;
  };

  // 🚀 KEEP ALIVE (Carga rápida)
  useEffect(() => {
    const keepAlive = async () => {
      try { await fetch('https://wiranqa-backend.onrender.com/health'); } catch (e) {}
    };
    keepAlive();
    const interval = setInterval(keepAlive, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    checkBackend(id);
    fetchRewards();
    fetchRestaurants();
    handleAutoScanFromURL(id);
  }, []);

  const checkBackend = async (id) => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/health');
      if (res.ok) {
        setBackendStatus('Online');
        fetchUserData(id);
        return true;
      }
    } catch { setBackendStatus('Offline'); }
    return false;
  };

  const fetchUserData = async (id) => {
    try {
      const res = await fetch(`https://wiranqa-backend.onrender.com/api/user/${id}`);
      const data = await res.json();
      if (data.points !== undefined) {
        setPoints(data.points);
        setLevel(data.level);
        setNickname(data.nickname);
        if (data.name) setIsRegistered(true);
        if (data.history) setHistory(data.history);
      }
    } catch (e) { console.error(e); }
  };

  const fetchRewards = async () => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/rewards');
      const data = await res.json();
      setRewards(data);
    } catch (e) { console.error(e); }
  };

  const fetchRestaurants = async () => {
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/restaurants');
      const data = await res.json();
      setRestaurants(data);
    } catch (e) { console.error(e); }
  };

  const handleAutoScanFromURL = async (id) => {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('code');
    if (qrCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await processScan(qrCode, id);
    }
  };

  const processScan = async (code, id) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setLoading(true);
    setMessage('⏳ Verificando tu WIRANQA...');
    const cleanCode = code.trim();
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, deviceId: id })
      });
      const data = await res.json();
      setLoading(false);
      
      if (res.ok && data.success) {
        setPoints(data.data.points);
        setLevel(data.data.level);
        setMessage(data.message);
        if (data.data.history) setHistory(data.data.history);
        setScanning(false);
      } else {
        setMessage(data.message || '❌ Ocurrió un error.');
        setScanning(false);
      }
    } catch (error) {
      setLoading(false);
      setScanning(false);
      setMessage('❌ No pudimos conectar con el servidor.');
    } finally {
      setTimeout(() => setMessage(''), 4000);
      isProcessing.current = false;
    }
  };

  const handleScan = (data) => {
    if (data && data.text && deviceId && !isProcessing.current) {
      processScan(data.text, deviceId);
    }
  };

  const updateNickname = async () => {
    if (!nickname.trim()) return;
    setIsEditingNickname(false);
    try {
      await fetch('https://wiranqa-backend.onrender.com/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, nickname: nickname.trim() })
      });
    } catch (e) { console.error(e); }
  };

  const handleRegister = async () => {
    const { name, dni, email } = userData;
    if (!name || !dni || !email) {
      setMessage('❌ Todos los campos son obligatorios.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name, dni, email })
      });
      const data = await res.json();
      if (data.success) {
        setIsRegistered(true);
        setShowRegisterForm(false);
        setMessage('✅ Registro completado.');
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage('❌ Error al registrar.');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch (e) {
      setMessage('❌ Error de conexión.');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handleRedeem = async (rewardId, cost) => {
    if (!isRegistered) {
      setShowRegisterForm(true);
      return;
    }
    if (points < cost) {
      setMessage(`❌ No tienes suficientes estrellas. Necesitas ${cost}.`);
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    // El cliente debe elegir el local
    if (!selectedRestaurant) {
      setMessage('❌ Primero debes elegir en qué local quieres canjear.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, rewardId, restaurantId: selectedRestaurant })
      });
      const data = await res.json();
      if (data.success) {
        setPoints(data.data.points);
        setMessage(data.message);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage('❌ Error al canjear el premio');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  // --- FUNCIONES DEL PANEL DEL RESTAURANTE ---
  const handleRestaurantLogin = async () => {
    if (!restaurantLogin.username || !restaurantLogin.password) {
      setShowLoginError(true);
      return;
    }
    
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/restaurant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restaurantLogin)
      });
      const data = await res.json();
      
      if (data.success) {
        setRestaurantLogged(true);
        setRestaurantData(data.restaurant);
        setShowLoginError(false);
        await fetchRestaurantStats(data.restaurant.id);
      } else {
        setShowLoginError(true);
      }
    } catch (error) {
      setShowLoginError(true);
    }
  };

  const fetchRestaurantStats = async (restaurantId) => {
    try {
      const res = await fetch(`https://wiranqa-backend.onrender.com/api/restaurant/stats/${restaurantId}`);
      const data = await res.json();
      setRestaurantStats(data);
    } catch (e) { console.error(e); }
  };

  const handleGenerateNewQR = async () => {
    if (!restaurantData) return;
    try {
      const res = await fetch('https://wiranqa-backend.onrender.com/api/restaurant/generate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurantData.id })
      });
      const data = await res.json();
      if (data.success) {
        setNewQrCode(data.newQrCode);
        setNewQrImage(data.newQrImage); // 🔥 Guardamos la imagen
        setRestaurantData({ ...restaurantData, current_qr_code: data.newQrCode });
        await fetchRestaurantStats(restaurantData.id);
      }
    } catch (e) { console.error(e); }
  };

  // 🔥 Función para descargar la imagen
  const downloadQR = () => {
    if (!newQrImage) return;
    const link = document.createElement('a');
    link.href = newQrImage;
    link.download = `QR_${restaurantData.name}.png`;
    link.click();
  };

  const handleLogout = () => {
    setRestaurantLogged(false);
    setRestaurantData(null);
    setRestaurantStats({ totalScans: 0, totalRedeems: 0, totalClients: 0 });
    setNewQrCode('');
    setNewQrImage(null); // Limpiamos la imagen
    setRestaurantLogin({ username: '', password: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-amber-200 relative overflow-hidden">
        <div className="relative z-10 text-center">
          <div className="flex flex-col items-center mb-4">
            <img src="/logo.png" alt="WIRANQA" className="h-20 object-contain mb-2" />
            <h1 className="text-2xl font-bold text-amber-700 tracking-wider">WIRANQA CLUB</h1>
            <p className="text-xs text-slate-500 font-medium tracking-widest">Cerveza Artesanal Ayacuchana</p>
          </div>

          <div className={`mb-4 p-3 rounded-xl transition-all duration-500 ease-in-out ${
            backendStatus === 'Online' 
              ? 'bg-emerald-50 border border-emerald-300 shadow-sm' 
              : 'bg-slate-50 border border-slate-200'
          }`}>
            <h2 className={`text-lg font-bold transition-colors duration-300 ${
              backendStatus === 'Online' 
                ? 'text-emerald-700' 
                : 'text-slate-500'
            }`}>
              {backendStatus === 'Online' ? '🍺 ¡Bienvenido, WIRANQERO!' : '🍺 Preparando tu experiencia WIRANQA...'}
            </h2>
          </div>

          {/* Si está en vista normal (cliente) */}
          {!restaurantView && (
            <>
              <div className="flex justify-center gap-4 mb-4 flex-wrap">
                <button onClick={() => setView('home')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'home' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🏠 Inicio</button>
                <button onClick={() => setView('catalog')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'catalog' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>🎁 Premios</button>
                <button onClick={() => setView('profile')} className={`text-sm font-bold px-3 py-1 rounded-lg ${view === 'profile' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>👤 Perfil</button>
              </div>

              {view === 'home' && (
                <>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-4xl">⭐</span>
                    <span className="text-5xl font-extrabold text-slate-800">{points}</span>
                  </div>
                  <div className="text-sm font-bold uppercase tracking-wider text-amber-600">{level.title}</div>
                  <div className="mt-4">
                    {scanning ? (
                      <div className="rounded-xl overflow-hidden border-2 border-amber-600 bg-black relative">
                        <QrReader delay={300} onError={console.error} onScan={handleScan} style={{ width: '100%', height: '250px', objectFit: 'cover' }} constraints={{ video: { facingMode: cameraMode } }} />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-44 h-44 border-2 border-amber-500 rounded-xl opacity-80"></div></div>
                        <button onClick={() => setScanning(false)} className="w-full py-3 bg-slate-900 text-white font-bold">Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setScanning(true)} disabled={loading || backendStatus !== 'Online'} className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95">
                        {loading ? '⏳ Procesando...' : '📷 Escanear tu WIRANQA'}
                      </button>
                    )}
                  </div>
                </>
              )}

              {view === 'catalog' && (
                <div className="mt-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">🎁 Catálogo de Premios</h3>
                  <p className="text-sm text-slate-500 mb-4">Tienes ⭐ {points} estrellas</p>
                  
                  {/* Selección de restaurante */}
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Elige el local para canjear:</label>
                    <select 
                      value={selectedRestaurant || ''} 
                      onChange={(e) => setSelectedRestaurant(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Selecciona un local --</option>
                      {restaurants.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    {rewards.length === 0 ? <p className="text-sm text-slate-400">Cargando premios...</p> : (
                      rewards.map((reward) => (
                        <div key={reward.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="text-left">
                            <h4 className="font-bold text-slate-800">{reward.name}</h4>
                            <p className="text-sm text-slate-500">Costo: ⭐ {reward.cost}</p>
                            {reward.description && <p className="text-xs text-amber-600">{reward.description}</p>}
                          </div>
                          <button onClick={() => handleRedeem(reward.id, reward.cost)} disabled={loading || points < reward.cost} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${points >= reward.cost ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                            {points >= reward.cost ? 'Canjear' : 'Faltan ⭐'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {view === 'profile' && (
                <div className="mt-4 text-left">
                  <h3 className="text-lg font-bold text-slate-800 text-center mb-4">👤 Mi Perfil</h3>
                  
                  <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Apodo</label>
                    {isEditingNickname ? (
                      <div className="flex gap-2">
                        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="flex-1 p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" maxLength={20} />
                        <button onClick={updateNickname} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Guardar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-800">{nickname}</span>
                        <span className="text-sm text-slate-500 ml-2">- Nivel {level.id}</span>
                        <button onClick={() => setIsEditingNickname(true)} className="text-sm text-amber-600 hover:text-amber-700 underline">Editar</button>
                      </div>
                    )}
                  </div>

                  <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Nivel</label>
                    <div className="flex items-center gap-2"><span className="text-2xl">{level.emoji}</span><span className="text-lg font-bold text-slate-800">{level.title}</span></div>
                    <p className="text-xs text-slate-500 mt-1">Nivel {level.id} de 5</p>
                    <p className="text-xs text-amber-600 mt-1">{level.desc}</p>
                  </div>

                  <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Estrellas</label>
                    <div className="flex items-center gap-2"><span className="text-3xl">⭐</span><span className="text-3xl font-bold text-slate-800">{points}</span></div>
                  </div>

                  <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-bold text-slate-700">📊 Mis Consumos</label>
                    </div>
                    <div className="text-sm text-slate-600">
                      {history.length === 0 ? <p className="text-slate-400">Aún sin consumos.</p> : (
                        history.map((item, idx) => (
                          <div key={idx} className="flex justify-between border-b border-slate-100 py-1">
                            <span>{item.restaurants ? item.restaurants.name : 'Local'}</span>
                            <span className="text-xs text-slate-400">{item.action_type === 'scan' ? '🍺 Consumo' : '🎁 Canje'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Botón para ir al panel del restaurante */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                <button 
                  onClick={() => setRestaurantView(true)}
                  className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-bold"
                >
                  🏪 Entrar como Restaurante
                </button>
              </div>
            </>
          )}

          {/* VISTA DEL RESTAURANTE */}
          {restaurantView && (
            <div className="mt-4">
              {!restaurantLogged ? (
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-center">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">🏪 Login Restaurante</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Usuario</label>
                      <input 
                        type="text" 
                        value={restaurantLogin.username} 
                        onChange={(e) => setRestaurantLogin({...restaurantLogin, username: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                        placeholder="Ej: laesquina"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Contraseña</label>
                      <input 
                        type="password" 
                        value={restaurantLogin.password} 
                        onChange={(e) => setRestaurantLogin({...restaurantLogin, password: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                        placeholder="••••••"
                      />
                    </div>
                    
                    {showLoginError && (
                      <p className="text-red-600 text-sm font-medium">❌ Usuario o contraseña incorrectos</p>
                    )}
                    
                    <button 
                      onClick={handleRestaurantLogin}
                      className="w-full py-3 bg-amber-600 text-white font-bold rounded hover:bg-amber-700"
                    >
                      Iniciar Sesión
                    </button>
                    <button 
                      onClick={() => setRestaurantView(false)}
                      className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm"
                    >
                      ← Volver a la app
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-center">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">🏪 Panel de {restaurantData.name}</h3>
                  <p className="text-sm text-slate-500 mb-4">Admin del Restaurante</p>

                  {/* Estadísticas */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-500">🍺 Consumos</p>
                      <p className="text-2xl font-bold text-slate-800">{restaurantStats.totalScans}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-500">🎁 Canjes</p>
                      <p className="text-2xl font-bold text-slate-800">{restaurantStats.totalRedeems}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-500">👥 Clientes</p>
                      <p className="text-2xl font-bold text-slate-800">{restaurantStats.totalClients}</p>
                    </div>
                  </div>

                   {/* Gestión del QR */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 mb-6">
                    <p className="text-sm font-bold text-slate-700 mb-2">📱 Código QR Actual</p>
                    {/* Mostramos la imagen si existe */}
                    <div className="mt-4 bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                      {newQrImage ? (
                        <div>
                          <p className="text-sm font-bold text-emerald-700 mb-2">✅ Nuevo QR Generado:</p>
                          <img src={newQrImage} alt="Nuevo QR" className="mx-auto w-40 h-40" />
                          <button 
                            onClick={downloadQR}
                            className="mt-3 px-4 py-2 bg-amber-600 text-white font-bold rounded hover:bg-amber-700 text-xs"
                          >
                            📥 Descargar QR
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-700 mb-1">
                          El código actual es válido. Si lo deseas, puedes generar uno nuevo.
                        </p>
                      )}
                      
                      <button 
                        onClick={handleGenerateNewQR}
                        className="w-full py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 text-sm mt-2"
                      >
                        🔄 Generar Nuevo QR Único
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleLogout}
                    className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm"
                  >
                    ← Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Formulario de registro */}
          {showRegisterForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-slate-800 mb-4">📝 Registro para canjear</h3>
                <div className="space-y-3">
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Nombre</label><input type="text" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="Nombre completo" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">DNI</label><input type="text" value={userData.dni} onChange={(e) => setUserData({...userData, dni: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="DNI" /></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-1">Correo</label><input type="email" value={userData.email} onChange={(e) => setUserData({...userData, email: e.target.value})} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:border-amber-500" placeholder="correo@ejemplo.com" /></div>
                  <button onClick={handleRegister} className="w-full py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700">Registrar</button>
                  <button onClick={() => setShowRegisterForm(false)} className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.includes('✅') || message.includes('🎉') || message.includes('¡') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{message}</div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-400">
            <span>🍺 Cerveza Artesanal Ayacuchana © 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
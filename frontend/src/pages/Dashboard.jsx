import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalScans: 0, totalPoints: 0, remainingBottles: 0 });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const statsRes = await fetch('http://localhost:3000/api/dashboard/stats');
      const statsData = await statsRes.json();
      setStats(statsData);

      const historyRes = await fetch('http://localhost:3000/api/dashboard/history');
      const historyData = await historyRes.json();
      setHistory(historyData);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReset = async () => {
    if (window.confirm("⚠️ ¿Estás seguro de reiniciar la base de datos? ¡Esto borrará todos los escaneos y los QR volverán a estar disponibles!")) {
      try {
        await fetch('http://localhost:3000/api/dashboard/reset', { method: 'POST' });
        loadData(); // Recargar datos
      } catch (error) {
        alert("Error al reiniciar");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">📊 Panel de Control</h1>
          <Link to="/" className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition">
            ← Volver al Escáner
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 text-xl">Cargando datos...</div>
        ) : (
          <>
            {/* Tarjetas de Estadísticas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-slate-500 text-sm font-bold uppercase mb-1">Botellas Canjeadas</h3>
                <p className="text-4xl font-bold text-slate-800">{stats.totalScans || 0}</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-slate-500 text-sm font-bold uppercase mb-1">Estrellas Regaladas</h3>
                <p className="text-4xl font-bold text-slate-800">{stats.totalPoints || 0}</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-slate-500 text-sm font-bold uppercase mb-1">Botellas Restantes</h3>
                <p className="text-4xl font-bold text-green-600">{stats.remainingBottles || 0}</p>
              </div>
            </div>

            {/* Historial y Botón de Reinicio */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">📜 Últimos Escaneos</h2>
                <button 
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm font-semibold"
                >
                  🔄 Reiniciar Lote
                </button>
              </div>

              {history.length === 0 ? (
                <p className="text-slate-400 text-center py-6">Aún no hay escaneos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="text-xs uppercase bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Código QR</th>
                        <th className="px-4 py-3">Fecha y Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-slate-800">{item.unique_code}</td>
                          <td className="px-4 py-3 text-slate-500">{new Date(item.redeemed_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
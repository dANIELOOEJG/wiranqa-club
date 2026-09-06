// src/components/QrScanner.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  facingMode?: 'user' | 'environment';
  delay?: number;
}

const QrScanner: React.FC<QrScannerProps> = ({
  onScan,
  onError,
  facingMode = 'environment',
  delay = 300,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const startScanning = async () => {
      try {
        await html5QrCode.start(
          { facingMode },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Si se detecta un QR, llamamos a onScan
            onScan(decodedText);
            // Opcional: detener después de un escaneo para evitar múltiples
            // stopScanning();
          },
          (errorMessage) => {
            // Ignoramos errores de lectura (son normales mientras escanea)
            // Solo reportamos si es un error grave
            if (onError && errorMessage.includes('No QR code found')) {
              // No hacemos nada, es esperado
            } else if (onError) {
              onError(errorMessage);
            }
          }
        );
        setIsScanning(true);
      } catch (err) {
        console.error('Error al iniciar la cámara:', err);
        if (onError) onError('No se pudo acceder a la cámara');
      }
    };

    startScanning();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [facingMode, onScan, onError]);

  // Función para detener el escaneo (útil si quieres parar después de un escaneo)
  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        setIsScanning(false);
      } catch (err) {
        console.error('Error al detener el escáner:', err);
      }
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div id={containerId} className="rounded-xl overflow-hidden bg-black" />
      {!isScanning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <span>Iniciando cámara...</span>
        </div>
      )}
    </div>
  );
};

export default QrScanner;
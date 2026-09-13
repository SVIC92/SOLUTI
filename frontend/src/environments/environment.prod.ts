export const environment = {
  production: true,
  // Vercel (frontend) y Render (backend) son dominios distintos — a diferencia
  // del despliegue on-premise (mismo reverse proxy), acá se necesita la URL
  // completa del backend. Reemplazar por la URL real del servicio en Render
  // (Render → tu servicio → arriba a la izquierda) antes de compilar/deployar.
  apiUrl: 'https://soluti.onrender.com/api/v1',
  wsUrl: 'https://soluti.onrender.com',
};

const https = require('https');

function callAwakeServer() {
  const url = 'https://tinarg-1p5l.onrender.com/?no_cargar_jsones_fechas=true';

  console.log(`Llamando a ${url} ...`);

  const req = https.get(url, res => {
    console.log(`Status: ${res.statusCode}`);
    let data = '';

    res.on('data', chunk => {
      data += chunk.toString();
    });

    res.on('end', () => {
      if (data) {
        console.log('Respuesta cuerpo:');
        console.log(data);
      } else {
        console.log('Respuesta sin cuerpo');
      }
      process.exit(0);
    });
  });

  req.on('error', err => {
    console.error('Error llamando a instancia remota:', err.message);
    process.exit(1);
  });
}

callAwakeServer();

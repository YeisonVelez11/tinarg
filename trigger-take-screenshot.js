const http = require('http');

function callTakeScreenshot() {
  const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/take-screenshot',
    method: 'GET',
  };

  console.log('Llamando a http://127.0.0.1:3001/take-screenshot ...');

  const req = http.request(options, res => {
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
    console.error('Error llamando a /take-screenshot:', err.message);
    process.exit(1);
  });

  req.end();
}

callTakeScreenshot();

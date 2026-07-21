import https from 'https'

const querystring = require('querystring');
const data = querystring.stringify({
  userName: "fake@pcpexpress.co.id",
  password: "fake"
});

const options = {
  hostname: 'mail.pcpexpress.co.id',
  port: 443,
  path: '/SOGo/connect',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data),
    'Accept': 'application/json, text/plain, */*'
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  console.log('headers:', res.headers);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();

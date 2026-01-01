const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('NexusBot Worker is running!\n');
});

server.listen(PORT, () => {
  console.log(`NexusBot Worker listening on port ${PORT}`);
});

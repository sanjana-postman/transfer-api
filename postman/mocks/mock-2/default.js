const http = require("http");
const PORT = process.env.PORT || 4500;

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // @endpoint GET /health
  if (method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  if (pm.mock.matchRequest("REQUEST_PATH", req)) {
    return pm.mock.sendExample("EXAMPLE_PATH", res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not defined" }));
});

server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});
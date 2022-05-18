import WebSocket from 'ws';
import express from 'express';
import http from 'http';

const { PORT_WS = '6969' } = process.env;

export default new class WS {
  constructor() {
    const server = http.createServer(express);
    this.wss = new WebSocket.Server({ server });
    server.listen(PORT_WS, function () {
      console.log(`Server is listening on ${PORT_WS}!`)
    });
  }
  sendMessage(message) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

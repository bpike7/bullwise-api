import express from 'express';
import asyncHandler from 'express-async-handler';
import { getInitialData, testWatchlistMonitor, testOrderMessages, createBuyOrder, getAllPositions } from '../interface.js';

const { NODE_ENV, PORT, APP_URL } = process.env;

const app = express();
app.use(express.json());

app.get('/heartbeat', async (req, res, next) => {
  res.send({ message: 'OK' });
});

app.post('/get-initial-data', asyncHandler(async (_, res) => {
  const data = await getInitialData();
  res.send(data);
}));

app.post('/test', asyncHandler(async (req, res) => {
  testWatchlistMonitor();
  res.send({ message: 'ok' });
}));

app.post('/test-order-messages', asyncHandler(async (req, res) => {
  testOrderMessages(req.body);
  res.send({ message: 'ok' });
}));

app.post('/get-all-positions', asyncHandler(async (_, res) => {
  const response = await getAllPositions();
  res.send(response);
}));

app.post('/create-buy-order', asyncHandler(async (req, res) => {
  const response = await createBuyOrder(req.body);
  res.send(response);
}));


app.listen(PORT, async () => {
  console.log(`Running app at: ${APP_URL}:${PORT}`);
  console.log(`🚀 ${NODE_ENV.toUpperCase()}`);
});

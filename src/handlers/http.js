import express from 'express';
import asyncHandler from 'express-async-handler';
import {
  createBuyOrder,
  createSellOrder,
  getPositions,
  collectData,
} from '../interface.js';

const { NODE_ENV, PORT, APP_URL } = process.env;

const app = express();
app.use(express.json());

app.get('/heartbeat', async (req, res, next) => {
  res.send({ message: 'OK' });
});

app.post('/collect-data', asyncHandler(async (_, res) => {
  const data = await collectData();
  res.send(data);
}));

app.post('/create-buy-order', asyncHandler(async (req, res) => {
  const data = await createBuyOrder(req.body);
  res.send(data);
}));

app.post('/create-sell-order', asyncHandler(async (req, res) => {
  const data = await createSellOrder(req.body);
  res.send(data);
}));

app.post('/get-all-positions', asyncHandler(async (_, res) => {
  const response = await getPositions();
  res.send(response);
}));

app.listen(PORT, async () => {
  console.log(`Running app at: ${APP_URL}:${PORT}`);
  console.log(`🚀 ${NODE_ENV.toUpperCase()}`);
});

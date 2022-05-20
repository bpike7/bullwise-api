import axios from 'axios';
import WSClient from './handlers/websocket.js';
import moment from 'moment-timezone';
import qs from 'qs';
import sql from './modules/db.js';

const {
  TRADIER_BASE_URL,
  TRADIER_ACCESS_TOKEN,
  TRADIER_ACCOUNT_ID,
  TRADIER_WS_BASE_URL,

  TRADIER_BASE_URL_PRODUCTION,
  TRADIER_ACCESS_TOKEN_PRODUCTION
} = process.env;

const WebSocket = require('ws');


export default new class Tradier {
  constructor() {
    this._requestor_production = axios.create({
      baseURL: TRADIER_BASE_URL_PRODUCTION,
      headers: {
        Authorization: `Bearer ${TRADIER_ACCESS_TOKEN_PRODUCTION}`,
        Accept: 'application/json'
      }
    });
    this._requestor = axios.create({
      baseURL: TRADIER_BASE_URL,
      headers: {
        Authorization: `Bearer ${TRADIER_ACCESS_TOKEN}`,
        Accept: 'application/json'
      }
    });
    this._requestor_qs = axios.create({
      baseURL: TRADIER_BASE_URL,
      headers: {
        Authorization: `Bearer ${TRADIER_ACCESS_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  // Market Data

  async getAllQuotes(symbols) {
    try {
      const { data } = await this._requestor_production.get(`v1/markets/quotes?symbols=${symbols.join(',')}&greeks=true`);
      return data.quotes.quote;
    } catch (err) {
      console.log('Err: getAllQuotes');
      if (err.response) return console.log(err.response.data);
      console.log(err);
    }
  }

  async getDailyCandles(s) {
    try {
      const oneDayPrior = moment().subtract(1, 'days').format('YYYY-MM-DD');
      const oneYearPrior = moment().subtract(364, 'days').format('YYYY-MM-DD');
      const { data } = await this._requestor_production.get(`/v1/markets/history?symbol=${s}&interval=daily&start=${oneYearPrior}&end=${oneDayPrior}`);
      return data;
    } catch (err) {
      console.log('Err: getDailyCandles');
      console.log(err);
    }
  }

  async getAllCloseOptions(symbol) {
    try {
      const { data: expirationData } = await this._requestor_production.get(`/v1/markets/options/expirations?symbol=${symbol}`);
      const [expirationDateClosest] = expirationData.expirations.date;
      const { data: chainData } = await this._requestor_production.get(`/v1/markets/options/chains?symbol=${symbol}&expiration=${expirationDateClosest}`);
      return chainData.options.option;
    } catch (err) {
      console.log('Err: getAllCloseOptions');
      console.log(err);
    }
  }

  // Account Data

  async getAccount() {
    try {
      const { data } = await this._requestor.get(`/v1/accounts/${TRADIER_ACCOUNT_ID}/balances`);
      return data.balances;
    } catch (err) {
      console.log('Err: getAccount');
      console.log(err);
    }
  }

  async getPositions() {
    try {
      const { data } = await this._requestor.get(`v1/accounts/${TRADIER_ACCOUNT_ID}/positions`);
      if (data.positions === 'null') return [];
      if (data.positions.position instanceof Object) return [data.positions.position];
      return data.positions.position;
    } catch (err) {
      console.log('Err: getPositions');
      console.log(err);
    }
  };

  async getOrders() {
    try {
      const { data } = await this._requestor.get(`v1/accounts/${TRADIER_ACCOUNT_ID}/orders`);
      if (data.orders === 'null') return [];
      return data.orders.order.filter(({ status }) => ['open', 'partially_filled', 'pending'].includes(status));
    } catch (err) {
      console.log('Err: getOrders');
      console.log(err);
    }
  }

  // Orders

  async createOrder({
    tag,
    symbol,
    option_symbol,
    quantity,
    type,
    order_price,
    side
  }) {
    try {
      const { data } = await this._requestor_qs.post(`/v1/accounts/${TRADIER_ACCOUNT_ID}/orders`, qs.stringify({
        tag,
        class: 'option',
        symbol,
        option_symbol,
        side,
        quantity: quantity.toString(),
        type,
        duration: 'gtc',
        price: order_price
      }));
      if (!data.order || data.order.status !== 'ok') console.log('order status not ok!: ', data);
      return data.order;
    } catch (err) {
      console.log(err);
    }
  }

  async cancelOrder({ }) {

  }

  async createAccountStream() {
    try {
      const { data } = await this._requestor.post('/v1/accounts/events/session');
      const ws = new WebSocket(`${TRADIER_WS_BASE_URL}/v1/accounts/events`);
      ws.on('open', function open() {
        ws.send(JSON.stringify({
          sessionid: data.stream.sessionid,
          events: ['order']
        }));
      });
      ws.on('message', function (dataRaw) {
        const data = JSON.parse(dataRaw);
        console.log('MESSAGE->>>>>>>>', data);
        if (data.event === 'order') return handleOrderMessage(data);
        return console.log(`Not order event: ${JSON.stringify(data)}`);

        // WSClient.sendMessage(JSON.stringify({
        //   id: data.id,
        //   status: data.status,
        //   price: data.price,
        //   stop_price: data.stop_price,
        //   avg_fill_price: data.avg_fill_price,
        //   executed_quantity: data.executed_quantity,
        //   remaining_quantity: data.remaining_quantity
        // }));
      });
      ws.on('error', function (data) {
        console.log(data);
      });
    } catch (err) {
      console.log(err);
      console.log('Err: createAccountStream');
    }
  }

  async createMarketStream() {
    //   try {
    //     const { data } = await this._requestor_production.post('/v1/markets/events/session');
    //     const ws = new WebSocket('wss://ws.tradier.com/v1/markets/events');
    //     ws.on('open', function open() {
    //       ws.send(JSON.stringify({
    //         symbols: ['QQQ'],
    //         sessionid: data.stream.sessionid,
    //         filter: ['summary', 'quote'],
    //         validOnly: true
    //       }));
    //     });
    //     ws.on('message', function (data) {
    //       const parsed = JSON.parse(data);
    //       console.log(JSON.parse(data));
    //       if (parsed.type === 'summary') WSClient.sendMessage(JSON.stringify(parsed));
    //       if (parsed.type === 'quote')

    //         // if (data.event !== 'order') return console.log(`Not order event: ${JSON.stringify(data)}`);
    //         WSClient.sendMessage(JSON.stringify({
    //           id: data.id,
    //           status: data.status,
    //           price: data.price,
    //           stop_price: data.stop_price,
    //           avg_fill_price: data.avg_fill_price,
    //           executed_quantity: data.executed_quantity,
    //           remaining_quantity: data.remaining_quantity
    //         }));
    //     });
    //     ws.on('error', function (data) {
    //       console.log(data);
    //     });
    //   } catch (err) {
    //     console.log(err);
    //     console.log('Err: createMarketStream');
    //   }
  }
}

async function handleOrderMessage(data) {
  try {
    const [existing] = await sql`select * from orders where uuid = ${data.tag}`;
    if (!existing) throw Error(`Unable to find order for ${data.id} ${data.tag}`);

    handleNotifications(existing, data);

    await sql`
      update orders set
      state = ${data.status},
      price = ${data.avg_fill_price}
      where uuid = ${data.tag}
    `;
  } catch (err) {
    console.log('Failed to handle order message: ', data, err);
  }
}

async function handleNotifications({ state: statePrev, contract, quantity }, { status: stateCurr, exec_quantity, remaining_quantity }) {
  if (statePrev === stateCurr) return;

  if (['partially_filled'].includes(stateCurr)) {
    return WSClient.sendMessage(JSON.stringify({
      notification: {
        message: `Order partially filled: ${contract} (${exec_quantity}/${exec_quantity + remaining_quantity})`,
        color: 'white'
      }
    }));
  }

  if (!['pending', 'open'].includes(statePrev) && ['pending', 'open'].includes(stateCurr)) {
    return WSClient.sendMessage(JSON.stringify({
      notification: {
        message: `Order placed: ${contract} x${quantity}`,
        color: 'white'
      }
    }));
  }

  if (['filled'].includes(stateCurr)) {
    WSClient.sendMessage(JSON.stringify({
      notification: {
        message: `Order filled!: ${contract} x${quantity}`,
        color: 'green'
      }
    }));
  }
}
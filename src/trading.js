import axios from 'axios';
import WSClient from './handlers/websocket.js';
import moment from 'moment-timezone';

const {
  NODE_ENV,
  TRADIER_BASE_URL_SANDBOX,
  TRADIER_BASE_URL,
  TRADIER_ACCESS_TOKEN,
  TRADIER_ACCESS_TOKEN_SANDBOX,
  TRADIER_ACCOUNT_ID,
  TRADIER_ACCOUNT_ID_SANDBOX
} = process.env;
const WebSocket = require('ws');


export default new class Tradier {
  constructor() {
    this._requestor_production = axios.create({
      baseURL: TRADIER_BASE_URL,
      headers: { Authorization: `Bearer ${TRADIER_ACCESS_TOKEN}` },
      Accept: 'application/json'
    });
    this._requestor_default = NODE_ENV === 'production' ? this._requestor_production : axios.create({
      baseURL: TRADIER_BASE_URL_SANDBOX,
      headers: { Authorization: `Bearer ${TRADIER_ACCESS_TOKEN_SANDBOX}` },
      Accept: 'application/json'
    });
    this._account_id_production = TRADIER_ACCOUNT_ID;
    this._account_id_default = NODE_ENV === 'production' ? this._account_id_production : TRADIER_ACCOUNT_ID_SANDBOX;
  }

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

  async getAccount() {
    try {
      return {} // TODO
      const { data } = await this._requestor_default.get(`/v1/accounts/${TRADIER_ACCOUNT_ID}/balances`);
      return data.balances;
    } catch (err) {
      console.log('Err: getAccount');
      console.log(err);
    }
  }

  async getPositions() {
    try {
      return [] // TODO
      const { data } = await this._requestor_default.get(`v1/accounts/${TRADIER_ACCOUNT_ID}/positions`);
      return data.positions.position;
    } catch (err) {
      console.log('Err: getPositions');
      console.log(err);
    }
  }

  async getOrders() {
    try {
      return [] // TODO
      const { data } = await this._requestor_default.get(`v1/accounts/${TRADIER_ACCOUNT_ID}/orders`);
      return data.orders.order;
    } catch (err) {
      console.log('Err: getOrders');
      console.log(err);
    }
  }

  async createOrder({
    symbol,
    option_symbol,
    order_size,
    order_type,
    order_price,
    side
  }) {
    try {
      const { data } = await axios.post(`v1/accounts/${TRADIER_ACCOUNT_ID}/orders`, {
        account_id: TRADIER_ACCOUNT_ID,
        class: 'option',
        symbol,
        option_symbol,
        side,
        quantity: order_size.toString(),
        type: order_type,
        duration: 'gtc',
        price: order_type === 'limit' ? order_price : undefined,
        stop: order_type === 'stop' ? order_price : undefined
      });
      return data.orders.order;
    } catch (err) {
      console.log('Err: createOrder');
      console.log(err);
    }
  }

  async createAccountStream() {
    try {

      const { data } = await this._requestor_default.post('/v1/accounts/events/session');
      const ws = new WebSocket('wss://ws.tradier.com/v1/accounts/events');
      ws.on('open', function open() {
        ws.send(JSON.stringify({
          sessionid: data.stream.sessionid,
          events: ['order']
        }));
      });
      ws.on('message', function (data) {
        if (data.event !== 'order') return console.log(`Not order event: ${JSON.stringify(data)}`);
        WSClient.sendMessage(JSON.stringify({
          id: data.id,
          status: data.status,
          price: data.price,
          stop_price: data.stop_price,
          avg_fill_price: data.avg_fill_price,
          executed_quantity: data.executed_quantity,
          remaining_quantity: data.remaining_quantity
        }));
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

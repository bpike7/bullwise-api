import axios from 'axios';
import WSClient from './handlers/websocket.js';
import moment from 'moment-timezone';
import qs from 'qs';
import sql from './modules/db.js';
import Big from 'big.js';
import { getPositionsOrders } from './interface.js';
import { parseOptionSymbol } from './modules/helpers.js';

const {
  TRADIER_BASE_URL,
  TRADIER_ACCESS_TOKEN,
  TRADIER_ACCOUNT_ID,
  TRADIER_WS_BASE_URL,
  TRADIER_BASE_URL_PRODUCTION,
  TRADIER_ACCESS_TOKEN_PRODUCTION
} = process.env;

const WebSocket = require('ws');


const trading = new class Tradier {
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

  handleError(err) {
    if (!err.response) return console.log(err);
    return console.log({
      status: err.response.status,
      data: err.response.data
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

  async getActiveOrders() {
    try {
      const { data } = await this._requestor.get(`v1/accounts/${TRADIER_ACCOUNT_ID}/orders`);
      if (data.orders === 'null') return [];
      return data.orders.order.filter(({ status }) => ['open', 'partially_filled', 'pending'].includes(status));
    } catch (err) {
      console.log('Err: getOrders');
      console.log(err);
    }
  }

  async createOrder(params) {
    const { tag, symbol, contract_symbol, quantity, type, order_price, side, stop } = params;
    try {
      const { data } = await this._requestor_qs.post(`/v1/accounts/${TRADIER_ACCOUNT_ID}/orders`, qs.stringify({
        tag,
        class: 'option',
        symbol,
        option_symbol: contract_symbol,
        side,
        quantity: quantity.toString(),
        type,
        duration: 'day',
        price: order_price,
        stop
      }));
      if (!data.order || data.order.status !== 'ok') return console.log('Order failed: ', data);
      return data.order;
    } catch (err) {
      this.handleError(err);
    }
  }

  async cancelOrder({ tradier_id }) {
    try {
      console.log(`/v1/accounts/${TRADIER_ACCOUNT_ID}/orders/${tradier_id}`);
      const { data } = await this._requestor.delete(`/v1/accounts/${TRADIER_ACCOUNT_ID}/orders/${tradier_id}`);
      return data.order;
    } catch (err) {
      this.handleError(err);
    }
  }

  async createAccountStream() {
    try {
      console.log('Creating tradier account stream . . .');
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
        if (data.event === 'heartbeat') return console.log('Tradier ws >> ok');
        if (data.event === 'order') return handleOrderMessage(data);
      });
      ws.on('error', function (data) {
        console.log(data);
      });
    } catch (err) {
      console.log(err);
      console.log('Err: createAccountStream');
    }
  }
}

export default trading;

async function handleOrderMessage(data, attempt = 0) {
  try {
    const [existingOrder] = await sql`select * from orders where uuid = ${data.tag}`;
    console.log('Tradier ws >> ', JSON.stringify({ type: data.type, state: data.status, symbol: existingOrder ? existingOrder.contract_symbol : undefined, tag: data.tag }));
    if (!existingOrder) {
      console.log('No existing order: ', attempt);
      if (attempt === 5) throw Error(`No existing order found for tag: ${JSON.stringify(data)}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempt += 1;
      return handleOrderMessage(data, attempt);
    }
    const [existingPosition] = await sql`select * from positions where contract_symbol = ${existingOrder.contract_symbol} and state = 'open'`;

    if (['pending', 'partially_filled', 'open', 'rejected', 'cancelled'].includes(data.status)) {
      if (existingOrder.state === 'cancelled') return;
      console.log(`${existingOrder.type} -> ${data.status}`);
      await sql`
        update orders set
        state = ${data.status}
        where uuid = ${data.tag}
      `;
    }

    if (['filled'].includes(data.status)) {
      const { symbol, strike } = parseOptionSymbol(existingOrder.contract_symbol);
      WSClient.sendMessage(JSON.stringify({
        notification: {
          message: `${existingOrder.side === 'buy_to_open' ? 'Bought' : 'Sold'} ${symbol} ${strike} x${data.exec_quantity}`,
          color: 'green'
        }
      }));

      if (existingOrder.side === 'buy_to_open') {
        if (existingPosition) {
          const addition = Big(data.avg_fill_price).times(data.exec_quantity);
          const sum = Big(existingPosition.price_avg).plus(addition);
          const newAvg = Big(sum).div(data.exec_quantity + 1).toNumber();
          await sql`
          update positions set
          price_avg = ${newAvg},
          quantity = ${data.exec_quantity + existingPosition.quantity}
          where id = ${existingPosition.id}
        `;
          await sql`
          update orders set
          price = ${data.avg_fill_price},
          position_id = ${existingPosition.id}
          where uuid = ${data.tag}
        `;
        } else {
          const [{ id }] = await sql`
            insert into positions
            (
              tradier_id,
              state,
              contract_symbol,
              quantity,
              price_avg
            ) VALUES
            (
              ${null}, 
              'open', 
              ${existingOrder.contract_symbol},
              ${data.exec_quantity},
              ${data.avg_fill_price}
              ) returning id
            `;
          await sql`
            update orders set
            state = ${data.status},
            price = ${data.avg_fill_price},
            position_id = ${id}
            where uuid = ${data.tag}
          `;
        }
      }

      if (existingOrder.side === 'sell_to_close') {
        const quantity = existingPosition.quantity - data.exec_quantity;
        await sql`
        update positions set
        state = ${quantity > 0 ? 'open' : 'closed'},
        quantity = ${quantity}
        where id = ${existingPosition.id}
      `;
        await sql`
        update orders set
        state = ${data.status},
        price = ${data.avg_fill_price},
        position_id = ${existingPosition.id}
        where uuid = ${data.tag}
      `;
      }
    }
    const positions = await getPositionsOrders();
    WSClient.sendMessage(JSON.stringify({ positions }));
  } catch (err) {
    console.log(err);
  }
}

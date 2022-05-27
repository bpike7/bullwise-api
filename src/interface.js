import tradier from './providers/tradier/index.js';
import axios from 'axios';
import moment from 'moment-timezone';
import { getSheetData, hubRangeMap } from './modules/googleSheets.js';
import Big from 'big.js';
import ws from './handlers/websocket.js';
import { parseOptionSymbol } from './modules/helpers.js';
import Orders from './orders.js';
import Positions from './positions.js';

const { NODE_ENV, APP_URL, PORT, BULLWISE_SPREADSHEET_ID } = process.env;

const indexQuoteCache = {};
const quoteCache = {};
let watchlistCache = [];

const max = 500;
const indexSymbols = ['QQQ', 'SPY', 'DIA'];


// TODOS

/*
  - Make 'max' dynamic based on account size
  - Make stop loss diff from price_avg dynamic based on that
*/


export async function collectData() {
  const symbols = await getSymbols();
  await updateQuoteCache(symbols);
  const data = {
    indices: getIndexLevelData(),
    watchlist: await updateWatchlist(symbols),
    positions: await getPositionsOrders(),
    orders: await getStrayOrders(),
    account: await tradier.getAccount()
  };
  ws.sendMessage(JSON.stringify(data));
  return data;
}

export function getQuoteBySymbol(symbol) {
  return quoteCache[symbol] || indexQuoteCache[symbol];
}

export async function getPositionsOrders() {
  const positions = await Positions.get({ state: 'open' });
  return Promise.all(positions.map(async p => {
    const { symbol, strike, option_type } = parseOptionSymbol(p.contract_symbol);
    const orders = await Orders.get({ position_id: p.id, state: ['pending', 'open', 'partially_filled'] });
    return {
      ...p,
      symbol,
      strike,
      option_type,
      orders
    };
  }));
}

export async function getPositions() {
  const positions = await Positions.get({ state: 'open' });
  return positions.map(p => {
    const { symbol, strike, option_type } = parseOptionSymbol(p.contract_symbol);
    return {
      ...p,
      symbol,
      strike,
      option_type
    };
  });
}

export async function getAccount() {
  return {};
}

export async function pingHeartBeat() {
  await axios.get(`${APP_URL}${NODE_ENV === 'development' ? `:${PORT}` : ''}/heartbeat`);
}

export async function createBuyOrder({ symbol, option_type, strike, size_relative, buy_sell_point }) {
  const cachedQuote = quoteCache[symbol] || indexQuoteCache[symbol];
  if (!cachedQuote) throw Error(`No cached quote found for ${symbol}`);
  if (!['call', 'put'].includes(option_type)) throw Error('Invalid option type supplied');
  const option = cachedQuote[`${option_type}s`].find((o) => o.strike === strike);
  if (!option) throw Error(`No option found for strike ${option_type} ${strike}`);
  const side = 'buy_to_open';
  const type = 'market'; // CURRENTLY ONLY SUPPORTING MARKET ORDERS!!!
  const price = buy_sell_point === 'bid-ask' ? option.ask : Big(option.ask).plus(option.bid).div(2).toNumber();
  const cost = Big(price).times(100).toNumber();
  const quantity = Big(max).div(cost).round().toNumber();
  try {
    const uuid = await Orders.insert({ contract_symbol: option.symbol, state: 'accepted', quantity, type, side, price: 0.00 });
    ws.sendMessage(JSON.stringify({ notification: { message: 'Order created', color: 'white' } }));
    const order = await tradier.createOrder({ symbol, contract_symbol: option.symbol, side, quantity, type, tag: uuid });
    if (!order) return;
    await Orders.update({ uuid, tradier_id: order.id.toString() });
  } catch (err) {
    console.log(err);
  }
}

export async function createSellOrder({ position_id, size_relative, buy_sell_point }) {
  const [position] = await Positions.get({ id: position_id });
  const { symbol } = parseOptionSymbol(position.contract_symbol);
  const side = 'sell_to_close';
  const type = 'market';
  const quantity = position.quantity;
  try {
    const uuid = await Orders.insert({ contract_symbol: position.contract_symbol, state: 'accepted', quantity, price: 0.00, type, side });
    ws.sendMessage(JSON.stringify({ notification: { message: 'Order created', color: 'white' } }));
    await cancelExistingStopOrders(position_id);
    const order = await tradier.createOrder({ symbol, contract_symbol: position.contract_symbol, side, quantity, type, tag: uuid });
    if (!order) return;
    await Orders.update({ uuid, tradier_id: order.id.toString(), state: 'sent' });
  } catch (err) {
    console.log(err);
  }
}

export async function createStopLossesOnNakedPositions() {
  const positions = await Positions.get({ state: 'open' });
  await Promise.all(positions.map(async p => {
    const [existingStop] = await Orders.get({ position_id: p.id, type: 'stop' });
    if (existingStop && existingStop.quantity === p.quantity) return;
    else if (existingStop) {
      // await(existingStop.id, { quantity: p.quantity });
    }
    else if (!existingStop) await createStopLossOrder(p.id);
  }));
}

async function getStrayOrders() {
  const orders = await Orders.get({ state: ['pending', 'open', 'partially_filled'], position_id: 'IS NULL' });
  return orders.map(o => {
    const { symbol, strike, option_type } = parseOptionSymbol(o.contract_symbol);
    return {
      ...o,
      symbol,
      strike,
      option_type
    };
  })
}

function getIndexLevelData() {
  const indices = indexSymbols.map(symbol => ({ symbol, ...(indexQuoteCache[symbol] || {}) }));
  return indices.map(createClientView)
}

async function cancelExistingStopOrders(position_id) {
  const [order] = await Orders.get({ position_id, type: 'stop' });
  const orderResponse = await tradier.cancelOrder({ tradier_id: order.tradier_id });
  if (orderResponse) await Orders.update({ id: order.id, state: 'canceled' });
}

async function updateQuoteCache(symbols) {
  const quotes = await getQuotes([...symbols, ...indexSymbols]);
  quotes.forEach(({ symbol, ...quote }) => {
    if (indexSymbols.includes(symbol)) indexQuoteCache[symbol] = quote;
    else quoteCache[symbol] = quote;
  })
}

async function updateWatchlist(symbols) {
  const quotes = symbols.map(symbol => ({ symbol, ...(quoteCache[symbol] || {}) }));
  const newWatchlist = quotes.sort((a, b) => a.volume_relative > b.volume_relative ? -1 : 1).slice(0, 3);
  const watchlistChanged = newWatchlist.some(nwl => !watchlistCache.some(wl => wl.symbol === nwl.symbol));
  if (watchlistChanged) ws.sendMessage(JSON.stringify({ notification: { message: 'Watchlist updated!', color: 'yellow' } }));
  watchlistCache = newWatchlist;
  return watchlistCache.map(createClientView)
}

function createClientView(wl) {
  // Derive strike min, max, closest
  const { strike_min, strike_max, strike_close } = [...wl.calls, ...wl.puts].reduce((acc, { strike }) => {
    if (strike > acc.strike_max) acc.strike_max = strike;
    if (strike < acc.strike_min) acc.strike_min = strike;
    acc.strike_close = (Math.abs(strike - wl.price_now) < Math.abs(acc.strike_close - wl.price_now) ? strike : acc.strike_close);
    return acc;
  }, { strike_min: 100000, strike_max: 0, strike_close: 0 });
  // Append key levels and distance from current price
  const key_levels = { above: [], below: [] };
  ['open', 'prevclose', 'high', 'low', 'close'].forEach(key => {
    const percent_from = percentGrowth(wl.price_now, wl[key]);
    if (percent_from >= 0) key_levels.above.push({ type: key, percent_from });
    else key_levels.below.push({ type: key, percent_from });
  });
  return {
    symbol: wl.symbol,
    price_now: wl.price_now,
    volume_relative: wl.volume_relative,
    calls: wl.calls,
    puts: wl.puts,
    strike_diff: wl.strike_diff,
    strike_max,
    strike_min,
    strike_close,
    change_percentage: wl.change_percentage,
    change_percentage_open: wl.change_percentage_open,
    key_levels,
  }
}

async function createStopLossOrder(position_id) {
  const [position] = await Positions.get({ id: position_id });
  const { symbol } = parseOptionSymbol(position.contract_symbol);
  const side = 'sell_to_close';
  const type = 'stop';
  const quantity = position.quantity;
  const price = Big(position.price_avg).minus(.3).toString();
  try {
    const uuid = await Orders.insert({ contract_symbol: position.contract_symbol, position_id: position.id, state: 'accepted', quantity, price, type, side });
    const order = await tradier.createOrder({
      symbol,
      contract_symbol: position.contract_symbol,
      side,
      quantity,
      type,
      tag: uuid,
      stop: price
    });
    if (!order) return;
    const [{ state }] = await Orders.get({ uuid });
    if (state !== 'sent') return Orders.update({ uuid, tradier_id: order.id.toString() });
    await Orders.update({ uuid, tradier: order.id.toString(), state: 'sent' });
  } catch (err) {
    console.log(err);
  }
}

async function getSymbols() {
  return (await getSheetData(BULLWISE_SPREADSHEET_ID, hubRangeMap.hub_input_watchlist)).map(([symbol]) => symbol);
}

async function getQuotes(symbols) {
  try {
    const quoteData = await tradier.getAllQuotes(symbols);
    const quoteResponse = (quoteData instanceof Array ? quoteData : [quoteData]).filter(q => !!q);
    return Promise.all(quoteResponse.map(async q => {
      const cachedQuote = quoteCache[q.symbol] || indexQuoteCache[q.symbol] || {};

      // Append daily candles if todays is not already there
      const { daily_candles } = cachedQuote;
      if (isMissingYesterdaysDailyCandles(daily_candles)) {
        const dailyCandlesFresh = await getDailyCandles(q.symbol);
        if (!dailyCandlesFresh) console.log('Cant get fresh daily_candles for ', q.symbol);
        else q.daily_candles = dailyCandlesFresh;
      } else q.daily_candles = daily_candles;

      // Append calculations
      if (!q.daily_candles) {
        console.log(q);
        throw Error();
      }
      q.volume_relative = relativeVolume(JSON.parse(q.daily_candles), q.volume);

      // Append levels - TODO
      q.levels_above = [];
      q.levels_below = [];

      // Append options
      const upperRealisticRange = percentValue(q.last, .1);
      const lowerRealisticRange = percentValue(q.last, -.1);
      const fullOptionChain = await tradier.getAllCloseOptions(q.symbol);
      const { calls, puts } = fullOptionChain.reduce((acc, o) => {
        const { option_type, strike, ask, bid } = o;
        if (!ask || !bid) return acc;
        const bid_ask_spread = Big(ask).minus(bid).round(2).toNumber();
        if (ask * 100 > max) return acc;
        if (option_type === 'call') {
          if (strike > upperRealisticRange) return acc;
          acc.calls.push({ strike: o.strike, symbol: o.symbol, bid: o.bid, ask: o.ask, bid_ask_spread })
        }
        else if (option_type === 'put') {
          if (strike < lowerRealisticRange) return acc;
          acc.puts.push({ strike: o.strike, symbol: o.symbol, bid: o.bid, ask: o.ask, bid_ask_spread });
        }
        return acc;
      }, { calls: [], puts: [] });
      q.calls = calls;
      q.puts = puts;
      const subject = (calls.length > puts.length ? calls : puts).sort((a, b) => a.strike > b.strike ? -1 : 1);
      q.strike_diff = parseFloat(Object.entries(subject.reduce((acc, o, i, arr) => {
        const next = arr[i + 1];
        if (next) {
          const diff = o.strike - next.strike;
          if (!acc[diff]) acc[diff] = 0;
          acc[diff] += 1;
        }
        return acc;
      }, {})).sort((a, b) => a[1] > b[1] ? -1 : 1)[0][0]);
      q.strike_diff = q.strike_diff > 2.5 ? 2.5 : q.strike_diff;

      return {
        symbol: q.symbol,
        price_now: q.last,
        volume_now: q.last_volume,
        volume_now_day: q.volume,
        open: q.open,
        close: q.close,
        high: q.high,
        low: q.low,
        prevclose: q.prevclose,
        strike_diff: q.strike_diff,
        volume_relative: q.volume_relative,
        change_percentage: q.change_percentage,
        change_percentage_open: percentGrowth(q.last, q.open),
        calls: q.calls,
        puts: q.puts,
        daily_candles: q.daily_candles
      }
    }));
  } catch (err) {
    console.log('Error getting quotes', symbols, err);
  }
}

async function getDailyCandles(s) {
  try {
    const data = await tradier.getDailyCandles(s);
    if (!data || !data.history || !data.history.day) return null;
    return JSON.stringify(data.history.day.reverse());
  } catch (e) {
    console.log(e);
    return {};
  }
}

function isMissingYesterdaysDailyCandles(daily_candles) {
  if (!daily_candles || Object.keys(daily_candles).length === 0) return true;
  const [mostRecentCandle] = JSON.parse(daily_candles);
  if (!mostRecentCandle || !mostRecentCandle.date) return true;
  if (previousWeekday() === new Date(mostRecentCandle.date).toISOString().split('T')[0]) return false;
  return true;
}

function previousWeekday() {
  return [1, 2, 3, 4, 5].indexOf(moment().subtract(1, 'day').day()) > -1 ?
    moment().subtract(1, 'day').format('YYYY-MM-DD') : moment(moment().day(-2)).format('YYYY-MM-DD');
}

function relativeVolume(dailyCandles, volumeNow) {
  if (!volumeNow) return 'NOVOL';
  const tmp = [...dailyCandles].splice(0, 5); // prevent reverse mutation
  if (tmp.length < 5) return reportError('Less than 5 candles found');
  const total = tmp.reduce((acc, candle) => {
    acc += candle.volume
    return acc;
  }, 0);
  const avg = Big(total).div(tmp.length).toNumber();
  return percentGrowth(avg, volumeNow);
}

function percentGrowth(first, second) {
  if (!first || !second) return null;
  return new Big(second).minus(first).div(Math.abs(first)).mul(100).round(2).toNumber();
}

function percentValue(value, percent) {
  return Big(value).times(percent).plus(value).toNumber();
}

import trading from './trading.js';
import axios from 'axios';
import moment from 'moment-timezone';
import { getSheetData, hubRangeMap } from './modules/googleSheets.js';
import Big from 'big.js';
import ws from './handlers/websocket.js';

const { NODE_ENV, APP_URL, PORT, SPREADSHEET_ID_HUB } = process.env;

const quoteCache = {};
let watchlist = [];

const max = 500;

export async function testWatchlistMonitor() {
  watchlist[1].calls = [];
  ws.sendMessage(JSON.stringify({
    watchlist: watchlist.map(wl => ({
      symbol: wl.symbol,
      price_now: wl.price_now,
      volume_relative: wl.volume_relative,
      calls: wl.calls,
      puts: wl.puts,
      strike_diff: wl.strike_diff,
      strike_max: [...wl.calls, ...wl.puts].reduce((acc, { strike }) => {
        if (strike > acc) acc = strike
        return acc;
      }, 0),
      strike_min: [...wl.calls, ...wl.puts].reduce((acc, { strike }) => {
        if (strike < acc) acc = strike
        return acc;
      }, 100000),
    }))
  }));
}

export async function testOrderMessages({ status }) {
  ws.sendMessage(JSON.stringify({
    orders: [{
      id: 11111,
      symbol: 'NFLX',
      status,
      action: 'buy',
      type: 'limit',
      option_type: 'call',
      strike: 180,
      size: 2,
      price_relative_favorable: .4
    }]
  }))
}

export async function getInitialData() {
  const account = await trading.getAccount();
  return {
    watchlist: watchlist.map(w => ({
      symbol: w.symbol,
      price_now: w.price_now,
      volume_relative: w.volume_relative,
      calls: w.calls,
      puts: w.puts,
      strike_diff: w.strike_diff
    })),
    positions: (await trading.getPositions() || []),
    orders: (await trading.getOrders() || []),
    account: {
      value: account.total_equity,
      pl_close: account.close_pl
    },
    indices: (await trading.getAllQuotes(['QQQ', 'SPY', 'DIA'])).reduce((acc, { symbol, last, change_percentage, open, high, low, close }) => {
      acc[symbol] = {
        symbol,
        price_now: last,
        change_percentage,
        open,
        high,
        low,
        close
      };
      return acc;
    }, {})
  };
}

export async function collectWatchlistData() {
  console.log('-Collecting');
  const account = await trading.getAccount();
  const symbols = await getSymbols();
  const quotes = await getQuotes(symbols);
  quotes.forEach(({ symbol, ...quote }) => quoteCache[symbol] = quote);
  watchlist = quotes
    .sort((a, b) => a.volume_relative > b.volume_relative ? -1 : 1)
    .slice(0, 8);

  ws.sendMessage(JSON.stringify({
    watchlist: watchlist.map(wl => {
      const { strike_min, strike_max, strike_close } = [...wl.calls, ...wl.puts].reduce((acc, { strike }) => {
        if (strike > acc.strike_max) acc.strike_max = strike;
        if (strike < acc.strike_min) acc.strike_min = strike;
        acc.strike_close = (Math.abs(strike - wl.price_now) < Math.abs(acc.strike_close - wl.price_now) ? strike : acc.strike_close);
        return acc;
      }, { strike_min: 100000, strike_max: 0, strike_close: 0 });
      return {
        symbol: wl.symbol,
        price_now: wl.price_now,
        volume_relative: wl.volume_relative,
        calls: wl.calls,
        puts: wl.puts,
        strike_diff: wl.strike_diff,
        strike_max,
        strike_min,
        strike_close
      }
    }),
    positions: (await trading.getPositions() || []),
    orders: (await trading.getOrders() || []),
    account: {
      value: account.total_equity,
      pl_close: account.close_pl
    },
    indices: await getIndexLevelData()
  }))
  console.log('-end');
}

const indexLevelKeys = ['open', 'prevclose', 'high', 'low', 'close'];
export async function getIndexLevelData() {
  (await trading.getAllQuotes(['QQQ', 'SPY', 'DIA'])).reduce((acc, q) => {
    acc[q.symbol] = { above: [], below: [] };




    return acc;
  }, {});
}

export async function getAllPositions() {

}

export async function pingHeartBeat() {
  await axios.get(`${APP_URL}${NODE_ENV === 'development' ? `:${PORT}` : ''}/heartbeat`);
}

// TODO - unfinished
export async function createBuyOrder({ symbol, option_type, strike, size_relative, buy_sell_point }) {
  const cachedQuote = quoteCache[symbol];
  if (!cachedQuote) throw Error(`No cached quote found for ${symbol}`);
  if (!['call', 'put'].includes(option_type)) throw Error('Invalid option type supplied');

  const option = cachedQuote[`${option_type}s`].find((o) => o.strike === strike);
  if (!option) throw Error(`No option found for strike ${option_type} ${strike}`);


  // TODO - make below dynamic
  const costMax = 600;
  const cost = buy_sell_point === 'bid-ask' ? option.ask : Big(option.ask).plus(option.bid).div(2).round(2).toNumber();

  const data = await trading.createOrder({
    symbol,
    option_symbol: option.symbol,
    side: 'buy_to_order',
    order_size: Big(costMax).div(cost).round().toNumber(),
    order_type: option_type,
    order_price: cost,
  });
  console.log(option);
}

async function getSymbols() {
  return (await getSheetData(SPREADSHEET_ID_HUB, hubRangeMap.hub_input_watchlist)).map(([symbol]) => symbol);
}

async function getQuotes(symbols) {
  try {
    const quoteData = await trading.getAllQuotes(symbols);
    const quoteResponse = quoteData instanceof Array ? quoteData : [quoteData];
    return Promise.all(quoteResponse.map(async q => {
      const cachedQuote = quoteCache[q.symbol] || {};

      // Append daily candles if todays is not already there
      const { daily_candles } = cachedQuote;
      if (isMissingYesterdaysDailyCandles(daily_candles)) {
        console.log('creating candles for ', q.symbol);
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
      const fullOptionChain = await trading.getAllCloseOptions(q.symbol);
      const { calls, puts } = fullOptionChain.reduce((acc, o) => {
        const { option_type, strike, ask, bid } = o;
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
        price_open_day: q.open,
        price_low_day: q.low,
        price_high_day: q.high,
        strike_diff: q.strike_diff,
        volume_relative: q.volume_relative,
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
    const data = await trading.getDailyCandles(s);
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

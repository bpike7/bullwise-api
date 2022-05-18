import Redis from 'async-redis';
import url from 'url';

const { REDISTOGO_URL, REDIS_URL } = process.env;

class RedisClient {
  constructor() {
    if (!!REDISTOGO_URL) {
      const rtg = url.parse(process.env.REDISTOGO_URL);
      this._client = Redis.createClient(rtg.port, rtg.hostname);
      this._client.auth(rtg.auth.split(":")[1]);
      // const url = new URL(REDISTOGO_URL)
      // this._client = Redis.createClient(url.port, url.hostname);
      // this._client.auth(url.auth.split(":")[1]);
    } else {
      this._client = Redis.createClient({ url: REDIS_URL });
    }
    this._client.on('error', (error) => {
      console.error('Redis Error', error);
    });

    this._client.on('ready', () => {
      console.log('REDIS: ready');
    });

    this._client.on('connect', (msg) => {
      console.log('REDIS: connected', msg || '');
    });

    this._client.on('reconnecting', (msg) => {
      console.log('REDIS: reconnecting', msg || '');
    });

    this._client.on('end', (msg) => {
      console.log('REDIS connection ended', msg || '');
    });

    this._client.on('warning', (msg) => {
      console.warn('REDIS: warning!', msg || '');
    });
  }

  async set(key, value) {
    if (!value && value !== false) throw Error('redis: value was null/undefined');
    if (typeof key !== 'string') throw Error('redis: string required as key');
    if (value instanceof Array || value instanceof Object) value = JSON.stringify(value);
    await this._client.set(key, value)
  }
  async get(key) {
    if (!key) throw Error('redis: key was null/undefined');
    if (typeof key !== 'string') throw Error('redis: string required as key');
    const rawValue = await this._client.get(key);
    if (rawValue && (rawValue.includes(`{`) || rawValue.includes('['))) return JSON.parse(rawValue);
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return rawValue;
  }
}

const redis = new RedisClient();
export default redis;
import { google } from 'googleapis';

const { BULLWISE_GOOGLE_CLIENT_EMAIL, BULLWISE_GOOGLE_PRIVATE_KEY } = process.env;
const client = new google.auth.JWT(BULLWISE_GOOGLE_CLIENT_EMAIL, null, BULLWISE_GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
const authCache = {};

export const hubRangeMap = {
  hub_input_watchlist_secondary: 'HUB_INPUT!A2:G22',
  hub_input_watchlist: 'HUB_INPUT!A2:A43',
  hub_input_account: 'HUB_INPUT!J7:K8',
  hub_input_opts: 'HUB_INPUT!K10:K12',
  hub_indices: 'HUB!O1:W9',
  hub_primary: 'HUB!B1:M9',
  hub_secondary: 'HUB!B11:V37'
};

export const columns = {
  nasdaq: {
    price_change_day: 0,
    price_change_hour: 5,
    price_change_fifteen: 8,
    price_change_five: 10,
    price_change_one: 11
  },
  hub_plays: {
    symbol: 0,
    l1: 1,
    l2: 2,
    l3: 3,
    contract: 4,
    size: 5,
    ack_contract_change: 6,
    risk: 7,
    hasMessaged: 8,
    timestamp: 9,
    trade_open: 10
  },
  hub_indices: {
    symbol: 0,
    price: 1,
    rv: 2,
    price_day: 3,
    price_hour: 4,
    price_5m: 5,
    hasHit: 6
  },
  metadata: {
    symbol: 0,
    sector: 1,
    industry: 2,
    daily_candles: 3,
    next_earnings: 4,
    exchange: 5
  },
  test: {
    symbol: 0,
    price: 1,
    target: 2,
    contract: 3,
    size: 4,
    risk: 5,
    risk_mod: 6,
    hasHit: 7,
    trade: 8
  }
}


client.authorize((err, tokens) => {
  if (err) console.log(err);
  authCache.access_token = tokens.access_token;
});

export async function getSheetData(spreadsheetId, range) {
  try {
    const gsapi = google.sheets({ version: 'v4', auth: client })
    const data = await gsapi.spreadsheets.values.get({ spreadsheetId, range: range });
    return data.data.values || [];
  } catch (err) {
    console.log(err);
  }
}

export async function getAllSheetData(spreadsheetId, filter = () => true) {
  const gsapi = google.sheets({ version: 'v4', auth: client })
  const sheetNames = (await gsapi.spreadsheets.get({ spreadsheetId })).data.sheets
    .map(s => s.properties.title)
    .filter(filter)
  return (await Promise.all(sheetNames.map(async sheetName => ({
    sheet: sheetName,
    data: await exports.getSheetData(spreadsheetId, sheetName)
  })))).reduce((acc, { sheet, data }) => {
    acc[sheet] = data;
    return acc;
  }, {});
}

export async function createNewSheet(spreadsheetId, name) {
  const gsapi = google.sheets({ version: 'v4', auth: client });
  await gsapi.spreadsheets.batchUpdate({
    auth: client,
    spreadsheetId: spreadsheetId,
    resource: {
      requests: [{
        addSheet: {
          properties: {
            title: name
          }
        }
      }],
    }
  });
}

export async function writeToSheet(spreadsheetId, range, data) {
  try {
    const gsapi = google.sheets({ version: 'v4', auth: client });
    await gsapi.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: data,
      },
    });
  } catch (err) {
    console.log(err);
  }
}

import { CronJob } from 'cron';
import { pingHeartBeat, collectWatchlistData } from '../interface.js';


new CronJob('*/5 * * * * *', async function () {
  try {
    await pingHeartBeat();
    await collectWatchlistData();
  } catch (err) {
    console.log(err);
  }
}, null, true, 'America/Chicago').start();

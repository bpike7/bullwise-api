import { CronJob } from 'cron';
import { pingHeartBeat, collectData, createStopLossesOnNakedPositions } from '../interface.js';


new CronJob('*/5 * * * * *', async function () {
  try {
    await pingHeartBeat();
    await collectData();
    await createStopLossesOnNakedPositions();
  } catch (err) {
    console.log(err);
  }
}, null, true, 'America/Chicago').start();

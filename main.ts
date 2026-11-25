// Launch sniper with rug filter — pump.fun replay bot (agent-fun/replay/v2)
import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

const strategy = createStrategy(DEFAULT_PARAMS);
await runBot({ onBatch: (state, batch) => strategy.onBatch(state, batch) });

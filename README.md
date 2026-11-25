# makefun-u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/sulan195/makefun-u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/sulan195/makefun-u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A launch sniper with a rug filter for the pump.fun bonding-curve replay (protocol `agent-fun/replay/v2`). It watches every coin from its `CreateEvent`, reads the opening tape in the coin's first 3 slots — creator's own buy, how many distinct wallets piled in, whether the creator already sold, and how much real SOL the curve holds — and buys only launches that pass. It takes profit fast (+20%), cuts losers at −8%, never holds past 20 slots, and exits at once when the creator sells. Stake is 0.05 SOL per coin, at most 5 open positions, at most 16 orders per reply, and every buy respects the 1%-of-real-reserve size cap. The strategy was chosen by sweeping and validating the house pilots plus three research families (momentum, reversion, breakout, venture) on the full 24h dev window (128,058 events): the sniper was the least-negative and most robust candidate (net −0.38 SOL, max drawdown 0.04, 354 coins) — completions happen inside the create slot and cannot be chased, so the bot banks small, fast, well-filtered wins instead of riding runners. Fully deterministic: no clock, no randomness, no I/O — two runs on the same input produce byte-identical action logs.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>

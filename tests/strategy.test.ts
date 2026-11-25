// Unit + edge-case tests for the pump.fun launch sniper (strategy.ts).
// Drives the strategy through the kit's own BotState with synthetic batches,
// so the tests exercise exactly the code the grader runs (node /bot/main.ts).
// Run: node --test tests/strategy.test.ts   (Node 22+, no dependencies)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BotState,
  type Batch,
  type ChainEvent,
  type CompleteEventRecord,
  type CreateEventRecord,
  type Fill,
  type Hello,
  type Mark,
  type Order,
  type TradeEventRecord,
} from '../vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from '../strategy.ts';

// ---------------------------------------------------------------- fixtures

const SOL = 1_000_000_000n;
const TX = 105_000n; // base 5_000 + priority 100_000
const VQ0 = 30_000_000_000n; // 30 SOL virtual quote at create
const VT0 = 1_000_000_000_000n; // 1e12 virtual tokens at create

const MINT_A = '11111111111111111111111111111111';
const MINT_B = '22222222222222222222222222222222';
const MINT_C = '33333333333333333333333333333333';
const MINT_D = '44444444444444444444444444444444';
const MINT_E = '55555555555555555555555555555555';
const MINT_F = '66666666666666666666666666666666';
const CREATOR = '99999999999999999999999999999999';
const U1 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const U2 = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const U3 = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const U4 = 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';

function hello(capitalLamports = 10n * SOL): Hello {
  return {
    type: 'hello',
    protocol: 'agent-fun/replay/v2',
    seed: '1',
    universe: {
      program: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      quote: 'SOL',
      mayhem: 'excluded',
      exclude_cashback: true,
      sample: { hash: 'sha256', modulus: 16, residue: 15 },
    },
    capital: { lamports: capitalLamports.toString() },
    caps: {
      max_open_positions: 5,
      max_order_bps_of_real_reserve: 100,
      max_orders_per_batch: 16,
      shorts: false,
      leverage: false,
    },
    latency_slots: 2,
    fees: {
      protocol_bps_fallback: 95,
      creator_bps_fallback: 30,
      base_fee_lamports: '5000',
      priority_fee_lamports: '100000',
      failed_tx_bps: 200,
    },
  };
}

function createEvent(mint: string, slot: number, creator = CREATOR): CreateEventRecord {
  return {
    event: 'CreateEvent',
    slot,
    signature: 'sig-create-' + slot,
    block_time: 1_700_000_000 + slot,
    chain_seq: 0,
    name: 'Test',
    symbol: 'TST',
    uri: 'https://example.invalid/tst.json',
    mint,
    bonding_curve: '77777777777777777777777777777777',
    user: creator,
    creator,
    timestamp: '1700000000',
    virtual_token_reserves: VT0.toString(),
    virtual_sol_reserves: VQ0.toString(),
    real_token_reserves: VT0.toString(),
    token_total_supply: VT0.toString(),
    token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    is_mayhem_mode: false,
    is_cashback_enabled: false,
    quote_mint: 'So11111111111111111111111111111111111111112',
    virtual_quote_reserves: VQ0.toString(),
    creator_fee_bps: 0,
    is_holder_reward: false,
    depth: 0,
  };
}

function tradeEvent(
  mint: string,
  slot: number,
  user: string,
  isBuy: boolean,
  sol: bigint,
  vq: bigint,
  vt: bigint,
  rq: bigint,
  creator = CREATOR,
): TradeEventRecord {
  return {
    event: 'TradeEvent',
    slot,
    signature: `sig-${mint.slice(0, 4)}-${slot}-${user.slice(0, 4)}`,
    block_time: 1_700_000_000 + slot,
    chain_seq: 1,
    mint,
    sol_amount: sol.toString(),
    token_amount: '0',
    is_buy: isBuy,
    user,
    timestamp: '1700000000',
    virtual_sol_reserves: vq.toString(),
    virtual_token_reserves: vt.toString(),
    real_sol_reserves: rq.toString(),
    real_token_reserves: vt.toString(),
    fee_recipient: '88888888888888888888888888888888',
    fee_basis_points: '0',
    fee: '0',
    creator,
    creator_fee_basis_points: '0',
    creator_fee: '0',
    track_volume: true,
    total_unclaimed_tokens: '0',
    total_claimed_tokens: '0',
    current_sol_volume: '0',
    last_update_timestamp: '1700000000',
    ix_name: 'buy',
    mayhem_mode: false,
    cashback_fee_basis_points: '0',
    cashback: '0',
    buyback_fee_basis_points: '0',
    buyback_fee: '0',
    shareholders: [],
    quote_mint: 'So11111111111111111111111111111111111111112',
    quote_amount: sol.toString(),
    virtual_quote_reserves: vq.toString(),
    real_quote_reserves: rq.toString(),
    holder_rewards_bps: '0',
    holder_rewards: '0',
    creator_fee_unclaimed: '0',
  };
}

function completeEvent(mint: string, slot: number): CompleteEventRecord {
  return {
    event: 'CompleteEvent',
    slot,
    signature: 'sig-complete-' + slot,
    block_time: 1_700_000_000 + slot,
    chain_seq: 99,
    user: CREATOR,
    mint,
    bonding_curve: '77777777777777777777777777777777',
    timestamp: '1700000000',
    quote_mint: 'So11111111111111111111111111111111111111112',
  };
}

function mark(mint: string, slot: number, vq: bigint, vt: bigint, rq: bigint): Mark {
  return {
    mint,
    slot,
    virtual_token_reserves: vt.toString(),
    virtual_quote_reserves: vq.toString(),
    real_token_reserves: vt.toString(),
    real_quote_reserves: rq.toString(),
  };
}

function fill(
  clientId: string,
  mint: string,
  side: 'buy' | 'sell',
  status: 'filled' | 'rejected' | 'failed',
  decidedSlot: number,
  slot: number,
  quoteLamports: bigint,
  tokenAmount: bigint,
  reason: string | null = null,
): Fill {
  return {
    client_id: clientId,
    mint,
    side,
    status,
    reason: reason as Fill['reason'],
    decided_slot: decidedSlot,
    slot,
    quote_lamports: quoteLamports.toString(),
    token_amount: tokenAmount.toString(),
    fee_lamports: '0',
    tx_fee_lamports: TX.toString(),
    fee_fallback: false,
  };
}

/** A minimal deterministic replay driver around BotState. */
class Sim {
  state: BotState;
  strat: ReturnType<typeof createStrategy>;
  seq = 0;
  cash: bigint;
  positions = new Map<string, { tokens: bigint; cost: bigint }>();

  constructor(capitalLamports = 10n * SOL) {
    this.state = new BotState(hello(capitalLamports));
    this.strat = createStrategy(DEFAULT_PARAMS);
    this.cash = capitalLamports;
  }

  /** Apply a batch, run the strategy, validate + record the reply. Returns wire orders. */
  batch(slot: number, events: ChainEvent[], marks: Mark[] = [], fills: Fill[] = []): Order[] {
    this.seq += 1;
    const account = {
      cash_lamports: this.cash.toString(),
      positions: [...this.positions.entries()].map(([mint, p]) => ({
        mint,
        token_amount: p.tokens.toString(),
        cost_lamports: p.cost.toString(),
      })),
    };
    const b: Batch = { type: 'batch', seq: this.seq, slot, events, marks, fills, account };
    this.state.applyBatch(b);
    const orders = this.strat.onBatch(this.state, b);
    const wire = this.state.toOrders(orders); // throws on >16 orders / malformed order
    this.state.recordOrders(wire);
    return wire;
  }

  /** Fold a buy fill into the ledger (cash and position), as the harness would. */
  applyBuyFill(f: Fill): void {
    assert.equal(f.status, 'filled');
    this.cash -= BigInt(f.quote_lamports) + TX;
    const p = this.positions.get(f.mint) ?? { tokens: 0n, cost: 0n };
    p.tokens += BigInt(f.token_amount);
    p.cost += BigInt(f.quote_lamports);
    this.positions.set(f.mint, p);
  }

  applySellFill(f: Fill): void {
    assert.equal(f.status, 'filled');
    this.cash += BigInt(f.quote_lamports) - TX;
    const p = this.positions.get(f.mint);
    assert.ok(p);
    p.tokens -= BigInt(f.token_amount);
    if (p.tokens <= 0n) this.positions.delete(f.mint);
  }

  applyFailedFill(): void {
    this.cash -= TX; // failed tx still pays the tx fee, nothing trades
  }
}

/** Two buys (1 SOL + 0.5 SOL) that leave a coin passing the rug filter. */
function goodTape(mint: string, slot: number): ChainEvent[] {
  return [
    createEvent(mint, slot),
    tradeEvent(mint, slot, U1, true, 1n * SOL, 31n * SOL, 967_800_000_000n, 1n * SOL),
    tradeEvent(mint, slot, U2, true, SOL / 2n, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n),
  ];
}

/** Buy MINT_A through a fill and return the buy's wire order. Tokens for 15m lamports at ~0.032 lamports/token. */
function buyMintA(sim: Sim, slot = 100): Order {
  const orders = sim.batch(slot, goodTape(MINT_A, slot));
  assert.equal(orders.length, 1, 'expected exactly one buy order');
  const buy = orders[0]!;
  assert.equal(buy.side, 'buy');
  assert.equal(buy.mint, MINT_A);
  assert.equal(buy.quote_lamports, '15000000'); // min(stake 50m, 1% of real 1.5 SOL) = 15m
  const f = fill(buy.client_id, MINT_A, 'buy', 'filled', slot, slot + 2, 15_000_000n, 467_800_000n);
  sim.applyBuyFill(f);
  sim.batch(slot + 2, [], [], [f]);
  return buy;
}

// ---------------------------------------------------------------- entry tests

test('entry: good launch passes the rug filter and buys min(stake, 1% cap)', () => {
  const sim = new Sim();
  const orders = sim.batch(100, goodTape(MINT_A, 100));
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'buy');
  assert.equal(orders[0]!.quote_lamports, '15000000');
  assert.equal(orders[0]!.max_slippage_bps, 10_000);
});

test('entry: fresh curve with real SOL 0 is skipped (maxBuy is 0)', () => {
  const sim = new Sim();
  const orders = sim.batch(100, [createEvent(MINT_A, 100)]);
  assert.equal(orders.length, 0);
});

test('entry: creator sold before entry -> coin skipped for good', () => {
  const sim = new Sim();
  const events: ChainEvent[] = [
    createEvent(MINT_A, 100),
    tradeEvent(MINT_A, 100, U1, true, 1n * SOL, 31n * SOL, 967_800_000_000n, 1n * SOL),
    tradeEvent(MINT_A, 100, U2, true, SOL / 2n, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n),
    tradeEvent(MINT_A, 101, CREATOR, false, 100_000_000n, 31_400_000_000n, 955_000_000_000n, 1_400_000_000n),
  ];
  const orders = sim.batch(101, events);
  assert.equal(orders.length, 0);
  // Even with the price recovering later, the coin stays done.
  const later = sim.batch(102, [
    tradeEvent(MINT_A, 102, U3, true, 1n * SOL, 32_400_000_000n, 925_000_000_000n, 2_400_000_000n),
  ]);
  assert.equal(later.length, 0);
});

test('entry: launch bundled by 4 distinct buyers is skipped (maxBuyers 3)', () => {
  const sim = new Sim();
  const events: ChainEvent[] = [
    createEvent(MINT_A, 100),
    tradeEvent(MINT_A, 100, U1, true, 400_000_000n, 30_400_000_000n, 987_000_000_000n, 400_000_000n),
    tradeEvent(MINT_A, 100, U2, true, 400_000_000n, 30_800_000_000n, 974_000_000_000n, 800_000_000n),
    tradeEvent(MINT_A, 100, U3, true, 400_000_000n, 31_200_000_000n, 961_000_000_000n, 1_200_000_000n),
    tradeEvent(MINT_A, 100, U4, true, 400_000_000n, 31_600_000_000n, 948_000_000_000n, 1_600_000_000n),
  ];
  assert.equal(sim.batch(100, events).length, 0);
});

test('entry: coin first seen after maxAge (3 slots) is never bought', () => {
  const sim = new Sim();
  sim.batch(100, [createEvent(MINT_A, 100)]);
  assert.equal(sim.batch(101, []).length, 0);
  assert.equal(sim.batch(102, []).length, 0);
  assert.equal(sim.batch(103, []).length, 0);
  // First qualifying tape arrives at age 4.
  const orders = sim.batch(104, [
    tradeEvent(MINT_A, 104, U1, true, 1n * SOL, 31n * SOL, 967_800_000_000n, 1n * SOL),
    tradeEvent(MINT_A, 104, U2, true, SOL / 2n, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n),
  ]);
  assert.equal(orders.length, 0);
});

test('entry: at most 5 open positions (6 good coins -> 5 buys)', () => {
  const sim = new Sim();
  const mints = [MINT_A, MINT_B, MINT_C, MINT_D, MINT_E, MINT_F];
  const events = mints.flatMap((m) => goodTape(m, 100));
  const orders = sim.batch(100, events);
  assert.equal(orders.length, 5);
  assert.equal(new Set(orders.map((o) => o.mint)).size, 5);
});

test('entry: insufficient cash skips the buy instead of sending an unaffordable order', () => {
  const sim = new Sim(10_000_000n); // 0.01 SOL capital
  assert.equal(sim.batch(100, goodTape(MINT_A, 100)).length, 0);
});

// ---------------------------------------------------------------- exit tests

test('exit: take-profit at +20% sells the whole position', () => {
  const sim = new Sim();
  buyMintA(sim);
  // Mark the price +27% over the buy: value ~19.3m vs basis 15.105m.
  const orders = sim.batch(104, [], [mark(MINT_A, 104, 40_000_000_000n, 952_000_000_000n, 1_500_000_000n)]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
  assert.equal(orders[0]!.mint, MINT_A);
  assert.equal(orders[0]!.token_amount, '467800000');
});

test('exit: stop-loss at -8% sells the whole position', () => {
  const sim = new Sim();
  buyMintA(sim);
  const orders = sim.batch(104, [], [mark(MINT_A, 104, 26_000_000_000n, 952_000_000_000n, 1_500_000_000n)]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
  assert.equal(orders[0]!.token_amount, '467800000');
});

test('exit: maxHold 20 slots sells even when the price is flat', () => {
  const sim = new Sim();
  buyMintA(sim, 100); // filled at slot 102 -> openedSlot 102
  const flat = [mark(MINT_A, 121, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n)];
  assert.equal(sim.batch(121, [], flat).length, 0, 'slot 121 is only 19 slots held');
  const orders = sim.batch(122, [], [mark(MINT_A, 122, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n)]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
});

test('exit: creator sells during the 2-slot buy latency -> exit still fires', () => {
  const sim = new Sim();
  const orders = sim.batch(100, goodTape(MINT_A, 100));
  assert.equal(orders.length, 1);
  const buy = orders[0]!;
  // Creator dumps in the latency window (slot 101), before the fill lands.
  const dump = sim.batch(101, [
    tradeEvent(MINT_A, 101, CREATOR, false, 100_000_000n, 31_400_000_000n, 955_000_000_000n, 1_400_000_000n),
  ]);
  assert.equal(dump.length, 0);
  // Fill arrives at slot 102; the dev-sell exit must fire in the same reply
  // because devSoldAtOpen was snapshotted (false) at submission, not at fill.
  const f = fill(buy.client_id, MINT_A, 'buy', 'filled', 100, 102, 15_000_000n, 467_800_000n);
  sim.applyBuyFill(f);
  const exit = sim.batch(102, [], [], [f]);
  assert.equal(exit.length, 1);
  assert.equal(exit[0]!.side, 'sell');
});

test('exit: creator sells while held -> immediate exit', () => {
  const sim = new Sim();
  buyMintA(sim);
  const orders = sim.batch(104, [
    tradeEvent(MINT_A, 104, CREATOR, false, 100_000_000n, 31_400_000_000n, 955_000_000_000n, 1_400_000_000n),
  ]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
});

test('exit: mark with zero reserves is ignored (falls back to curve)', () => {
  const sim = new Sim();
  buyMintA(sim);
  // Mark reports vt = 0; the same batch's trade keeps the curve valid and
  // flat. Before the fix the zero mark made sellValue return 0 and falsely
  // triggered the stop-loss.
  const orders = sim.batch(104, [
    tradeEvent(MINT_A, 104, U1, true, 100_000_000n, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n),
  ], [mark(MINT_A, 104, 40_000_000_000n, 0n, 1_500_000_000n)]);
  assert.equal(orders.length, 0);
});

test('exit: stale mark (older than the latest trade) is ignored, curve wins', () => {
  const sim = new Sim();
  buyMintA(sim);
  // The trade moves the curve +27% (TP territory); the mark is one slot older
  // and still shows the flat price. Before the fix the stale mark won and
  // the TP never fired.
  const orders = sim.batch(104, [
    tradeEvent(MINT_A, 104, U1, true, 2n * SOL, 40_000_000_000n, 952_000_000_000n, 3_500_000_000n),
  ], [mark(MINT_A, 103, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n)]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
});

test('exit: marks missing -> price falls back to curve reserves from the trade', () => {
  const sim = new Sim();
  buyMintA(sim);
  // No marks: the trade itself moves the curve +27%, the exit reads the curve.
  const orders = sim.batch(104, [
    tradeEvent(MINT_A, 104, U1, true, 2n * SOL, 40_000_000_000n, 952_000_000_000n, 3_500_000_000n),
  ]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]!.side, 'sell');
});

test('exit: CompleteEvent -> no orders (harness force-closes; selling would be token_complete)', () => {
  const sim = new Sim();
  const buy = buyMintA(sim);
  void buy;
  const orders = sim.batch(104, [completeEvent(MINT_A, 104)]);
  assert.equal(orders.length, 0);
  // The harness close fill clears the position; a later +50% mark must not sell.
  const close = fill('_complete_1', MINT_A, 'sell', 'filled', 104, 104, 19_000_000n, 467_800_000n);
  sim.positions.delete(MINT_A);
  sim.cash += 19_000_000n - TX;
  const later = sim.batch(105, [], [mark(MINT_A, 105, 45_000_000_000n, 952_000_000_000n, 1_500_000_000n)], [close]);
  assert.equal(later.length, 0);
});

// ---------------------------------------------------------------- failure / recovery tests

test('failure: failed buy tx pays the fee, creates no position, does not crash', () => {
  const sim = new Sim();
  const orders = sim.batch(100, goodTape(MINT_A, 100));
  assert.equal(orders.length, 1);
  const buy = orders[0]!;
  const f = fill(buy.client_id, MINT_A, 'buy', 'failed', 100, 102, 0n, 0n);
  sim.applyFailedFill();
  sim.batch(102, [], [], [f]);
  assert.equal(sim.positions.size, 0);
  // A failed buy exhausts the coin's single buy attempt: buysSent counts orders
  // SENT, not fills, and maxAdds is 0, so the coin is never retried (shipped
  // pilot behaviour — the loss is capped at one tx fee per coin).
  const retry = sim.batch(103, [
    tradeEvent(MINT_A, 103, U3, true, 500_000_000n, 32_000_000_000n, 940_000_000_000n, 2_000_000_000n),
  ]);
  assert.equal(retry.length, 0);
});

test('failure: sell rejected for insufficient_tokens -> re-sell the remaining tokens', () => {
  const sim = new Sim();
  const buy = buyMintA(sim);
  void buy;
  const tpMark = [mark(MINT_A, 104, 40_000_000_000n, 952_000_000_000n, 1_500_000_000n)];
  const sells = sim.batch(104, [], tpMark);
  assert.equal(sells.length, 1);
  const sell = sells[0]!;
  const rej = fill(sell.client_id, MINT_A, 'sell', 'rejected', 104, 106, 0n, 0n, 'insufficient_tokens');
  // The rejected fill is processed in the same onBatch as the exits, so the
  // re-sell is sent in the very same reply; the position is still held in full.
  const resend = sim.batch(106, [], tpMark, [rej]);
  assert.equal(resend.length, 1);
  assert.equal(resend[0]!.side, 'sell');
  assert.equal(resend[0]!.token_amount, '467800000');
  // While that re-sell is in flight, no duplicate sell is sent.
  const dup = sim.batch(107, [], [mark(MINT_A, 107, 40_000_000_000n, 952_000_000_000n, 1_500_000_000n)]);
  assert.equal(dup.length, 0);
});

test('exit: rejected sell is retried even after the exit condition clears (sticky exit)', () => {
  const sim = new Sim();
  const buy = buyMintA(sim);
  void buy;
  const tpMark = [mark(MINT_A, 104, 40_000_000_000n, 952_000_000_000n, 1_500_000_000n)];
  const sells = sim.batch(104, [], tpMark);
  assert.equal(sells.length, 1);
  const sell = sells[0]!;
  const rej = fill(sell.client_id, MINT_A, 'sell', 'rejected', 104, 106, 0n, 0n, 'insufficient_tokens');
  // The reject batch carries a FLAT mark: the TP condition has cleared, but
  // the decided exit is sticky and the sell is retried anyway.
  const resend = sim.batch(106, [], [mark(MINT_A, 106, 31_500_000_000n, 952_000_000_000n, 1_500_000_000n)], [rej]);
  assert.equal(resend.length, 1);
  assert.equal(resend[0]!.side, 'sell');
});

test('safety: reply never exceeds 16 orders even when pacing is far behind (splitting disabled)', () => {
  const sim = new Sim();
  const mints = [MINT_A, MINT_B, MINT_C, MINT_D, MINT_E];
  // Batch 1: buy all five coins (one piece each while pacing is on schedule).
  const first = sim.batch(100, mints.flatMap((m) => goodTape(m, 100)));
  assert.equal(first.length, 5);
  // Batch 2: deliver all five buy fills (positions open, filled = 5).
  const fills = first.map((o, i) =>
    fill(o.client_id, mints[i]!, 'buy', 'filled', 100, 102, 15_000_000n, 467_800_000n),
  );
  for (const f of fills) sim.applyBuyFill(f);
  assert.equal(sim.batch(102, [], [], fills).length, 0);
  // Batch 3: jump block_time ~20_000s into the window with only 5 fills done:
  // pacing is far behind its 300-fill schedule, but order splitting is
  // disabled (maxSplit 1), so each sell is a single order: 5 sells total.
  const marks = mints.map((m) => {
    const mk = mark(m, 103, 40_000_000_000n, 952_000_000_000n, 1_500_000_000n);
    mk.slot = 103;
    return mk;
  });
  const events: ChainEvent[] = mints.map((m) =>
    tradeEvent(m, 103, U3, true, 100_000_000n, 40_000_000_000n, 952_000_000_000n, 1_600_000_000n),
  );
  for (const e of events) e.block_time = 1_700_020_000;
  const orders = sim.batch(103, events, marks);
  assert.equal(orders.length, 5, `expected 5 sells x 1 piece, got ${orders.length}`);
  assert.ok(orders.length <= 16);
  assert.ok(orders.every((o) => o.side === 'sell'));
});

// ---------------------------------------------------------------- determinism

test('determinism: two runs over the same batch sequence return byte-identical orders', () => {
  const mints = [MINT_A, MINT_B, MINT_C];
  const run = (): string => {
    const sim = new Sim();
    const out: unknown[] = [];
    // Slot 100: three good launches -> three buys (o1, o2, o3 in mint order).
    out.push(sim.batch(100, mints.flatMap((m) => goodTape(m, 100))));
    // Slot 102: deliver the three buy fills.
    const buys = (out[0] as Order[]).map((o, i) =>
      fill(o.client_id, mints[i]!, 'buy', 'filled', 100, 102, 15_000_000n, 467_800_000n),
    );
    for (const f of buys) sim.applyBuyFill(f);
    out.push(sim.batch(102, [], [], buys));
    // Slots 103..130: prices climb ~1% per slot; TP (+20%) fires partway through.
    for (let s = 103; s <= 130; s++) {
      const vq = 31_500_000_000n + BigInt(s - 102) * 315_000_000n;
      out.push(
        sim.batch(
          s,
          [],
          mints.map((m) => mark(m, s, vq, 952_000_000_000n, 1_500_000_000n)),
        ),
      );
    }
    return JSON.stringify(out);
  };
  const first = run();
  const second = run();
  assert.equal(first, second);
  assert.ok(first.includes('"side":"sell"'), 'the script must actually exercise an exit');
});

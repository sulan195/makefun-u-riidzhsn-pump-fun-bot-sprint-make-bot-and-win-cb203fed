import { BPS } from './vendor/makefun-bot.ts';
import type { Batch, BotState, OrderInput, Pubkey } from './vendor/makefun-bot.ts';

export interface Params {
  minAge: number; maxAge: number; stakeLamports: number; minBuyLamports: number;
  maxAdds: number; addStepBps: number; addDelay: number; addLamports: number; addMinFlowLamports: number;
  minRealSol: number; maxRealSol: number; minDevBuy: number; maxDevBuy: number;
  minTrades: number; minBuyers: number; maxBuyers: number;
  maxSellRatioBps: number; maxBigSellBps: number; minRunupBps: number; maxRunupBps: number;
  flowWindow: number; minFlowLamports: number; minRecentBuyers: number;
  skipDevSold: boolean; buySlippageBps: number;
  tp1Bps: number; tp1PartBps: number; slAfterTp1Bps: number;
  tpBps: number; slBps: number; trailArmBps: number; trailBps: number;
  maxHold: number; exitOnDevSell: boolean; staleSlots: number; exitFlowLamports: number;
  fillTarget: number; windowSeconds: number; baseSplit: number; maxSplit: number; minPieceLamports: number;
}

export const DEFAULT_PARAMS: Params = {
  minAge: 0, maxAge: 3, stakeLamports: 50_000_000, minBuyLamports: 5_000_000,
  maxAdds: 0, addStepBps: 0, addDelay: 2, addLamports: 100_000_000, addMinFlowLamports: 0,
  minRealSol: 1_000_000_000, maxRealSol: 30_000_000_000, minDevBuy: 0, maxDevBuy: 2_500_000_000,
  minTrades: 0, minBuyers: 0, maxBuyers: 3,
  maxSellRatioBps: 10_000, maxBigSellBps: 10_000, minRunupBps: 0, maxRunupBps: 1_000_000,
  flowWindow: 10, minFlowLamports: -1_000_000_000_000, minRecentBuyers: 0,
  skipDevSold: true, buySlippageBps: 10_000,
  tp1Bps: 1_000_000, tp1PartBps: 5_000, slAfterTp1Bps: 0,
  tpBps: 2_000, slBps: 800, trailArmBps: 1_000_000, trailBps: 1_000,
  maxHold: 20, exitOnDevSell: true, staleSlots: 1_000_000, exitFlowLamports: 1_000_000_000_000,
  fillTarget: 300, windowSeconds: 21_600, baseSplit: 1, maxSplit: 1, minPieceLamports: 2_000_000,
};

export interface Strategy {
  onBatch(state: BotState, batch: Batch): OrderInput[];
}

interface TradeTick {
  slot: number;
  isBuy: boolean;
  sol: bigint;
  user: Pubkey;
}

interface Coin {
  mint: Pubkey;
  createSlot: number;
  creator: Pubkey;
  vq0: bigint;
  vt0: bigint;
  devBuy: bigint;
  trades: number;
  buyers: Set<Pubkey>;
  bought: bigint;
  soldByOthers: bigint;
  bigSellBps: bigint;
  devSold: boolean;
  lastTradeSlot: number;
  recent: TradeTick[];
  buysSent: number;
  spentSent: bigint;
  devSoldAtBuy: boolean;
  lastBuyVq: bigint;
  lastBuyVt: bigint;
  lastBuySlot: number;
  done: boolean;
  complete: boolean;
}

interface Held {
  openedSlot: number;
  txPaid: bigint;
  best: bigint;
  devSoldAtOpen: boolean;
  tookTp1: boolean;
  exiting: boolean;
}

interface FlowStats {
  net: bigint;
  buyers: number;
}

interface ReservePair {
  vq: bigint;
  vt: bigint;
}

const CURVE_FEE_BPS = 125n;
const MAX_SELL_SLIPPAGE_BPS = 10_000;

function toBigInt(n: number): bigint {
  return BigInt(Math.trunc(n));
}

function clampInt(value: number, lo: number, hi: number): number {
  const v = Math.trunc(value);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Proceeds from selling `tokens` into virtual reserves `(vq, vt)` after
 * bonding-curve fees (95 bps protocol + 30 bps creator = 125 bps, rounded up).
 */
function sellValue(tokens: bigint, vq: bigint, vt: bigint): bigint {
  if (tokens <= 0n || vt <= 0n || vq <= 0n) return 0n;
  const q = (tokens * vq) / (vt + tokens);
  const fee = (q * CURVE_FEE_BPS + BPS - 1n) / BPS;
  return q - fee;
}

export function createStrategy(params: Params = DEFAULT_PARAMS): Strategy {
  const stakeLamports = toBigInt(params.stakeLamports);
  const minBuyLamports = toBigInt(params.minBuyLamports);
  const addStepBps = toBigInt(params.addStepBps);
  const addLamports = toBigInt(params.addLamports);
  const addMinFlowLamports = toBigInt(params.addMinFlowLamports);
  const minRealSol = toBigInt(params.minRealSol);
  const maxRealSol = toBigInt(params.maxRealSol);
  const minDevBuy = toBigInt(params.minDevBuy);
  const maxDevBuy = toBigInt(params.maxDevBuy);
  const maxSellRatioBps = toBigInt(params.maxSellRatioBps);
  const maxBigSellBps = toBigInt(params.maxBigSellBps);
  const minRunupBps = toBigInt(params.minRunupBps);
  const maxRunupBps = toBigInt(params.maxRunupBps);
  const minFlowLamports = toBigInt(params.minFlowLamports);
  const tp1Bps = toBigInt(params.tp1Bps);
  const tp1PartBps = toBigInt(params.tp1PartBps);
  const slAfterTp1Bps = toBigInt(params.slAfterTp1Bps);
  const tpBps = toBigInt(params.tpBps);
  const slBps = toBigInt(params.slBps);
  const trailArmBps = toBigInt(params.trailArmBps);
  const trailBps = toBigInt(params.trailBps);
  const exitFlowLamports = toBigInt(params.exitFlowLamports);
  const minPieceLamports = toBigInt(params.minPieceLamports);

  const coins = new Map<Pubkey, Coin>();
  const held = new Map<Pubkey, Held>();
  const selling = new Set<Pubkey>();

  let filled = 0;
  let firstTime: number | null = null;
  let nowTime = 0;

  function pruneTicks(coin: Coin, minSlot: number): void {
    let drop = 0;
    while (drop < coin.recent.length) {
      const tick = coin.recent[drop];
      if (tick === undefined || tick.slot >= minSlot) break;
      drop++;
    }
    if (drop > 0) {
      coin.recent.splice(0, drop);
    }
  }

  function flow(coin: Coin, slot: number): FlowStats {
    pruneTicks(coin, slot - params.flowWindow);
    let net = 0n;
    const recentBuyers = new Set<Pubkey>();
    for (const tick of coin.recent) {
      if (tick.isBuy) {
        net += tick.sol;
        if (tick.user !== coin.creator) {
          recentBuyers.add(tick.user);
        }
      } else {
        net -= tick.sol;
      }
    }
    return { net, buyers: recentBuyers.size };
  }

  /**
   * Guardrail pacing: splits orders into up to `maxSplit` pieces only when
   * cumulative filled count falls behind the linear `fillTarget` schedule
   * across `windowSeconds` of replay block_time.
   */
  function pieces(): number {
    if (firstTime === null || params.windowSeconds <= 0) {
      return params.baseSplit;
    }
    const rawElapsed = nowTime - firstTime;
    const elapsed =
      rawElapsed < 0 ? 0 : rawElapsed > params.windowSeconds ? params.windowSeconds : rawElapsed;
    const due = (params.fillTarget * elapsed) / params.windowSeconds;
    if (filled >= due) {
      return params.baseSplit;
    }
    const behind = due - filled;
    const extra = behind > params.fillTarget * 0.15 ? 2 : 1;
    return Math.min(params.maxSplit, params.baseSplit + extra);
  }

  function sellOrders(mint: Pubkey, tokens: bigint, k: number, room: number): OrderInput[] {
    if (room <= 0 || tokens <= 0n) return [];
    const n = clampInt(k, 1, room);
    const piece = tokens / BigInt(n);
    if (piece === 0n) {
      return [
        {
          side: 'sell',
          mint,
          token_amount: tokens,
          max_slippage_bps: MAX_SELL_SLIPPAGE_BPS,
        },
      ];
    }
    const out: OrderInput[] = [];
    for (let i = 0; i < n - 1; i++) {
      out.push({
        side: 'sell',
        mint,
        token_amount: piece,
        max_slippage_bps: MAX_SELL_SLIPPAGE_BPS,
      });
    }
    out.push({
      side: 'sell',
      mint,
      token_amount: tokens - piece * BigInt(n - 1),
      max_slippage_bps: MAX_SELL_SLIPPAGE_BPS,
    });
    return out;
  }

  function buyOrders(mint: Pubkey, amount: bigint, k: number, room: number): OrderInput[] {
    if (room <= 0 || amount <= 0n) return [];
    let n = clampInt(k, 1, room);
    while (n > 1 && amount / BigInt(n) < minPieceLamports) {
      n--;
    }
    const piece = amount / BigInt(n);
    if (piece === 0n) {
      return [
        {
          side: 'buy',
          mint,
          quote_lamports: amount,
          max_slippage_bps: params.buySlippageBps,
        },
      ];
    }
    const out: OrderInput[] = [];
    for (let i = 0; i < n - 1; i++) {
      out.push({
        side: 'buy',
        mint,
        quote_lamports: piece,
        max_slippage_bps: params.buySlippageBps,
      });
    }
    out.push({
      side: 'buy',
      mint,
      quote_lamports: amount - piece * BigInt(n - 1),
      max_slippage_bps: params.buySlippageBps,
    });
    return out;
  }

  function onBatch(state: BotState, batch: Batch): OrderInput[] {
    // 1 & 2. Fold chain events into per-coin state and track deterministic block_time.
    for (const ev of batch.events) {
      if (ev.block_time !== null) {
        if (firstTime === null) {
          firstTime = ev.block_time;
          nowTime = ev.block_time;
        } else if (ev.block_time > nowTime) {
          nowTime = ev.block_time;
        }
      }

      if (ev.event === 'CreateEvent') {
        if (!coins.has(ev.mint)) {
          coins.set(ev.mint, {
            mint: ev.mint,
            createSlot: ev.slot,
            creator: ev.creator,
            vq0: BigInt(ev.virtual_quote_reserves),
            vt0: BigInt(ev.virtual_token_reserves),
            devBuy: 0n,
            trades: 0,
            buyers: new Set<Pubkey>(),
            bought: 0n,
            soldByOthers: 0n,
            bigSellBps: 0n,
            devSold: false,
            lastTradeSlot: ev.slot,
            recent: [],
            buysSent: 0,
            spentSent: 0n,
            devSoldAtBuy: false,
            lastBuyVq: 0n,
            lastBuyVt: 0n,
            lastBuySlot: ev.slot,
            done: false,
            complete: false,
          });
        }
      } else if (ev.event === 'TradeEvent') {
        const coin = coins.get(ev.mint);
        if (coin === undefined) continue;
        // Retired, unheld coins are dead: stop growing their tape (buyers Set
        // and recent ticks are unbounded otherwise; see review finding 6).
        // Held coins keep updating — exits read devSold/lastTradeSlot/flow.
        if (coin.done && !held.has(coin.mint)) continue;

        const sol = BigInt(ev.sol_amount);
        coin.trades++;
        coin.lastTradeSlot = ev.slot;
        coin.recent.push({
          slot: ev.slot,
          isBuy: ev.is_buy,
          sol,
          user: ev.user,
        });
        if (coin.recent.length > 128) {
          pruneTicks(coin, Math.min(ev.slot, batch.slot) - params.flowWindow);
        }

        if (ev.is_buy) {
          coin.bought += sol;
          if (ev.user === coin.creator && ev.slot === coin.createSlot) {
            coin.devBuy += sol;
          } else if (ev.user !== coin.creator) {
            coin.buyers.add(ev.user);
          }
        } else {
          if (ev.user === coin.creator) {
            coin.devSold = true;
          } else {
            coin.soldByOthers += sol;
            const preReal = BigInt(ev.real_quote_reserves) + sol;
            if (preReal > 0n) {
              const sellBps = (sol * BPS) / preReal;
              if (sellBps > coin.bigSellBps) {
                coin.bigSellBps = sellBps;
              }
            }
          }
        }
      } else if (ev.event === 'CompleteEvent') {
        const coin = coins.get(ev.mint);
        if (coin !== undefined) {
          coin.complete = true;
          coin.done = true;
        }
      }
    }

    // 3. Build batch marks lookup and read batch order cap + per-order tx fee.
    // The mark's slot is kept: a mark older than the curve's latest reserves
    // is stale and must not override a newer trade (Luna finding 1).
    const marks = new Map<Pubkey, ReservePair & { slot: number }>();
    for (const m of batch.marks) {
      marks.set(m.mint, {
        vq: BigInt(m.virtual_quote_reserves),
        vt: BigInt(m.virtual_token_reserves),
        slot: m.slot,
      });
    }
    const cap = state.hello.caps.max_orders_per_batch;
    const tx = state.txFeeLamports();

    // 4. Reconcile fills: handle synthetic '_' closes, count fills, track tx fees & Held state.
    for (const f of batch.fills) {
      if (f.client_id.startsWith('_')) {
        held.delete(f.mint);
        selling.delete(f.mint);
        continue;
      }
      if (f.status === 'filled') {
        filled++;
      }
      const txFee = BigInt(f.tx_fee_lamports);
      const existingHeld = held.get(f.mint);
      if (existingHeld !== undefined) {
        if (f.status !== 'rejected') {
          existingHeld.txPaid += txFee;
        }
      } else if (f.side === 'buy' && f.status === 'filled') {
        const coin = coins.get(f.mint);
        held.set(f.mint, {
          openedSlot: f.slot,
          txPaid: txFee,
          best: 0n,
          // Snapshot from BUY SUBMISSION time (coin.devSoldAtBuy), not the
          // fill slot: a creator dump during the 2-slot buy latency must
          // still trigger the dev-sell exit (review finding 1).
          devSoldAtOpen: coin?.devSoldAtBuy ?? false,
          tookTp1: false,
          exiting: false,
        });
      }
    }

    // 5. Clean up `selling` and stale `held` entries against live pending orders & positions.
    const pendingBuyMints = new Set<Pubkey>();
    const pendingSellMints = new Set<Pubkey>();
    for (const p of state.pending.values()) {
      if (p.order.side === 'buy') {
        pendingBuyMints.add(p.order.mint);
      } else {
        pendingSellMints.add(p.order.mint);
      }
    }

    for (const mint of selling) {
      if (!pendingSellMints.has(mint)) {
        selling.delete(mint);
      }
    }

    for (const mint of held.keys()) {
      const pos = state.positions.get(mint);
      const hasPosition = pos !== undefined && pos.token_amount > 0n;
      if (!hasPosition && !selling.has(mint) && !pendingBuyMints.has(mint)) {
        held.delete(mint);
      }
    }

    // Evict retired/completed coins with no open position, no pending buy
    // and no held entry: keeps the per-batch entry scan bounded under
    // high-launch-volume windows (review finding 6).
    for (const mint of coins.keys()) {
      const c = coins.get(mint)!;
      if (
        (c.done || c.complete) &&
        !held.has(mint) &&
        !state.positions.has(mint) &&
        !pendingBuyMints.has(mint)
      ) {
        coins.delete(mint);
      }
    }

    // 6. Compute pacing split count for this batch.
    const k = pieces();
    const orders: OrderInput[] = [];

    // 7. EXITS FIRST — evaluate held positions in insertion order before any new buys.
    // Exit triggers:
    //   (a) Partial TP (tp1Bps -> sell tp1PartBps as single order)
    //   (b) Full TP (tpBps)
    //   (c) Stop-loss (slBps, or slAfterTp1Bps after partial TP)
    //   (d) Trailing stop (armed at trailArmBps, trails peak net value by trailBps)
    //   (e) Max hold duration (maxHold slots)
    //   (f) Creator sell after entry (exitOnDevSell when !devSoldAtOpen)
    //   (g) Stale tape (staleSlots without trades)
    //   (h) Heavy net sell flow (flow.net < -exitFlowLamports)
    for (const [mint, pos] of state.positions) {
      if (orders.length >= cap) break;
      if (pos.token_amount <= 0n) continue;
      if (selling.has(mint)) continue;

      const coin = coins.get(mint);
      const curve = state.curves.get(mint);
      if (curve?.complete || coin?.complete) continue;

      let h = held.get(mint);
      if (h === undefined) {
        h = {
          openedSlot: state.slot,
          txPaid: tx,
          best: 0n,
          devSoldAtOpen: coin?.devSoldAtBuy ?? coin?.devSold ?? false,
          tookTp1: false,
          exiting: false,
        };
        held.set(mint, h);
      }

      // Prefer a fresh mark, but only when both reserves are positive; a
      // zero-reserve mark (vq = 0 or vt = 0) would make sellValue return 0
      // and falsely trigger the stop-loss (review finding 3).
      // A mark older than the curve's latest reserves is stale: the curve
      // already reflects a newer trade, so the mark must not win (Luna 1).
      const mark = marks.get(mint);
      let vq = curve?.virtual_quote_reserves;
      let vt = curve?.virtual_token_reserves;
      if (mark !== undefined && mark.vq > 0n && mark.vt > 0n) {
        if (curve === undefined || mark.slot >= curve.reserves_slot) {
          vq = mark.vq;
          vt = mark.vt;
        }
      }
      if (vq === undefined || vt === undefined || vq <= 0n || vt <= 0n) continue;

      const value = sellValue(pos.token_amount, vq, vt) - tx;
      const basis = pos.cost_lamports + h.txPaid;
      if (value > h.best) {
        h.best = value;
      }

      if (basis > 0n) {
        // (a) Partial take-profit (single order, marks coin done and skips full-exit checks).
        if (!h.tookTp1 && value * BPS >= basis * (BPS + tp1Bps)) {
          const part = (pos.token_amount * tp1PartBps) / BPS;
          if (part > 0n && part < pos.token_amount) {
            orders.push({
              side: 'sell',
              mint,
              token_amount: part,
              max_slippage_bps: MAX_SELL_SLIPPAGE_BPS,
            });
            selling.add(mint);
            h.tookTp1 = true;
            h.best = 0n;
            if (coin !== undefined) coin.done = true;
            continue;
          }
        }
      }

      // A decided exit stays decided (sticky): a failed/rejected split-sell
      // remainder must be retried next batch even if the trigger condition
      // transiently clears (review finding 4).
      let exit = h.exiting;
      if (basis > 0n) {
        // (b) Full take-profit.
        if (value * BPS >= basis * (BPS + tpBps)) {
          exit = true;
        }
        // (c) Stop-loss.
        const sl = h.tookTp1 ? slAfterTp1Bps : slBps;
        if (value * BPS <= basis * (BPS - sl)) {
          exit = true;
        }
        // (d) Trailing stop from best net exit value.
        if (
          h.best * BPS >= basis * (BPS + trailArmBps) &&
          value * BPS <= h.best * (BPS - trailBps)
        ) {
          exit = true;
        }
      }

      // (e) Maximum hold time in slots.
      if (state.slot - h.openedSlot >= params.maxHold) {
        exit = true;
      }
      // (f) Creator sold after position opened.
      if (params.exitOnDevSell && (coin?.devSold ?? false) && !h.devSoldAtOpen) {
        exit = true;
      }
      // (g) No trades for staleSlots.
      if (coin !== undefined && state.slot - coin.lastTradeSlot >= params.staleSlots) {
        exit = true;
      }
      // (h) Net order flow below -exitFlowLamports.
      if (coin !== undefined && flow(coin, state.slot).net < -exitFlowLamports) {
        exit = true;
      }

      if (exit) {
        h.exiting = true;
        const sells = sellOrders(mint, pos.token_amount, k, cap - orders.length);
        if (sells.length > 0) {
          orders.push(...sells);
          selling.add(mint);
          if (coin !== undefined) coin.done = true;
        }
      }
    }

    // 8. ENTRIES AND ADDS — scan coins in insertion order using remaining batch capacity.
    let free = state.freeCashLamports() - tx * BigInt(orders.length);
    let open = state.committedPositionCount();

    for (const coin of coins.values()) {
      if (orders.length >= cap) break;
      if (coin.done || coin.complete) continue;

      const age = state.slot - coin.createSlot;
      const isAdd = coin.buysSent > 0;
      if (!isAdd && age > params.maxAge) {
        coin.done = true;
        continue;
      }
      if (age < params.minAge) continue;

      if (isAdd) {
        // A failed/rejected buy leaves no position and no retry: retire the
        // coin instead of leaving it done === false forever (review finding 5).
        if (coin.buysSent > params.maxAdds) {
          if (
            !state.positions.has(coin.mint) &&
            !pendingBuyMints.has(coin.mint) &&
            !held.has(coin.mint)
          ) {
            coin.done = true;
          }
          continue;
        }
        const pos = state.positions.get(coin.mint);
        if (pos === undefined || pos.token_amount <= 0n) continue;
        if (selling.has(coin.mint) || pendingBuyMints.has(coin.mint)) continue;
        if (coin.devSold) continue;

        const curve = state.curves.get(coin.mint);
        if (curve === undefined || curve.complete) continue;
        if (state.slot - coin.lastBuySlot < params.addDelay) continue;

        const vq = curve.virtual_quote_reserves;
        const vt = curve.virtual_token_reserves;
        if (vt <= 0n || coin.lastBuyVt <= 0n) continue;
        if (vq * coin.lastBuyVt * BPS < coin.lastBuyVq * vt * (BPS + addStepBps)) continue;
        if (flow(coin, state.slot).net < addMinFlowLamports) continue;

        const maxBuy = state.maxBuyLamports(coin.mint);
        const amount = addLamports < maxBuy ? addLamports : maxBuy;
        if (amount < minBuyLamports) continue;

        const buys = buyOrders(coin.mint, amount, k, cap - orders.length);
        if (buys.length === 0) continue;
        // Reserve exactly the tx fees this split will cost (review finding 7).
        if (free < amount + tx * BigInt(buys.length)) continue;
        orders.push(...buys);
        free -= amount + tx * BigInt(buys.length);
        coin.buysSent++;
        if (coin.buysSent === 1) coin.devSoldAtBuy = coin.devSold;
        coin.spentSent += amount;
        coin.lastBuyVq = vq;
        coin.lastBuyVt = vt;
        coin.lastBuySlot = state.slot;
        continue;
      }

      // First buy path: enforce position cap, curve liveliness, dev-sell check, and rug filter.
      if (open >= state.hello.caps.max_open_positions) continue;
      if (selling.has(coin.mint) || pendingBuyMints.has(coin.mint) || state.positions.has(coin.mint)) {
        continue;
      }

      const curve = state.curves.get(coin.mint);
      if (curve === undefined || curve.complete) continue;

      if (coin.devSold && params.skipDevSold) {
        coin.done = true;
        continue;
      }

      const vq = curve.virtual_quote_reserves;
      const vt = curve.virtual_token_reserves;

      // Rug filter — every launch quality check must pass before sniping:
      // 1) Real SOL liquidity within [minRealSol, maxRealSol]
      // 2) Creator create-slot buy within [minDevBuy, maxDevBuy]
      // 3) Trade count >= minTrades and distinct non-creator buyers within [minBuyers, maxBuyers]
      // 4) Non-creator sell-to-buy ratio <= maxSellRatioBps and largest dump <= maxBigSellBps
      // 5) Price runup from launch reserves within [minRunupBps, maxRunupBps]
      // 6) Recent window net flow >= minFlowLamports and recent buyers >= minRecentBuyers
      const realSol = curve.real_quote_reserves;
      if (realSol < minRealSol || realSol > maxRealSol) continue;
      if (coin.devBuy < minDevBuy || coin.devBuy > maxDevBuy) continue;
      if (coin.trades < params.minTrades) continue;
      if (coin.buyers.size < params.minBuyers || coin.buyers.size > params.maxBuyers) continue;
      if (coin.bought > 0n && coin.soldByOthers * BPS > coin.bought * maxSellRatioBps) continue;
      if (coin.bigSellBps > maxBigSellBps) continue;
      if (vt <= 0n || coin.vq0 <= 0n) continue;
      const runup = (vq * coin.vt0 * BPS) / (vt * coin.vq0);
      if (runup < minRunupBps || runup > maxRunupBps) continue;
      const recentFlow = flow(coin, state.slot);
      if (recentFlow.net < minFlowLamports || recentFlow.buyers < params.minRecentBuyers) continue;

      const room = stakeLamports - coin.spentSent;
      if (room < minBuyLamports) continue;
      const maxBuy = state.maxBuyLamports(coin.mint);
      const amount = room < maxBuy ? room : maxBuy;
      if (amount < minBuyLamports) continue;

      const buys = buyOrders(coin.mint, amount, k, cap - orders.length);
      if (buys.length === 0) continue;
      // Reserve exactly the tx fees this split will cost (review finding 7).
      if (free < amount + tx * BigInt(buys.length)) continue;
      orders.push(...buys);
      free -= amount + tx * BigInt(buys.length);
      coin.buysSent++;
      // Snapshot the creator-sold flag at SUBMISSION time for the dev-sell
      // exit (review finding 1).
      if (coin.buysSent === 1) coin.devSoldAtBuy = coin.devSold;
      coin.spentSent += amount;
      coin.lastBuyVq = vq;
      coin.lastBuyVt = vt;
      coin.lastBuySlot = state.slot;
      open++;
    }

    // 9. Return batch orders.
    return orders;
  }

  return { onBatch };
}

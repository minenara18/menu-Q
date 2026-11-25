/**
 * Pure queue mathematics for Order-Q.
 *
 * No I/O lives here: services gather data (queue contents, menu make times,
 * station SLAs) and call these functions. Keeping the math pure makes the ETA
 * range, fallback behaviour, EMA learning and priority ordering unit-testable.
 */

/** Minimum completed samples before a menu's learned average is trusted. */
export const MIN_SAMPLE_COUNT = 5;
/** Exponential moving average smoothing factor for make-time learning. */
export const EMA_ALPHA = 0.3;
/** ETA is shown as a range: -20% / +30% around the point estimate. */
export const ETA_MIN_FACTOR = 0.8;
export const ETA_MAX_FACTOR = 1.3;
/** Light congestion multiplier: +2% per active subticket, capped at +25%. */
export const DENSITY_PER_ACTIVE = 0.02;
export const DENSITY_MAX = 0.25;
/** One manual bump is worth a huge score reduction so it beats FIFO/SLA. */
export const MANUAL_BUMP_SCORE = 1_000_000_000;
/** Fallback make time when a menu/category has no better value. */
export const DEFAULT_MAKE_SECONDS = 180;

/** Round to the nearest whole rupiah/second, halves rounded up. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + 0.5);
}

/**
 * EMA update for make time. The first sample replaces the seed value; later
 * samples blend with the previous average.
 */
export function nextEma(
  previous: number,
  sample: number,
  sampleCount: number,
  alpha: number = EMA_ALPHA,
): number {
  if (sampleCount <= 0) return sample;
  if (previous <= 0) return sample;
  return previous * (1 - alpha) + sample * alpha;
}

/** True while a menu has fewer than `minSamples` real observations. */
export function shouldUseFallback(sampleCount: number, minSamples: number = MIN_SAMPLE_COUNT): boolean {
  return sampleCount < minSamples;
}

/**
 * Resolve the make time used for ETA: category fallback until enough samples,
 * then the learned average.
 */
export function resolveAvgMakeSeconds(
  avgMakeSeconds: number,
  sampleCount: number,
  fallback: number,
  minSamples: number = MIN_SAMPLE_COUNT,
): number {
  if (shouldUseFallback(sampleCount, minSamples)) return fallback;
  return avgMakeSeconds > 0 ? avgMakeSeconds : fallback;
}

/** Light congestion factor based on the number of active subtickets. */
export function computeDensityFactor(activeSubticketCount: number): number {
  if (activeSubticketCount <= 0) return 1;
  return 1 + Math.min(DENSITY_MAX, activeSubticketCount * DENSITY_PER_ACTIVE);
}

/** One station's ETA = remaining queue work + work for the new items. */
export function estimateStationEtaSeconds(queueWorkSeconds: number, newWorkSeconds: number): number {
  return Math.max(0, queueWorkSeconds + newWorkSeconds);
}

/**
 * Ticket ETA = slowest station, scaled by congestion, expressed as a RANGE IN
 * MINUTES. Inputs are seconds (make times); the single conversion point is here
 * so checkout, validate, events, receipt and display all agree on the unit.
 */
export function estimateTicketEta(
  stationEtas: number[],
  activeSubticketCount: number,
): { point: number; min: number; max: number } {
  const peak = stationEtas.length > 0 ? Math.max(...stationEtas) : 0;
  const pointSeconds = peak * computeDensityFactor(activeSubticketCount);
  const point = pointSeconds / 60;
  const min = Math.max(1, roundHalfUp(point * ETA_MIN_FACTOR));
  const max = Math.max(min, roundHalfUp(point * ETA_MAX_FACTOR));
  return { point, min, max };
}

export type PriorityReason = 'FIFO' | 'melewati SLA' | 'bump manual';

export interface PriorityInput {
  createdAtMs: number;
  slaSeconds: number;
  nowMs: number;
  priorityBump: number;
}

export interface PriorityResult {
  /** Lower score = served first. */
  score: number;
  reason: PriorityReason;
  overdueSeconds: number;
}

/**
 * Transparent priority score.
 *
 * Base is FIFO (creation time). A subticket that has been waiting longer than
 * its station SLA receives a growing bonus (lower score). A manual maker bump
 * receives a very large bonus so it jumps the queue. Stations are independent,
 * so a small ticket at one station is never blocked by a large ticket at another.
 */
export function computePriorityScore(input: PriorityInput): PriorityResult {
  const ageMs = Math.max(0, input.nowMs - input.createdAtMs);
  const slaMs = Math.max(0, input.slaSeconds) * 1000;
  const overdueMs = Math.max(0, ageMs - slaMs);
  const overdueSeconds = Math.floor(overdueMs / 1000);

  const slaBonus = overdueMs;
  const bumpBonus = Math.max(0, input.priorityBump) * MANUAL_BUMP_SCORE;
  const score = input.createdAtMs - slaBonus - bumpBonus;

  let reason: PriorityReason = 'FIFO';
  if (bumpBonus > 0 && bumpBonus >= slaBonus) reason = 'bump manual';
  else if (slaBonus > 0) reason = 'melewati SLA';

  return { score, reason, overdueSeconds };
}

export interface QueueEntry {
  id: string;
  stationId: string;
  createdAtMs: number;
  slaSeconds: number;
  priorityBump: number;
}

export interface RankedQueueEntry<T> {
  entry: T;
  score: number;
  reason: PriorityReason;
  overdueSeconds: number;
  rank: number;
}

/** Order entries by priority score (ascending) and assign 1-based ranks. */
export function orderQueue<T extends QueueEntry>(entries: T[], nowMs: number): RankedQueueEntry<T>[] {
  return entries
    .map((entry) => ({
      entry,
      ...computePriorityScore({
        createdAtMs: entry.createdAtMs,
        slaSeconds: entry.slaSeconds,
        nowMs,
        priorityBump: entry.priorityBump,
      }),
    }))
    .sort((a, b) => a.score - b.score || a.entry.createdAtMs - b.entry.createdAtMs)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

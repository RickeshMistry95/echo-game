export type Shape = 'square' | 'circle' | 'octagon' | 'plus' | 'ring';
export type Tier = 'open' | 'standard' | 'tight';

export interface Point {
  x: number;
  y: number;
}

export interface CircleObstacle {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
}

export interface RectObstacle {
  kind: 'rect';
  x: number;
  y: number;
  hw: number;
  hh: number;
}

export type Obstacle = CircleObstacle | RectObstacle;

export interface GameMap {
  seed: number;
  tier: Tier;
  shape: Shape;
  obstacles: Obstacle[];
  spawn: Point;
  /** 100 pre-generated coin positions, reachable and away from walls. */
  coins: Point[];
  /** How many obstacle rerolls the fairness checks needed (0 = first try). */
  attempt: number;
}

export const TIERS: Tier[] = ['open', 'standard', 'tight'];
export const TIER_LABEL: Record<Tier, string> = { open: 'Open', standard: 'Standard', tight: 'Tight' };

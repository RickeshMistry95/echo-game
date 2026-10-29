// All gameplay numbers live here so tuning is a one-file job.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** One round lasts 10 seconds. */
export const ROUND_TICKS = 600;

/** The logical arena is 600 x 600 units. Screen size never changes difficulty. */
export const ARENA = 600;
export const CENTER = ARENA / 2;

export const PLAYER_R = 9;
export const GHOST_R = 9;
export const COIN_R = 10;

/** Centre distance at which player and ghost count as touching (a little forgiving). */
export const HIT_DIST = 16;
/** Passing closer than this without touching counts as a near miss. */
export const NEAR_DIST = 28;
/** Must get farther than this before the same ghost can score another near miss. */
export const NEAR_RESET = 40;

/** Top speed in units per second, identical on every input device. */
export const SPEED = 230;
/** Per-tick smoothing toward target velocity (about 80 ms to full speed). */
export const ACCEL_K = 0.2;

/** Collisions with ghosts are ignored for this many ticks at the start of a round. */
export const SHIELD_TICKS = 45;

export const ROUND_POINTS = 100;
/** Every coin is worth the same; a new one appears the moment you take one. */
export const COIN_POINTS = 25;
export const NEAR_POINTS = 10;
export const NEAR_CAP = 5;

/** A round's coin spawns at least this far from where the player starts. */
export const COIN_MIN_START_DIST = 150;
/** ...and not within this distance of any ghost start point. */
export const COIN_GHOST_CLEAR = 40;

/** Chain coins within this many ticks of each other to build a combo. */
export const COMBO_WINDOW = 150;
/** Every this many coins in a chain raises the multiplier by one. */
export const COMBO_STEP = 3;
export const COMBO_MAX_MULT = 5;

/** Chance a coin appears on a future clone path instead of a safe spot, and what it pays. */
export const RISKY_CHANCE = 0.3;
export const RISKY_MULT = 3;

/** A near miss gives a short burst of speed. */
export const BOOST_TICKS = 40;
export const BOOST_FACTOR = 1.35;

/** A slow clone replays at this fraction of your speed. */
export const SLOW_CLONE = 0.6;
/** A flickering clone is solid for FLICKER_SOLID ticks of every FLICKER_PERIOD, and harmless in between. */
export const FLICKER_PERIOD = 150;
export const FLICKER_SOLID = 90;

/** Round modifiers change your speed. */
export const SWIFT_FACTOR = 1.3;
export const SLUGGISH_FACTOR = 0.8;

/** Daily #1 was the launch day. */
export const DAILY_EPOCH = '2026-10-29';

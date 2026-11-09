/** Track data types (phase-2-coasters.md §4.2, §4.4; Phase 4 §4.4 water pieces). Owner: W1-G, extended by W3-C. */

/** F flat, G gentle (2 m per tile), X steep (6 m per tile). */
export type TrackSlope = 'F' | 'G+' | 'G-' | 'X+' | 'X-';
export type TrackBank = 'none' | 'left' | 'right';
/**
 * S station, St straight, G gentle, X steep, Ts small turn, Tm medium turn, B banking, Br brakes, BB block brake, L loop,
 * Sp spooky tunnel, W water feature (splashdown, rough water, whirlpool; Phase 4).
 */
export type PieceGroup = 'S' | 'St' | 'G' | 'X' | 'Ts' | 'Tm' | 'B' | 'Br' | 'BB' | 'L' | 'Sp' | 'W';

/** Piece set: rail pieces (Phase 2) or one of the water sets (Phase 4 §4.4). A type builds only pieces of its set. */
export type PieceSet = 'rail' | 'flume' | 'rapids';

/**
 * Drive of a water piece (Phase 4 §4.4 physics):
 * - `conveyor`: v = the piece's conveyor speed, gravity ignored (stations, lifts)
 * - `current`: a = −g·sinθ − k·(v − vCurrent) (straights, turns, slopes down, rough water)
 * - `gravity`: the Phase 2 gravity formula (drops, waterfalls)
 * - `splash`: splash brake above 4 m/s, else current (splashdown)
 * - `whirlpool`: current, then v = min(v, 2 m/s)
 */
export type WaterDrive = 'conveyor' | 'current' | 'gravity' | 'splash' | 'whirlpool';

export type PieceGeometry =
  /** Constant pitch (from the entry slope), no turn, constant bank. */
  | { kind: 'straight' }
  /** Pitch changes linearly from the entry slope to the exit slope. */
  | { kind: 'transition' }
  /** Flat quarter circle. */
  | { kind: 'turn'; radiusM: number; side: 'left' | 'right' }
  /** Flat straight whose bank rolls linearly from the entry bank to the exit bank. */
  | { kind: 'bank' }
  /** Vertical loop: four quarter arcs (radii 12, 4, 4, 12 m), shifts one tile sideways. */
  | { kind: 'loop'; side: 'left' | 'right' }
  /**
   * Water slope (Phase 4 §4.4): a channel at the constant pitch of `slope` (gentle 2 m or steep 6 m per tile) between
   * flat joints, so water pieces join without transition pieces. The κ rule (phase-2 §4.3) gives it κv = 0.
   */
  | { kind: 'ramp'; slope: TrackSlope };

export type PieceSpecial = 'station' | 'brakes' | 'blockBrake' | 'spooky' | 'splashdown' | 'waterfall' | 'rough' | 'whirlpool' | null;

/** Water behaviour of a piece (null on rail pieces). */
export interface WaterPieceInfo {
  drive: WaterDrive;
  /** Conveyor speed (mm/s) for `conveyor` pieces, else 0. */
  conveyorMms: number;
  /** Riders on this piece get wet (Phase 4 §4.4 "Wet riders"). */
  wetsRiders: boolean;
}

export interface TrackPieceDef {
  /** Row number: 1–29 in the phase-2 §4.2 table; water pieces continue with 30–50 in Phase 4 §4.4 table order. */
  num: number;
  id: string;
  name: string;
  group: PieceGroup;
  set: PieceSet;
  entry: { slope: TrackSlope; bank: TrackBank };
  /**
   * Local frame: entry tile (0, 0), heading +x, entry height 0.
   * (dx, dy) is the next piece's entry tile. turn: −1 left, +1 right.
   */
  exit: { dx: number; dy: number; dz: number; turn: -1 | 0 | 1; slope: TrackSlope; bank: TrackBank };
  /** Occupied local tiles. */
  tiles: ReadonlyArray<readonly [number, number]>;
  /** Rail height range relative to the entry height (m). */
  railMin: number;
  railMax: number;
  /** Arc length in millimetres (table length rounded to the mm). */
  lengthMm: number;
  /** Vertical curvature (1/m; + valley, − crest) for transitions; 0 elsewhere (loops: see geometry). */
  kv: number;
  /** Horizontal curvature (1/m; + right, − left). */
  kh: number;
  geometry: PieceGeometry;
  /** Cents, before the type's piece factor. */
  cost: number;
  /** May carry a chain lift (pieces 2, 3, 5, 7, 8, 11, 12). */
  chainable: boolean;
  inversions: number;
  turnKind: 'small' | 'medium' | null;
  special: PieceSpecial;
  /** Water drive and effects; null on rail pieces. */
  water: WaterPieceInfo | null;
}

export type TrackDriveMode = 'gravity' | 'powered' | 'guestDriven' | 'waterCurrent';

export type RatingExtra = 'none' | 'scenic' | 'smallTurns' | 'spooky' | 'laps';

export interface TrackTypeDef {
  /** Same id as the catalog entry (content-catalog §2). */
  id: string;
  drive: TrackDriveMode;
  medium: 'rail' | 'water';
  /** The piece set this type builds from (rail types: `rail`). */
  pieceSet: PieceSet;
  /** Id of the station piece `placeStation` lays. */
  stationPiece: string;
  groups: readonly PieceGroup[];
  /** Chain lift option allowed. */
  chain: boolean;
  physics: {
    /** Rolling friction coefficient. */
    mu: number;
    /** Drag coefficient (1/m). */
    cd: number;
    chainSpeedMms: number;
    /** Powered target speed, or the top kart speed (guest-driven). */
    driveSpeedMms: number;
  };
  /** Water current (Phase 4 §4.4, §8): current speed and the coefficient k (1/s). Null for rail types. */
  water: { currentMms: number; k: number } | null;
  vehicle: {
    seatsPerCar: number;
    carLengthMm: number;
    carsMin: number;
    carsMax: number;
    defaultCars: number;
    maxTrains: number;
    spins: boolean;
  };
  ratings: { e: number; i: number; n: number; kAir: number; extra: RatingExtra };
  /** Cents. `pieceFactorPermille` 1000 = factor 1.0. */
  costs: { base: number; pieceFactorPermille: number; runBase: number; extraTrain: number };
  maxHeightM: number;
  render: {
    rail: 'steel' | 'wood' | 'narrow' | 'kart' | 'tunnel' | 'flume' | 'rapids';
    supports: 'round' | 'lattice' | 'pillar';
    car: 'coaster' | 'junior' | 'loco' | 'mouse' | 'ghost' | 'kart' | 'log' | 'raft';
    colours: { track: number; supports: number; cars: number };
  };
}

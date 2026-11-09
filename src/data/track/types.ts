/** Track data types (phase-2-coasters.md §4.2, §4.4). Owner: W1-G. */

/** F flat, G gentle (2 m per tile), X steep (6 m per tile). */
export type TrackSlope = 'F' | 'G+' | 'G-' | 'X+' | 'X-';
export type TrackBank = 'none' | 'left' | 'right';
/** S station, St straight, G gentle, X steep, Ts small turn, Tm medium turn, B banking, Br brakes, BB block brake, L loop, Sp spooky tunnel. */
export type PieceGroup = 'S' | 'St' | 'G' | 'X' | 'Ts' | 'Tm' | 'B' | 'Br' | 'BB' | 'L' | 'Sp';

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
  | { kind: 'loop'; side: 'left' | 'right' };

export type PieceSpecial = 'station' | 'brakes' | 'blockBrake' | 'spooky' | null;

export interface TrackPieceDef {
  /** Row number in the phase-2 §4.2 table (1–29). */
  num: number;
  id: string;
  name: string;
  group: PieceGroup;
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
}

export type TrackDriveMode = 'gravity' | 'powered' | 'guestDriven' | 'waterCurrent';

export type RatingExtra = 'none' | 'scenic' | 'smallTurns' | 'spooky' | 'laps';

export interface TrackTypeDef {
  /** Same id as the catalog entry (content-catalog §2). */
  id: string;
  drive: TrackDriveMode;
  medium: 'rail' | 'water';
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
    rail: 'steel' | 'wood' | 'narrow' | 'kart' | 'tunnel';
    supports: 'round' | 'lattice' | 'pillar';
    car: 'coaster' | 'junior' | 'loco' | 'mouse' | 'ghost' | 'kart';
    colours: { track: number; supports: number; cars: number };
  };
}

/** Core domain types for the football world. All tournament access is data-driven. */

export type ConfederationId = "UEFA" | "CONMEBOL" | "CONCACAF" | "AFC" | "CAF" | "OFC";

export interface DateRange {
  fromSeason: string;
  toSeason: string | null;
}

export interface ContinentalAccessRule {
  federationId: string;
  confederation: ConfederationId;
  allowed: boolean;
  range: DateRange;
  note?: string;
}

export interface Federation {
  id: string;
  name: string;
  confederation: ConfederationId;
  coefficient: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  city: string;
  federationId: string;
  stadium: string;
  reputation: number;
  colors: [string, string];
  vibe?: string;
  crest?: string;
  /** Starting transfer budget in abstract millions; overridden by career finances. */
  budget?: number;
  /**
   * Guest euro clubs from associations without a playable domestic league.
   * Not available for career start; enter UEFA via seasonal rotation.
   */
  guest?: boolean;
}

export type Position = "GK" | "DF" | "MF" | "FW";

/** Detailed pitch roles (Russian football abbreviations). */
export type RoleId =
  | "GK"
  | "LB"
  | "CB"
  | "RB"
  | "LWB"
  | "RWB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST"
  | "CF";

export type PreferredFoot = "L" | "R" | "B";

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  goalkeeping: number;
}

export type PlayerTrait =
  | "finisher"
  | "playmaker"
  | "speedster"
  | "tank"
  | "wall"
  | "leader"
  | "engine"
  | "poacher"
  | "sweeper_keeper"
  | "dribbler";

/** Persistent transfer/loan history on a player (survives season log reset). */
export interface CareerMove {
  date: string;
  kind: "permanent" | "loan" | "loan_return";
  fromClubId: string;
  toClubId: string;
  fee: number;
  fromClubName?: string;
  toClubName?: string;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  nationalityId: string;
  clubId: string | null;
  positions: Position[];
  /** Detailed roles, primary first */
  roles: RoleId[];
  preferredRole: RoleId;
  preferredFoot: PreferredFoot;
  attributes: PlayerAttributes;
  traits: PlayerTrait[];
  overall: number;
  potential: number;
  /** Height in centimetres */
  height: number;
  /** Weight in kilograms */
  weight: number;
  /** Market value in abstract millions */
  marketValue: number;
  /** Seasonal wage in abstract millions (same unit as budget / market value). */
  wage: number;
  /** Index into the player portrait pack (stable appearance). */
  portraitId: number;
  /** Age at which the player retires after the season tick (age becomes >= this). */
  retirementAge?: number;
  /** Active loan (player is at toClub while owned by parent). */
  loan?: {
    parentClubId: string;
    fee: number;
    until: string;
  };
  /** Club moves across the player's career (permanent + loans). */
  careerMoves?: CareerMove[];
}

export interface League {
  id: string;
  name: string;
  federationId: string;
  tier: number;
  teamCount: number;
  clubIds: string[];
}

export type TournamentKind = "league" | "domestic_cup" | "continental" | "national_team";

export interface TournamentFormat {
  id: string;
  kind: TournamentKind;
  name: string;
  confederation?: ConfederationId;
  fromSeason: string;
  slotsByFederation?: Record<string, number>;
}

export type FormationId = "4-4-2" | "4-3-3" | "3-5-2" | "4-2-3-1" | "5-3-2";

export interface TeamTactics {
  formation: FormationId;
  /** Exactly 11 player ids when set */
  lineup: string[];
  /** 0–100: higher = more forward pressure / chances created */
  attack: number;
  /** 0–100: higher = deeper block / fewer chances conceded */
  defence: number;
  /** 0–100: higher = more tackles, more fouls/cards */
  aggression: number;
}

export type MatchEventType =
  | "kickoff"
  | "chance"
  | "shot"
  | "save"
  | "goal"
  | "assist"
  | "miss"
  | "corner"
  | "foul"
  | "freekick"
  | "handball"
  | "penalty"
  | "card"
  | "offsides"
  | "injury"
  | "sub_off"
  | "sub_on"
  | "tactics"
  | "halftime"
  | "second_half"
  | "fulltime"
  | "comment";

export interface MatchSideStats {
  shots: number;
  shotsOnTarget: number;
  corners: number;
  offsides: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  possessionTicks: number;
}

/** Pre-match stadium / weather snapshot (also stored on live state + result). */
export interface MatchAtmosphere {
  weather: "clear" | "sunny" | "cloudy" | "rain" | "heavy_rain" | "snow" | "wind";
  weatherLabel: string;
  weatherHint: string;
  stadium: string;
  capacity: number;
  attendance: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  homeShots: number;
  awayShots: number;
  events: MatchEvent[];
  homeLineup?: string[];
  awayLineup?: string[];
  ratings?: Record<string, number>;
  homeStats?: MatchSideStats;
  awayStats?: MatchSideStats;
  atmosphere?: MatchAtmosphere;
}

export interface MatchSummaryPlayerLine {
  playerId: string;
  name: string;
  clubId: string;
  count?: number;
  detail?: string;
  rating?: number;
  /** Match minutes for this event line (goals / cards). */
  minutes?: number[];
}

export interface MatchSummary {
  homeGoals: number;
  awayGoals: number;
  homeShots: number;
  awayShots: number;
  scorers: MatchSummaryPlayerLine[];
  yellowCards: MatchSummaryPlayerLine[];
  redCards: MatchSummaryPlayerLine[];
  motm: MatchSummaryPlayerLine | null;
  fouls: number;
  penalties: number;
  corners: number;
  homeStats: MatchSideStats;
  awayStats: MatchSideStats;
  /** Post-match quotes from players and coaches. */
  reactions: MatchReaction[];
}

export interface MatchReaction {
  role: "player" | "coach";
  name: string;
  clubId: string;
  playerId?: string;
  quote: string;
}

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  clubId?: string;
  playerId?: string;
  secondaryPlayerId?: string;
  text: string;
  score?: [number, number];
  detail?: string;
}

export interface Fixture {
  id: string;
  tournamentId: string;
  date: string;
  homeClubId: string;
  awayClubId: string;
  result?: MatchResult;
}

export type NewsCategory =
  | "match"
  | "transfer_rumour"
  | "quote"
  | "national_team"
  | "insight"
  | "transfer"
  | "drama";

export interface NewsItem {
  id: string;
  date: string;
  category: NewsCategory;
  headline: string;
  body: string;
  relatedClubIds?: string[];
  relatedPlayerIds?: string[];
  speaker?: {
    role: "coach" | "president" | "player" | "sporting_director" | "journalist";
    name: string;
    clubId?: string;
    playerId?: string;
  };
}

/** Squad discontent / dressing-room conflict (user club). */
export type SquadDramaKind =
  | "dressing_room_fight"
  | "playing_time"
  | "coach_clash"
  | "wage_envy"
  | "clique_conflict"
  | "wants_transfer";

export type SquadDramaStatus = "active" | "resolved" | "cooled";

export interface SquadDrama {
  id: string;
  kind: SquadDramaKind;
  playerIds: string[];
  clubId: string;
  startedOn: string;
  status: SquadDramaStatus;
  /** Last date overall/form penalty was applied. */
  lastPenaltyOn?: string;
  /** Last drama news / reminder date. */
  lastNewsOn?: string;
  /** Consecutive user-match starts in XI (cool-down). */
  startsStreak?: number;
  resolvedOn?: string;
  resolvedReason?: "sold" | "loaned" | "starting_xi" | "cooled";
}

export interface WorldPack {
  version: string;
  season: string;
  federations: Federation[];
  continentalAccess: ContinentalAccessRule[];
  clubs: Club[];
  leagues: League[];
  tournaments: TournamentFormat[];
}

export interface PlayerSeasonStats {
  playerId: string;
  clubId: string;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutes: number;
  ratingSum: number;
  ratingCount: number;
  /** Goalkeeper: shots saved this season */
  saves: number;
  /** Goalkeeper: matches with 0 goals conceded while starting */
  cleanSheets: number;
  /** Goalkeeper: goals conceded while on the pitch (approx. full matches) */
  goalsConceded: number;
}

export interface ClubFinances {
  budget: number;
}

export interface TransferWindow {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** One completed deal during a transfer window (permanent or loan). */
export interface TransferDealRecord {
  id: string;
  date: string;
  windowId: string;
  kind: "permanent" | "loan";
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
}

/** AI club bid for a user-owned player (persisted while pending). */
export interface IncomingTransferOffer {
  id: string;
  date: string;
  windowId: string;
  playerId: string;
  playerName: string;
  /** Club that wants to buy. */
  buyingClubId: string;
  fee: number;
  status: "pending" | "accepted" | "rejected" | "expired";
}

/** User buy/loan bid awaiting seller response on the next tour / day advance. */
export interface OutgoingTransferOffer {
  id: string;
  date: string;
  windowId: string;
  kind: "buy" | "loan";
  playerId: string;
  playerName: string;
  /** Club that currently owns the player. */
  sellingClubId: string;
  fee: number;
  swapPlayerIds?: string[];
  status: "pending" | "accepted" | "rejected" | "expired";
}

export interface WindowTransferReport {
  windowId: string;
  label: string;
  from: string;
  to: string;
  closedOn: string;
  deals: TransferDealRecord[];
}

export interface CareerSave {
  id: string;
  managerName: string;
  clubId: string;
  season: string;
  currentDate: string;
  players: Player[];
  fixtures: Fixture[];
  news: NewsItem[];
  table: Record<string, LeagueTableRow[]>;
  playerStats: Record<string, PlayerSeasonStats>;
  userTactics: TeamTactics;
  /** Per-club transfer budgets (abstract millions). */
  clubFinances: Record<string, ClubFinances>;
  /** Calendar transfer windows for this career season. */
  transferWindows: TransferWindow[];
  /** Matches remaining to miss after a red card (or yellow accumulation). */
  suspensions: Record<string, number>;
  /** Active / recent squad discontent events (dressing-room drama). */
  squadDramas?: SquadDrama[];
  /** Log of deals in the current season (for window reports). */
  transferLog?: TransferDealRecord[];
  /** Pending / recent buy offers for the user's players. */
  incomingTransferOffers?: IncomingTransferOffer[];
  /** Pending user buy/loan offers awaiting club reply next tour. */
  outgoingTransferOffers?: OutgoingTransferOffer[];
  /** Shown once after a transfer window closes. */
  pendingWindowReport?: WindowTransferReport | null;
  /** Market value at the start of the current championship (per player). */
  seasonStartMarketValues?: Record<string, number>;
  /** True after season awards / end-of-season development applied. */
  seasonResolved?: boolean;
  /** Youth academy prospects awaiting promote / dismiss after season. */
  pendingAcademy?: Player[];
  /** Bumps when portrait assignment rules change (tone by nationality, no ref art). */
  portraitSchema?: number;
  /** Bumps when squad nationality mix / legionnaires rules change. */
  nationalitySchema?: number;
  /** UEFA association coefficients (rolling 5 seasons + live season). */
  uefa?: {
    history: Record<string, number[]>;
    current: Record<string, { points: number; clubs: number }>;
  };
}

export interface LeagueTableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface LiveMatchState {
  fixtureId: string;
  homeClubId: string;
  awayClubId: string;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  homeShots: number;
  awayShots: number;
  homeStats: MatchSideStats;
  awayStats: MatchSideStats;
  events: MatchEvent[];
  homeOnField: string[];
  awayOnField: string[];
  homeBench: string[];
  awayBench: string[];
  homeTactics: TeamTactics;
  awayTactics: TeamTactics;
  ratings: Record<string, number>;
  /** Remaining stamina 0–100 by player id (drains during the match). */
  stamina: Record<string, number>;
  /** Yellow cards in this match by player id */
  matchYellows: Record<string, number>;
  homeSubsUsed: number;
  awaySubsUsed: number;
  maxSubs: number;
  finished: boolean;
  /** Stadium crowd + weather for this match. */
  atmosphere?: MatchAtmosphere;
}

export interface DayAdvanceResult {
  save: CareerSave;
  /** User fixture waiting for pre-match / live play (not yet simulated fully) */
  pendingUserMatch?: {
    fixture: Fixture;
  };
}

export interface TransferResult {
  ok: boolean;
  save: CareerSave;
  error?: string;
  /** Fee paid/received when ok. */
  fee?: number;
  /** Buyer/user budget before the deal (when applicable). */
  budgetBefore?: number;
  /** Buyer/user budget after the deal (when applicable). */
  budgetAfter?: number;
}

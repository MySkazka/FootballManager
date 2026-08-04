export type * from "./types";
export { hasContinentalAccess, federationsWithContinentalAccess } from "./access";
export { Rng } from "./rng";
export {
  simulateMatch,
  createLiveMatch,
  advanceLiveMatch,
  liveMakeSubstitution,
  liveUpdateTactics,
  liveMatchToResult,
  liveApplyAutoSubs,
  emptySideStats,
  resolveMatchStats,
} from "./liveMatch";
export {
  generateSquad,
  generateWorldPlayers,
  ensureMissingClubSquads,
  hasLatinLetters,
  recomputeMarketValue,
  refreshMarketValues,
  rollBody,
  rollCyrillicName,
  rollNationality,
  rollRolesAndFoot,
} from "./players";
export {
  PORTRAIT_COUNT,
  PORTRAIT_SCHEMA,
  portraitIdForPlayer,
  assignSquadPortraits,
  isValidPortraitId,
  toneWeights,
} from "./portraits";
export { newsFromMatch, newsNationalTeam, generateWindowRumours, transferBuzzForPrematch } from "./news";
export {
  createCareer,
  normalizeCareerSave,
  advanceDay,
  advanceUntilMatchday,
  finishUserMatch,
  findUserFixtureOnDate,
  clubPlayers,
  beginUserMatch,
  updateUserTactics,
  completeSeason,
  seasonIsReadyToAward,
} from "./career";
export type { SeasonAwards } from "./development";
export {
  isLastCareerSeason,
  willRetireAfterSeason,
  ensureRetirementAge,
  applySeasonAging,
  generateAcademyProspects,
  acceptAcademyProspect,
  rejectAcademyProspect,
  clearAcademyPending,
  lastSeasonWarningNews,
} from "./aging";
export {
  buildTransferWindows,
  seedClubFinances,
  getActiveTransferWindow,
  getNextTransferWindow,
  isTransferWindowOpen,
  clubBudget,
  listTransferTargets,
  buyPlayer,
  sellPlayer,
  simulateAiTransfers,
  getBuyNegotiation,
  evaluateBuyOffer,
  raiseBuyOffer,
  swapCreditForPlayers,
  listSwapCandidates,
  evaluateLoanWillingness,
  listLoanTargets,
  loanPlayer,
  loanFeeForPlayer,
  evaluateLoanInterest,
  listLoanOutCandidates,
  loanOutPlayer,
  resolveExpiredLoans,
  buildWindowReport,
  detectClosedTransferWindow,
  clearWindowReport,
  defaultLoanUntil,
} from "./transfers";
export type { BuyNegotiation, OfferDecision } from "./transfers";
export type { TransferDealRecord, WindowTransferReport } from "./types";
export { analyzeSquadNeeds, topSquadNeedPositions, squadNeedsSummary } from "./squadNeeds";
export type { SquadNeed } from "./squadNeeds";
export {
  POSITION_LABEL,
  ROLE_LABEL,
  FOOT_LABEL,
  ATTRIBUTE_LABEL,
  TRAIT_LABEL,
  NATIONALITY_LABEL,
  nationalityLabel,
  nationalityCode,
  nationalityFlag,
  nationalityShort,
  primaryPosition,
  primaryRole,
  preferredRoleLabel,
  positionLabel,
  playerDisplayName,
  clubDisplayName,
  clubTitleLines,
  formatMarketValue,
  keyAttributes,
  topStrengths,
  computeOverall,
  sortSquad,
} from "./labels";
export {
  FORMATIONS,
  FORMATION_SLOTS,
  FORMATION_ROLES,
  FORMATION_COORDS,
  mentalityLabel,
  autoSelectLineup,
  defaultTactics,
  validateLineup,
  flankFootBonus,
  roleFlank,
  roleFitBonus,
  effectiveOverall,
  suggestAutoSubstitutions,
  tacticsStretchPenalty,
  suggestFormations,
  scoreFormationFit,
  bestFormationForClub,
  optimalTactics,
} from "./tactics";
export type { LineupContext, AutoSubSuggestion, FormationSuggestion } from "./tactics";
export { summarizeMatch } from "./matchSummary";
export type { MatchReaction } from "./types";
export { buildMatchReactions } from "./matchReactions";
export {
  averageRating,
  leagueTopScorers,
  leagueTopAssists,
  leagueTopGoalInvolvements,
  leagueTopRatings,
  leagueTopCards,
  leagueTopKeepers,
  emptyPlayerStats,
  normalizePlayerStats,
} from "./stats";
export { buildLeagueFixtures, ensureFullLeagueFixtures, expectedLeagueFixtureCount } from "./fixtures";
export {
  selectContinentalEntrants,
  buildContinentalGroupFixtures,
  buildUefaContinentalFixtures,
  ensureContinentalFixtures,
  pickSeasonGuests,
  seasonEuroGuestIds,
} from "./continental";
export { applyMatchdayIncome, estimateHomeGate } from "./finances";
export {
  seedUefaState,
  ensureUefaState,
  uefaRanking,
  leagueTableEuroZones,
  zoneForPlace,
  slotsByAssociationRank,
  legendLabels,
  federationRank,
  applyUefaMatchPoints,
  registerEuroParticipants,
  finalizeUefaSeason,
  RUS_LEGACY_SLOTS,
} from "./uefa";
export type { EuroQualificationZones, UefaAssociationRow, UefaState } from "./uefa";
export {
  isEuroTournament,
  listLeagueCalendar,
  listEuroCalendar,
  groupFixturesByDate,
  tournamentDisplayName,
} from "./calendar";
export type { CalendarMatchday } from "./calendar";
export {
  buildCareerValueHistory,
  buildSeasonValueHistory,
  seasonValueDelta,
  snapshotSeasonStartValues,
  ensurePlayerSeasonStartValue,
} from "./valueHistory";
export type { ValueHistoryPoint } from "./valueHistory";
export {
  buildClubHistory,
  careerLegendsForClub,
  clubPlayedMatches,
  upcomingClubEuroFixtures,
} from "./clubHistory";
export type { ClubHistory, ClubLegend, ClassicMatch, PlayedMatchRow } from "./clubHistory";
export {
  rollMatchAtmosphere,
  clubStadiumCapacity,
  weatherEffects,
  weatherLabel,
  formatAttendance,
  attendanceFillPct,
} from "./weather";
export type { WeatherId, WeatherEffects } from "./weather";

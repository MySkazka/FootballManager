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
  createWorldSquadOvrBuilder,
  ensureMissingClubSquads,
  hasLatinLetters,
  recomputeMarketValue,
  computePlayerWage,
  clubWageBill,
  ensurePlayerWage,
  refreshMarketValues,
  rollBody,
  rollCyrillicName,
  rollNationality,
  rollRolesAndFoot,
} from "./players";
export {
  PORTRAIT_COUNT,
  PORTRAIT_SCHEMA,
  PLAYER_PORTRAIT_BLOCKLIST,
  PLAYER_PORTRAIT_ALLOWLIST,
  STAFF_EXEC_PORTRAIT_IDS,
  COACH_FACE_PORTRAIT_IDS,
  COACH_DEDICATED_PORTRAIT_COUNT,
  coachPortraitPoolSize,
  portraitSlotForStaff,
  portraitIdForPlayer,
  assignSquadPortraits,
  isValidPortraitId,
  toneWeights,
} from "./portraits";
export { newsFromMatch, newsNationalTeam, generateWindowRumours, transferBuzzForPrematch } from "./news";
export {
  DRAMA_SPAWN_CHANCE_PER_DAY,
  DRAMA_MAX_ACTIVE,
  DRAMA_PENALTY_INTERVAL_DAYS,
  DRAMA_XI_STARTS_TO_RESOLVE,
  tickSquadDramas,
  applyDramaPenalty,
  clearSquadDramasForPlayers,
  noteSquadDramaMatchStarts,
  tryResolveDramasByLineup,
  normalizeSquadDramas,
  enrichDramaNewsPlayerIds,
  newsComparePlayerIds,
  forceSpawnDrama,
} from "./squadDrama";
export type { SquadDrama, SquadDramaKind, SquadDramaStatus, NewsCategory } from "./types";
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
  startNextSeason,
  bumpSeasonLabel,
  fastForwardToLeagueMatchdaysLeft,
  fastForwardToLeagueMatchdaysLeftAsync,
  unfinishedLeagueMatchdaysLeft,
} from "./career";
export type { SeasonAwards, SeasonEndQuote } from "./development";
export { buildSeasonEndQuotes } from "./seasonQuotes";
export type { SeasonQuoteRole } from "./seasonQuotes";
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
  transferClubScope,
  buyPlayer,
  sellPlayer,
  listSellClubOffers,
  listLoanClubOffers,
  simulateAiTransfers,
  generateIncomingTransferOffers,
  listPendingIncomingOffers,
  listPendingOutgoingOffers,
  acceptIncomingOffer,
  rejectIncomingOffer,
  rejectIncomingOffers,
  expireStaleIncomingOffers,
  expireStaleOutgoingOffers,
  submitOutgoingBuyOffer,
  submitOutgoingLoanOffer,
  resolveOutgoingTransferOffers,
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
  isBigTransfer,
} from "./transfers";
export type { BuyNegotiation, OfferDecision, OutboundClubOffer, OutboundOfferStatus, SubmitOutgoingResult, TransferMarketScope } from "./transfers";
export type {
  TransferDealRecord,
  IncomingTransferOffer,
  OutgoingTransferOffer,
  WindowTransferReport,
} from "./types";
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
  rolesLabel,
  positionLabel,
  playerDisplayName,
  playerNameWithAge,
  squadAverageOverall,
  clubDisplayName,
  clubTitleLines,
  clubTableLabel,
  MONEY_CURRENCY,
  formatMarketValue,
  formatWage,
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
  slotContribution,
  lineupContributionScore,
  analyzeLineupStrength,
  applyOptimalLineup,
  suggestAutoSubstitutions,
  tacticsStretchPenalty,
  suggestFormations,
  scoreFormationFit,
  bestFormationForClub,
  optimalTactics,
} from "./tactics";
export type {
  LineupContext,
  AutoSubSuggestion,
  FormationSuggestion,
  LineupStrengthHint,
} from "./tactics";
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
  buildWorldHonoursLedger,
  careerLegendsForClub,
  clubPlayedMatches,
  upcomingClubEuroFixtures,
  groupHonoursForDisplay,
  timesHolderPhrase,
} from "./clubHistory";
export type { ClubHistory, ClubLegend, ClassicMatch, PlayedMatchRow } from "./clubHistory";
export {
  clubStrengthScore,
  clubStrengthDelta,
  playerSquadRole,
  isImportantStarter,
  evaluatePlayerTransferWillingness,
  evaluateWageAffordability,
  sellerAskDiscountForBuyerStrength,
} from "./agency";
export type { SquadRole } from "./agency";
export {
  rollMatchAtmosphere,
  clubStadiumCapacity,
  weatherEffects,
  weatherLabel,
  formatAttendance,
  attendanceFillPct,
} from "./weather";
export type { WeatherId, WeatherEffects } from "./weather";

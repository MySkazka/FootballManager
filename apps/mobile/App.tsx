import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  advanceUntilMatchday,
  advanceLiveMatch,
  ATTRIBUTE_LABEL,
  averageRating,
  analyzeSquadNeeds,
  squadNeedsSummary,
  beginUserMatch,
  buildCareerValueHistory,
  buildClubHistory,
  buildSeasonValueHistory,
  careerLegendsForClub,
  clubBudget,
  clubPlayedMatches,
  completeSeason,
  fastForwardToLeagueMatchdaysLeftAsync,
  unfinishedLeagueMatchdaysLeft,
  seasonValueDelta,
  createCareer,
  acceptAcademyProspect,
  acceptIncomingOffer,
  analyzeLineupStrength,
  applyOptimalLineup,
  finishUserMatch,
  formatMarketValue,
  formatWage,
  FOOT_LABEL,
  formatAttendance,
  attendanceFillPct,
  getActiveTransferWindow,
  getBuyNegotiation,
  getNextTransferWindow,
  listSwapCandidates,
  swapCreditForPlayers,
  groupFixturesByDate,
  hasContinentalAccess,
  isBigTransfer,
  uefaRanking,
  leagueTableEuroZones,
  zoneForPlace,
  legendLabels,
  federationRank,
  ensureUefaState,
  isLastCareerSeason,
  isTransferWindowOpen,
  listEuroCalendar,
  listLeagueCalendar,
  listPendingIncomingOffers,
  listPendingOutgoingOffers,
  rejectAcademyProspect,
  rejectIncomingOffer,
  rejectIncomingOffers,
  clearAcademyPending,
  clearWindowReport,
  keyAttributes,
  leagueTopAssists,
  leagueTopCards,
  leagueTopGoalInvolvements,
  leagueTopKeepers,
  leagueTopRatings,
  leagueTopScorers,
  listLoanTargets,
  listLoanOutCandidates,
  listTransferTargets,
  transferClubScope,
  loanFeeForPlayer,
  loanOutPlayer,
  submitOutgoingBuyOffer,
  submitOutgoingLoanOffer,
  liveMakeSubstitution,
  liveMatchToResult,
  liveUpdateTactics,
  newsComparePlayerIds,
  normalizeCareerSave,
  nationalityShort,
  playerDisplayName,
  playerNameWithAge,
  POSITION_LABEL,
  primaryPosition,
  positionLabel,
  preferredRoleLabel,
  rolesLabel,
  raiseBuyOffer,
  Rng,
  seasonIsReadyToAward,
  startNextSeason,
  sellPlayer,
  sortSquad,
  squadAverageOverall,
  summarizeMatch,
  suggestAutoSubstitutions,
  topStrengths,
  transferBuzzForPrematch,
  TRAIT_LABEL,
  upcomingClubEuroFixtures,
  updateUserTactics,
  emptySideStats,
  resolveMatchStats,
  FORMATION_ROLES,
  FORMATION_COORDS,
  ROLE_LABEL,
  effectiveOverall,
  coachPortraitPoolSize,
  portraitSlotForStaff,
  type AutoSubSuggestion,
  type CareerSave,
  type Club,
  type Fixture,
  type LiveMatchState,
  type MatchSideStats,
  type MatchSummary,
  type NewsItem,
  type Player,
  type PlayerAttributes,
  type Position,
  type SeasonAwards,
  type WindowTransferReport,
  type IncomingTransferOffer,
  type LineupStrengthHint,
  type TeamTactics,
  type TransferMarketScope,
  type WorldPack,
} from "@fm/engine";
import packJson from "./assets/world/pack.v1.json";
import { ClubLogo } from "./src/visuals/ClubLogo";
import { ValueHistoryChart } from "./src/visuals/ValueHistoryChart";
import { MomentCelebration, type MomentKind } from "./src/visuals/GoalCelebration";
import { PersonPortrait, preloadPortraits, type PortraitKind } from "./src/visuals/PersonPortrait";
import {
  formRingFromStats,
  PlayerOverviewCard,
} from "./src/visuals/PlayerOverviewCard";
import { PlayerRadar, radarAxesForPlayer } from "./src/visuals/PlayerRadar";
import { TacticsPanel } from "./src/visuals/TacticsPanel";
import { FormationPitch, pitchRoleTags, pitchShortName } from "./src/visuals/FormationPitch";
import { ClubCrestHero, CrestHeroBack } from "./src/visuals/ClubCrestHero";
import { LeagueTableBoard } from "./src/visuals/LeagueTableBoard";
import { broadcast, registerThemeRebuild } from "./src/visuals/broadcastTheme";
import { ThemeProvider, ThemeToggle, useTheme } from "./src/visuals/ThemeProvider";
import { SeasonAwardsPanel } from "./src/visuals/SeasonCelebrationArt";
import { PlayerCompareScreen } from "./src/visuals/PlayerCompareScreen";
import { OutboundClubPicker } from "./src/visuals/OutboundClubPicker";

const pack = packJson as unknown as WorldPack;
/** v3: height/weight/marketValue, clubFinances, transferWindows. */
const SAVE_KEY = "touchline.career.v3";
const LEGACY_SAVE_KEYS = ["touchline.career.v2", "touchline.career.v1"] as const;
const SPEEDS = [0.5, 1, 2, 4] as const;

const ALL_ATTR_KEYS = Object.keys(ATTRIBUTE_LABEL ?? {}) as (keyof PlayerAttributes)[];

const LEAGUE_CHIP_LABEL: Record<string, string> = {
  rpl: "РПЛ",
  epl: "АПЛ",
  laliga: "Ла Лига",
  bundesliga: "Бундеслига",
  seriea: "Серия А",
  ligue1: "Лига 1",
};

const NEWS_CATEGORY_LABEL: Record<string, string> = {
  match: "Матч",
  transfer_rumour: "Слух",
  quote: "Цитата",
  national_team: "Сборная",
  insight: "Аналитика",
  transfer: "Трансфер",
  drama: "Конфликт",
};

function newsCategoryLabel(category: string): string {
  return NEWS_CATEGORY_LABEL[category] ?? category;
}

/** Schedule work after first paint — avoid InteractionManager (can stall behind gestures). */
function afterFirstPaint(cb: () => void): () => void {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    // Second frame: list + mesh have committed before we touch the JS thread.
    raf2 = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        if (!cancelled) cb();
      }, 32);
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}

function leagueChipLabel(league: { id: string; name: string }) {
  return LEAGUE_CHIP_LABEL[league.id] ?? league.name;
}

function uniqueByClubId<T extends { clubId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.clubId)) return false;
    seen.add(r.clubId);
    return true;
  });
}

type CareerTab = "table" | "stats" | "news" | "tactics" | "uefa";

type Screen =
  | { name: "select" }
  | { name: "career"; tab?: CareerTab }
  | { name: "squad"; clubId: string }
  | {
      name: "player";
      playerId: string;
      clubId: string;
      /** Enables transfer actions on the profile when opened from the market. */
      from?: "squad" | "transfers";
      /** Where Back should return (preserves match/summary state). */
      returnTo?: Exclude<Screen, { name: "player" }>;
    }
  | {
      name: "playerCompare";
      playerIds: [string, string];
      returnTo?: Exclude<Screen, { name: "player" | "playerCompare" }>;
    }
  | { name: "prematch"; fixture: Fixture }
  | { name: "match"; live: LiveMatchState }
  | { name: "summary"; fixture: Fixture; summary: MatchSummary; homeName: string; awayName: string }
  | { name: "transfers" }
  | { name: "calendar" }
  | { name: "awards"; awards: SeasonAwards }
  | { name: "academy" }
  | { name: "windowReport"; report: WindowTransferReport };

function playerBackLabel(returnTo?: Exclude<Screen, { name: "player" }>, from?: "squad" | "transfers") {
  if (returnTo?.name === "playerCompare") return "← сравнение";
  if (returnTo?.name === "transfers" || from === "transfers") return "← трансферы";
  if (returnTo?.name === "career") return "← кабинет";
  if (returnTo?.name === "summary") return "← итоги";
  if (returnTo?.name === "match") return "← матч";
  if (returnTo?.name === "academy") return "← академия";
  if (returnTo?.name === "awards") return "← итоги сезона";
  if (returnTo?.name === "windowReport") return "← итоги окна";
  return "← состав";
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { mode } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: broadcast.bgDeep }} key={mode}>
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <AppRoutes />
    </View>
  );
}

function AppRoutes() {
  const [screen, setScreen] = useState<Screen>({ name: "select" });
  const [save, setSave] = useState<CareerSave | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(pack.leagues[0]?.id ?? "rpl");
  const [startingClubId, setStartingClubId] = useState<string | null>(null);
  const autoNearSeasonEndRef = useRef(false);
  const [nearEndBusy, setNearEndBusy] = useState(false);
  const [buyDeal, setBuyDeal] = useState<null | {
    playerId: string;
    offer: number;
    feedback?: string;
    feedbackKind?: "info" | "reject" | "accept" | "error";
    swapIds: string[];
    lastVerdict?: "reject" | "insult" | "cap" | "accept" | "player" | "wage";
  }>(null);
  const [outboundPick, setOutboundPick] = useState<null | {
    playerId: string;
    kind: "sell" | "loan";
  }>(null);

  const startBuyDeal = (playerId: string) => {
    if (!save) return;
    const neg = getBuyNegotiation(pack, save, playerId);
    if (!neg) {
      Alert.alert("Трансфер", "Игрок недоступен.");
      return;
    }
    setBuyDeal({
      playerId,
      offer: neg.marketValue,
      swapIds: [],
      feedbackKind: "info",
      feedback: `Рыночная оценка ${formatMarketValue(neg.marketValue)}. Обычно клуб просит больше — повышайте кэш или добавьте обмен. Потолок торга ~${formatMarketValue(neg.hardCeil)}.`,
    });
  };

  const openPlayer = (
    playerId: string,
    opts?: {
      clubId?: string;
      from?: "squad" | "transfers";
      returnTo?: Exclude<Screen, { name: "player" }>;
    }
  ) => {
    if (!save) return;
    const player =
      save.players.find((p) => p.id === playerId) ??
      save.pendingAcademy?.find((p) => p.id === playerId);
    if (!player) return;
    const returnTo =
      opts?.returnTo ??
      (screen.name === "player"
        ? screen.returnTo
        : screen.name === "playerCompare"
          ? screen
          : (screen as Exclude<Screen, { name: "player" }>));
    setScreen({
      name: "player",
      playerId,
      clubId: opts?.clubId ?? player.clubId ?? save.clubId,
      from: opts?.from,
      returnTo,
    });
  };

  const openPlayerCompare = (
    playerIds: [string, string],
    opts?: { returnTo?: Exclude<Screen, { name: "player" | "playerCompare" }> }
  ) => {
    if (!save) return;
    const [a, b] = playerIds;
    if (!save.players.some((p) => p.id === a) || !save.players.some((p) => p.id === b)) return;
    const returnTo =
      opts?.returnTo ??
      (screen.name === "playerCompare"
        ? screen.returnTo
        : screen.name === "player"
          ? (screen.returnTo && screen.returnTo.name !== "playerCompare"
              ? screen.returnTo
              : { name: "career" as const, tab: "news" as const })
          : (screen as Exclude<Screen, { name: "player" | "playerCompare" }>));
    setScreen({ name: "playerCompare", playerIds, returnTo });
  };

  const buyDealModal =
    save && buyDeal ? (
      <BuyNegotiationModal
        pack={pack}
        save={save}
        playerId={buyDeal.playerId}
        offer={buyDeal.offer}
        swapIds={buyDeal.swapIds}
        feedback={buyDeal.feedback}
        feedbackKind={buyDeal.feedbackKind}
        lastVerdict={buyDeal.lastVerdict}
        onChangeOffer={(offer, feedback, swapIds, meta) =>
          setBuyDeal({
            playerId: buyDeal.playerId,
            offer,
            feedback,
            feedbackKind: meta?.feedbackKind ?? "info",
            lastVerdict: meta?.lastVerdict,
            swapIds: swapIds ?? buyDeal.swapIds,
          })
        }
        onClose={() => setBuyDeal(null)}
        onSubmitted={(next) => {
          setSave(next);
          setBuyDeal(null);
          setScreen({ name: "transfers" });
          Alert.alert(
            "Предложение отправлено",
            "Клуб ответит к следующему туру. Смотрите Ленту и кабинет — там появится уведомление о результате."
          );
        }}
      />
    ) : null;

  const outboundPlayer =
    save && outboundPick
      ? save.players.find((p) => p.id === outboundPick.playerId)
      : undefined;
  const outboundModal =
    save && outboundPick && outboundPlayer ? (
      <OutboundClubPicker
        visible
        kind={outboundPick.kind}
        pack={pack}
        save={save}
        player={outboundPlayer}
        onClose={() => setOutboundPick(null)}
        onConfirm={(clubId, fee) => {
          const kind = outboundPick.kind;
          const result =
            kind === "sell"
              ? sellPlayer(pack, save, outboundPlayer.id, clubId, fee)
              : loanOutPlayer(pack, save, outboundPlayer.id, clubId);
          setOutboundPick(null);
          if (!result.ok) {
            Alert.alert(
              kind === "sell" ? "Трансфер" : "Аренда",
              result.error ?? "Не удалось"
            );
            return;
          }
          setSave(result.save);
          setScreen({ name: "transfers" });
        }}
      />
    ) : null;

  useEffect(() => {
    void preloadPortraits();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let raw = await AsyncStorage.getItem(SAVE_KEY);
        let fromLegacy = false;
        if (!raw) {
          for (const key of LEGACY_SAVE_KEYS) {
            raw = await AsyncStorage.getItem(key);
            if (raw) {
              fromLegacy = true;
              break;
            }
          }
        }
        if (!raw || cancelled) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          await AsyncStorage.multiRemove([SAVE_KEY, ...LEGACY_SAVE_KEYS]);
          return;
        }

        const normalized = normalizeCareerSave(pack, parsed);
        if (!normalized) {
          await AsyncStorage.multiRemove([SAVE_KEY, ...LEGACY_SAVE_KEYS]);
          return;
        }

        if (fromLegacy) {
          await AsyncStorage.multiRemove([...LEGACY_SAVE_KEYS]);
        }
        if (cancelled) return;
        setSave(normalized);
        setScreen({ name: "career", tab: "table" });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (save) AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [save, hydrated]);

  const nearEndBusyRef = useRef(false);

  // Dev: jump each device's save to ~3 league rounds left so season transition can be tested.
  useEffect(() => {
    if (!__DEV__ || !hydrated || !save) {
      if (!save) autoNearSeasonEndRef.current = false;
      return;
    }
    if (autoNearSeasonEndRef.current) return;
    if (unfinishedLeagueMatchdaysLeft(pack, save) <= 3) {
      autoNearSeasonEndRef.current = true;
      return;
    }
    autoNearSeasonEndRef.current = true;
    runNearSeasonEndJump(save);
  }, [hydrated, save]);

  const runNearSeasonEndJump = (current: CareerSave) => {
    if (nearEndBusyRef.current) return;
    nearEndBusyRef.current = true;
    setNearEndBusy(true);
    // Paint overlay before structuredClone + bulk results.
    requestAnimationFrame(() => {
      setTimeout(() => {
        void (async () => {
          try {
            const next = await fastForwardToLeagueMatchdaysLeftAsync(pack, current, 3);
            setSave(next);
          } finally {
            nearEndBusyRef.current = false;
            setNearEndBusy(false);
          }
        })();
      }, 50);
    });
  };

  const jumpNearSeasonEnd = () => {
    if (!save) return;
    autoNearSeasonEndRef.current = true;
    runNearSeasonEndJump(save);
  };

  const clubs = useMemo(
    () =>
      pack.clubs.filter((c) =>
        pack.leagues.find((l) => l.id === selectedLeague)?.clubIds.includes(c.id)
      ),
    [selectedLeague]
  );

  const startCareer = (club: Club) => {
    if (startingClubId) return;
    setStartingClubId(club.id);
    // Paint "Создаём карьеру…" before sync createCareer (fixtures + 3k players).
    // Do not use InteractionManager — it can stall forever behind pending gestures.
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          setSave(createCareer(pack, club.id, "Менеджер", 2026));
          setScreen({ name: "career", tab: "table" });
        } finally {
          setStartingClubId(null);
        }
      }, 50);
    });
  };

  const endCareer = () => {
    Alert.alert(
      "Завершить карьеру и начать новую?",
      "Текущая карьера будет удалена. После этого можно выбрать новый клуб.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Завершить",
          style: "destructive",
          onPress: () => {
            void AsyncStorage.multiRemove([SAVE_KEY, ...LEGACY_SAVE_KEYS]);
            setSave(null);
            setScreen({ name: "select" });
          },
        },
      ]
    );
  };

  const onAdvance = () => {
    if (!save) return;
    const remaining = save.fixtures.some(
      (f) =>
        !f.result &&
        (f.homeClubId === save.clubId || f.awayClubId === save.clubId)
    );
    const result = advanceUntilMatchday(pack, save, 1000);
    setSave(result.save);
    if (result.save.pendingWindowReport) {
      setSave(result.save);
      setScreen({ name: "windowReport", report: result.save.pendingWindowReport });
      if (result.pendingUserMatch) {
        // stash match after report via save; user continues from career
      }
      return;
    }
    if (result.pendingUserMatch) {
      setScreen({ name: "prematch", fixture: result.pendingUserMatch.fixture });
      return;
    }
    if (!remaining || seasonIsReadyToAward(pack, result.save)) {
      const finished = completeSeason(pack, result.save, 1000);
      setSave(finished.save);
      if (finished.awards) {
        setScreen({ name: "awards", awards: finished.awards });
        return;
      }
    }
    Alert.alert(
      remaining ? "Матч не найден" : "Календарь окончен",
      remaining
        ? "Не удалось найти ближайший матч. Попробуйте ещё раз."
        : "Все матчи сезона сыграны. Начните новую карьеру, чтобы продолжить."
    );
  };

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <Text style={styles.sub}>Загрузка…</Text>
      </View>
    );
  }

  const withBuyModal = (node: ReactNode) => (
    <>
      {node}
      {buyDealModal}
      {outboundModal}
      {nearEndBusy ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.nearEndOverlay}>
            <ActivityIndicator size="large" color={broadcast.gold} />
            <Text style={styles.nearEndOverlayText}>Перематываем к 3 турам…</Text>
          </View>
        </Modal>
      ) : null}
    </>
  );

  if (screen.name === "match" && save) {
    if (!screen.live) {
      return (
        <View style={styles.root}>
          <Pressable onPress={() => setScreen({ name: "career", tab: "table" })}>
            <Text style={styles.back}>← кабинет</Text>
          </Pressable>
          <Text style={styles.sub}>Матч недоступен</Text>
        </View>
      );
    }
    return (
      <LiveMatchScreen
        pack={pack}
        save={save}
        live={screen.live}
        onLiveChange={(live) => setScreen({ name: "match", live })}
        onTacticsPersist={(t) => setSave(updateUserTactics(save, t))}
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            returnTo: { name: "match", live: screen.live },
          })
        }
        onDone={(live) => {
          const result = liveMatchToResult(live);
          const userTactics =
            live.homeClubId === save.clubId ? live.homeTactics : live.awayTactics;
          setSave(finishUserMatch(pack, save, live.fixtureId, result, 1000, userTactics));
          const fixture = save.fixtures.find((f) => f.id === live.fixtureId);
          const homeClub = pack.clubs.find((c) => c.id === live.homeClubId);
          const awayClub = pack.clubs.find((c) => c.id === live.awayClubId);
          setScreen({
            name: "summary",
            fixture: fixture ?? {
              id: live.fixtureId,
              tournamentId: "",
              date: save.currentDate,
              homeClubId: live.homeClubId,
              awayClubId: live.awayClubId,
            },
            summary: summarizeMatch(result, save.players, live.homeClubId, live.awayClubId),
            homeName: homeClub?.name ?? "Хозяева",
            awayName: awayClub?.name ?? "Гости",
          });
        }}
      />
    );
  }

  if (screen.name === "summary" && save) {
    const homeClub = pack.clubs.find((c) => c.id === screen.fixture.homeClubId);
    const awayClub = pack.clubs.find((c) => c.id === screen.fixture.awayClubId);
    return (
      <MatchSummaryScreen
        pack={pack}
        save={save}
        home={homeClub}
        away={awayClub}
        homeName={screen.homeName}
        awayName={screen.awayName}
        summary={screen.summary}
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            returnTo: {
              name: "summary",
              fixture: screen.fixture,
              summary: screen.summary,
              homeName: screen.homeName,
              awayName: screen.awayName,
            },
          })
        }
        onContinue={() => {
          if (seasonIsReadyToAward(pack, save)) {
            const finished = completeSeason(pack, save, 1000);
            setSave(finished.save);
            if (finished.awards) {
              setScreen({ name: "awards", awards: finished.awards });
              return;
            }
          }
          setScreen({ name: "career", tab: "table" });
        }}
      />
    );
  }

  if (screen.name === "prematch" && save) {
    if (!screen.fixture) {
      return (
        <View style={styles.root}>
          <Pressable onPress={() => setScreen({ name: "career", tab: "table" })}>
            <Text style={styles.back}>← кабинет</Text>
          </Pressable>
          <Text style={styles.sub}>Матч не найден</Text>
        </View>
      );
    }
    return (
      <PreMatchScreen
        pack={pack}
        save={save}
        fixture={screen.fixture}
        onBack={() => setScreen({ name: "career", tab: "table" })}
        onTactics={(t) => setSave(updateUserTactics(save, t))}
        onStart={(tactics) => {
          setSave(updateUserTactics(save, tactics));
          const live = beginUserMatch(pack, { ...save, userTactics: tactics }, screen.fixture.id, tactics);
          if (live) setScreen({ name: "match", live });
        }}
      />
    );
  }

  if (screen.name === "player" && save) {
    const player =
      save.players.find((p) => p.id === screen.playerId) ??
      save.pendingAcademy?.find((p) => p.id === screen.playerId);
    const fromTransfers = screen.from === "transfers";
    const goBack = () => {
      if (screen.returnTo) {
        setScreen(screen.returnTo);
        return;
      }
      setScreen(fromTransfers ? { name: "transfers" } : { name: "squad", clubId: screen.clubId });
    };
    if (!player) {
      return (
        <View style={styles.root}>
          <Pressable onPress={goBack}>
            <Text style={styles.back}>← назад</Text>
          </Pressable>
        </View>
      );
    }
    const club = pack.clubs.find((c) => c.id === player.clubId);
    const windowOpen = isTransferWindowOpen(save);
    const fee = player.marketValue ?? 0;
    const canSell =
      fromTransfers && windowOpen && player.clubId === save.clubId && !player.loan;
    const canBuy =
      fromTransfers && windowOpen && player.clubId !== save.clubId && !player.loan;
    const transferActions: {
      label: string;
      confirmTitle?: string;
      confirmBody?: string;
      destructive?: boolean;
      onConfirm?: () => void;
      onPress?: () => void;
    }[] = [];
    if (canBuy) {
      transferActions.push({
        label: `Предложить ${formatMarketValue(fee)}`,
        onPress: () => startBuyDeal(player.id),
      });
      const loanFee = loanFeeForPlayer(player);
      transferActions.push({
        label: `Заявка на аренду · ${formatMarketValue(loanFee)}`,
        confirmTitle: "Заявка на аренду",
        confirmBody: `${playerNameWithAge(player)}\nСтоимость аренды: ${formatMarketValue(loanFee)}\nЗаявка уйдёт клубу — ответ к следующему туру.`,
        onConfirm: () => {
          const result = submitOutgoingLoanOffer(pack, save, player.id);
          if (!result.ok) {
            Alert.alert("Аренда", result.error ?? "Не удалось отправить заявку");
            return;
          }
          setSave(result.save);
          setScreen({ name: "transfers" });
          Alert.alert(
            "Заявка отправлена",
            "Клуб ответит к следующему туру. Смотрите Ленту."
          );
        },
      });
    }
    if (canSell) {
      transferActions.push({
        label: `Продать…`,
        onPress: () => setOutboundPick({ playerId: player.id, kind: "sell" }),
      });
      transferActions.push({
        label: `Отдать в аренду…`,
        onPress: () => setOutboundPick({ playerId: player.id, kind: "loan" }),
      });
    }

    return withBuyModal(
      <PlayerScreen
        player={player}
        club={club}
        stats={save.playerStats[player.id]}
        season={save.season}
        seasonStartValue={
          save.seasonStartMarketValues?.[player.id] ?? player.marketValue ?? 0.1
        }
        backLabel={playerBackLabel(screen.returnTo, screen.from)}
        onBack={goBack}
        onOpenClub={(clubId) => setScreen({ name: "squad", clubId })}
        transferActions={transferActions}
        transferLog={save.transferLog}
        clubsById={new Map(pack.clubs.map((c) => [c.id, c]))}
      />
    );
  }

  if (screen.name === "squad" && save) {
    return (
      <SquadScreen
        pack={pack}
        save={save}
        clubId={screen.clubId}
        onBack={() => setScreen({ name: "career", tab: "table" })}
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            clubId: screen.clubId,
            from: "squad",
            returnTo: { name: "squad", clubId: screen.clubId },
          })
        }
        onTactics={(t) => setSave(updateUserTactics(save, t))}
      />
    );
  }

  if (screen.name === "transfers" && save) {
    return withBuyModal(
      <TransfersScreen
        pack={pack}
        save={save}
        onBack={() => setScreen({ name: "career", tab: "table" })}
        onSave={setSave}
        onPlayer={(playerId, clubId) =>
          openPlayer(playerId, {
            clubId,
            from: "transfers",
            returnTo: { name: "transfers" },
          })
        }
        onStartBuy={startBuyDeal}
        onOutboundPick={(playerId, kind) => setOutboundPick({ playerId, kind })}
      />
    );
  }

  if (screen.name === "awards" && save) {
    const awardsClub =
      pack.clubs.find((c) => c.id === screen.awards.userClubId) ??
      pack.clubs.find((c) => c.id === save.clubId);
    const enterNextSeason = () => {
      setSave((prev) => {
        if (!prev) return prev;
        const cleared = clearAcademyPending(prev);
        return cleared.seasonResolved ? startNextSeason(pack, cleared) : cleared;
      });
      setScreen({ name: "career", tab: "table" });
    };
    return (
      <SeasonAwardsScreen
        awards={screen.awards}
        club={awardsClub}
        onPlayer={(playerId) =>
          openPlayer(playerId, { returnTo: { name: "awards", awards: screen.awards } })
        }
        onContinue={() => {
          if ((save.pendingAcademy?.length ?? 0) > 0) {
            setScreen({ name: "academy" });
            return;
          }
          enterNextSeason();
        }}
      />
    );
  }

  if (screen.name === "windowReport" && save) {
    return (
      <WindowReportScreen
        pack={pack}
        report={screen.report}
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            returnTo: { name: "windowReport", report: screen.report },
          })
        }
        onDone={() => {
          setSave((prev) => (prev ? clearWindowReport(prev) : prev));
          setScreen({ name: "career", tab: "table" });
        }}
      />
    );
  }

  if (screen.name === "academy" && save) {
    return (
      <AcademyScreen
        pack={pack}
        save={save}
        onPlayer={(playerId) => openPlayer(playerId, { returnTo: { name: "academy" } })}
        onAccept={(playerId) =>
          setSave((prev) => (prev ? acceptAcademyProspect(prev, playerId) : prev))
        }
        onReject={(playerId) =>
          setSave((prev) => (prev ? rejectAcademyProspect(prev, playerId) : prev))
        }
        onDone={() => {
          setSave((prev) => {
            if (!prev) return prev;
            const cleared = clearAcademyPending(prev);
            return cleared.seasonResolved ? startNextSeason(pack, cleared) : cleared;
          });
          setScreen({ name: "career", tab: "table" });
        }}
      />
    );
  }

  if (screen.name === "career" && save) {
    if (save.pendingWindowReport) {
      return (
        <WindowReportScreen
          pack={pack}
          report={save.pendingWindowReport}
          onPlayer={(playerId) =>
            openPlayer(playerId, {
              returnTo: { name: "windowReport", report: save.pendingWindowReport! },
            })
          }
          onDone={() => {
            setSave((prev) => (prev ? clearWindowReport(prev) : prev));
            setScreen({ name: "career", tab: "table" });
          }}
        />
      );
    }
    return withBuyModal(
      <CareerScreen
        pack={pack}
        save={save}
        tab={screen.tab ?? "table"}
        setTab={(tab) => setScreen({ name: "career", tab })}
        onAdvance={onAdvance}
        onEndCareer={endCareer}
        onJumpNearSeasonEnd={__DEV__ ? jumpNearSeasonEnd : undefined}
        nearEndBusy={nearEndBusy}
        onSquad={(clubId) => setScreen({ name: "squad", clubId })}
        onTransfers={() => setScreen({ name: "transfers" })}
        onCalendar={() => setScreen({ name: "calendar" })}
        onTactics={(t) => setSave(updateUserTactics(save, t))}
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            returnTo: { name: "career", tab: screen.tab ?? "table" },
          })
        }
        onComparePlayers={(playerIds) =>
          openPlayerCompare(playerIds, {
            returnTo: { name: "career", tab: "news" },
          })
        }
      />
    );
  }

  if (screen.name === "playerCompare" && save) {
    return (
      <PlayerCompareScreen
        pack={pack}
        save={save}
        playerIds={screen.playerIds}
        onBack={() =>
          setScreen(screen.returnTo ?? { name: "career", tab: "news" })
        }
        onPlayer={(playerId) =>
          openPlayer(playerId, {
            returnTo: {
              name: "playerCompare",
              playerIds: screen.playerIds,
              returnTo: screen.returnTo,
            },
          })
        }
      />
    );
  }

  if (screen.name === "calendar" && save) {
    return (
      <CalendarScreen
        pack={pack}
        save={save}
        onBack={() => setScreen({ name: "career" })}
        onSquad={(clubId) => setScreen({ name: "squad", clubId })}
      />
    );
  }

  // Club select only when there is no active career save.
  // Crests use ClubLogo with pointerEvents="none" so row Pressables keep receiving taps.
  return (
    <View style={styles.selectRoot}>
      <Text style={styles.brand}>Менеджер от Бога</Text>
      <Text style={styles.sub}>Выбери клуб — узнаваемые имена, свои составы</Text>
      {startingClubId ? (
        <Text style={styles.sub}>Создаём карьеру…</Text>
      ) : null}
      <View style={styles.leagueRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.leagueRow}
          contentContainerStyle={styles.leagueRowContent}
          keyboardShouldPersistTaps="handled"
        >
          {pack.leagues.map((league) => {
            const active = league.id === selectedLeague;
            return (
              <Pressable
                key={league.id}
                disabled={!!startingClubId}
                onPress={() => setSelectedLeague(league.id)}
                style={[styles.leagueChip, active && styles.leagueChipActive]}
              >
                <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>
                  {leagueChipLabel(league)} ({league.teamCount})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView
        style={styles.clubList}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {clubs.map((club) => {
          const busy = startingClubId === club.id;
          return (
            <Pressable
              key={club.id}
              style={[styles.clubRow, startingClubId && !busy && styles.clubRowDimmed]}
              disabled={!!startingClubId}
              onPress={() => startCareer(club)}
            >
              <View pointerEvents="none">
                <ClubLogo club={club} size={40} />
              </View>
              <View style={styles.clubMeta}>
                <Text style={styles.clubName}>{club.name}</Text>
                <Text style={styles.clubCity}>
                  {club.city} · {club.vibe}
                </Text>
                <Text style={styles.clubCity}>престиж {club.reputation}</Text>
              </View>
              <Text style={styles.rep}>{busy ? "…" : club.reputation}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CareerScreen({
  pack,
  save,
  tab,
  setTab,
  onAdvance,
  onEndCareer,
  onJumpNearSeasonEnd,
  nearEndBusy,
  onSquad,
  onTransfers,
  onCalendar,
  onTactics,
  onPlayer,
  onComparePlayers,
}: {
  pack: WorldPack;
  save: CareerSave;
  tab: CareerTab;
  setTab: (t: CareerTab) => void;
  onAdvance: () => void;
  onEndCareer: () => void;
  onJumpNearSeasonEnd?: () => void;
  nearEndBusy?: boolean;
  onSquad: (clubId: string) => void;
  onTransfers: () => void;
  onCalendar: () => void;
  onTactics: (t: TeamTactics) => void;
  onPlayer: (playerId: string) => void;
  onComparePlayers?: (playerIds: [string, string]) => void;
}) {
  const club = pack.clubs.find((c) => c.id === save.clubId);
  const homeLeague = club ? pack.leagues.find((l) => l.clubIds.includes(club.id)) : undefined;
  const [viewLeagueId, setViewLeagueId] = useState(homeLeague?.id ?? pack.leagues[0]?.id ?? "rpl");
  const [statsBoard, setStatsBoard] = useState<
    "goals" | "assists" | "ga" | "rating" | "cards" | "keepers"
  >("goals");
  const [tabReady, setTabReady] = useState(true);
  const clubsById = useMemo(() => new Map(pack.clubs.map((c) => [c.id, c])), [pack.clubs]);
  const transferTips = useMemo(
    () => analyzeSquadNeeds(save.players, save.clubId, save.userTactics),
    [save.players, save.clubId, save.userTactics]
  );
  const transferTipSummary = squadNeedsSummary(transferTips);

  useEffect(() => {
    if (tab === "table") {
      setTabReady(true);
      return;
    }
    setTabReady(false);
    return afterFirstPaint(() => setTabReady(true));
  }, [tab]);

  if (!club || !homeLeague) {
    return (
      <View style={styles.root}>
        <Text style={styles.sub}>Сохранение повреждено — начните новую карьеру</Text>
        <Pressable style={styles.endCareerBtn} onPress={onEndCareer}>
          <Text style={styles.endCareerText}>Завершить карьеру и начать новую</Text>
        </Pressable>
      </View>
    );
  }
  const viewLeague = pack.leagues.find((l) => l.id === viewLeagueId) ?? homeLeague;
  const table = uniqueByClubId(save.table[viewLeague.id] ?? []);
  const euro = hasContinentalAccess(pack, club.federationId);
  const squad = save.players.filter((p) => p.clubId === club.id);
  const budget = clubBudget(save, club.id);
  const windowOpen = isTransferWindowOpen(save);
  const nextWindow = getNextTransferWindow(save);
  /** Collapse huge crest+CTA stack so tactics pitch / stats lists fit on one phone screen. */
  const chromeCollapsed = tab === "tactics" || tab === "stats";

  return (
    <View style={styles.root}>
      {!chromeCollapsed ? <ThemeToggle /> : null}
      {chromeCollapsed ? (
        <View style={styles.careerSlimBar}>
          <View style={styles.careerSlimMeta}>
            <Text
              style={styles.careerSlimTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {club.name}
            </Text>
            <Text
              style={styles.careerSlimSub}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {save.currentDate} · {formatMarketValue(budget)}
              {nextWindow && !windowOpen ? ` · окно ${nextWindow.from}` : ""}
            </Text>
          </View>
          <Pressable style={styles.careerSlimCta} onPress={onAdvance}>
            <Text
              style={styles.careerSlimCtaText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              allowFontScaling={false}
            >
              К матчу
            </Text>
          </Pressable>
          <Pressable style={styles.careerSlimChip} onPress={onTransfers}>
            <Text
              style={styles.careerSlimChipText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              allowFontScaling={false}
            >
              Трансф.
            </Text>
          </Pressable>
          <Pressable style={styles.careerSlimChip} onPress={onCalendar}>
            <Text
              style={styles.careerSlimChipText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              allowFontScaling={false}
            >
              Календ.
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ClubCrestHero
            compact
            club={club}
            date={save.currentDate}
            subtitle={`${club.city} · евро: ${euro ? "да" : "нет"}`}
            lines={[
              `Состав ~${squadAverageOverall(save.players, club.id)} · ${formatMarketValue(budget)}`,
            ]}
          />

          <View style={styles.careerActionRow}>
            <Pressable style={[styles.cta, styles.ctaCompact, styles.careerActionPrimary]} onPress={onAdvance}>
              <Text
                style={[styles.ctaText, styles.ctaTextCompact]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                К матчу
              </Text>
            </Pressable>
            <Pressable style={[styles.ctaSecondary, styles.ctaCompact, { flex: 1 }]} onPress={onTransfers}>
              <Text
                style={[styles.ctaSecondaryText, styles.ctaTextCompact]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {windowOpen ? "Трансферы" : "Трансф. · закр."}
              </Text>
            </Pressable>
            <Pressable style={[styles.ctaSecondary, styles.ctaCompact, { flex: 1 }]} onPress={onCalendar}>
              <Text
                style={[styles.ctaSecondaryText, styles.ctaTextCompact]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Календарь
              </Text>
            </Pressable>
          </View>
          <Text style={styles.transferTipLine}>{transferTipSummary}</Text>
          {(() => {
            const last = squad.filter((p) => isLastCareerSeason(p));
            if (!last.length) return null;
            return (
              <Pressable onPress={() => onPlayer(last[0]!.id)}>
                <Text style={styles.lastSeasonBanner}>
                  Последний сезон в карьере: {last.map((p) => p.lastName).slice(0, 4).join(", ")}
                  {last.length > 4 ? ` +${last.length - 4}` : ""}. Даже после продажи завершат карьеру по итогам чемпионата.
                </Text>
              </Pressable>
            );
          })()}
          {(() => {
            const dramas = (save.squadDramas ?? []).filter((d) => d.status === "active");
            if (!dramas.length) return null;
            const dramaIds = dramas.flatMap((d) => d.playerIds);
            const names = dramaIds
              .map((id) => save.players.find((p) => p.id === id)?.lastName)
              .filter(Boolean)
              .slice(0, 4);
            const pair = dramas
              .map((d) => d.playerIds.filter((id) => save.players.some((p) => p.id === id)))
              .find((ids) => ids.length >= 2);
            const firstId = dramaIds.find((id) => save.players.some((p) => p.id === id));
            return (
              <Pressable
                onPress={() => {
                  if (pair && onComparePlayers) {
                    onComparePlayers([pair[0]!, pair[1]!]);
                    return;
                  }
                  if (firstId) onPlayer(firstId);
                }}
              >
                <Text style={styles.dramaBanner}>
                  Конфликт в составе ({dramas.length}): {names.join(", ")}
                  {names.length >= 4 ? "…" : ""}. Продайте или ставьте в основу — смотрите Ленту.
                </Text>
              </Pressable>
            );
          })()}
          {(() => {
            const incoming = listPendingIncomingOffers(save);
            if (!incoming.length) return null;
            const first = incoming[0]!;
            const buyer = pack.clubs.find((c) => c.id === first.buyingClubId);
            return (
              <Pressable onPress={onTransfers}>
                <Text style={styles.transferOfferBanner}>
                  Входящие заявки на ваших игроков: {incoming.length}. «
                  {buyer?.shortName ?? first.buyingClubId}» предлагает {formatMarketValue(first.fee)} за{" "}
                  {first.playerName.split(" ").pop()}. Откройте Трансферы.
                </Text>
              </Pressable>
            );
          })()}
          {(() => {
            const outgoing = listPendingOutgoingOffers(save);
            if (!outgoing.length) return null;
            return (
              <Pressable onPress={onTransfers}>
                <Text style={styles.outgoingOfferBanner}>
                  Ждёте ответа клубов: {outgoing.length}{" "}
                  {outgoing.length === 1 ? "предложение" : "предложений"} (покупка/аренда). Результат — к
                  следующему туру, смотрите Ленту.
                </Text>
              </Pressable>
            );
          })()}
          {!windowOpen && nextWindow ? (
            <Text style={styles.hint}>Следующее окно: {nextWindow.label} с {nextWindow.from}</Text>
          ) : null}
        </>
      )}

      <View style={[styles.tabs, chromeCollapsed && styles.tabsTight]}>
        {(
          [
            ["table", "Таблица"],
            ["stats", "Статы"],
            ["tactics", "Тактика"],
            ["uefa", "УЕФА"],
            ["news", "Лента"],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabOn]}>
            <Text
              style={[styles.tabText, tab === id && styles.tabTextOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.62}
              allowFontScaling={false}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "table" && (
        <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
          <Text style={styles.section}>Мир · чемпионаты</Text>
          <View style={styles.leagueRowWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.leagueRow}
              contentContainerStyle={styles.leagueRowContent}
            >
              {pack.leagues.map((league) => {
                const active = league.id === viewLeague.id;
                return (
                  <Pressable
                    key={league.id}
                    onPress={() => setViewLeagueId(league.id)}
                    style={[styles.leagueChip, active && styles.leagueChipActive]}
                  >
                    <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>
                      {leagueChipLabel(league)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          {(() => {
            const uefa = ensureUefaState(pack, save);
            const rank = federationRank(pack, uefa, viewLeague.federationId);
            const zones = leagueTableEuroZones(viewLeague.federationId, rank);
            const legend = legendLabels(zones);
            const boardRows = table
              .map((row, i) => {
                const c = clubsById.get(row.clubId);
                if (!c) return null;
                const place = i + 1;
                const zone = zoneForPlace(place, zones);
                return {
                  ...row,
                  place,
                  club: c,
                  zone: zone === "ucl" || zone === "uel" || zone === "uecl" ? zone : null,
                  isMine: row.clubId === save.clubId,
                };
              })
              .filter((r): r is NonNullable<typeof r> => r != null);
            return (
              <LeagueTableBoard
                leagueName={viewLeague.name}
                season={save.season}
                federationId={viewLeague.federationId}
                rows={boardRows}
                onPressClub={onSquad}
                subtitle={`УЕФА ${rank}-е · зоны еврокубков`}
                footer={
                  <View style={styles.euroLegend}>
                    <Text style={styles.sectionOnBlue}>Легенда еврокубков</Text>
                    {legend.map((item) => (
                      <View key={item.zone} style={styles.euroLegendRow}>
                        <View
                          style={[
                            styles.euroLegendSwatch,
                            item.zone === "ucl" && styles.tableRowUcl,
                            item.zone === "uel" && styles.tableRowUel,
                            item.zone === "uecl" && styles.tableRowUecl,
                          ]}
                        />
                        <Text style={styles.euroLegendTextOnBlue}>
                          {item.places}: {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                }
              />
            );
          })()}
          <Pressable style={styles.ctaSecondary} onPress={() => onSquad(club.id)}>
            <Text style={styles.ctaSecondaryText}>Состав и история клуба</Text>
          </Pressable>
          {onJumpNearSeasonEnd ? (
            <Pressable
              style={[styles.debugNearEndBtn, nearEndBusy && styles.debugNearEndBtnBusy]}
              onPress={onJumpNearSeasonEnd}
              disabled={!!nearEndBusy}
            >
              <Text style={styles.debugNearEndText}>
                {nearEndBusy
                  ? "Перематываем…"
                  : `Тест: 3 тура до конца (${unfinishedLeagueMatchdaysLeft(pack, save)} осталось)`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.endCareerBtn} onPress={onEndCareer}>
            <Text style={styles.endCareerText}>Завершить карьеру и начать новую</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === "uefa" &&
        (tabReady ? (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
            <Text style={styles.section}>Рейтинг ассоциаций УЕФА</Text>
            <Text style={styles.hint}>
              Сумма коэффициентов за 5 сезонов. От рейтинга зависит, сколько клубов страны играет в ЛЧ, ЛЕ и Лиге конференций.
              Текущий сезон копится отдельно (очки / число клубов в еврокубках).
            </Text>
            <View style={styles.tableHead}>
              <Text style={styles.thRank}>#</Text>
              <Text style={[styles.thClub, { flex: 1.2 }]}>Страна</Text>
              <Text style={styles.thGoals}>5 лет</Text>
              <Text style={styles.thGoals}>Сезон</Text>
              <Text style={styles.thGoals}>Слоты</Text>
            </View>
            {uefaRanking(pack, ensureUefaState(pack, save)).map((row) => {
              const mine = row.federationId === club.federationId;
              return (
                <View
                  key={row.federationId}
                  style={[styles.tableRow, mine && styles.tableRowMineBorder]}
                >
                  <Text style={styles.tdRank}>{row.rank}</Text>
                  <Text style={[styles.tableClub, { flex: 1.2 }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.tdGoals}>{row.total.toFixed(1)}</Text>
                  <Text style={styles.tdGoals}>{row.seasonScore.toFixed(2)}</Text>
                  <Text style={styles.tdGoals}>
                    {row.slots.ucl}/{row.slots.uel}/{row.slots.uecl}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.hint}>
              Слоты: ЛЧ / ЛЕ / ЛК — по текущему рейтингу ассоциации УЕФА.
            </Text>
          </ScrollView>
        ) : (
          <Text style={styles.sub}>Загрузка…</Text>
        ))}

      {tab === "stats" &&
        (tabReady ? (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
            <View style={styles.leagueRowWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.leagueRow}
                contentContainerStyle={styles.leagueRowContent}
              >
                {(
                  [
                    ["goals", "Голы"],
                    ["assists", "Пасы"],
                    ["ga", "Г+П"],
                    ["rating", "Оценка"],
                    ["cards", "Карточки"],
                    ["keepers", "Вратари"],
                  ] as const
                ).map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setStatsBoard(id)}
                    style={[styles.leagueChip, statsBoard === id && styles.leagueChipActive]}
                  >
                    <Text
                      style={[
                        styles.leagueChipText,
                        statsBoard === id && styles.leagueChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {statsBoard === "goals" ? (
              <Leaderboard
                title="Бомбардиры"
                rows={leagueTopScorers(save.playerStats, viewLeague.clubIds, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) => `${s.goals}`}
                onPlayer={onPlayer}
              />
            ) : null}
            {statsBoard === "assists" ? (
              <Leaderboard
                title="Ассистенты"
                rows={leagueTopAssists(save.playerStats, viewLeague.clubIds, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) => `${s.assists}`}
                onPlayer={onPlayer}
              />
            ) : null}
            {statsBoard === "ga" ? (
              <Leaderboard
                title="Гол + пас"
                rows={leagueTopGoalInvolvements(save.playerStats, viewLeague.clubIds, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) => `${s.goals + s.assists} · ${s.goals}г ${s.assists}п`}
                onPlayer={onPlayer}
              />
            ) : null}
            {statsBoard === "rating" ? (
              <Leaderboard
                title="Средняя оценка"
                rows={leagueTopRatings(save.playerStats, viewLeague.clubIds, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) => `${averageRating(s).toFixed(1)} · ${s.appearances} игр`}
                onPlayer={onPlayer}
              />
            ) : null}
            {statsBoard === "cards" ? (
              <Leaderboard
                title="Карточки"
                rows={leagueTopCards(save.playerStats, viewLeague.clubIds, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) => `${s.yellowCards ?? 0} ж · ${s.redCards ?? 0} к`}
                onPlayer={onPlayer}
              />
            ) : null}
            {statsBoard === "keepers" ? (
              <Leaderboard
                title="Вратари"
                rows={leagueTopKeepers(save.playerStats, viewLeague.clubIds, save.players, 20)}
                save={save}
                pack={pack}
                clubsById={clubsById}
                value={(s) =>
                  `${s.cleanSheets ?? 0} «0» · ${s.saves ?? 0} сейв · ${s.goalsConceded ?? 0} пр`
                }
                onPlayer={onPlayer}
              />
            ) : null}
          </ScrollView>
        ) : (
          <Text style={styles.sub}>Загрузка…</Text>
        ))}

      {tab === "tactics" &&
        (tabReady ? (
          <ScrollView
            style={styles.tabScroll}
            contentContainerStyle={styles.tabScrollContent}
            showsVerticalScrollIndicator
          >
            <TacticsPanel
              compact
              tactics={save.userTactics}
              squad={squad}
              clubId={club.id}
              jersey={club.colors[0]}
              jerseySecondary={club.colors[1]}
              onChange={onTactics}
              lineupContext={{
                stats: save.playerStats,
                suspensions: save.suspensions ?? {},
              }}
            />
          </ScrollView>
        ) : (
          <Text style={styles.sub}>Загрузка…</Text>
        ))}

      {tab === "news" &&
        (tabReady ? (
          <FlatList
            style={styles.news}
            data={save.news.slice(0, 30)}
            keyExtractor={(n) => n.id}
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: n }) => (
              <NewsCard
                item={n}
                pack={pack}
                save={save}
                onPlayer={onPlayer}
                onComparePlayers={onComparePlayers}
              />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        ) : (
          <Text style={styles.sub}>Загрузка…</Text>
        ))}
    </View>
  );
}

function Leaderboard({
  title,
  rows,
  save,
  pack,
  clubsById,
  value,
  onPlayer,
}: {
  title: string;
  rows: CareerSave["playerStats"][string][];
  save: CareerSave;
  pack: WorldPack;
  clubsById?: Map<string, Club>;
  value: (s: CareerSave["playerStats"][string]) => string;
  onPlayer?: (playerId: string) => void;
}) {
  const playersById = useMemo(() => new Map(save.players.map((p) => [p.id, p])), [save.players]);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.section}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.sub}>Пока пусто — сыграйте туры</Text> : null}
      {rows.map((s, i) => {
        const p = playersById.get(s.playerId);
        const c = clubsById?.get(s.clubId) ?? pack.clubs.find((x) => x.id === s.clubId);
        if (!p || !c) return null;
        return (
          <Pressable
            key={s.playerId}
            style={styles.statRow}
            onPress={onPlayer ? () => onPlayer(s.playerId) : undefined}
            disabled={!onPlayer}
          >
            <Text style={styles.statRank}>{i + 1}</Text>
            <PersonPortrait seed={p.id} size={28} jersey={c.colors[0]}
              jerseySecondary={c.colors[1]} age={p.age} 
              portraitId={p.portraitId}
              nationalityId={p.nationalityId}
            />
            <ClubLogo club={c} size={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tableClub, { marginLeft: 0 }]} numberOfLines={1}>
                {playerNameWithAge(p)}
              </Text>
              <Text style={styles.statNat} numberOfLines={1}>
                {nationalityShort(p.nationalityId)}
              </Text>
            </View>
            <Text style={styles.pts}>{value(s)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PreMatchScreen({
  pack,
  save,
  fixture,
  onBack,
  onTactics,
  onStart,
}: {
  pack: WorldPack;
  save: CareerSave;
  fixture: Fixture;
  onBack: () => void;
  onTactics: (t: TeamTactics) => void;
  onStart: (t: TeamTactics) => void;
}) {
  const [tactics, setTactics] = useState(save.userTactics);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const home = pack.clubs.find((c) => c.id === fixture?.homeClubId);
  const away = pack.clubs.find((c) => c.id === fixture?.awayClubId);
  const preview = fixture ? beginUserMatch(pack, save, fixture.id, tactics) : null;

  if (!fixture || !home || !away || !preview) {
    return (
      <View style={styles.root}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← кабинет</Text>
        </Pressable>
        <Text style={styles.sub}>Не удалось подготовить матч</Text>
      </View>
    );
  }

  const userIsHome = fixture.homeClubId === save.clubId;
  const userClub = userIsHome ? home : away;
  const opp = userIsHome ? away : home;
  const oppIds = userIsHome ? preview.awayOnField : preview.homeOnField;
  const myIds = tactics.lineup.slice(0, 11);
  const oppBench = userIsHome ? preview.awayBench : preview.homeBench;
  const myBench = save.players
    .filter((p) => p.clubId === save.clubId && !myIds.includes(p.id))
    .sort((a, b) => b.overall - a.overall)
    .map((p) => p.id);

  const league = pack.leagues.find((l) => l.clubIds.includes(save.clubId));
  const buzzClubs = [
    save.clubId,
    fixture.homeClubId,
    fixture.awayClubId,
    ...(league?.clubIds ?? []),
  ];
  const transferBuzz = isTransferWindowOpen(save)
    ? transferBuzzForPrematch(save.news, save.currentDate, buzzClubs, 3)
    : [];

  const applyTactics = (t: TeamTactics) => {
    setTactics(t);
    onTactics(t);
  };

  const swapPlayers = (a: string, b: string) => {
    const next = [...tactics.lineup];
    const ai = next.indexOf(a);
    const bi = next.indexOf(b);
    if (ai >= 0 && bi >= 0) {
      next[ai] = b;
      next[bi] = a;
    } else if (ai >= 0) {
      next[ai] = b;
    } else if (bi >= 0) {
      next[bi] = a;
    } else {
      setSelectedId(null);
      return;
    }
    applyTactics({ ...tactics, lineup: next.slice(0, 11) });
    setSelectedId(null);
  };

  const onTapMine = (id: string) => {
    if (!selectedId) {
      setSelectedId(id);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    swapPlayers(selectedId, id);
  };

  const renderPlayerRow = (
    p: Player,
    opts: {
      jersey: string;
      jerseySecondary?: string;
      compact?: boolean;
      selected?: boolean;
      onPress?: () => void;
    }
  ) => {
    const avatar = opts.compact ? 22 : 26;
    const content = (
      <>
        <PersonPortrait
          seed={p.id}
          size={avatar}
          jersey={opts.jersey}
          jerseySecondary={opts.jerseySecondary}
          age={p.age}
          portraitId={p.portraitId}
          nationalityId={p.nationalityId}
        />
        <Text style={[styles.prePos, opts.compact && styles.prePosSm]} numberOfLines={1}>
          {rolesLabel(p)}
        </Text>
        <Text style={[styles.preName, opts.compact && styles.preNameSm]} numberOfLines={1}>
          {p.lastName}
        </Text>
        <Text style={[styles.preOvr, opts.compact && styles.preOvrSm]}>{p.overall}</Text>
      </>
    );
    if (opts.onPress) {
      return (
        <Pressable
          key={p.id}
          onPress={opts.onPress}
          style={[styles.prePlayerRow, opts.selected && styles.xiRowSelected]}
        >
          {content}
        </Pressable>
      );
    }
    return (
      <View key={p.id} style={styles.prePlayerRow}>
        {content}
      </View>
    );
  };

  const renderMineColumn = () => (
    <View style={styles.preCol}>
      <Text style={styles.preColTitle} numberOfLines={1}>
        Вы · {userClub.shortName}
      </Text>
      <Text style={styles.preSub}>Основа</Text>
      {myIds.map((id) => {
        const p = save.players.find((x) => x.id === id);
        if (!p) return null;
        return renderPlayerRow(p, {
          jersey: userClub.colors[0],
          jerseySecondary: userClub.colors[1],
          selected: selectedId === id,
          onPress: () => onTapMine(id),
        });
      })}
      <Text style={[styles.preSub, { marginTop: 10 }]}>
        {selectedId ? "Тапните второго для обмена" : "Запас"}
      </Text>
      {myBench.slice(0, 9).map((id) => {
        const p = save.players.find((x) => x.id === id);
        if (!p) return null;
        return renderPlayerRow(p, {
          jersey: userClub.colors[0],
          jerseySecondary: userClub.colors[1],
          compact: true,
          selected: selectedId === id,
          onPress: () => onTapMine(id),
        });
      })}
    </View>
  );

  const renderOppColumn = () => (
    <View style={styles.preCol}>
      <Text style={styles.preColTitle} numberOfLines={1}>
        Соперник · {opp.shortName}
      </Text>
      <Text style={styles.preSub}>Основа</Text>
      {oppIds.map((id) => {
        const p = save.players.find((x) => x.id === id);
        if (!p) return null;
        return renderPlayerRow(p, {
          jersey: opp.colors[0],
          jerseySecondary: opp.colors[1],
        });
      })}
      <Text style={[styles.preSub, { marginTop: 10 }]}>Запас</Text>
      {oppBench.slice(0, 7).map((id) => {
        const p = save.players.find((x) => x.id === id);
        if (!p) return null;
        return renderPlayerRow(p, {
          jersey: opp.colors[0],
          jerseySecondary: opp.colors[1],
          compact: true,
        });
      })}
    </View>
  );

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← отложить</Text>
      </Pressable>
      <Text style={styles.brandSmall}>Перед матчем</Text>
      <Text style={styles.hint}>
        Замена: выберите игрока основы, затем запасного (или наоборот).
      </Text>
      <View style={styles.matchHeader}>
        <View style={styles.matchSide}>
          <ClubLogo club={home} size={44} />
          <Text style={styles.matchClub}>{home.name}</Text>
          <Text style={styles.clubCity}>{home.city}</Text>
        </View>
        <Text style={styles.scoreBig}>vs</Text>
        <View style={[styles.matchSide, { alignItems: "flex-end" }]}>
          <ClubLogo club={away} size={44} />
          <Text style={styles.matchClub}>{away.name}</Text>
          <Text style={styles.clubCity}>{away.city}</Text>
        </View>
      </View>

      {preview.atmosphere ? (
        <View style={styles.atmosphereBox}>
          <Text style={styles.atmosphereStadium} numberOfLines={1}>
            {preview.atmosphere.stadium}
          </Text>
          <Text style={styles.atmosphereLine}>
            Вместимость {formatAttendance(preview.atmosphere.capacity)} · пришло{" "}
            {formatAttendance(preview.atmosphere.attendance)} (
            {attendanceFillPct(preview.atmosphere.attendance, preview.atmosphere.capacity)}%)
          </Text>
          <Text style={styles.atmosphereWeather}>
            Погода: {preview.atmosphere.weatherLabel} — {preview.atmosphere.weatherHint}
          </Text>
        </View>
      ) : null}

      <ScrollView>
        {transferBuzz.length > 0 ? (
          <View style={styles.buzzBox}>
            <Text style={styles.buzzTitle}>Слухи трансферного окна</Text>
            {transferBuzz.map((n) => (
              <View key={n.id} style={styles.buzzItem}>
                <Text style={styles.buzzHeadline}>{n.headline}</Text>
                <Text style={styles.buzzBody}>{n.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.preRow}>
          {userIsHome ? renderMineColumn() : renderOppColumn()}
          <View style={styles.preDivider} />
          {userIsHome ? renderOppColumn() : renderMineColumn()}
        </View>

        <TacticsPanel
          tactics={tactics}
          squad={save.players.filter((p) => p.clubId === save.clubId)}
          clubId={save.clubId}
          jersey={userClub.colors[0]}
              jerseySecondary={userClub.colors[1]}
          onChange={(t) => {
            applyTactics(t);
            setSelectedId(null);
          }}
          compact
          lineupContext={{
            stats: save.playerStats,
            suspensions: save.suspensions ?? {},
          }}
        />
      </ScrollView>

      <Pressable style={styles.cta} onPress={() => onStart(tactics)}>
        <Text style={styles.ctaText}>Начать матч</Text>
      </Pressable>
    </View>
  );
}

function MatchSummaryScreen({
  pack,
  save,
  home,
  away,
  homeName,
  awayName,
  summary,
  onContinue,
  onPlayer,
}: {
  pack: WorldPack;
  save: CareerSave;
  home?: Club;
  away?: Club;
  homeName: string;
  awayName: string;
  summary: MatchSummary;
  onContinue: () => void;
  onPlayer?: (playerId: string) => void;
}) {
  const reactions = summary.reactions ?? [];
  const coachClubIds = reactions.filter((r) => r.role === "coach" && r.clubId).map((r) => r.clubId);
  const coachPool = coachPortraitPoolSize();
  const [tab, setTab] = useState<"scheme" | "interview">("scheme");

  const formatMinutes = (minutes?: number[]) =>
    minutes?.length ? minutes.map((m) => `${m}'`).join(", ") : null;

  const line = (rows: MatchSummary["scorers"], empty: string) =>
    rows.length === 0 ? (
      <Text style={styles.sub}>{empty}</Text>
    ) : (
      rows.map((r) => {
        const club = pack.clubs.find((c) => c.id === r.clubId);
        const mins = formatMinutes(r.minutes);
        return (
          <Pressable
            key={`${r.playerId}-${r.detail ?? ""}-${r.minutes?.join("-") ?? r.count}`}
            style={styles.summaryRow}
            onPress={onPlayer && r.playerId ? () => onPlayer(r.playerId) : undefined}
            disabled={!onPlayer || !r.playerId}
          >
            {club ? <ClubLogo club={club} size={18} /> : null}
            <Text style={styles.tableClub} numberOfLines={1}>
              {r.name}
              {r.count && r.count > 1 ? ` ×${r.count}` : ""}
            </Text>
            {mins ? <Text style={styles.summaryMinute}>{mins}</Text> : null}
            {r.rating != null ? <Text style={styles.pts}>{r.rating.toFixed(1)}</Text> : null}
          </Pressable>
        );
      })
    );

  const motmClub = summary.motm
    ? pack.clubs.find((c) => c.id === summary.motm!.clubId)
    : undefined;
  const motmPlayer = summary.motm
    ? save.players.find((p) => p.id === summary.motm!.playerId)
    : undefined;

  return (
    <View style={styles.root}>
      <Text style={styles.brandSmall}>Итоги матча</Text>
      <Text style={styles.scoreBig}>
        {summary.homeGoals}:{summary.awayGoals}
      </Text>
      <Text style={styles.sub}>
        {homeName} — {awayName}
      </Text>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("scheme")}
          style={[styles.tab, tab === "scheme" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "scheme" && styles.tabTextOn]}>Схема</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("interview")}
          style={[styles.tab, tab === "interview" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "interview" && styles.tabTextOn]}>Интервью</Text>
        </Pressable>
      </View>

      <ScrollView>
        {tab === "scheme" ? (
          <>
            {home && away ? (
              <LiveMatchStatsPanel
                home={home}
                away={away}
                score={[summary.homeGoals, summary.awayGoals]}
                homeStats={summary.homeStats ?? emptySideStats()}
                awayStats={summary.awayStats ?? emptySideStats()}
              />
            ) : (
              <>
                <Text style={styles.section}>Статистика</Text>
                <Text style={styles.sub}>
                  Удары {summary.homeShots}:{summary.awayShots} · Фолы {summary.fouls} · Пенальти{" "}
                  {summary.penalties} · Угловые {summary.corners}
                </Text>
              </>
            )}

            <Text style={styles.section}>Голы</Text>
            {line(summary.scorers, "Без голов")}

            <Text style={styles.section}>Жёлтые карточки</Text>
            {line(summary.yellowCards, "Нет")}

            <Text style={styles.section}>Красные карточки</Text>
            {line(summary.redCards, "Нет")}

            <Text style={styles.section}>Лучший игрок матча</Text>
            {summary.motm ? (
              <Pressable
                style={styles.summaryRow}
                onPress={
                  onPlayer && summary.motm.playerId
                    ? () => onPlayer(summary.motm!.playerId)
                    : undefined
                }
                disabled={!onPlayer || !summary.motm.playerId}
              >
                <PersonPortrait
                  seed={summary.motm.playerId}
                  size={40}
                  jersey={motmClub?.colors[0]}
                  jerseySecondary={motmClub?.colors[1]}
                  age={motmPlayer?.age}
                  portraitId={motmPlayer?.portraitId}
                  nationalityId={motmPlayer?.nationalityId}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[styles.tableClub, { marginLeft: 0 }]} numberOfLines={1}>
                    {summary.motm.name}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {motmClub ? <ClubLogo club={motmClub} size={16} /> : null}
                    <Text style={{ color: broadcast.mist, fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {motmClub?.name ?? "Клуб не указан"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.pts}>{summary.motm.rating?.toFixed(1)}</Text>
              </Pressable>
            ) : (
              <Text style={styles.sub}>Не определён</Text>
            )}
          </>
        ) : reactions.length === 0 ? (
          <Text style={styles.sub}>Комментариев нет</Text>
        ) : (
          reactions.map((r, idx) => {
            const club = pack.clubs.find((c) => c.id === r.clubId);
            const player = r.playerId
              ? save.players.find((p) => p.id === r.playerId)
              : undefined;
            const roleLabel = r.role === "coach" ? "Тренер" : "Игрок";
            const coachSlot =
              r.role === "coach"
                ? portraitSlotForStaff("coach", r.clubId, coachPool, coachClubIds)
                : undefined;
            return (
              <Pressable
                key={`${r.role}-${r.clubId}-${r.playerId ?? r.name}-${idx}`}
                style={styles.reactionCard}
                onPress={
                  onPlayer && r.role === "player" && r.playerId
                    ? () => onPlayer(r.playerId!)
                    : undefined
                }
                disabled={!onPlayer || r.role !== "player" || !r.playerId}
              >
                <View style={styles.reactionTop}>
                  {r.role === "player" && player ? (
                    <PersonPortrait
                      seed={player.id}
                      size={36}
                      jersey={club?.colors[0]}
                      jerseySecondary={club?.colors[1]}
                      age={player.age}
                      portraitId={player.portraitId}
                      nationalityId={player.nationalityId}
                    />
                  ) : (
                    <PersonPortrait
                      seed={`coach:${r.clubId}`}
                      size={36}
                      kind="coach"
                      portraitId={coachSlot}
                      jersey={club?.colors[0]}
                    />
                  )}
                  {club ? <ClubLogo club={club} size={18} /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.tableClub, { marginLeft: 0 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.reactionMeta} numberOfLines={1}>
                      {roleLabel}
                      {club ? ` · ${club.shortName}` : ""}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reactionQuote}>«{r.quote}»</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable style={styles.cta} onPress={onContinue}>
        <Text style={styles.ctaText}>В кабинет</Text>
      </Pressable>
    </View>
  );
}

function LiveMatchScreen({
  pack,
  save,
  live,
  onLiveChange,
  onTacticsPersist,
  onDone,
  onPlayer,
}: {
  pack: WorldPack;
  save: CareerSave;
  live: LiveMatchState;
  onLiveChange: (l: LiveMatchState) => void;
  onTacticsPersist: (t: TeamTactics) => void;
  onDone: (l: LiveMatchState) => void;
  onPlayer?: (playerId: string) => void;
}) {
  const home = pack.clubs.find((c) => c.id === live?.homeClubId);
  const away = pack.clubs.find((c) => c.id === live?.awayClubId);
  const userIsHome = !!live && live.homeClubId === save.clubId;
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState<"feed" | "ratings" | "subs" | "tactics" | "stats">("feed");
  const [eventCursor, setEventCursor] = useState(0);
  const [celebration, setCelebration] = useState<{
    kind: MomentKind;
    playerId: string;
    playerName: string;
    jersey?: string;
    subtitle?: string;
    club?: Club;
    portraitId?: number;
    nationalityId?: string;
    key: number;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rngRef = useRef(new Rng(Date.now() % 100000));
  const celebratedIdRef = useRef<string | null>(null);

  const visible = live?.events.slice(0, Math.max(1, eventCursor)) ?? [];
  const score = visible[visible.length - 1]?.score ?? [live?.homeGoals ?? 0, live?.awayGoals ?? 0];

  // Keep the clock paused while managing lineup / tactics / stats
  useEffect(() => {
    if (panel === "subs" || panel === "tactics" || panel === "stats") {
      setPaused(true);
    }
  }, [panel]);

  // Drive clock: reveal events, then simulate the next minute chunk on a timer
  useEffect(() => {
    if (!live || !home || !away || paused || live.finished || celebration) return;
    if (panel === "subs" || panel === "tactics" || panel === "stats") return;

    if (eventCursor < live.events.length) {
      const cur = live.events[Math.max(0, eventCursor - 1)];
      const next = live.events[eventCursor];
      const gap = next && cur ? Math.max(1, next.minute - cur.minute) : 1;
      const ms = Math.max(70, (380 * gap) / speed);
      const t = setTimeout(() => setEventCursor((c) => c + 1), ms);
      return () => clearTimeout(t);
    }

    if (live.minute < 90) {
      const ms = Math.max(60, 220 / speed);
      const t = setTimeout(() => {
        const chunk = Math.min(90, live.minute + Math.max(1, Math.round(speed)));
        const advanced = advanceLiveMatch(live, home, away, save.players, chunk, rngRef.current);
        onLiveChange(advanced);
      }, ms);
      return () => clearTimeout(t);
    }
  }, [eventCursor, paused, speed, live, home, away, save.players, onLiveChange, celebration, panel]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [eventCursor]);

  // Big moments: goal, cards, penalty, handball (no free-kick popups)
  useEffect(() => {
    const last = visible[visible.length - 1];
    if (!last?.playerId) return;
    let kind: MomentKind | null = null;
    let subtitle: string | undefined;
    if (last.type === "goal") {
      kind = "goal";
      if (last.detail === "penalty") subtitle = "С пенальти";
      if (last.detail === "freekick") subtitle = "Со штрафного";
    } else if (last.type === "card" && last.detail === "yellow") {
      kind = "yellow";
    } else if (last.type === "card" && last.detail === "red") {
      kind = "red";
      subtitle = "Удаление";
    } else if (last.type === "penalty") {
      kind = "penalty";
    } else if (last.type === "handball") {
      kind = "handball";
    }
    if (!kind) return;
    const stamp = `${visible.length}:${last.type}:${last.minute}:${last.playerId}:${last.detail ?? ""}`;
    if (celebratedIdRef.current === stamp) return;
    celebratedIdRef.current = stamp;
    const actor = save.players.find((p) => p.id === last.playerId);
    const actorClub = pack.clubs.find((c) => c.id === last.clubId);
    setCelebration({
      kind,
      playerId: last.playerId,
      playerName: actor ? playerDisplayName(actor) : "Игрок",
      jersey: actorClub?.colors[0],
      subtitle,
      club: actorClub,
      portraitId: actor?.portraitId,
      nationalityId: actor?.nationalityId,
      key: visible.length,
    });
  }, [visible, pack.clubs, save.players]);

  if (!live || !home || !away) {
    return (
      <View style={styles.root}>
        <Text style={styles.sub}>Матч недоступен</Text>
      </View>
    );
  }

  const userOnField = userIsHome ? live.homeOnField : live.awayOnField;
  const userBench = userIsHome ? live.homeBench : live.awayBench;
  const userTactics = userIsHome ? live.homeTactics : live.awayTactics;
  const subsLeft = live.maxSubs - (userIsHome ? live.homeSubsUsed : live.awaySubsUsed);
  const homeReds = visible.filter((e) => e.type === "card" && e.detail === "red" && e.clubId === home.id).length;
  const awayReds = visible.filter((e) => e.type === "card" && e.detail === "red" && e.clubId === away.id).length;
  const liveStats = resolveMatchStats({
    homeClubId: home.id,
    awayClubId: away.id,
    events: visible,
    homeStats: live.homeStats,
    awayStats: live.awayStats,
    homeShots: live.homeShots,
    awayShots: live.awayShots,
  });

  return (
    <View style={styles.root}>
      {celebration ? (
        <MomentCelebration
          key={celebration.key}
          kind={celebration.kind}
          playerId={celebration.playerId}
          playerName={celebration.playerName}
          jersey={celebration.jersey}
          subtitle={celebration.subtitle}
          club={celebration.club}
          portraitId={celebration.portraitId}
          nationalityId={celebration.nationalityId}
          onDone={() => setCelebration(null)}
        />
      ) : null}
      <View style={styles.matchHeader}>
        <View style={styles.matchSide}>
          <View style={styles.crestRow}>
            <ClubLogo club={home} size={40} />
            {homeReds > 0 ? (
              <View style={styles.redCardsRow}>
                {Array.from({ length: homeReds }, (_, i) => (
                  <View key={`hr-${i}`} style={styles.redCardBadge} />
                ))}
              </View>
            ) : null}
          </View>
          <Text style={styles.matchClub}>{home.name}</Text>
          <Text style={styles.clubCity}>{home.city}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.scoreBig}>
            {score[0]} : {score[1]}
          </Text>
          <Text style={styles.sub}>{live.minute}'</Text>
          {live.atmosphere ? (
            <Text style={styles.atmosphereLive} numberOfLines={1}>
              {live.atmosphere.weatherLabel} · {formatAttendance(live.atmosphere.attendance)}
            </Text>
          ) : null}
        </View>
        <View style={[styles.matchSide, { alignItems: "flex-end" }]}>
          <View style={[styles.crestRow, { justifyContent: "flex-end" }]}>
            {awayReds > 0 ? (
              <View style={styles.redCardsRow}>
                {Array.from({ length: awayReds }, (_, i) => (
                  <View key={`ar-${i}`} style={styles.redCardBadge} />
                ))}
              </View>
            ) : null}
            <ClubLogo club={away} size={40} />
          </View>
          <Text style={styles.matchClub}>{away.name}</Text>
          <Text style={styles.clubCity}>{away.city}</Text>
        </View>
      </View>

      {panel === "feed" ? (
        <LiveMatchStatsPanel
          home={home}
          away={away}
          score={score as [number, number]}
          homeStats={liveStats.home}
          awayStats={liveStats.away}
          compact
        />
      ) : null}

      <View style={styles.speedRow}>
        <Pressable style={styles.speedBtn} onPress={() => setPaused((p) => !p)}>
          <Text style={styles.speedBtnText}>{paused ? "▶" : "⏸"}</Text>
        </Pressable>
        {SPEEDS.map((s) => (
          <Pressable
            key={s}
            style={[styles.speedBtn, speed === s && styles.speedBtnActive]}
            onPress={() => {
              setPaused(false);
              setSpeed(s);
            }}
          >
            <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>{s}x</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.speedBtn}
          onPress={() => {
            let s = live;
            while (!s.finished) {
              s = advanceLiveMatch(s, home, away, save.players, 90, rngRef.current);
            }
            onLiveChange(s);
            setEventCursor(s.events.length);
          }}
        >
          <Text style={styles.speedBtnText}>конец</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ["feed", "Лента"],
            ["stats", "Статы"],
            ["ratings", "Оценки"],
            ["subs", `Замены (${subsLeft})`],
            ["tactics", "Тактика"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => {
              setPanel(id);
              if (id === "subs" || id === "tactics" || id === "ratings" || id === "stats") {
                setPaused(true);
              }
            }}
            style={[styles.tab, panel === id && styles.tabOn]}
          >
            <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {panel === "feed" && (
        <ScrollView ref={scrollRef} style={styles.feed}>
          {visible.map((e, i) => {
            const side =
              !e.clubId
                ? "neutral"
                : e.clubId === home.id
                  ? "home"
                  : e.clubId === away.id
                    ? "away"
                    : "neutral";
            const eventClub =
              e.clubId === home.id ? home : e.clubId === away.id ? away : undefined;
            const showCrest = !!eventClub && (e.playerId || ["goal", "chance", "shot", "save", "miss", "foul", "card", "corner", "assist", "sub_on", "sub_off"].includes(e.type));
            return (
              <View
                key={`${e.minute}-${e.type}-${i}`}
                style={[
                  styles.feedItem,
                  side === "home" && styles.feedHome,
                  side === "away" && styles.feedAway,
                  side === "neutral" && styles.feedNeutral,
                  e.type === "goal" && styles.feedGoal,
                  e.type === "card" && e.detail === "yellow" && styles.feedYellow,
                  e.type === "card" && e.detail === "red" && styles.feedRed,
                  (e.type === "penalty" || e.type === "handball" || e.type === "freekick") &&
                    styles.feedSetPiece,
                ]}
              >
                <View
                  style={[
                    styles.feedAccent,
                    {
                      backgroundColor:
                        side === "home" ? home.colors[0] : side === "away" ? away.colors[0] : "#5F7A6C",
                    },
                  ]}
                />
                {showCrest && eventClub ? (
                  <View style={styles.feedCrest}>
                    <ClubLogo club={eventClub} size={18} />
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.feedText,
                    side === "away" && { textAlign: "right" },
                    side === "neutral" && { textAlign: "center", color: broadcast.mist },
                  ]}
                >
                  {e.text}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {panel === "stats" && (
        <ScrollView>
          <LiveMatchStatsPanel
            home={home}
            away={away}
            score={score as [number, number]}
            homeStats={liveStats.home}
            awayStats={liveStats.away}
          />
        </ScrollView>
      )}

      {panel === "ratings" && (
        <ScrollView>
          <Text style={styles.section}>Ваши игроки на поле · оценка · выносливость</Text>
          {[...userOnField]
            .map((id) => ({ id, r: live.ratings[id] ?? 6.5 }))
            .sort((a, b) => a.r - b.r)
            .map(({ id, r }) => {
              const p = save.players.find((x) => x.id === id)!;
              return (
                <Pressable
                  key={id}
                  style={styles.xiRow}
                  onPress={onPlayer ? () => onPlayer(id) : undefined}
                  disabled={!onPlayer}
                >
                  <PersonPortrait seed={p.id} size={28} jersey={userIsHome ? home.colors[0] : away.colors[0]}
              jerseySecondary={userIsHome ? home.colors[1] : away.colors[1]} age={p.age} 
              portraitId={p.portraitId}
              nationalityId={p.nationalityId}
            />
                  <Text style={[styles.posBadge, { width: 64 }]}>{rolesLabel(p)}</Text>
                  <Text style={styles.tableClub} numberOfLines={1}>
                    {playerNameWithAge(p)}
                  </Text>
                  <Text
                    style={[
                      styles.pts,
                      { fontSize: 11, color: (live.stamina?.[id] ?? 100) < 40 ? "#E74C3C" : broadcast.mist },
                    ]}
                  >
                    {Math.round(live.stamina?.[id] ?? 100)}%
                  </Text>
                  <Text style={[styles.pts, r < 6 && { color: "#E74C3C" }, r >= 7.5 && { color: "#2ECC71" }]}>
                    {r.toFixed(1)}
                  </Text>
                </Pressable>
              );
            })}
        </ScrollView>
      )}

      {panel === "subs" && (
        <ScrollView>
          <Text style={styles.hint}>
            Замены: {userIsHome ? live.homeSubsUsed : live.awaySubsUsed} сделано · осталось{" "}
            {subsLeft} из {live.maxSubs}
          </Text>
          <SubPicker
            live={live}
            save={save}
            userClubId={save.clubId}
            jersey={(userIsHome ? home : away).colors[0]}
              jerseySecondary={(userIsHome ? home : away).colors[1]}
            onSub={(outId, inId) => {
              const next = liveMakeSubstitution(
                live,
                save.clubId,
                outId,
                inId,
                live.minute,
                save.players
              );
              onLiveChange(next);
              setEventCursor(next.events.length);
            }}
          />
        </ScrollView>
      )}

      {panel === "tactics" && (
        <ScrollView>
          <TacticsPanel
            compact
            lockLineup
            tactics={{ ...userTactics, lineup: [...userOnField] }}
            squad={save.players.filter((p) => p.clubId === save.clubId)}
            clubId={save.clubId}
            jersey={(userIsHome ? home : away).colors[0]}
              jerseySecondary={(userIsHome ? home : away).colors[1]}
            lineupContext={{
              stats: save.playerStats,
              suspensions: save.suspensions ?? {},
            }}
            onChange={(t) => {
              const patched = liveUpdateTactics(
                live,
                save.clubId,
                {
                  attack: t.attack,
                  defence: t.defence,
                  aggression: t.aggression,
                  formation: t.formation,
                },
                live.minute
              );
              onLiveChange(patched);
              onTacticsPersist({ ...t, lineup: [...(userIsHome ? patched.homeOnField : patched.awayOnField)] });
              setEventCursor(patched.events.length);
            }}
          />
        </ScrollView>
      )}

      {live.finished ? (
        <Pressable style={styles.cta} onPress={() => onDone(live)}>
          <Text style={styles.ctaText}>К итогам матча</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.ctaSecondary}
          onPress={() => {
            if (panel === "subs" || panel === "tactics" || panel === "stats") {
              setPanel("feed");
            }
            setPaused(false);
          }}
        >
          <Text style={styles.ctaSecondaryText}>
            {paused || panel === "subs" || panel === "tactics" || panel === "stats"
              ? "Продолжить матч"
              : "Идёт матч…"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function LiveMatchStatsPanel({
  home,
  away,
  score,
  homeStats,
  awayStats,
  compact,
}: {
  home: Club;
  away: Club;
  score: [number, number];
  homeStats: MatchSideStats;
  awayStats: MatchSideStats;
  compact?: boolean;
}) {
  const ht = Math.max(0, homeStats.possessionTicks);
  const at = Math.max(0, awayStats.possessionTicks);
  const total = ht + at;
  const homePoss = total > 0 ? Math.round((ht / total) * 100) : 50;
  const awayPoss = 100 - homePoss;

  if (compact) {
    return (
      <View style={styles.statsCompact}>
        <Text style={styles.statsCompactText}>
          Уд {homeStats.shots}({homeStats.shotsOnTarget}) · Угл {homeStats.corners} · ЖК{" "}
          {homeStats.yellowCards} · КК {homeStats.redCards} · {homePoss}%
        </Text>
        <Text style={styles.statsCompactMid}>статы</Text>
        <Text style={[styles.statsCompactText, { textAlign: "right" }]}>
          {awayPoss}% · КК {awayStats.redCards} · ЖК {awayStats.yellowCards} · Угл{" "}
          {awayStats.corners} · Уд {awayStats.shots}({awayStats.shotsOnTarget})
        </Text>
      </View>
    );
  }

  const row = (label: string, left: string | number, right: string | number) => (
    <View style={styles.matchStatRow} key={label}>
      <Text style={styles.statVal}>{left}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statVal}>{right}</Text>
    </View>
  );

  return (
    <View style={styles.statsCard}>
      <View style={styles.statsHead}>
        <View style={styles.statsSide}>
          <ClubLogo club={home} size={28} />
          <Text style={styles.statsClub} numberOfLines={1}>
            {home.shortName}
          </Text>
        </View>
        <Text style={styles.statsScore}>
          {score[0]}-{score[1]}
        </Text>
        <View style={[styles.statsSide, { alignItems: "flex-end" }]}>
          <ClubLogo club={away} size={28} />
          <Text style={styles.statsClub} numberOfLines={1}>
            {away.shortName}
          </Text>
        </View>
      </View>
      <View style={styles.statsTitleBar}>
        <Text style={styles.statsTitle}>Статистика матча</Text>
      </View>
      {row(
        "Удары (в створ)",
        `${homeStats.shots} (${homeStats.shotsOnTarget})`,
        `${awayStats.shots} (${awayStats.shotsOnTarget})`
      )}
      {row("Угловые", homeStats.corners, awayStats.corners)}
      {row("Офсайды", homeStats.offsides, awayStats.offsides)}
      {row("Нарушения", homeStats.fouls, awayStats.fouls)}
      {row("Предупреждения", homeStats.yellowCards, awayStats.yellowCards)}
      {row("Удаления", homeStats.redCards, awayStats.redCards)}
      {row("Владение мячом", `${homePoss}%`, `${awayPoss}%`)}
    </View>
  );
}

function SubPicker({
  live,
  save,
  userClubId,
  jersey,
  jerseySecondary,
  onSub,
}: {
  live: LiveMatchState;
  save: CareerSave;
  userClubId: string;
  jersey: string;
  jerseySecondary?: string;
  onSub: (outId: string, inId: string) => void;
}) {
  const [outId, setOutId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AutoSubSuggestion | null>(null);
  const isHome = live.homeClubId === userClubId;
  const onField = isHome ? live.homeOnField : live.awayOnField;
  const bench = isHome ? live.homeBench : live.awayBench;
  const formation = (isHome ? live.homeTactics : live.awayTactics).formation;
  const coords = FORMATION_COORDS[formation];
  const used = isHome ? live.homeSubsUsed : live.awaySubsUsed;
  const left = live.maxSubs - used;
  const byId = new Map(save.players.map((p) => [p.id, p]));

  const suggestOne = () => {
    const suggestions = suggestAutoSubstitutions(
      onField,
      bench,
      formation,
      save.players,
      live.ratings,
      live.matchYellows ?? {},
      3,
      live.stamina
    );
    const next =
      suggestions.find(
        (s) => s.outId !== proposal?.outId || s.inId !== proposal?.inId
      ) ?? suggestions[0];
    setProposal(next ?? null);
  };

  const pitchSlots = onField.flatMap((id, i) => {
    const p = byId.get(id);
    const c = coords[i] ?? { x: 50, y: 50 };
    const role = FORMATION_ROLES[formation][i] ?? "CM";
    if (!p) return [];
    const selected = outId === id;
    const proposed = proposal?.outId === id;
    const eff = effectiveOverall(p, role);
    return [
      {
        key: `${id}-${i}`,
        x: c.x,
        y: c.y,
        rating: Math.round(eff),
        name: pitchShortName(p),
        roleTags: pitchRoleTags(role, p),
        portrait: {
          seed: p.id,
          portraitId: p.portraitId,
          nationalityId: p.nationalityId,
          age: p.age,
          jersey,
          jerseySecondary,
        },
        selected,
        danger: proposed,
        onPress: () => {
          setProposal(null);
          setOutId(selected ? null : id);
        },
      },
    ];
  });

  return (
    <View>
      <Text style={styles.section}>Схема · тап по игроку = убрать</Text>
      <FormationPitch compact slots={pitchSlots} />

      {left > 0 && !live.finished ? (
        <Pressable style={styles.ctaSecondary} onPress={suggestOne}>
          <Text style={styles.ctaSecondaryText}>Предложить автозамену</Text>
        </Pressable>
      ) : null}

      {proposal ? (
        <View style={styles.proposalBox}>
          <Text style={styles.proposalTitle}>
            Предложение · сделано {used}/{live.maxSubs} · осталось {left}
          </Text>
          <Text style={styles.sub}>
            ↓ {byId.get(proposal.outId)?.lastName ?? "?"} ({ROLE_LABEL[proposal.role]}) → ↑{" "}
            {byId.get(proposal.inId)?.lastName ?? "?"}
          </Text>
          <View style={styles.proposalActions}>
            <Pressable
              style={styles.cta}
              onPress={() => {
                onSub(proposal.outId, proposal.inId);
                setProposal(null);
                setOutId(null);
              }}
            >
              <Text style={styles.ctaText}>Применить</Text>
            </Pressable>
            <Pressable
              style={styles.ctaSecondary}
              onPress={() => {
                suggestOne();
              }}
            >
              <Text style={styles.ctaSecondaryText}>Другое</Text>
            </Pressable>
            <Pressable style={styles.ctaSecondary} onPress={() => setProposal(null)}>
              <Text style={styles.ctaSecondaryText}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Запас {outId ? "· тап = заменить" : ""}</Text>
      {bench.map((id) => {
        const p = byId.get(id)!;
        const role = p.preferredRole ?? "CM";
        const eff = effectiveOverall(p, role);
        const proposedIn = proposal?.inId === id;
        return (
          <Pressable
            key={id}
            style={[
              styles.xiRow,
              !outId && !proposedIn && { opacity: 0.55 },
              proposedIn && styles.tableRowMine,
            ]}
            onPress={() => {
              if (outId) {
                onSub(outId, id);
                setOutId(null);
                setProposal(null);
              }
            }}
          >
            <PersonPortrait seed={p.id} size={28} jersey={jersey} jerseySecondary={jerseySecondary} age={p.age} 
              portraitId={p.portraitId}
              nationalityId={p.nationalityId}
            />
            <Text style={[styles.posBadge, { width: 64 }]}>{rolesLabel(p)}</Text>
            <Text style={styles.tableClub} numberOfLines={1}>
              {playerNameWithAge(p)}
            </Text>
            <Text style={styles.pts}>{eff}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SquadScreen({
  pack,
  save,
  clubId,
  onBack,
  onPlayer,
  onTactics,
}: {
  pack: WorldPack;
  save: CareerSave;
  clubId: string;
  onBack: () => void;
  onPlayer: (id: string) => void;
  onTactics?: (t: TeamTactics) => void;
}) {
  const club = pack.clubs.find((c) => c.id === clubId)!;
  const isUserClub = clubId === save.clubId;
  const squad = useMemo(
    () => sortSquad(save.players.filter((p) => p.clubId === clubId)),
    [save.players, clubId]
  );
  const [tab, setTab] = useState<"tactics" | "list" | "history">(
    isUserClub ? "tactics" : "list"
  );
  const [historyReady, setHistoryReady] = useState(false);
  const [strengthHints, setStrengthHints] = useState<LineupStrengthHint[] | null>(null);

  useEffect(() => {
    if (tab !== "history") {
      setHistoryReady(false);
      return;
    }
    return afterFirstPaint(() => setHistoryReady(true));
  }, [tab]);

  const history = useMemo(() => buildClubHistory(pack, clubId), [pack, clubId]);
  const living = useMemo(
    () => (historyReady ? careerLegendsForClub(save, clubId) : []),
    [save, clubId, historyReady]
  );
  const played = useMemo(
    () => (historyReady ? clubPlayedMatches(pack, save, clubId, 30) : []),
    [pack, save, clubId, historyReady]
  );
  const euroSoon = useMemo(
    () => (historyReady ? upcomingClubEuroFixtures(pack, save, clubId) : []),
    [pack, save, clubId, historyReady]
  );
  const euroAccess = hasContinentalAccess(pack, club.federationId, save.season);
  const lineupCtx = {
    stats: save.playerStats,
    suspensions: save.suspensions ?? {},
  };

  const showStrengthHints = () => {
    if (!isUserClub) return;
    setStrengthHints(analyzeLineupStrength(save.players, clubId, save.userTactics, lineupCtx));
  };

  const applyStrengthHints = () => {
    if (!isUserClub || !onTactics) return;
    const next = applyOptimalLineup(save.players, clubId, save.userTactics, lineupCtx);
    onTactics(next);
    setStrengthHints(analyzeLineupStrength(save.players, clubId, next, lineupCtx));
  };

  return (
    <View style={styles.root}>
      <ClubCrestHero
        compact
        club={club}
        date={save.currentDate}
        topLeft={<CrestHeroBack label="← кабинет" onPress={onBack} />}
        subtitle={`${club.city}${history ? ` · осн. ${history.founded}` : ""}${euroAccess ? " · еврокубки" : ""}`}
        lines={[`Состав ~${squadAverageOverall(save.players, clubId)}`]}
      />

      <View style={styles.tabs}>
        {isUserClub && onTactics ? (
          <Pressable
            onPress={() => setTab("tactics")}
            style={[styles.tab, tab === "tactics" && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === "tactics" && styles.tabTextOn]}>Схема</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setTab("list")}
          style={[styles.tab, tab === "list" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "list" && styles.tabTextOn]}>Состав</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          style={[styles.tab, tab === "history" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "history" && styles.tabTextOn]}>История</Text>
        </Pressable>
      </View>

      {tab === "list" ? (
        <FlatList
          data={squad}
          keyExtractor={(p) => p.id}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: 28 }}
          ListHeaderComponent={
            isUserClub && onTactics ? (
              <View style={styles.needsBox}>
                <Text style={styles.needsTitle}>Сила основы</Text>
                <Text style={styles.needsLead}>
                  Подсказки считаются теми же правилами, что и матч: роль в схеме, любимая нога на фланге, OVR со штрафом вне позиции.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <Pressable style={styles.ctaSecondary} onPress={showStrengthHints}>
                    <Text style={styles.ctaSecondaryText}>Показать подсказки</Text>
                  </Pressable>
                  <Pressable style={styles.cta} onPress={applyStrengthHints}>
                    <Text style={styles.ctaText}>Применить автооснову</Text>
                  </Pressable>
                </View>
                {strengthHints?.map((h, i) => (
                  <Text key={`${i}-${h.message.slice(0, 24)}`} style={styles.hint}>
                    · {h.message}
                  </Text>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item: p }) => {
            const st = save.playerStats[p.id];
            return (
              <Pressable style={styles.playerRow} onPress={() => onPlayer(p.id)}>
                <PersonPortrait
                  seed={p.id}
                  size={44}
                  jersey={club.colors[0]}
                  jerseySecondary={club.colors[1]}
                  age={p.age}
                  portraitId={p.portraitId}
                  nationalityId={p.nationalityId}
                />
                <Text style={[styles.posBadge, { width: 64 }]}>{rolesLabel(p)}</Text>
                <View style={styles.clubMeta}>
                  <Text style={styles.clubName}>
                    {playerNameWithAge(p)}
                    {p.loan ? " · аренда" : ""}
                    {isLastCareerSeason(p) ? " · последний сезон" : ""}
                  </Text>
                  <Text style={styles.clubCity}>
                    {nationalityShort(p.nationalityId)}
                    {" · "}
                    {topStrengths(p, 2).map((s) => ATTRIBUTE_LABEL[s.key]).join(" · ")}
                    {st ? ` · ${st.goals}г ${st.assists}п` : ""}
                    {` · ${formatMarketValue(p.marketValue)}`}
                  </Text>
                </View>
                <Text style={styles.rep}>{p.overall}</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          {isUserClub && onTactics && tab === "tactics" ? (
            <TacticsPanel
              tactics={save.userTactics}
              squad={squad}
              clubId={club.id}
              jersey={club.colors[0]}
              jerseySecondary={club.colors[1]}
              onChange={onTactics}
              lineupContext={lineupCtx}
            />
          ) : null}

          {tab === "history" && history ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.historyMotto}>«{history.motto}»</Text>
              <Text style={styles.section}>Трофеи и вехи</Text>
              {history.honours.map((h) => (
                <Text key={h} style={styles.sub}>
                  · {h}
                </Text>
              ))}

              <Text style={styles.section}>Легенды клуба</Text>
              {history.legends.map((lg) => (
                <View key={lg.id} style={styles.historyRow}>
                  <Text style={styles.clubName}>
                    {lg.firstName} {lg.lastName}
                  </Text>
                  <Text style={styles.clubCity}>
                    {lg.positionLabel} · {lg.years} · пик {lg.peakOverall}
                  </Text>
                  <Text style={styles.hint}>{lg.capsNote}</Text>
                </View>
              ))}
              {historyReady && living.length ? (
                <>
                  <Text style={styles.section}>Звёзды эпохи</Text>
                  {living.map((lg) => {
                    const livingId = lg.id.startsWith("living-") ? lg.id.slice("living-".length) : null;
                    return (
                      <Pressable
                        key={lg.id}
                        style={styles.historyRow}
                        onPress={livingId ? () => onPlayer(livingId) : undefined}
                        disabled={!livingId}
                      >
                        <Text style={styles.clubName}>
                          {lg.firstName} {lg.lastName}
                        </Text>
                        <Text style={styles.clubCity}>
                          {lg.positionLabel} · {lg.years} · {lg.peakOverall}
                        </Text>
                        <Text style={styles.hint}>{lg.capsNote}</Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              <Text style={styles.section}>Классика прошлых лет</Text>
              {history.classicMatches.map((m) => (
                <View key={m.id} style={styles.historyRow}>
                  <Text style={styles.clubName}>
                    {m.homeName} {m.score} {m.awayName}
                  </Text>
                  <Text style={styles.clubCity}>
                    {m.competition} · {m.season}
                  </Text>
                  <Text style={styles.hint}>{m.note}</Text>
                </View>
              ))}

              {!historyReady ? (
                <Text style={styles.sub}>Загрузка результатов сезона…</Text>
              ) : (
                <>
                  {euroSoon.length ? (
                    <>
                      <Text style={styles.section}>Еврокубки · календарь</Text>
                      {euroSoon.map((f) => {
                        const home = pack.clubs.find((c) => c.id === f.homeClubId);
                        const away = pack.clubs.find((c) => c.id === f.awayClubId);
                        const cup = pack.tournaments.find((t) => t.id === f.tournamentId);
                        return (
                          <Text key={f.id} style={styles.sub}>
                            {f.date} · {cup?.name ?? "Евро"} · {home?.shortName} —{" "}
                            {away?.shortName}
                          </Text>
                        );
                      })}
                    </>
                  ) : euroAccess ? (
                    <Text style={styles.hint}>
                      Федерация допущена к еврокубкам. Места распределяются по рейтингу клубов.
                    </Text>
                  ) : null}

                  <Text style={styles.section}>Результаты сезона</Text>
                  {played.length === 0 ? (
                    <Text style={styles.sub}>Пока нет сыгранных матчей</Text>
                  ) : (
                    played.map((m) => (
                      <View key={m.id} style={styles.historyRow}>
                        <Text style={styles.clubName}>
                          {m.homeName} {m.score} {m.awayName}
                        </Text>
                        <Text
                          style={[
                            styles.clubCity,
                            m.won && { color: "#6BCB8A" },
                            !m.won && !m.drawn && { color: "#E07A5F" },
                          ]}
                        >
                          {m.date} · {m.competition}
                          {m.won ? " · победа" : m.drawn ? " · ничья" : " · поражение"}
                        </Text>
                      </View>
                    ))
                  )}
                </>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function PlayerScreen({
  player,
  club,
  stats,
  season,
  seasonStartValue,
  onBack,
  backLabel = "← состав",
  onOpenClub,
  transferActions,
  transferLog,
  clubsById,
}: {
  player: Player;
  club?: Club;
  stats?: CareerSave["playerStats"][string];
  season?: string;
  seasonStartValue?: number;
  onBack: () => void;
  backLabel?: string;
  onOpenClub?: (clubId: string) => void;
  transferActions?: {
    label: string;
    confirmTitle?: string;
    confirmBody?: string;
    destructive?: boolean;
    disabled?: boolean;
    disabledHint?: string;
    onConfirm?: () => void;
    onPress?: () => void;
  }[];
  transferLog?: CareerSave["transferLog"];
  clubsById?: Map<string, Club>;
}) {
  const isGk = primaryPosition(player) === "GK";
  const keys = keyAttributes(player);
  const keySet = new Set(keys);
  const otherKeys = ALL_ATTR_KEYS.filter((k) => !keySet.has(k));
  const radarAxes = useMemo(
    () => radarAxesForPlayer(player.attributes, isGk),
    [player.attributes, isGk]
  );
  const formRing = useMemo(
    () => formRingFromStats(stats, player.overall),
    [stats, player.overall]
  );
  const careerHistory = useMemo(() => buildCareerValueHistory(player), [player]);
  const startMv = seasonStartValue ?? player.marketValue ?? 0.1;
  const seasonHistory = useMemo(
    () => buildSeasonValueHistory(player, startMv, stats, season),
    [player, startMv, stats, season]
  );
  const delta = seasonValueDelta(player.marketValue ?? startMv, startMv);
  const deltaText =
    delta.absolute === 0
      ? "без изменений с начала чемпионата"
      : delta.absolute > 0
        ? `рост с начала чемпионата: +${formatMarketValue(delta.absolute)} (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`
        : `падение с начала чемпионата: ${formatMarketValue(delta.absolute)} (${delta.percent}%)`;
  const [dialog, setDialog] = useState<null | {
    title: string;
    body: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm?: () => void;
  }>(null);

  const moveHistory = useMemo(() => {
    const fromPlayer = player.careerMoves ?? [];
    if (fromPlayer.length) return fromPlayer;
    return (transferLog ?? [])
      .filter((d) => d.playerId === player.id)
      .map((d) => ({
        date: d.date,
        kind: d.kind as "permanent" | "loan" | "loan_return",
        fromClubId: d.fromClubId,
        toClubId: d.toClubId,
        fee: d.fee,
        fromClubName: clubsById?.get(d.fromClubId)?.shortName,
        toClubName: clubsById?.get(d.toClubId)?.shortName,
      }));
  }, [player.careerMoves, player.id, transferLog, clubsById]);

  return (
    <View style={styles.playerRoot}>
      <ScrollView
        style={styles.playerScroll}
        contentContainerStyle={styles.playerScrollContent}
      >
        <View style={styles.playerHero}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.playerBackHit}>
            <Text style={styles.playerBack}>{backLabel}</Text>
          </Pressable>
          <View style={styles.playerHeroTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.playerHeroName} numberOfLines={2}>
                {playerDisplayName(player)}
              </Text>
              <Text style={styles.playerHeroMeta} numberOfLines={1}>
                {player.age} лет · {positionLabel(player)} · {player.overall}
                {player.potential > player.overall ? ` · пот. ${player.potential}` : ""}
              </Text>
            </View>
            <Text style={styles.playerHeroValue}>{formatMarketValue(player.marketValue)}</Text>
          </View>
          <View style={styles.playerPortraitWrap}>
            <PersonPortrait
              seed={player.id}
              size={168}
              jersey={club?.colors[0]}
              jerseySecondary={club?.colors[1]}
              age={player.age}
              portraitId={player.portraitId}
              nationalityId={player.nationalityId}
              showKitBadge
            />
          </View>
          <View style={styles.playerInfoGrid}>
            <View style={styles.playerInfoCell}>
              <Text style={styles.playerInfoLabel}>Сила</Text>
              <Text style={styles.playerInfoValue}>{player.overall}</Text>
            </View>
            <View style={styles.playerInfoDivider} />
            <View style={styles.playerInfoCell}>
              <Text style={styles.playerInfoLabel}>Роль</Text>
              <Text style={styles.playerInfoValue}>{preferredRoleLabel(player)}</Text>
            </View>
            <View style={styles.playerInfoDivider} />
            <Pressable
              style={styles.playerInfoCell}
              disabled={!club || !onOpenClub}
              onPress={() => club && onOpenClub?.(club.id)}
            >
              <Text style={styles.playerInfoLabel}>Клуб</Text>
              <Text
                style={[
                  styles.playerInfoValue,
                  styles.playerInfoClubValue,
                  club && onOpenClub ? styles.playerInfoClubLink : null,
                ]}
                numberOfLines={2}
              >
                {club ? club.shortName || club.name : "—"}
              </Text>
            </Pressable>
          </View>
        </View>

        <PlayerOverviewCard stats={stats} isGk={isGk} formRing={formRing} />

        <View style={styles.playerPerf}>
          <Text style={styles.playerPerfTitle}>Показатели</Text>
          <View style={styles.playerPerfBody}>
            <PlayerRadar axes={radarAxes} />
            <Text style={styles.playerPerfSection}>Ключевые</Text>
            {keys.map((key) => (
              <View key={key} style={styles.attrRow}>
                <Text style={[styles.attrLabel, styles.playerPerfAttrLabel]}>
                  {ATTRIBUTE_LABEL[key]}
                </Text>
                <View style={[styles.attrTrack, styles.playerPerfTrack]}>
                  <View
                    style={[
                      styles.attrFill,
                      styles.playerPerfFill,
                      { width: `${player.attributes?.[key] ?? 0}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.attrVal, styles.playerPerfAttrVal]}>
                  {player.attributes?.[key] ?? 0}
                </Text>
              </View>
            ))}
            {otherKeys.length ? (
              <>
                <Text style={styles.playerPerfSection}>Остальные</Text>
                {otherKeys.map((key) => (
                  <View key={key} style={styles.attrRow}>
                    <Text style={[styles.attrLabel, styles.playerPerfAttrLabel]}>
                      {ATTRIBUTE_LABEL[key]}
                    </Text>
                    <View style={[styles.attrTrack, styles.playerPerfTrack]}>
                      <View
                        style={[
                          styles.attrFill,
                          styles.attrFillMuted,
                          { width: `${player.attributes?.[key] ?? 0}%` as `${number}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.attrVal, styles.playerPerfAttrVal]}>
                      {player.attributes?.[key] ?? 0}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.playerDetails}>
          {isLastCareerSeason(player) ? (
            <Text style={styles.lastSeasonBanner}>
              Последний сезон в карьере. Даже при трансфере завершит карьеру по окончании чемпионата.
            </Text>
          ) : null}
          <Text style={styles.sub}>
            {nationalityShort(player.nationalityId)} · нога:{" "}
            {FOOT_LABEL[player.preferredFoot] ?? "Правая"} · {player.height} см · {player.weight} кг
          </Text>
          <Text style={styles.sub}>Зарплата: {formatWage(player.wage)}</Text>
          {club ? (
            <Text style={styles.sub}>
              {club.name} · {club.city}
            </Text>
          ) : null}
          <View style={styles.traitRow}>
            {(player.traits ?? []).map((t) => (
              <Text key={t} style={styles.traitChip}>
                {TRAIT_LABEL[t] ?? t}
              </Text>
            ))}
          </View>

          <Text style={styles.section}>История переходов</Text>
          {moveHistory.length === 0 ? (
            <Text style={styles.sub}>Пока нет зафиксированных трансферов или аренд.</Text>
          ) : (
            moveHistory.slice(0, 12).map((m, i) => {
              const kindLabel =
                m.kind === "loan"
                  ? "Аренда"
                  : m.kind === "loan_return"
                    ? "Возврат"
                    : "Трансфер";
              const from =
                m.fromClubName ?? clubsById?.get(m.fromClubId)?.shortName ?? m.fromClubId;
              const to = m.toClubName ?? clubsById?.get(m.toClubId)?.shortName ?? m.toClubId;
              return (
                <View key={`${m.date}-${m.fromClubId}-${m.toClubId}-${i}`} style={styles.moveRow}>
                  <Text style={styles.moveDate}>{m.date}</Text>
                  <Text style={styles.moveBody}>
                    {kindLabel}: «{from}» → «{to}»
                    {m.fee > 0 ? ` · ${formatMarketValue(m.fee)}` : ""}
                  </Text>
                </View>
              );
            })
          )}
          <ValueHistoryChart
            title="Стоимость за карьеру"
            points={careerHistory}
            formatValue={formatMarketValue}
            footnote="Ось — возраст (лет). Модельная история стоимости с дебюта."
          />
          <ValueHistoryChart
            title={season ? `Этот чемпионат · ${season}` : "Этот чемпионат"}
            points={seasonHistory}
            formatValue={formatMarketValue}
            footnote={`${formatMarketValue(startMv)} в старте → ${formatMarketValue(player.marketValue)} сейчас · ${deltaText}`}
            accent="#6BCB8A"
          />
        </View>
      </ScrollView>

      <View style={styles.playerFooter}>
        {player.loan ? (
          <Text style={styles.hint}>
            В аренде до {player.loan.until}. Игровая практика в аренде ускоряет рост рейтинга.
          </Text>
        ) : null}
        {(transferActions ?? []).map((transferAction, idx) => (
          <Pressable
            key={`${transferAction.label}-${idx}`}
            style={[
              styles.cta,
              transferAction.disabled && { opacity: 0.4 },
              idx > 0 && { marginTop: 8 },
            ]}
            disabled={transferAction.disabled}
            onPress={() => {
              if (transferAction.onPress) {
                transferAction.onPress();
                return;
              }
              if (!transferAction.onConfirm || !transferAction.confirmTitle) return;
              setDialog({
                title: transferAction.confirmTitle,
                body: transferAction.confirmBody ?? "",
                confirmLabel: transferAction.destructive
                  ? "Продать"
                  : transferAction.label.includes("Аренда")
                    ? "Арендовать"
                    : "Купить",
                destructive: transferAction.destructive,
                onConfirm: () => {
                  setDialog(null);
                  transferAction.onConfirm?.();
                },
              });
            }}
          >
            <Text style={styles.ctaText}>{transferAction.label}</Text>
          </Pressable>
        ))}
      </View>
      <AppDialog
        visible={!!dialog}
        title={dialog?.title ?? ""}
        body={dialog?.body ?? ""}
        confirmLabel={dialog?.confirmLabel}
        destructive={dialog?.destructive}
        onConfirm={dialog?.onConfirm}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

function speakerKind(role: NonNullable<NewsItem["speaker"]>["role"]): PortraitKind {
  if (role === "coach") return "coach";
  if (role === "president") return "president";
  if (role === "sporting_director") return "sporting_director";
  if (role === "journalist") return "journalist";
  return "player";
}

function NewsCard({
  item,
  pack,
  save,
  onPlayer,
  onComparePlayers,
}: {
  item: NewsItem;
  pack: WorldPack;
  save: CareerSave;
  onPlayer?: (playerId: string) => void;
  onComparePlayers?: (playerIds: [string, string]) => void;
}) {
  const clubs = [
    ...new Map(
      (item.relatedClubIds ?? [])
        .map((id) => pack.clubs.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => [c!.id, c!])
    ).values(),
  ] as Club[];
  const player = item.speaker?.playerId
    ? save.players.find((p) => p.id === item.speaker!.playerId)
    : undefined;
  const compareIds = newsComparePlayerIds(item, save);
  const relatedPlayerId =
    item.speaker?.playerId ??
    item.relatedPlayerIds?.find((id) => save.players.some((p) => p.id === id));
  const speakerClub = item.speaker?.clubId
    ? pack.clubs.find((c) => c.id === item.speaker!.clubId)
    : clubs[0];
  const openRelated =
    compareIds && onComparePlayers
      ? () => onComparePlayers(compareIds)
      : onPlayer && relatedPlayerId
        ? () => onPlayer(relatedPlayerId)
        : undefined;
  const partner =
    compareIds?.[1] != null
      ? save.players.find((p) => p.id === compareIds[1])
      : undefined;
  return (
    <Pressable style={styles.newsItem} onPress={openRelated} disabled={!openRelated}>
      <View style={styles.newsTop}>
        {item.speaker ? (
          <View style={{ flexDirection: "row", gap: 4 }}>
            <PersonPortrait
              seed={
                item.speaker.clubId
                  ? `${item.speaker.role}:${item.speaker.clubId}`
                  : item.speaker.name + (item.speaker.playerId ?? "")
              }
              size={40}
              kind={speakerKind(item.speaker.role)}
              jersey={
                speakerKind(item.speaker.role) === "player"
                  ? speakerClub?.colors[0]
                  : undefined
              }
              jerseySecondary={
                speakerKind(item.speaker.role) === "player"
                  ? speakerClub?.colors[1]
                  : undefined
              }
              portraitId={
                speakerKind(item.speaker.role) === "player"
                  ? player?.portraitId
                  : undefined
              }
              nationalityId={player?.nationalityId}
              age={player?.age}
            />
            {partner ? (
              <PersonPortrait
                seed={partner.id}
                size={40}
                jersey={speakerClub?.colors[0]}
                jerseySecondary={speakerClub?.colors[1]}
                portraitId={partner.portraitId}
                nationalityId={partner.nationalityId}
                age={partner.age}
              />
            ) : null}
          </View>
        ) : clubs[0] ? (
          <ClubLogo club={clubs[0]} size={40} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.newsCat}>{newsCategoryLabel(item.category)}</Text>
          <Text style={styles.newsHead}>{item.headline}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {clubs.slice(0, 2).map((c, i) => (
            <ClubLogo key={`${item.id}-${c.id}-${i}`} club={c} size={20} />
          ))}
        </View>
      </View>
      <Text style={styles.newsBody}>{item.body}</Text>
      {compareIds ? (
        <Text style={styles.speakerLine}>Сравнить игроков →</Text>
      ) : player ? (
        <Text style={styles.speakerLine}>{playerDisplayName(player)}</Text>
      ) : null}
    </Pressable>
  );
}


function BuyNegotiationModal({
  pack,
  save,
  playerId,
  offer,
  swapIds,
  feedback,
  feedbackKind = "info",
  lastVerdict,
  onChangeOffer,
  onClose,
  onSubmitted,
}: {
  pack: WorldPack;
  save: CareerSave;
  playerId: string;
  offer: number;
  swapIds: string[];
  feedback?: string;
  feedbackKind?: "info" | "reject" | "accept" | "error";
  lastVerdict?: "reject" | "insult" | "cap" | "accept" | "player" | "wage";
  onChangeOffer: (
    offer: number,
    feedback?: string,
    swapIds?: string[],
    meta?: {
      feedbackKind?: "info" | "reject" | "accept" | "error";
      lastVerdict?: "reject" | "insult" | "cap" | "accept" | "player" | "wage";
    }
  ) => void;
  onClose: () => void;
  onSubmitted: (save: CareerSave) => void;
}) {
  const player = save.players.find((p) => p.id === playerId);
  const neg = getBuyNegotiation(pack, save, playerId);
  const budget = clubBudget(save, save.clubId);
  const swapCandidates = useMemo(
    () => listSwapCandidates(save, playerId).slice(0, 14),
    [save, playerId]
  );
  const swapPlayers = useMemo(
    () =>
      swapIds
        .map((id) => save.players.find((p) => p.id === id))
        .filter((p): p is Player => !!p),
    [swapIds, save.players]
  );
  const swapCredit = swapCreditForPlayers(swapPlayers);

  if (!player || !neg) {
    return (
      <AppDialog
        visible
        title="Торг"
        body="Игрок недоступен для переговоров."
        onCancel={onClose}
      />
    );
  }
  const from = pack.clubs.find((c) => c.id === player.clubId);
  const canAfford = budget >= offer;
  const atCeil = offer >= neg.hardCeil - 0.05;
  const packageValue = Math.round((offer + swapCredit) * 10) / 10;

  const toggleSwap = (id: string) => {
    let next = swapIds.includes(id) ? swapIds.filter((x) => x !== id) : [...swapIds, id];
    if (next.length > 2) next = next.slice(-2);
    const selected = next
      .map((x) => save.players.find((p) => p.id === x))
      .filter((p): p is Player => !!p);
    const credit = swapCreditForPlayers(selected);
    const suggested = Math.max(0.5, Math.round((neg.marketValue - credit) * 10) / 10);
    onChangeOffer(
      Math.min(neg.hardCeil, Math.max(0.5, suggested)),
      selected.length
        ? `В обмен: ${selected.map((p) => p.lastName).join(", ")} (−${formatMarketValue(credit)} к кэшу).`
        : "Обмен убран — снова чисто денежное предложение.",
      next,
      { feedbackKind: "info", lastVerdict: undefined }
    );
  };

  const bumpAndNote = (step: "small" | "medium" | "large", note: string) => {
    onChangeOffer(
      raiseBuyOffer(offer, neg.marketValue, neg.hardCeil, step),
      note,
      swapIds,
      { feedbackKind: "info", lastVerdict: undefined }
    );
  };

  const submit = () => {
    if (!canAfford) {
      onChangeOffer(
        offer,
        `Нельзя отправить: не хватает бюджета (есть ${formatMarketValue(budget)}, нужно ${formatMarketValue(offer)}).`,
        swapIds,
        { feedbackKind: "error", lastVerdict: undefined }
      );
      return;
    }
    const result = submitOutgoingBuyOffer(pack, save, playerId, offer, swapIds);
    if (!result.ok) {
      onChangeOffer(offer, result.error ?? "Не удалось отправить предложение.", swapIds, {
        feedbackKind: "error",
        lastVerdict: undefined,
      });
      return;
    }
    onSubmitted(result.save);
  };

  const primaryLabel = !canAfford
    ? "Не хватает бюджета"
    : `Отправить предложение · ${formatMarketValue(offer)}`;

  const onPrimary = () => {
    submit();
  };

  const feedbackStyle =
    feedbackKind === "reject" || feedbackKind === "error"
      ? styles.negoFeedbackReject
      : feedbackKind === "accept"
        ? styles.negoFeedbackAccept
        : styles.negoFeedback;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogOverlay}>
        <View style={[styles.dialogCard, { maxHeight: "88%" }]}>
          <Text style={styles.dialogTitle}>Торг за игрока</Text>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.dialogBody}>
              {playerNameWithAge(player)}
              {from ? ` («${from.name}»)` : ""}
              {"\n"}Рынок: {formatMarketValue(neg.marketValue)} · потолок кэша ~{formatMarketValue(neg.hardCeil)}
              {"\n"}Зарплата: {formatWage(player.wage)}
              {"\n"}Ваше предложение (кэш): {formatMarketValue(offer)}
              {swapPlayers.length
                ? `\nОбмен: ${swapPlayers.map((p) => p.lastName).join(", ")} (~${formatMarketValue(swapCredit)})`
                : ""}
              {"\n"}Пакет ≈ {formatMarketValue(packageValue)}
              {"\n"}Ваш бюджет: {formatMarketValue(budget)}
              {canAfford
                ? `\nПосле отправки предложение уйдёт клубу — ответ к следующему туру`
                : "\n⚠ Недостаточно средств на это предложение"}
            </Text>
            <Text style={styles.hint}>
              Ответ продавца не мгновенный: примите или отклонение придут после «Следующий матч» / смены дня.
            </Text>
            {feedback ? (
              <View
                style={[
                  styles.negoSellerBox,
                  (feedbackKind === "reject" || feedbackKind === "error") &&
                    styles.negoSellerBoxReject,
                ]}
              >
                <Text style={styles.negoSellerLabel}>Ответ продавца</Text>
                <Text style={feedbackStyle}>{feedback}</Text>
              </View>
            ) : null}

            <Text style={[styles.needsTitle, { marginTop: 10 }]}>Игроки в обмен (до 2)</Text>
            <Text style={styles.hint}>Отметьте своих — кэш предложения пересчитается.</Text>
            {swapCandidates.map((p) => {
              const on = swapIds.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggleSwap(p.id)}
                  style={[styles.swapRow, on && styles.swapRowOn]}
                >
                  <PersonPortrait
                    seed={p.id}
                    size={28}
                    jersey={pack.clubs.find((c) => c.id === save.clubId)?.colors[0]}
                    jerseySecondary={pack.clubs.find((c) => c.id === save.clubId)?.colors[1]}
                    age={p.age}
                    portraitId={p.portraitId}
                    nationalityId={p.nationalityId}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clubName} numberOfLines={1}>
                      {playerNameWithAge(p)}
                    </Text>
                    <Text style={styles.clubCity}>
                      {rolesLabel(p)} · {p.overall} · {formatMarketValue(p.marketValue)}
                    </Text>
                  </View>
                  <Text style={on ? styles.swapCheckOn : styles.swapCheck}>{on ? "✓" : "+"}</Text>
                </Pressable>
              );
            })}

            <Text style={[styles.needsTitle, { marginTop: 10 }]}>Повысить кэш</Text>
            <View style={styles.negoRaiseRow}>
              <Pressable
                style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
                disabled={atCeil}
                onPress={() => bumpAndNote("small", "Повысили кэш на ~5%. Можно снова отправить предложение.")}
              >
                <Text style={styles.negoRaiseText}>+5%</Text>
              </Pressable>
              <Pressable
                style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
                disabled={atCeil}
                onPress={() => bumpAndNote("medium", "Повысили кэш на ~10%. Можно снова отправить предложение.")}
              >
                <Text style={styles.negoRaiseText}>+10%</Text>
              </Pressable>
              <Pressable
                style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
                disabled={atCeil}
                onPress={() => bumpAndNote("large", "Крупная прибавка кэша. Можно снова отправить предложение.")}
              >
                <Text style={styles.negoRaiseText}>+20%</Text>
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogBtnGhost} onPress={onClose}>
              <Text style={styles.dialogBtnGhostText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.dialogBtnMain, !canAfford && { opacity: 0.45 }]}
              onPress={onPrimary}
            >
              <Text style={styles.dialogBtnMainText} numberOfLines={2}>
                {primaryLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AppDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = "Отмена",
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <View style={styles.dialogActions}>
            {confirmLabel && onConfirm ? (
              <>
                <Pressable style={styles.dialogBtnGhost} onPress={onCancel}>
                  <Text style={styles.dialogBtnGhostText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  style={[styles.dialogBtnMain, destructive && styles.dialogBtnDanger]}
                  onPress={onConfirm}
                >
                  <Text
                    style={[styles.dialogBtnMainText, destructive && styles.dialogBtnDangerText]}
                  >
                    {confirmLabel}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.dialogBtnMain} onPress={onCancel}>
                <Text style={styles.dialogBtnMainText}>Понятно</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TransfersScreen({
  pack,
  save,
  onBack,
  onSave,
  onPlayer,
  onStartBuy,
  onOutboundPick,
}: {
  pack: WorldPack;
  save: CareerSave;
  onBack: () => void;
  onSave: (s: CareerSave) => void;
  onPlayer: (playerId: string, clubId: string) => void;
  onStartBuy: (playerId: string) => void;
  onOutboundPick: (playerId: string, kind: "sell" | "loan") => void;
}) {
  const [tab, setTab] = useState<"buy" | "loan" | "loanOut" | "sell">("buy");
  const [posFilter, setPosFilter] = useState<Position | "all">("all");
  const [marketScope, setMarketScope] = useState<TransferMarketScope>("all");
  const [sortBy, setSortBy] = useState<"rating" | "value">("value");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [listsReady, setListsReady] = useState(false);
  const [headerReady, setHeaderReady] = useState(false);
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    | null
    | {
        title: string;
        body: string;
        confirmLabel?: string;
        destructive?: boolean;
        onConfirm?: () => void;
      }
  >(null);

  useEffect(() => {
    setListsReady(false);
    setHeaderReady(false);
    const cancelHeader = afterFirstPaint(() => setHeaderReady(true));
    const cancelLists = afterFirstPaint(() => {
      startTransition(() => setListsReady(true));
    });
    return () => {
      cancelHeader();
      cancelLists();
    };
  }, [save.id]);

  const open = isTransferWindowOpen(save);
  const active = getActiveTransferWindow(save);
  const next = getNextTransferWindow(save);
  const budget = clubBudget(save, save.clubId);
  const club = pack.clubs.find((c) => c.id === save.clubId)!;
  const clubsById = useMemo(() => new Map(pack.clubs.map((c) => [c.id, c])), [pack.clubs]);
  const leagueByClubId = useMemo(() => {
    const m = new Map<string, (typeof pack.leagues)[0]>();
    for (const league of pack.leagues) {
      for (const id of league.clubIds) m.set(id, league);
    }
    return m;
  }, [pack.leagues]);

  const windowDeals = useMemo(() => {
    const log = save.transferLog ?? [];
    if (!active) return log.slice(0, 40);
    return log.filter(
      (d) =>
        d.windowId === active.id || (d.date >= active.from && d.date <= active.to)
    );
  }, [save.transferLog, active]);

  const incomingOffers = useMemo(
    () => (open ? listPendingIncomingOffers(save) : []),
    [save, open]
  );
  const outgoingOffers = useMemo(
    () => (open ? listPendingOutgoingOffers(save) : []),
    [save, open]
  );

  const offersByPlayer = useMemo(() => {
    const m = new Map<string, IncomingTransferOffer[]>();
    for (const o of incomingOffers) {
      const list = m.get(o.playerId) ?? [];
      list.push(o);
      m.set(o.playerId, list);
    }
    return m;
  }, [incomingOffers]);

  const targets = useMemo(
    () =>
      listsReady
        ? listTransferTargets(pack, save, { scope: marketScope, limit: 100 })
        : [],
    [pack, save, listsReady, marketScope]
  );
  const loanTargets = useMemo(
    () =>
      listsReady && tab === "loan"
        ? listLoanTargets(pack, save, { scope: marketScope, limit: 60 })
        : [],
    [pack, save, tab, listsReady, marketScope]
  );
  const loanOutCandidates = useMemo(
    () => (listsReady && tab === "loanOut" ? listLoanOutCandidates(pack, save) : []),
    [pack, save, tab, listsReady]
  );
  const needs = useMemo(
    () => analyzeSquadNeeds(save.players, save.clubId, save.userTactics),
    [save.players, save.clubId, save.userTactics]
  );
  const needPositions = useMemo(() => new Set(needs.map((n) => n.position)), [needs]);

  const buyList = useMemo(() => {
    if (tab !== "buy") return [];
    const filtered =
      posFilter === "all"
        ? targets
        : targets.filter((p) => primaryPosition(p) === posFilter);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") {
        const d = (a.overall - b.overall) * dir;
        return d || ((a.marketValue ?? 0) - (b.marketValue ?? 0)) * dir;
      }
      const d = ((a.marketValue ?? 0) - (b.marketValue ?? 0)) * dir;
      return d || (a.overall - b.overall) * dir;
    });
  }, [targets, posFilter, sortBy, sortDir, tab]);

  const sellList = useMemo(() => {
    if (tab !== "sell") return [];
    const squad = save.players.filter((p) => p.clubId === save.clubId);
    const filtered =
      posFilter === "all"
        ? squad
        : squad.filter((p) => primaryPosition(p) === posFilter);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") {
        const d = (a.overall - b.overall) * dir;
        return d || ((a.marketValue ?? 0) - (b.marketValue ?? 0)) * dir;
      }
      const d = ((a.marketValue ?? 0) - (b.marketValue ?? 0)) * dir;
      return d || (a.overall - b.overall) * dir;
    });
  }, [save.players, save.clubId, posFilter, sortBy, sortDir, tab]);

  const loanList = useMemo(() => {
    const filtered =
      posFilter === "all"
        ? loanTargets
        : loanTargets.filter((p) => primaryPosition(p) === posFilter);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") {
        const d = (a.overall - b.overall) * dir;
        return d || (loanFeeForPlayer(a) - loanFeeForPlayer(b)) * dir;
      }
      const d = (loanFeeForPlayer(a) - loanFeeForPlayer(b)) * dir;
      return d || (a.overall - b.overall) * dir;
    });
  }, [loanTargets, posFilter, sortBy, sortDir]);

  const loanOutList = useMemo(() => {
    const filtered =
      posFilter === "all"
        ? loanOutCandidates
        : loanOutCandidates.filter((p) => primaryPosition(p) === posFilter);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") {
        const d = (a.overall - b.overall) * dir;
        return d || (loanFeeForPlayer(a) - loanFeeForPlayer(b)) * dir;
      }
      const d = (loanFeeForPlayer(a) - loanFeeForPlayer(b)) * dir;
      return d || (a.overall - b.overall) * dir;
    });
  }, [loanOutCandidates, posFilter, sortBy, sortDir]);

  const toggleSort = (key: "rating" | "value") => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const doBuy = (playerId: string) => {
    onStartBuy(playerId);
  };

  const doLoan = (playerId: string) => {
    const p = save.players.find((x) => x.id === playerId);
    if (!p) return;
    const fee = loanFeeForPlayer(p);
    const from = p.clubId ? pack.clubs.find((c) => c.id === p.clubId) : undefined;
    if (budget < fee) {
      setDialog({
        title: "Аренда",
        body: `Недостаточно бюджета (нужно ${formatMarketValue(fee)}, есть ${formatMarketValue(budget)}).`,
      });
      return;
    }
    setDialog({
      title: "Заявка на аренду",
      body: `${playerNameWithAge(p)}${from ? ` («${from.shortName}»)` : ""}\nАренда до конца сезона\nСтоимость: ${formatMarketValue(fee)}\n\nЗаявка уйдёт клубу. Ответ — к следующему туру (не мгновенно).`,
      confirmLabel: "Отправить заявку",
      onConfirm: () => {
        const result = submitOutgoingLoanOffer(pack, save, playerId);
        setDialog(null);
        if (!result.ok) {
          setDialog({ title: "Аренда", body: result.error ?? "Не удалось отправить заявку" });
          return;
        }
        onSave(result.save);
        setDialog({
          title: "Заявка отправлена",
          body: "Клуб ответит к следующему туру. Следите за Лентой и баннерами в кабинете.",
        });
      },
    });
  };

  const doLoanOut = (playerId: string) => {
    if (!save.players.some((x) => x.id === playerId)) return;
    onOutboundPick(playerId, "loan");
  };

  const doSell = (playerId: string) => {
    if (!save.players.some((x) => x.id === playerId)) return;
    onOutboundPick(playerId, "sell");
  };

  const doAcceptOffer = (offer: IncomingTransferOffer) => {
    const buyer = clubsById.get(offer.buyingClubId);
    const rivals = (offersByPlayer.get(offer.playerId) ?? []).filter(
      (o) => o.id !== offer.id
    );
    const rivalNote = rivals.length
      ? `\n\nДругие предложения по этому игроку будут отклонены (${rivals.length}).`
      : "";
    setDialog({
      title: "Принять предложение?",
      body: `${offer.playerName}\nПокупатель: «${buyer?.name ?? offer.buyingClubId}»\nСумма: ${formatMarketValue(offer.fee)}${rivalNote}`,
      confirmLabel: "Продать",
      destructive: true,
      onConfirm: () => {
        const result = acceptIncomingOffer(pack, save, offer.id);
        setDialog(null);
        if (!result.ok) {
          setDialog({
            title: "Предложение",
            body: result.error ?? "Не удалось принять",
          });
          return;
        }
        onSave(result.save);
      },
    });
  };

  const doRejectOffer = (offerId: string) => {
    onSave(rejectIncomingOffer(save, offerId));
  };

  const doRejectAllForPlayer = (playerId: string) => {
    const p = save.players.find((x) => x.id === playerId);
    setDialog({
      title: "Отклонить все?",
      body: `Отклонить все предложения по игроку ${p ? playerNameWithAge(p) : playerId}?`,
      confirmLabel: "Отклонить все",
      destructive: true,
      onConfirm: () => {
        setDialog(null);
        onSave(rejectIncomingOffers(save, playerId));
      },
    });
  };

  const doRejectAllOffers = () => {
    setDialog({
      title: "Отклонить все предложения?",
      body: "Все входящие заявки клубов будут отклонены.",
      confirmLabel: "Отклонить все",
      destructive: true,
      onConfirm: () => {
        setDialog(null);
        onSave(rejectIncomingOffers(save));
      },
    });
  };

  const posChips: { id: Position | "all"; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "GK", label: POSITION_LABEL.GK },
    { id: "DF", label: POSITION_LABEL.DF },
    { id: "MF", label: POSITION_LABEL.MF },
    { id: "FW", label: POSITION_LABEL.FW },
  ];

  const scopeChips: { id: TransferMarketScope; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "league", label: "Моя лига" },
    { id: "other", label: "Другие лиги" },
    { id: "euro", label: "Евро" },
  ];

  const scopeHint =
    marketScope === "league"
      ? "моя лига"
      : marketScope === "other"
        ? "другие чемпионаты"
        : marketScope === "euro"
          ? "еврокубковые гости"
          : "все чемпионаты и евро";

  const list =
    tab === "buy" ? buyList : tab === "loan" ? loanList : tab === "loanOut" ? loanOutList : sellList;

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← кабинет</Text>
      </Pressable>
      <Text style={styles.brandSmall}>Трансферы</Text>
      <Text style={styles.sub}>
        {club.name} · бюджет {formatMarketValue(budget)}
      </Text>
      {open ? (
        <Text style={styles.sub}>
          Окно открыто: {active?.label} ({active?.from} — {active?.to})
        </Text>
      ) : (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedTitle}>Окно закрыто</Text>
          <Text style={styles.sub}>
            {next
              ? `Следующее: ${next.label} с ${next.from}`
              : "Дождитесь следующего трансферного окна"}
          </Text>
        </View>
      )}

      <FlatList
        data={open && listsReady ? list : []}
        keyExtractor={(p) => p.id}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            {open && incomingOffers.length > 0 ? (
              <View style={styles.needsBox}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.needsTitle}>
                    Входящие предложения · {incomingOffers.length}
                  </Text>
                  <Pressable onPress={doRejectAllOffers}>
                    <Text style={styles.dealBig}>отклонить все</Text>
                  </Pressable>
                </View>
                <Text style={styles.needsLead}>
                  Клубы хотят купить ваших игроков. Если заявок несколько на одного — выберите покупателя или откажите всем.
                </Text>
                {[...offersByPlayer.entries()].map(([playerId, offers]) => {
                  const p = save.players.find((x) => x.id === playerId);
                  return (
                    <View key={playerId} style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Pressable
                          style={{ flex: 1, minWidth: 0 }}
                          onPress={() => onPlayer(playerId, p?.clubId ?? save.clubId)}
                        >
                          <Text style={styles.clubName}>
                            {p ? playerNameWithAge(p) : offers[0]?.playerName}
                            {offers.length > 1 ? ` · ${offers.length} клуба` : ""}
                          </Text>
                        </Pressable>
                        {offers.length > 1 ? (
                          <Pressable onPress={() => doRejectAllForPlayer(playerId)}>
                            <Text style={styles.dealBig}>отказать всем</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {offers.map((o) => {
                        const buyer = clubsById.get(o.buyingClubId);
                        const mv = p?.marketValue ?? o.fee;
                        const big = o.fee >= Math.max(12, mv * 1.05);
                        return (
                          <View key={o.id} style={styles.dealRow}>
                            <Text style={styles.dealLine} numberOfLines={2}>
                              {big ? "★ " : ""}
                              «{buyer?.shortName ?? o.buyingClubId}» предлагает {formatMarketValue(o.fee)}
                              {mv ? ` (оценка ${formatMarketValue(mv)})` : ""}
                            </Text>
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                              <Pressable
                                style={styles.transferBuyBtn}
                                onPress={() => doAcceptOffer(o)}
                              >
                                <Text style={styles.transferBuyBtnText}>Принять</Text>
                              </Pressable>
                              <Pressable
                                style={styles.transferSellBtn}
                                onPress={() => doRejectOffer(o.id)}
                              >
                                <Text style={styles.transferSellBtnText}>Отклонить</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {open && outgoingOffers.length > 0 ? (
              <View style={styles.needsBox}>
                <Text style={styles.needsTitle}>
                  Ваши предложения · ждут ответа · {outgoingOffers.length}
                </Text>
                <Text style={styles.needsLead}>
                  Клуб ответит к следующему туру (после «Следующий матч»). Результат появится в Ленте.
                </Text>
                {outgoingOffers.map((o) => {
                  const seller = clubsById.get(o.sellingClubId);
                  return (
                    <View key={o.id} style={styles.dealRow}>
                      <Text style={styles.dealLine} numberOfLines={2}>
                        {o.kind === "loan" ? "Аренда" : "Покупка"}: {o.playerName} ← «
                        {seller?.shortName ?? o.sellingClubId}» · {formatMarketValue(o.fee)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {headerReady ? (
              <View style={styles.needsBox}>
                <Text style={styles.needsTitle}>
                  {active ? `Рынок окна · ${active.label}` : "Сделки сезона"}
                </Text>
                <Text style={styles.needsLead}>
                  Переходы всех клубов лиги (включая ваши). ★ — громкие сделки.
                </Text>
                {windowDeals.length === 0 ? (
                  <Text style={styles.needsLead}>Пока нет закрытых переходов в этом окне.</Text>
                ) : (
                  windowDeals.slice(0, 16).map((d) => {
                    const from = clubsById.get(d.fromClubId);
                    const to = clubsById.get(d.toClubId);
                    const big = isBigTransfer(d, windowDeals);
                    const involvesUser =
                      d.fromClubId === save.clubId || d.toClubId === save.clubId;
                    return (
                      <Pressable
                        key={d.id}
                        style={styles.dealRow}
                        onPress={() => onPlayer(d.playerId, d.toClubId || d.fromClubId)}
                      >
                        <Text style={styles.dealLine} numberOfLines={2}>
                          {big ? "★ " : ""}
                          «{from?.shortName ?? d.fromClubId}» → «{to?.shortName ?? d.toClubId}»
                          {" · "}
                          {d.playerName}
                          {" · "}
                          {d.kind === "loan" ? "аренда " : ""}
                          {formatMarketValue(d.fee)}
                          {involvesUser ? " · вы" : ""}
                        </Text>
                        {big ? <Text style={styles.dealBig}>громкий трансфер</Text> : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : (
              <Text style={styles.hint}>Рынок окна загружается…</Text>
            )}

            <View style={styles.needsBox}>
              <Text style={styles.needsTitle}>Куда усилить состав</Text>
              <Text style={styles.needsLead}>
                Подсказки по линиям, которые сейчас слабее остальных. Нажмите — откроется фильтр покупки.
              </Text>
              {needs.slice(0, 3).map((n) => (
                <Pressable
                  key={n.position}
                  onPress={() => {
                    setTab("buy");
                    setPosFilter(n.position);
                  }}
                  style={styles.needsItem}
                >
                  <Text
                    style={[
                      styles.needsSeverity,
                      n.severity === "high" && styles.needsHigh,
                      n.severity === "medium" && styles.needsMed,
                    ]}
                  >
                    {n.severity === "high"
                      ? "Срочно · "
                      : n.severity === "medium"
                        ? "Желательно · "
                        : "На заметку · "}
                    {n.label}
                  </Text>
                  <Text style={styles.needsTip}>{n.tip}</Text>
                </Pressable>
              ))}
            </View>

            {open ? (
              <>
                <View style={styles.tabs}>
                  {(
                    [
                      ["buy", "Купить"],
                      ["loan", "Взять"],
                      ["loanOut", "Отдать"],
                      ["sell", "Продать"],
                    ] as const
                  ).map(([id, label]) => (
                    <Pressable
                      key={id}
                      onPress={() => setTab(id)}
                      style={[styles.tab, tab === id && styles.tabOn]}
                    >
                      <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.posFilterRow}>
                  {scopeChips.map((chip) => (
                    <Pressable
                      key={chip.id}
                      onPress={() => setMarketScope(chip.id)}
                      style={[styles.posFilterChip, marketScope === chip.id && styles.filterChipOn]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          marketScope === chip.id && styles.filterChipTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.posFilterRow}>
                  {posChips.map((chip) => (
                    <Pressable
                      key={chip.id}
                      onPress={() => setPosFilter(chip.id)}
                      style={[styles.posFilterChip, posFilter === chip.id && styles.filterChipOn]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          posFilter === chip.id && styles.filterChipTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.sortRow}>
                  <Text style={styles.sortLabel}>Сортировка</Text>
                  <Pressable
                    onPress={() => toggleSort("rating")}
                    style={[styles.sortChip, sortBy === "rating" && styles.filterChipOn]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        sortBy === "rating" && styles.filterChipTextOn,
                      ]}
                    >
                      Рейтинг {sortBy === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => toggleSort("value")}
                    style={[styles.sortChip, sortBy === "value" && styles.filterChipOn]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        sortBy === "value" && styles.filterChipTextOn,
                      ]}
                    >
                      Цена {sortBy === "value" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.hint}>
                  {listsReady ? `Найдено: ${list.length}` : "Загрузка списка…"}
                  {posFilter !== "all" ? ` · ${POSITION_LABEL[posFilter]}` : ""}
                  {` · ${scopeHint}`}
                </Text>
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          open && listsReady ? (
            <Text style={styles.sub}>Нет игроков по выбранным фильтрам</Text>
          ) : open && !listsReady ? (
            <Text style={styles.sub}>Собираем рынок…</Text>
          ) : null
        }
        renderItem={({ item: p }) => {
          if (tab === "buy") {
            const from = p.clubId ? clubsById.get(p.clubId) : undefined;
            const fromLeague = p.clubId ? leagueByClubId.get(p.clubId) : undefined;
            const scopeTag =
              p.clubId && !fromLeague
                ? transferClubScope(pack, save, p.clubId) === "euro"
                  ? "Евро"
                  : null
                : null;
            const canAfford = budget >= (p.marketValue ?? 0);
            const matchesNeed = needPositions.has(primaryPosition(p));
            return (
              <View style={styles.transferRow}>
                <Pressable
                  style={styles.transferRowMain}
                  onPress={() => onPlayer(p.id, p.clubId ?? save.clubId)}
                >
                  <PersonPortrait
                    seed={p.id}
                    size={36}
                    jersey={from?.colors[0]}
                    jerseySecondary={from?.colors[1]}
                    age={p.age}
                    portraitId={p.portraitId}
                    nationalityId={p.nationalityId}
                  />
                  {from ? <ClubLogo club={from} size={16} /> : null}
                  <View style={styles.clubMeta}>
                    <Text style={styles.clubName}>
                      {playerNameWithAge(p)}
                      {matchesNeed ? " · нужно" : ""}
                    </Text>
                    <Text style={styles.clubCity}>
                      {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall} ·{" "}
                      {from?.name}
                      {fromLeague ? ` · ${fromLeague.name}` : scopeTag ? ` · ${scopeTag}` : ""}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.transferBuyBtn, !canAfford && styles.transferBuyBtnOff]}
                  disabled={!canAfford}
                  onPress={() => doBuy(p.id)}
                >
                  <Text
                    style={[styles.transferBuyBtnText, !canAfford && styles.transferBuyBtnTextOff]}
                    numberOfLines={2}
                  >
                    {canAfford
                      ? `Предложить ${formatMarketValue(p.marketValue)}`
                      : formatMarketValue(p.marketValue)}
                  </Text>
                </Pressable>
              </View>
            );
          }
          if (tab === "loan") {
            const from = p.clubId ? clubsById.get(p.clubId) : undefined;
            const fromLeague = p.clubId ? leagueByClubId.get(p.clubId) : undefined;
            const scopeTag =
              p.clubId && !fromLeague
                ? transferClubScope(pack, save, p.clubId) === "euro"
                  ? "Евро"
                  : null
                : null;
            const fee = loanFeeForPlayer(p);
            const canAfford = budget >= fee;
            return (
              <View style={styles.transferRow}>
                <Pressable
                  style={styles.transferRowMain}
                  onPress={() => onPlayer(p.id, p.clubId ?? save.clubId)}
                >
                  <PersonPortrait
                    seed={p.id}
                    size={36}
                    jersey={from?.colors[0]}
                    jerseySecondary={from?.colors[1]}
                    age={p.age}
                    portraitId={p.portraitId}
                    nationalityId={p.nationalityId}
                  />
                  {from ? <ClubLogo club={from} size={16} /> : null}
                  <View style={styles.clubMeta}>
                    <Text style={styles.clubName}>{playerNameWithAge(p)}</Text>
                    <Text style={styles.clubCity}>
                      {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall} ·{" "}
                      {from?.name}
                      {fromLeague ? ` · ${fromLeague.name}` : scopeTag ? ` · ${scopeTag}` : ""}
                      {" · скамейка/запас"}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.transferBuyBtn, !canAfford && styles.transferBuyBtnOff]}
                  disabled={!canAfford}
                  onPress={() => doLoan(p.id)}
                >
                  <Text
                    style={[styles.transferBuyBtnText, !canAfford && styles.transferBuyBtnTextOff]}
                    numberOfLines={2}
                  >
                    Аренда {formatMarketValue(fee)}
                  </Text>
                </Pressable>
              </View>
            );
          }
          if (tab === "loanOut") {
            return (
              <View style={styles.transferRow}>
                <Pressable
                  style={styles.transferRowMain}
                  onPress={() => onPlayer(p.id, save.clubId)}
                >
                  <PersonPortrait
                    seed={p.id}
                    size={36}
                    jersey={club.colors[0]}
                    jerseySecondary={club.colors[1]}
                    age={p.age}
                    portraitId={p.portraitId}
                    nationalityId={p.nationalityId}
                  />
                  <View style={styles.clubMeta}>
                    <Text style={styles.clubName}>{playerNameWithAge(p)}</Text>
                    <Text style={styles.clubCity}>
                      {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall}
                      {" · выберите клуб"}
                    </Text>
                  </View>
                </Pressable>
                <Pressable style={styles.transferBuyBtn} onPress={() => doLoanOut(p.id)}>
                  <Text style={styles.transferBuyBtnText} numberOfLines={2}>
                    Отдать…
                  </Text>
                </Pressable>
              </View>
            );
          }
          const onLoan = Boolean(p.loan);
          return (
            <View style={styles.transferRow}>
              <Pressable
                style={styles.transferRowMain}
                onPress={() => onPlayer(p.id, save.clubId)}
              >
                <PersonPortrait
                  seed={p.id}
                  size={36}
                  jersey={club.colors[0]}
                  jerseySecondary={club.colors[1]}
                  age={p.age}
                  portraitId={p.portraitId}
                  nationalityId={p.nationalityId}
                />
                <View style={styles.clubMeta}>
                  <Text style={styles.clubName}>
                    {playerNameWithAge(p)}
                    {onLoan ? " · аренда" : ""}
                  </Text>
                  <Text style={styles.clubCity}>
                    {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall}
                    {onLoan && p.loan ? ` · до ${p.loan.until}` : ""}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.transferSellBtn, onLoan && styles.transferBuyBtnOff]}
                disabled={onLoan}
                onPress={() => doSell(p.id)}
              >
                <Text
                  style={[styles.transferSellBtnText, onLoan && styles.transferBuyBtnTextOff]}
                  numberOfLines={2}
                >
                  {onLoan
                    ? "Нельзя продать"
                    : isLastCareerSeason(p)
                      ? "Продать… (посл. сезон)"
                      : "Продать…"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      <AppDialog
        visible={!!dialog}
        title={dialog?.title ?? ""}
        body={dialog?.body ?? ""}
        confirmLabel={dialog?.confirmLabel}
        destructive={dialog?.destructive}
        onConfirm={dialog?.onConfirm}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

function CalendarScreen({
  pack,
  save,
  onBack,
  onSquad,
}: {
  pack: WorldPack;
  save: CareerSave;
  onBack: () => void;
  onSquad: (clubId: string) => void;
}) {
  const club = pack.clubs.find((c) => c.id === save.clubId);
  const homeLeague = club ? pack.leagues.find((l) => l.clubIds.includes(club.id)) : undefined;
  const [mode, setMode] = useState<"league" | "euro">("league");
  const [leagueId, setLeagueId] = useState(homeLeague?.id ?? pack.leagues[0]?.id ?? "rpl");
  const [euroCup, setEuroCup] = useState<"all" | "ucl" | "uel" | "uecl">("all");
  const [mineOnly, setMineOnly] = useState(true);

  const clubsById = useMemo(() => new Map(pack.clubs.map((c) => [c.id, c])), [pack.clubs]);
  const tournamentName = useMemo(() => {
    const m = new Map(pack.tournaments.map((t) => [t.id, t.name]));
    return m;
  }, [pack.tournaments]);
  const leagueByClubId = useMemo(() => {
    const m = new Map<string, string>();
    for (const league of pack.leagues) {
      const label = leagueChipLabel(league);
      for (const id of league.clubIds) m.set(id, label);
    }
    return m;
  }, [pack.leagues]);
  const fedByClubId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of pack.clubs) {
      const fed = pack.federations.find((f) => f.id === c.federationId);
      m.set(c.id, fed?.name ?? c.federationId);
    }
    return m;
  }, [pack.clubs, pack.federations]);

  const fixtures = useMemo(() => {
    const clubFilter = mineOnly ? save.clubId : undefined;
    if (mode === "league") {
      return listLeagueCalendar(save, leagueId, { clubId: clubFilter });
    }
    return listEuroCalendar(save, {
      tournamentId: euroCup,
      clubId: clubFilter,
    });
  }, [save, mode, leagueId, euroCup, mineOnly]);

  const matchdays = useMemo(() => groupFixturesByDate(fixtures), [fixtures]);
  const viewLeague = pack.leagues.find((l) => l.id === leagueId);
  const euroTitle =
    euroCup === "all"
      ? "Все еврокубки"
      : pack.tournaments.find((t) => t.id === euroCup)?.name ?? euroCup;

  const shortName = (id: string) => clubsById.get(id)?.shortName ?? id;
  const leagueOf = (clubId: string) =>
    leagueByClubId.get(clubId) ?? fedByClubId.get(clubId) ?? clubId;
  const groupOf = (f: Fixture) => {
    const m = f.id.match(/-g(\d+)-/);
    return m ? `Группа ${m[1]}` : null;
  };

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← кабинет</Text>
      </Pressable>
      <Text style={styles.brandSmall}>Календарь</Text>
      <Text style={styles.sub}>
        {save.season} · сегодня {save.currentDate}
      </Text>

      <View style={styles.tabs}>
        {(
          [
            ["league", "Чемпионат"],
            ["euro", "Еврокубки"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setMode(id)}
            style={[styles.tab, mode === id && styles.tabOn]}
          >
            <Text style={[styles.tabText, mode === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "league" ? (
        <View style={styles.leagueRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.leagueRow}
            contentContainerStyle={styles.leagueRowContent}
          >
            {pack.leagues.map((league) => {
              const active = league.id === leagueId;
              return (
                <Pressable
                  key={league.id}
                  onPress={() => setLeagueId(league.id)}
                  style={[styles.leagueChip, active && styles.leagueChipActive]}
                >
                  <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>
                    {leagueChipLabel(league)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.leagueRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.leagueRow}
            contentContainerStyle={styles.leagueRowContent}
          >
            {(
              [
                ["all", "Все"],
                ["ucl", "ЛЧ"],
                ["uel", "ЛЕ"],
                ["uecl", "ЛК"],
              ] as const
            ).map(([id, label]) => {
              const active = euroCup === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setEuroCup(id)}
                  style={[styles.leagueChip, active && styles.leagueChipActive]}
                >
                  <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.posFilterRow}>
        <Pressable
          onPress={() => setMineOnly(false)}
          style={[styles.posFilterChip, !mineOnly && styles.filterChipOn]}
        >
          <Text style={[styles.filterChipText, !mineOnly && styles.filterChipTextOn]}>Все матчи</Text>
        </Pressable>
        <Pressable
          onPress={() => setMineOnly(true)}
          style={[styles.posFilterChip, mineOnly && styles.filterChipOn]}
        >
          <Text style={[styles.filterChipText, mineOnly && styles.filterChipTextOn]}>
            Только мои
          </Text>
        </Pressable>
      </View>

      <Text style={styles.section}>
        {mode === "league" ? viewLeague?.name ?? "Чемпионат" : euroTitle}
      </Text>
      <Text style={styles.hint}>
        {`${matchdays.length} туров · ${fixtures.length} матчей`}
        {mineOnly ? " · ваш клуб" : ""}
      </Text>

      <FlatList
        data={matchdays}
        keyExtractor={(md) => md.date}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={6}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          <Text style={styles.sub}>
            {mode === "euro"
              ? "Еврокубковых матчей в календаре пока нет."
              : "Матчей не найдено."}
          </Text>
        }
        renderItem={({ item: md }) => {
          const past = md.date < save.currentDate;
          const today = md.date === save.currentDate;
          return (
            <View style={styles.calendarDay}>
              <Text
                style={[
                  styles.calendarDayTitle,
                  today && styles.calendarDayToday,
                  past && !today && styles.calendarDayPast,
                ]}
              >
                {md.date}
                {today ? " · сегодня" : past ? " · сыграно" : ""}
              </Text>
              {md.fixtures.map((f) => {
                const mine =
                  f.homeClubId === save.clubId || f.awayClubId === save.clubId;
                const grp = mode === "euro" ? groupOf(f) : null;
                const score = f.result
                  ? `${f.result.homeGoals}:${f.result.awayGoals}`
                  : "vs";
                return (
                  <Pressable
                    key={f.id}
                    style={[styles.calendarRow, mine && styles.calendarRowMine]}
                    onPress={() => onSquad(f.homeClubId)}
                  >
                    <View style={styles.calendarClubs}>
                      <Text style={styles.clubName} numberOfLines={1}>
                        {shortName(f.homeClubId)} — {shortName(f.awayClubId)}
                      </Text>
                      {mode === "euro" ? (
                        <Text style={styles.clubCity}>
                          {tournamentName.get(f.tournamentId) ?? f.tournamentId}
                          {grp ? ` · ${grp}` : ""}
                          {" · "}
                          {leagueOf(f.homeClubId)} — {leagueOf(f.awayClubId)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.calendarScore}>{score === "vs" ? "—" : score}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        }}
      />
    </View>
  );
}

function WindowReportScreen({
  pack,
  report,
  onDone,
  onPlayer,
}: {
  pack: WorldPack;
  report: WindowTransferReport;
  onDone: () => void;
  onPlayer?: (playerId: string) => void;
}) {
  const nameOf = (id: string) => pack.clubs.find((c) => c.id === id)?.name ?? id;
  return (
    <View style={styles.root}>
      <Text style={styles.brandSmall}>Итоги окна</Text>
      <Text style={styles.sub}>
        {report.label} · {report.from} — {report.to}
      </Text>
      <Text style={styles.hint}>Закрыто {report.closedOn}. Переходы игроков за окно:</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {report.deals.length === 0 ? (
          <Text style={styles.sub}>Крупных переходов не зафиксировано.</Text>
        ) : (
          report.deals.map((d) => {
            const big = isBigTransfer(d, report.deals);
            return (
              <Pressable
                key={d.id}
                style={styles.historyRow}
                onPress={onPlayer ? () => onPlayer(d.playerId) : undefined}
                disabled={!onPlayer}
              >
                <Text style={styles.clubName}>
                  {big ? "★ " : ""}
                  {d.playerName}
                  {d.kind === "loan" ? " (аренда)" : ""}
                </Text>
                <Text style={styles.clubCity}>
                  {nameOf(d.fromClubId)} → {nameOf(d.toClubId)} · {formatMarketValue(d.fee)} · {d.date}
                </Text>
                {big ? <Text style={styles.dealBig}>громкий трансфер</Text> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <Pressable style={styles.cta} onPress={onDone}>
        <Text style={styles.ctaText}>Понятно</Text>
      </Pressable>
    </View>
  );
}

function SeasonAwardsScreen({
  awards,
  club,
  onContinue,
  onPlayer,
}: {
  awards: SeasonAwards;
  club?: Club;
  onContinue: () => void;
  onPlayer?: (playerId: string) => void;
}) {
  const placeLabel =
    awards.place === 1
      ? "Чемпион"
      : awards.place === 2
        ? "Серебро"
        : awards.place === 3
          ? "Бронза"
          : `${awards.place}-е место`;
  const quotes = awards.quotes ?? [];

  return (
    <View style={[styles.root, styles.awardsRoot]}>
      <Text style={styles.awardsTitle}>Итоги сезона</Text>
      <Text style={styles.awardsLeague}>
        {awards.leagueName} · {awards.season}
      </Text>
      <ScrollView contentContainerStyle={styles.awardsScroll} showsVerticalScrollIndicator={false}>
        {club ? (
          <SeasonAwardsPanel
            club={club}
            place={awards.place}
            placeLabel={placeLabel}
            clubName={awards.userClubName}
            points={awards.points}
            gd={awards.gd}
            played={awards.played}
          />
        ) : null}

        <Text style={styles.awardsBody}>{awards.body}</Text>
        {awards.place > 1 ? (
          <Text style={styles.sub}>Чемпион: {awards.championName}</Text>
        ) : null}
        {awards.topScorerName ? (
          <Pressable
            onPress={
              onPlayer && awards.topScorerId ? () => onPlayer(awards.topScorerId!) : undefined
            }
            disabled={!onPlayer || !awards.topScorerId}
          >
            <Text style={styles.sub}>
              Бомбардир: {awards.topScorerName} — {awards.topScorerGoals}
            </Text>
          </Pressable>
        ) : null}
        {awards.topAssistName ? (
          <Pressable
            onPress={
              onPlayer && awards.topAssistId ? () => onPlayer(awards.topAssistId!) : undefined
            }
            disabled={!onPlayer || !awards.topAssistId}
          >
            <Text style={styles.sub}>
              Ассистент: {awards.topAssistName} — {awards.topAssistCount}
            </Text>
          </Pressable>
        ) : null}
        {awards.topRatingName ? (
          <Pressable
            onPress={
              onPlayer && awards.topRatingId ? () => onPlayer(awards.topRatingId!) : undefined
            }
            disabled={!onPlayer || !awards.topRatingId}
          >
            <Text style={styles.sub}>
              Рейтинг: {awards.topRatingName} — {awards.topRatingValue?.toFixed(1)}
            </Text>
          </Pressable>
        ) : null}

        {quotes.length ? (
          <View style={styles.awardsQuotes}>
            <Text style={styles.section}>Голоса клуба</Text>
            {quotes.map((q) => (
              <View key={q.role} style={styles.awardsQuoteCard}>
                <PersonPortrait
                  seed={
                    q.role === "captain" && q.playerId
                      ? q.playerId
                      : `${q.role}:${awards.userClubId}`
                  }
                  size={44}
                  kind={
                    q.role === "captain"
                      ? "player"
                      : q.role === "coach"
                        ? "coach"
                        : q.role === "president"
                          ? "president"
                          : "sporting_director"
                  }
                  jersey={club?.colors[0]}
                  jerseySecondary={club?.colors[1]}
                  portraitId={q.portraitId}
                />
                <View style={styles.awardsQuoteMeta}>
                  <Text style={styles.awardsQuoteRole}>{q.roleLabel}</Text>
                  <Text style={styles.awardsQuoteName}>{q.name}</Text>
                  <Text style={styles.awardsQuoteBody}>«{q.body}»</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.hint, { marginTop: 12 }]}>
          После «Далее» откроется таблица нового чемпионата.
        </Text>
      </ScrollView>
      <Pressable style={styles.cta} onPress={onContinue}>
        <Text style={styles.ctaText}>Далее</Text>
      </Pressable>
    </View>
  );
}

function AcademyScreen({
  pack,
  save,
  onAccept,
  onReject,
  onDone,
  onPlayer,
}: {
  pack: WorldPack;
  save: CareerSave;
  onAccept: (playerId: string) => void;
  onReject: (playerId: string) => void;
  onDone: () => void;
  onPlayer?: (playerId: string) => void;
}) {
  const club = pack.clubs.find((c) => c.id === save.clubId);
  const prospects = save.pendingAcademy ?? [];

  return (
    <View style={styles.root}>
      <Text style={styles.brandSmall}>Спортивная школа</Text>
      <Text style={styles.sub}>
        {club?.name ?? "Клуб"} · выпускники сезона {save.season}
      </Text>
      <Text style={styles.hint}>
        Выберите, кого перевести в основу. Остальные останутся за кадром академии.
      </Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 8 }}>
        {prospects.length === 0 ? (
          <Text style={styles.sub}>Все решения приняты.</Text>
        ) : (
          prospects.map((p) => (
            <View key={p.id} style={styles.academyCard}>
              <Pressable
                style={styles.transferRowMain}
                onPress={onPlayer ? () => onPlayer(p.id) : undefined}
                disabled={!onPlayer}
              >
                <PersonPortrait
                  seed={p.id}
                  size={48}
                  jersey={club?.colors[0]}
                  jerseySecondary={club?.colors[1]}
                  age={p.age}
                  portraitId={p.portraitId}
                  nationalityId={p.nationalityId}
                />
                <View style={styles.clubMeta}>
                  <Text style={styles.clubName}>{playerNameWithAge(p)}</Text>
                  <Text style={styles.clubCity}>
                    {positionLabel(p)} · OVR {p.overall} · пот. {p.potential}
                  </Text>
                  <Text style={styles.clubCity}>
                    {nationalityShort(p.nationalityId)} · {formatMarketValue(p.marketValue)}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.academyActions}>
                <Pressable
                  style={[styles.ctaSecondary, { flex: 1, marginTop: 0 }]}
                  onPress={() => onReject(p.id)}
                >
                  <Text style={styles.ctaSecondaryText}>Отклонить</Text>
                </Pressable>
                <Pressable
                  style={[styles.cta, { flex: 1, marginTop: 0 }]}
                  onPress={() => onAccept(p.id)}
                >
                  <Text style={styles.ctaText}>В основу</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable style={styles.cta} onPress={onDone}>
        <Text style={styles.ctaText}>
          {prospects.length ? "Пропустить остальных" : "В кабинет"}
        </Text>
      </Pressable>
    </View>
  );
}

function buildAppStyles() {
  return StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(5, 8, 15, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: broadcast.surface,
    borderWidth: 1,
    borderColor: broadcast.accentSoft,
    borderRadius: broadcast.radiusLg,
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 12,
  },
  dialogTitle: {
    color: broadcast.white,
    fontSize: 20,
    fontWeight: "800",
  },
  dialogBody: {
    color: broadcast.mist,
    fontSize: 14,
    lineHeight: 21,
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  dialogBtnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  dialogBtnGhostText: { color: broadcast.white, fontWeight: "600" },
  dialogBtnMain: {
    flex: 1,
    backgroundColor: broadcast.cta,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  dialogBtnMainText: { color: broadcast.ctaText, fontWeight: "700" },
  dialogBtnDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: broadcast.dangerBorder,
  },
  dialogBtnDangerText: { color: broadcast.danger },
  posFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    marginBottom: 2,
  },
  posFilterChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: broadcast.radiusPill,
    backgroundColor: broadcast.surfaceAlt,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
    backgroundColor: broadcast.surfaceAlt,
  },
  filterChipOn: {
    borderColor: broadcast.accent,
    backgroundColor: broadcast.accentSoft,
    shadowColor: broadcast.accentGlow,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  filterChipText: {
    color: broadcast.mist,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  filterChipTextOn: { color: broadcast.white },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  sortLabel: { color: broadcast.mist, fontSize: 12, marginRight: 4 },
  root: { flex: 1, backgroundColor: broadcast.bgDeep, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 20 },
  selectRoot: {
    flex: 1,
    backgroundColor: broadcast.bgDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  clubList: { flex: 1 },
  clubRowDimmed: { opacity: 0.45 },
  playerRoot: { flex: 1, backgroundColor: broadcast.bgDeep, paddingTop: 0, paddingBottom: 0 },
  playerScroll: { flex: 1 },
  playerScrollContent: { paddingBottom: 24 },
  playerHero: {
    backgroundColor: "transparent",
    paddingTop: 62,
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 260,
    /** Visible so portrait can overlap the overview sheet; no square clip on sheet corners. */
    overflow: "visible",
  },
  playerBackHit: {
    alignSelf: "flex-start",
    marginBottom: 10,
    zIndex: 100,
    elevation: 100,
    backgroundColor: broadcast.chipBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
    borderWidth: 1,
    borderColor: broadcast.chipBorder,
    minHeight: 36,
    justifyContent: "center",
  },
  playerBack: { color: broadcast.white, fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  playerHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    zIndex: 2,
  },
  playerHeroName: {
    color: broadcast.white,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.8,
    lineHeight: 30,
    textTransform: "uppercase",
  },
  playerHeroMeta: {
    color: broadcast.mist,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
  },
  playerHeroValue: {
    color: broadcast.accent,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  playerPortraitWrap: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: -28,
    zIndex: 2,
  },
  playerInfoGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 36,
    marginBottom: 4,
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusLg,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 8,
    zIndex: 2,
    shadowColor: broadcast.cardGlow,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  playerInfoCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  playerInfoDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 2,
  },
  playerInfoLabel: {
    color: broadcast.mistDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  playerInfoValue: {
    color: broadcast.white,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  playerInfoClubValue: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
    paddingHorizontal: 2,
  },
  playerInfoClubLink: {
    color: broadcast.accent,
    textDecorationLine: "underline",
  },
  playerPerf: {
    backgroundColor: broadcast.surface,
    borderTopLeftRadius: broadcast.radiusXl,
    borderTopRightRadius: broadcast.radiusXl,
    overflow: "hidden",
    marginTop: -12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
  },
  playerPerfTitle: {
    color: broadcast.white,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  playerPerfBody: { marginTop: 8 },
  playerPerfSection: {
    marginTop: 14,
    marginBottom: 4,
    color: broadcast.mist,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  playerPerfAttrLabel: { color: broadcast.mistDim },
  playerPerfTrack: { backgroundColor: broadcast.chipBorder },
  playerPerfFill: { backgroundColor: broadcast.accent },
  playerPerfAttrVal: { color: broadcast.accent },
  playerDetails: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: broadcast.bgDeep,
  },
  playerFooter: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: broadcast.bgDeep,
  },
  brand: {
    fontSize: 30,
    color: broadcast.white,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  brandSmall: {
    fontSize: 22,
    color: broadcast.white,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, zIndex: 1 },
  sub: { marginTop: 4, color: broadcast.mist, fontSize: 13, lineHeight: 18 },
  back: { color: broadcast.accent, fontSize: 14, fontWeight: "600" },
  /** Padding on wrap (not ScrollView) so RN horizontal scroll clip cannot flat-cut pill tops/glows. */
  leagueRowWrap: {
    marginTop: 10,
    marginBottom: 2,
    paddingVertical: 10,
    overflow: "visible",
    flexGrow: 0,
    flexShrink: 0,
  },
  leagueRow: { flexGrow: 0, flexShrink: 0 },
  leagueRowContent: {
    alignItems: "center",
    paddingVertical: 6,
    paddingRight: 4,
  },
  leagueChip: {
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginRight: 8,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: broadcast.surfaceAlt,
    borderRadius: broadcast.radiusPill,
    overflow: "visible",
  },
  leagueChipActive: {
    borderColor: broadcast.accent,
    backgroundColor: broadcast.accentSoft,
    shadowColor: broadcast.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  leagueChipText: {
    color: broadcast.mist,
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: true,
    fontWeight: "700",
  },
  leagueChipTextActive: { color: broadcast.white },
  list: { paddingVertical: 12, gap: 8 },
  endCareerBtn: {
    marginTop: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: broadcast.dangerBorder,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  endCareerText: { color: broadcast.danger, fontWeight: "600", fontSize: 13 },
  debugNearEndBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: broadcast.gold,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  debugNearEndBtnBusy: { opacity: 0.55 },
  debugNearEndText: { color: broadcast.gold, fontWeight: "600", fontSize: 12 },
  nearEndOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 24,
  },
  nearEndOverlayText: {
    color: broadcast.white,
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  transferRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  transferBuyBtn: {
    maxWidth: 112,
    backgroundColor: broadcast.cta,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: broadcast.radiusPill,
  },
  transferBuyBtnOff: {
    backgroundColor: broadcast.surfaceAlt,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    borderRadius: broadcast.radiusPill,
  },
  transferBuyBtnText: {
    color: broadcast.ctaText,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  transferBuyBtnTextOff: { color: broadcast.mistDim, fontWeight: "600" },
  transferSellBtn: {
    maxWidth: 112,
    borderWidth: 1,
    borderColor: broadcast.dangerBorder,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: broadcast.radiusPill,
  },
  transferSellBtnText: {
    color: broadcast.danger,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  negoFeedback: {
    color: broadcast.gold,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  negoFeedbackReject: {
    color: broadcast.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  negoFeedbackAccept: {
    color: "#6BCB8A",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  negoSellerBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusMd,
  },
  negoSellerBoxReject: {
    borderColor: broadcast.dangerBorder,
    backgroundColor: broadcast.surfaceAlt,
  },
  negoSellerLabel: {
    color: broadcast.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  dealRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  dealLine: { color: broadcast.white, fontSize: 12, lineHeight: 17 },
  dealBig: { color: broadcast.gold, fontSize: 10, marginTop: 2, fontWeight: "700" },
  moveRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  moveDate: { color: broadcast.mistDim, fontSize: 11 },
  moveBody: { color: broadcast.white, fontSize: 13, marginTop: 2, lineHeight: 18 },
  negoRaiseRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  negoRaiseBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: broadcast.accent,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  negoRaiseText: { color: broadcast.accent, fontWeight: "700", fontSize: 13 },
  clubMeta: { flex: 1 },
  clubName: { color: broadcast.white, fontSize: 15, fontWeight: "600" },
  clubCity: { color: broadcast.mist, fontSize: 12, marginTop: 2 },
  rep: { color: broadcast.accent, fontSize: 16, fontWeight: "700" },
  cta: {
    marginTop: 12,
    backgroundColor: broadcast.cta,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: broadcast.radiusPill,
  },
  ctaCompact: {
    marginTop: 0,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  ctaText: {
    color: broadcast.ctaText,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  ctaTextCompact: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  ctaSecondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusPill,
  },
  ctaSecondaryText: { color: broadcast.white, fontWeight: "700" },
  careerSlimBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: -16,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: broadcast.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.accentSoft,
  },
  careerSlimMeta: { flex: 1, flexShrink: 1, minWidth: 0 },
  careerSlimTitle: {
    color: broadcast.white,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  careerSlimSub: { color: broadcast.mistDim, fontSize: 10, marginTop: 1 },
  careerSlimCta: {
    flexShrink: 0,
    backgroundColor: broadcast.cta,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: broadcast.radiusPill,
  },
  careerSlimCtaText: {
    color: broadcast.ctaText,
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
  },
  careerSlimChip: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: broadcast.radiusPill,
    backgroundColor: broadcast.surfaceAlt,
  },
  careerSlimChipText: { color: broadcast.white, fontWeight: "700", fontSize: 10 },
  careerActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  careerActionPrimary: { flex: 1.15 },
  tabScroll: { flex: 1 },
  tabScrollContent: { paddingBottom: 36 },
  tabsTight: { marginTop: 4, marginBottom: 4 },
  calendarDay: { marginBottom: 14 },
  calendarDayTitle: {
    color: broadcast.accent,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  calendarDayToday: { color: broadcast.white },
  calendarDayPast: { color: broadcast.mistDim },
  calendarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  calendarRowMine: { backgroundColor: broadcast.surface },
  calendarClubs: { flex: 1, gap: 2 },
  calendarScore: {
    color: broadcast.mist,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 28,
    textAlign: "right",
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 0,
    marginTop: 12,
    marginBottom: 8,
    paddingTop: 6,
    overflow: "visible",
    flexGrow: 0,
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  tabOn: {
    borderBottomColor: broadcast.accent,
    backgroundColor: "transparent",
    shadowColor: broadcast.accentGlow,
    shadowOpacity: 0.75,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  tabText: {
    color: broadcast.mistDim,
    fontSize: 11,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
    paddingTop: 4,
    paddingBottom: 2,
    includeFontPadding: true,
  },
  tabTextOn: { color: broadcast.white, fontWeight: "800" },
  section: { marginTop: 12, marginBottom: 6, color: broadcast.mist, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "700" },
  sectionOnBlue: { marginTop: 4, marginBottom: 6, color: broadcast.mist, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "700" },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingVertical: 2,
  },
  th: { color: broadcast.mistDim, fontSize: 10 },
  thRank: { width: 22, color: broadcast.mistDim, fontSize: 10, textAlign: "center" },
  thLogoSpacer: { width: 18 },
  thClub: { flex: 1, color: broadcast.mistDim, fontSize: 10, marginLeft: 4 },
  thNum: { width: 22, color: broadcast.mistDim, fontSize: 10, textAlign: "center" },
  thGoals: { width: 44, color: broadcast.mistDim, fontSize: 10, textAlign: "center" },
  thPts: { width: 24, color: broadcast.mistDim, fontSize: 10, textAlign: "center" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5 },
  tableRowMine: { backgroundColor: broadcast.surface },
  tableRowMineBorder: { borderWidth: 1, borderColor: broadcast.accent, borderRadius: 8 },
  tableRowUcl: { backgroundColor: "rgba(46, 155, 90, 0.35)" },
  tableRowUel: { backgroundColor: "rgba(196, 120, 40, 0.35)" },
  tableRowUecl: { backgroundColor: "rgba(61, 126, 196, 0.4)" },
  euroLegend: { marginTop: 14, marginBottom: 8, gap: 6 },
  euroLegendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  euroLegendSwatch: { width: 18, height: 14, borderRadius: 2 },
  euroLegendText: { color: broadcast.mist, fontSize: 12 },
  euroLegendTextOnBlue: { color: broadcast.mist, fontSize: 12 },
  pos: { color: broadcast.mist, fontSize: 12 },
  tdRank: {
    width: 22,
    color: broadcast.mist,
    fontSize: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdLogo: { width: 18, alignItems: "center", justifyContent: "center" },
  tableClub: { flex: 1, color: broadcast.white, fontSize: 13, marginLeft: 4 },
  tdNum: {
    width: 22,
    color: broadcast.mist,
    fontSize: 11,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdGoals: {
    width: 44,
    color: broadcast.mist,
    fontSize: 11,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdPts: {
    width: 24,
    color: broadcast.white,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  pts: { color: broadcast.white, fontWeight: "700", fontSize: 12 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 },
  statRank: {
    width: 22,
    color: broadcast.mist,
    fontSize: 12,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  statNat: { color: broadcast.mist, fontSize: 11, marginTop: 1, fontWeight: "600", letterSpacing: 0.3 },
  news: { flex: 1 },
  newsItem: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: broadcast.chipBorder },
  newsTop: { flexDirection: "row", gap: 8 },
  newsCat: { color: broadcast.mistDim, fontSize: 10, textTransform: "uppercase" },
  newsHead: { color: broadcast.white, fontWeight: "600", fontSize: 14 },
  newsBody: { color: broadcast.mist, fontSize: 13, marginTop: 6, lineHeight: 18 },
  speakerLine: { color: broadcast.accent, fontSize: 11, marginTop: 4 },
  matchHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  matchSide: { width: "30%", gap: 4 },
  crestRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  redCardsRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  redCardBadge: {
    width: 10,
    height: 14,
    borderRadius: 2,
    backgroundColor: "#E74C3C",
    borderWidth: 1,
    borderColor: "#9B2C2C",
  },
  matchClub: { color: broadcast.white, fontSize: 12 },
  scoreBig: { fontSize: 24, color: broadcast.white, fontWeight: "700" },
  preRow: { flexDirection: "row", marginTop: 12, alignItems: "flex-start" },
  preCol: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  preDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)", alignSelf: "stretch", marginHorizontal: 6 },
  preColTitle: {
    color: broadcast.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  preSub: {
    color: broadcast.mistDim,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  prePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    minHeight: 32,
  },
  prePos: {
    width: 44,
    color: broadcast.gold,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  prePosSm: { width: 26, fontSize: 9 },
  preName: {
    flex: 1,
    minWidth: 0,
    color: broadcast.white,
    fontSize: 11,
  },
  preNameSm: { fontSize: 10, color: broadcast.mist },
  preOvr: {
    width: 22,
    color: broadcast.gold,
    fontWeight: "700",
    fontSize: 11,
    textAlign: "right",
  },
  preOvrSm: { fontSize: 10, width: 20 },
  speedRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  speedBtn: {
    borderWidth: 1,
    borderColor: broadcast.ctaSecondaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: broadcast.radiusPill,
    backgroundColor: broadcast.surfaceAlt,
  },
  speedBtnActive: {
    borderColor: broadcast.accent,
    backgroundColor: broadcast.accentSoft,
    shadowColor: broadcast.accent,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  speedBtnText: { color: broadcast.mistDim, fontSize: 12 },
  speedBtnTextActive: { color: broadcast.white },
  feed: { flex: 1, marginTop: 8 },
  feedItem: { flexDirection: "row", marginBottom: 6, overflow: "hidden" },
  feedHome: { marginRight: 24, backgroundColor: broadcast.surface },
  feedAway: { marginLeft: 24, backgroundColor: broadcast.surfaceAlt, flexDirection: "row-reverse" },
  feedNeutral: { marginHorizontal: 12, backgroundColor: broadcast.surfaceAlt },
  feedGoal: { borderWidth: 1, borderColor: broadcast.accentSoft },
  feedYellow: { borderWidth: 1, borderColor: "#F1C40F66" },
  feedRed: { borderWidth: 1, borderColor: "#E74C3C66" },
  feedSetPiece: { borderWidth: 1, borderColor: "#3498DB55" },
  feedAccent: { width: 4 },
  feedCrest: { justifyContent: "center", paddingLeft: 6, paddingRight: 2 },
  feedText: { flex: 1, color: broadcast.white, fontSize: 13, lineHeight: 18, padding: 8 },
  xiRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  xiRowSelected: { backgroundColor: broadcast.accentSoft, borderRadius: 4 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  summaryMinute: {
    color: broadcast.gold,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 36,
    textAlign: "right",
  },
  reactionCard: {
    backgroundColor: broadcast.surface,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    padding: 10,
    marginBottom: 8,
    gap: 8,
    borderRadius: broadcast.radiusMd,
  },
  reactionTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reactionMeta: { color: broadcast.mist, fontSize: 11, marginTop: 2 },
  reactionQuote: { color: broadcast.white, fontSize: 13, lineHeight: 19 },
  slotRole: { width: 36, color: broadcast.mist, fontSize: 10 },
  statsCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: broadcast.surface,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    borderRadius: broadcast.radiusMd,
  },
  statsCompactText: { flex: 1, color: broadcast.mistDim, fontSize: 9 },
  statsCompactMid: {
    color: broadcast.accent,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statsCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    backgroundColor: broadcast.surface,
    overflow: "hidden",
    borderRadius: broadcast.radiusLg,
  },
  statsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: broadcast.bgMid,
  },
  statsSide: { width: "34%", gap: 4 },
  statsClub: { color: broadcast.white, fontSize: 12, fontWeight: "700" },
  statsScore: {
    color: broadcast.white,
    fontSize: 26,
    fontWeight: "800",
    minWidth: 64,
    textAlign: "center",
  },
  statsTitleBar: {
    backgroundColor: broadcast.accent,
    paddingVertical: 8,
    alignItems: "center",
  },
  statsTitle: {
    color: broadcast.ink,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  matchStatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  statVal: { width: "22%", color: broadcast.white, fontSize: 14, fontWeight: "700", textAlign: "center" },
  statLabel: { flex: 1, color: broadcast.mist, fontSize: 12, textAlign: "center" },
  proposalBox: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: broadcast.accent,
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusMd,
    gap: 8,
  },
  proposalTitle: { color: broadcast.accent, fontSize: 12, fontWeight: "700" },
  proposalActions: { gap: 6 },
  posBadge: { minWidth: 36, maxWidth: 72, color: broadcast.accent, fontSize: 10, fontWeight: "700" },
  traitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  traitChip: {
    borderWidth: 1,
    borderColor: broadcast.accentSoft,
    color: broadcast.accent,
    padding: 6,
    alignSelf: "flex-start",
    fontSize: 12,
    borderRadius: broadcast.radiusPill,
  },
  attrRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  attrLabel: { width: 90, color: broadcast.mistDim, fontSize: 12 },
  attrTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  attrFill: { height: 6, backgroundColor: broadcast.accent },
  attrFillMuted: { backgroundColor: broadcast.accentMuted },
  attrVal: { width: 28, textAlign: "right", color: broadcast.accent, fontSize: 12 },
  hint: { color: broadcast.mistDim, fontSize: 11, marginBottom: 8 },
  lockedBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    padding: 14,
    backgroundColor: broadcast.surface,
    borderRadius: broadcast.radiusMd,
  },
  lockedTitle: { color: broadcast.white, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  needsBox: {
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: broadcast.gold,
    backgroundColor: broadcast.surfaceElevated,
    padding: 14,
    gap: 10,
  },
  needsTitle: { color: broadcast.gold, fontWeight: "700", fontSize: 15 },
  needsLead: { color: broadcast.mist, fontSize: 12, lineHeight: 17, marginBottom: 2 },
  needsItem: {
    gap: 3,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: broadcast.chipBorder,
  },
  needsSeverity: { color: broadcast.mist, fontWeight: "700", fontSize: 13 },
  needsHigh: { color: broadcast.danger },
  needsMed: { color: broadcast.gold },
  needsTip: { color: broadcast.white, fontSize: 13, lineHeight: 18 },
  transferTipLine: {
    color: broadcast.gold,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 2,
    lineHeight: 17,
  },
  historyMotto: {
    color: broadcast.gold,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  historyRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
    gap: 2,
  },
  lastSeasonBanner: {
    color: broadcast.danger,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  dramaBanner: {
    color: broadcast.gold,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  transferOfferBanner: {
    color: broadcast.accent,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    fontWeight: "700",
  },
  outgoingOfferBanner: {
    color: broadcast.accent,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    fontWeight: "600",
  },
  academyCard: {
    borderWidth: 1,
    borderColor: broadcast.chipBorder,
    backgroundColor: broadcast.surface,
    padding: 12,
    gap: 10,
  },
  academyActions: {
    flexDirection: "row",
    gap: 8,
  },
  buzzBox: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: broadcast.chipBorder,
    backgroundColor: broadcast.surface,
    padding: 12,
    gap: 8,
  },
  buzzTitle: { color: broadcast.gold, fontWeight: "700", fontSize: 13 },
  buzzItem: { gap: 2 },
  buzzHeadline: { color: broadcast.white, fontWeight: "600", fontSize: 12 },
  buzzBody: { color: broadcast.mist, fontSize: 12, lineHeight: 17 },
  atmosphereBox: {
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: broadcast.cardBorder,
    backgroundColor: broadcast.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    borderRadius: broadcast.radiusMd,
  },
  atmosphereStadium: { color: broadcast.white, fontWeight: "700", fontSize: 14 },
  atmosphereLine: { color: broadcast.mist, fontSize: 12, lineHeight: 17 },
  atmosphereWeather: { color: broadcast.gold, fontSize: 12, lineHeight: 17 },
  atmosphereLive: { color: broadcast.mist, fontSize: 11, marginTop: 2, maxWidth: 140, textAlign: "center" },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: broadcast.chipBorder,
  },
  swapRowOn: { backgroundColor: broadcast.accentSoft },
  swapCheck: { color: broadcast.mistDim, fontSize: 16, width: 22, textAlign: "center" },
  swapCheckOn: { color: broadcast.gold, fontSize: 16, fontWeight: "700", width: 22, textAlign: "center" },
  awardsRoot: {
    backgroundColor: "#000000",
  },
  awardsTitle: {
    fontSize: 26,
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  awardsLeague: { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4, marginBottom: 14 },
  awardsScroll: { paddingBottom: 20, gap: 12 },
  awardsBody: { color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 20, marginTop: 4 },
  awardsQuotes: { marginTop: 8, gap: 8 },
  awardsQuoteCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#0B0F14",
  },
  awardsQuoteMeta: { flex: 1, minWidth: 0, gap: 2 },
  awardsQuoteRole: {
    color: "#E8C45A",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  awardsQuoteName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  awardsQuoteBody: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 18, marginTop: 4 },
  });
}

let styles = buildAppStyles();
registerThemeRebuild(() => {
  styles = buildAppStyles();
});

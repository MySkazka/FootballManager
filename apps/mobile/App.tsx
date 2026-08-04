import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  advanceUntilMatchday,
  advanceLiveMatch,
  ATTRIBUTE_LABEL,
  averageRating,
  analyzeSquadNeeds,
  squadNeedsSummary,
  beginUserMatch,
  buyPlayer,
  buildCareerValueHistory,
  buildClubHistory,
  buildSeasonValueHistory,
  careerLegendsForClub,
  clubBudget,
  clubPlayedMatches,
  completeSeason,
  seasonValueDelta,
  createCareer,
  acceptAcademyProspect,
  evaluateBuyOffer,
  finishUserMatch,
  formatMarketValue,
  FOOT_LABEL,
  formatAttendance,
  attendanceFillPct,
  getActiveTransferWindow,
  getBuyNegotiation,
  getNextTransferWindow,
  groupFixturesByDate,
  hasContinentalAccess,
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
  rejectAcademyProspect,
  clearAcademyPending,
  clearWindowReport,
  keyAttributes,
  leagueTopAssists,
  leagueTopCards,
  leagueTopGoalInvolvements,
  leagueTopKeepers,
  leagueTopRatings,
  leagueTopScorers,
  evaluateLoanWillingness,
  evaluateLoanInterest,
  listLoanTargets,
  listLoanOutCandidates,
  listTransferTargets,
  loanFeeForPlayer,
  loanPlayer,
  loanOutPlayer,
  liveMakeSubstitution,
  liveMatchToResult,
  liveUpdateTactics,
  normalizeCareerSave,
  nationalityShort,
  playerDisplayName,
  POSITION_LABEL,
  primaryPosition,
  preferredRoleLabel,
  positionLabel,
  raiseBuyOffer,
  Rng,
  seasonIsReadyToAward,
  sellPlayer,
  sortSquad,
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
  type TeamTactics,
  type WorldPack,
} from "@fm/engine";
import packJson from "./assets/world/pack.v1.json";
import { ClubLogo } from "./src/visuals/ClubLogo";
import { ValueHistoryChart } from "./src/visuals/ValueHistoryChart";
import { MomentCelebration, type MomentKind } from "./src/visuals/GoalCelebration";
import { PersonPortrait, preloadPortraits, type PortraitKind } from "./src/visuals/PersonPortrait";
import { TacticsPanel } from "./src/visuals/TacticsPanel";

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
};

function newsCategoryLabel(category: string): string {
  return NEWS_CATEGORY_LABEL[category] ?? category;
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

type Screen =
  | { name: "select" }
  | { name: "career"; tab?: "table" | "stats" | "news" | "tactics" | "uefa" }
  | { name: "squad"; clubId: string }
  | { name: "player"; playerId: string; clubId: string; from?: "squad" | "transfers" }
  | { name: "prematch"; fixture: Fixture }
  | { name: "match"; live: LiveMatchState }
  | { name: "summary"; fixture: Fixture; summary: MatchSummary; homeName: string; awayName: string }
  | { name: "transfers" }
  | { name: "calendar" }
  | { name: "awards"; awards: SeasonAwards }
  | { name: "academy" }
  | { name: "windowReport"; report: WindowTransferReport };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "select" });
  const [save, setSave] = useState<CareerSave | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(pack.leagues[0]?.id ?? "rpl");
  const [buyDeal, setBuyDeal] = useState<null | {
    playerId: string;
    offer: number;
    feedback?: string;
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
      feedback: `Рыночная оценка ${formatMarketValue(neg.marketValue)}. Клуб редко отдаёт игрока сразу по этой сумме — можно повысить предложение (обычно до ~${formatMarketValue(neg.hardCeil)}).`,
    });
  };

  const buyDealModal =
    save && buyDeal ? (
      <BuyNegotiationModal
        pack={pack}
        save={save}
        playerId={buyDeal.playerId}
        offer={buyDeal.offer}
        feedback={buyDeal.feedback}
        onChangeOffer={(offer, feedback) => setBuyDeal({ playerId: buyDeal.playerId, offer, feedback })}
        onClose={() => setBuyDeal(null)}
        onBought={(next) => {
          setSave(next);
          setBuyDeal(null);
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

  const clubs = useMemo(
    () =>
      pack.clubs.filter((c) =>
        pack.leagues.find((l) => l.id === selectedLeague)?.clubIds.includes(c.id)
      ),
    [selectedLeague]
  );

  const startCareer = (club: Club) => {
    setSave(createCareer(pack, club.id, "Менеджер", 2026));
    setScreen({ name: "career", tab: "table" });
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
    const player = save.players.find((p) => p.id === screen.playerId);
    const fromTransfers = screen.from === "transfers";
    if (!player) {
      return (
        <View style={styles.root}>
          <Pressable
            onPress={() =>
              setScreen(fromTransfers ? { name: "transfers" } : { name: "squad", clubId: screen.clubId })
            }
          >
            <Text style={styles.back}>← назад</Text>
          </Pressable>
        </View>
      );
    }
    const club = pack.clubs.find((c) => c.id === player.clubId);
    const windowOpen = isTransferWindowOpen(save);
    const budget = clubBudget(save, save.clubId);
    const fee = player.marketValue ?? 0;
    const canSell =
      fromTransfers && windowOpen && player.clubId === save.clubId && !player.loan;
    const canBuy =
      fromTransfers && windowOpen && player.clubId !== save.clubId && !player.loan;
    const loanVerdict = canBuy
      ? evaluateLoanWillingness(pack, save, player.id)
      : { ok: false as const, fee: 0, message: "" };
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
      if (loanVerdict.ok) {
        transferActions.push({
          label: `Аренда за ${formatMarketValue(loanVerdict.fee)}`,
          confirmTitle: "Взять в аренду?",
          confirmBody: `${playerDisplayName(player)}\n${loanVerdict.message}\nБюджет после: ${formatMarketValue(budget - loanVerdict.fee)}`,
          onConfirm: () => {
            const result = loanPlayer(pack, save, player.id);
            if (!result.ok) {
              Alert.alert("Аренда", result.error ?? "Не удалось");
              return;
            }
            setSave(result.save);
            setScreen({ name: "transfers" });
          },
        });
      }
    }
    if (canSell) {
      transferActions.push({
        label: `Продать за ${formatMarketValue(fee)}`,
        confirmTitle: "Продать игрока?",
        confirmBody: `${playerDisplayName(player)}\nВы получите: ${formatMarketValue(fee)}\nИгрок уйдёт из клуба без возможности отмены.`,
        destructive: true,
        onConfirm: () => {
          const result = sellPlayer(pack, save, player.id);
          if (!result.ok) {
            Alert.alert("Трансфер", result.error ?? "Не удалось продать");
            return;
          }
          setSave(result.save);
          setScreen({ name: "transfers" });
        },
      });
      const outInterest = evaluateLoanInterest(pack, save, player.id);
      if (outInterest.ok) {
        transferActions.push({
          label: `Отдать в аренду · ${formatMarketValue(outInterest.fee)}`,
          confirmTitle: "Отдать в аренду?",
          confirmBody: `${playerDisplayName(player)}\n${outInterest.message}\nВ аренде игрок получит практику и может вырасти быстрее, чем на лавке.`,
          onConfirm: () => {
            const result = loanOutPlayer(pack, save, player.id);
            if (!result.ok) {
              Alert.alert("Аренда", result.error ?? "Не удалось");
              return;
            }
            setSave(result.save);
            setScreen({ name: "transfers" });
          },
        });
      }
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
        backLabel={fromTransfers ? "← трансферы" : "← состав"}
        onBack={() =>
          setScreen(fromTransfers ? { name: "transfers" } : { name: "squad", clubId: screen.clubId })
        }
        transferActions={transferActions}
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
        onPlayer={(playerId) => setScreen({ name: "player", playerId, clubId: screen.clubId, from: "squad" })}
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
          setScreen({ name: "player", playerId, clubId, from: "transfers" })
        }
        onStartBuy={startBuyDeal}
      />
    );
  }

  if (screen.name === "awards" && save) {
    return (
      <SeasonAwardsScreen
        awards={screen.awards}
        onContinue={() => {
          if ((save.pendingAcademy?.length ?? 0) > 0) {
            setScreen({ name: "academy" });
            return;
          }
          setScreen({ name: "career", tab: "table" });
        }}
      />
    );
  }

  if (screen.name === "windowReport" && save) {
    return (
      <WindowReportScreen
        pack={pack}
        report={screen.report}
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
        onAccept={(playerId) =>
          setSave((prev) => (prev ? acceptAcademyProspect(prev, playerId) : prev))
        }
        onReject={(playerId) =>
          setSave((prev) => (prev ? rejectAcademyProspect(prev, playerId) : prev))
        }
        onDone={() => {
          setSave((prev) => (prev ? clearAcademyPending(prev) : prev));
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
          onDone={() => {
            setSave((prev) => (prev ? clearWindowReport(prev) : prev));
            setScreen({ name: "career", tab: "table" });
          }}
        />
      );
    }
    return (
      <CareerScreen
        pack={pack}
        save={save}
        tab={screen.tab ?? "table"}
        setTab={(tab) => setScreen({ name: "career", tab })}
        onAdvance={onAdvance}
        onEndCareer={endCareer}
        onSquad={(clubId) => setScreen({ name: "squad", clubId })}
        onTransfers={() => setScreen({ name: "transfers" })}
        onCalendar={() => setScreen({ name: "calendar" })}
        onTactics={(t) => setSave(updateUserTactics(save, t))}
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
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.brand}>Менеджер от Бога</Text>
      <Text style={styles.sub}>Выбери клуб — узнаваемые имена, свои составы</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueRow} contentContainerStyle={styles.leagueRowContent}>
        {pack.leagues.map((league) => {
          const active = league.id === selectedLeague;
          return (
            <Pressable
              key={league.id}
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
      <ScrollView contentContainerStyle={styles.list}>
        {clubs.map((club, index) => (
          <Pressable
            key={`${selectedLeague}-${club.id}-${index}`}
            style={styles.clubRow}
            onPress={() => startCareer(club)}
          >
            <ClubLogo club={club} size={40} />
            <View style={styles.clubMeta}>
              <Text style={styles.clubName}>{club.name}</Text>
              <Text style={styles.clubCity}>
                {club.city} · {club.vibe}
              </Text>
            </View>
            <Text style={styles.rep}>{club.reputation}</Text>
          </Pressable>
        ))}
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
  onSquad,
  onTransfers,
  onCalendar,
  onTactics,
}: {
  pack: WorldPack;
  save: CareerSave;
  tab: "table" | "stats" | "news" | "tactics" | "uefa";
  setTab: (t: "table" | "stats" | "news" | "tactics" | "uefa") => void;
  onAdvance: () => void;
  onEndCareer: () => void;
  onSquad: (clubId: string) => void;
  onTransfers: () => void;
  onCalendar: () => void;
  onTactics: (t: TeamTactics) => void;
}) {
  const club = pack.clubs.find((c) => c.id === save.clubId);
  const homeLeague = club ? pack.leagues.find((l) => l.clubIds.includes(club.id)) : undefined;
  const [viewLeagueId, setViewLeagueId] = useState(homeLeague?.id ?? pack.leagues[0]?.id ?? "rpl");
  const [statsBoard, setStatsBoard] = useState<
    "goals" | "assists" | "ga" | "rating" | "cards" | "keepers"
  >("goals");
  const transferTips = useMemo(
    () => analyzeSquadNeeds(save.players, save.clubId, save.userTactics),
    [save.players, save.clubId, save.userTactics]
  );
  const transferTipSummary = squadNeedsSummary(transferTips);

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
  const activeWindow = getActiveTransferWindow(save);
  const nextWindow = getNextTransferWindow(save);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.titleRow}>
        <ClubLogo club={club} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandSmall}>{club.name}</Text>
          <Text style={styles.sub}>
            {club.city} · {save.currentDate} · евро: {euro ? "да" : "нет"}
          </Text>
          <Text style={styles.sub}>Бюджет: {formatMarketValue(budget)}</Text>
          <Text style={styles.hint}>
            Касса растёт от билетов, ТВ и спонсоров — чем выше в таблице и лучше результаты, тем больше.
          </Text>
        </View>
      </View>

      <Pressable style={styles.cta} onPress={onAdvance}>
        <Text style={styles.ctaText}>Следующий матч</Text>
      </Pressable>
      <Pressable style={styles.ctaSecondary} onPress={onTransfers}>
        <Text style={styles.ctaSecondaryText}>
          Трансферы {windowOpen ? `(${activeWindow?.label ?? "открыто"})` : "(закрыто)"}
        </Text>
      </Pressable>
      <Pressable style={styles.ctaSecondary} onPress={onCalendar}>
        <Text style={styles.ctaSecondaryText}>Календарь · чемпионат и еврокубки</Text>
      </Pressable>
      <Text style={styles.transferTipLine}>{transferTipSummary}</Text>
      {(() => {
        const last = squad.filter((p) => isLastCareerSeason(p));
        if (!last.length) return null;
        return (
          <Text style={styles.lastSeasonBanner}>
            Последний сезон в карьере: {last.map((p) => p.lastName).slice(0, 4).join(", ")}
            {last.length > 4 ? ` +${last.length - 4}` : ""}. Даже после продажи завершат карьеру по итогам чемпионата.
          </Text>
        );
      })()}
      {!windowOpen && nextWindow ? (
        <Text style={styles.hint}>Следующее окно: {nextWindow.label} с {nextWindow.from}</Text>
      ) : null}

      <View style={styles.tabs}>
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
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "table" && (
        <ScrollView>
          <Text style={styles.section}>Мир · чемпионаты</Text>
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
          <Text style={styles.section}>{viewLeague.name}</Text>
          {(() => {
            const uefa = ensureUefaState(pack, save);
            const rank = federationRank(pack, uefa, viewLeague.federationId);
            const zones = leagueTableEuroZones(viewLeague.federationId, rank);
            const legend = legendLabels(zones);
            return (
              <>
                <Text style={styles.hint}>
                  Рейтинг ассоциации УЕФА: {rank}-е · зоны еврокубков по таблице
                </Text>
                <View style={styles.tableHead}>
                  <Text style={styles.thRank}>#</Text>
                  <View style={styles.thLogoSpacer} />
                  <Text style={styles.thClub}>Клуб</Text>
                  <Text style={styles.thNum}>И</Text>
                  <Text style={styles.thNum}>В</Text>
                  <Text style={styles.thNum}>Н</Text>
                  <Text style={styles.thNum}>П</Text>
                  <Text style={styles.thGoals}>Мячи</Text>
                  <Text style={styles.thPts}>О</Text>
                </View>
                {table.map((row, i) => {
                  const c = pack.clubs.find((x) => x.id === row.clubId);
                  if (!c) return null;
                  const mine = row.clubId === save.clubId;
                  const place = i + 1;
                  const zone = zoneForPlace(place, zones);
                  return (
                    <Pressable
                      key={`${viewLeague.id}-${row.clubId}-${i}`}
                      style={[
                        styles.tableRow,
                        zone === "ucl" && styles.tableRowUcl,
                        zone === "uel" && styles.tableRowUel,
                        zone === "uecl" && styles.tableRowUecl,
                        mine && styles.tableRowMineBorder,
                      ]}
                      onPress={() => onSquad(row.clubId)}
                    >
                      <Text style={styles.tdRank}>{place}</Text>
                      <View style={styles.tdLogo}>
                        <ClubLogo club={c} size={18} />
                      </View>
                      <Text style={styles.tableClub} numberOfLines={1}>
                        {c.shortName}
                      </Text>
                      <Text style={styles.tdNum}>{row.played}</Text>
                      <Text style={styles.tdNum}>{row.won}</Text>
                      <Text style={styles.tdNum}>{row.drawn}</Text>
                      <Text style={styles.tdNum}>{row.lost}</Text>
                      <Text style={styles.tdGoals}>
                        {row.gf}:{row.ga}
                      </Text>
                      <Text style={styles.tdPts}>{row.points}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.euroLegend}>
                  <Text style={styles.section}>Легенда еврокубков</Text>
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
                      <Text style={styles.euroLegendText}>
                        {item.places}: {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}
          <Pressable style={styles.ctaSecondary} onPress={() => onSquad(club.id)}>
            <Text style={styles.ctaSecondaryText}>Состав и история клуба</Text>
          </Pressable>
          <Pressable style={styles.endCareerBtn} onPress={onEndCareer}>
            <Text style={styles.endCareerText}>Завершить карьеру и начать новую</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === "uefa" && (
        <ScrollView>
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
      )}

      {tab === "stats" && (
        <ScrollView>
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
                  style={[styles.leagueChipText, statsBoard === id && styles.leagueChipTextActive]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {statsBoard === "goals" ? (
            <Leaderboard
              title="Бомбардиры"
              rows={leagueTopScorers(save.playerStats, viewLeague.clubIds, 20)}
              save={save}
              pack={pack}
              value={(s) => `${s.goals}`}
            />
          ) : null}
          {statsBoard === "assists" ? (
            <Leaderboard
              title="Ассистенты"
              rows={leagueTopAssists(save.playerStats, viewLeague.clubIds, 20)}
              save={save}
              pack={pack}
              value={(s) => `${s.assists}`}
            />
          ) : null}
          {statsBoard === "ga" ? (
            <Leaderboard
              title="Гол + пас"
              rows={leagueTopGoalInvolvements(save.playerStats, viewLeague.clubIds, 20)}
              save={save}
              pack={pack}
              value={(s) => `${s.goals + s.assists} · ${s.goals}г ${s.assists}п`}
            />
          ) : null}
          {statsBoard === "rating" ? (
            <Leaderboard
              title="Средняя оценка"
              rows={leagueTopRatings(save.playerStats, viewLeague.clubIds, 20)}
              save={save}
              pack={pack}
              value={(s) => `${averageRating(s).toFixed(1)} · ${s.appearances} игр`}
            />
          ) : null}
          {statsBoard === "cards" ? (
            <Leaderboard
              title="Карточки"
              rows={leagueTopCards(save.playerStats, viewLeague.clubIds, 20)}
              save={save}
              pack={pack}
              value={(s) => `${s.yellowCards ?? 0} ж · ${s.redCards ?? 0} к`}
            />
          ) : null}
          {statsBoard === "keepers" ? (
            <Leaderboard
              title="Вратари"
              rows={leagueTopKeepers(save.playerStats, viewLeague.clubIds, save.players, 20)}
              save={save}
              pack={pack}
              value={(s) =>
                `${s.cleanSheets ?? 0} «0» · ${s.saves ?? 0} сейв · ${s.goalsConceded ?? 0} пр`
              }
            />
          ) : null}
        </ScrollView>
      )}

      {tab === "tactics" && (
        <ScrollView>
          <TacticsPanel
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
      )}

      {tab === "news" && (
        <ScrollView style={styles.news}>
          {save.news.slice(0, 30).map((n) => (
            <NewsCard key={n.id} item={n} pack={pack} save={save} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Leaderboard({
  title,
  rows,
  save,
  pack,
  value,
}: {
  title: string;
  rows: CareerSave["playerStats"][string][];
  save: CareerSave;
  pack: WorldPack;
  value: (s: CareerSave["playerStats"][string]) => string;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.section}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.sub}>Пока пусто — сыграйте туры</Text> : null}
      {rows.map((s, i) => {
        const p = save.players.find((x) => x.id === s.playerId);
        const c = pack.clubs.find((x) => x.id === s.clubId);
        if (!p || !c) return null;
        return (
          <View key={s.playerId} style={styles.statRow}>
            <Text style={styles.statRank}>{i + 1}</Text>
            <PersonPortrait seed={p.id} size={28} jersey={c.colors[0]}
              jerseySecondary={c.colors[1]} age={p.age} 
              portraitId={p.portraitId}
              nationalityId={p.nationalityId}
            />
            <ClubLogo club={c} size={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tableClub, { marginLeft: 0 }]} numberOfLines={1}>
                {playerDisplayName(p)}
              </Text>
              <Text style={styles.statNat} numberOfLines={1}>
                {nationalityShort(p.nationalityId)}
              </Text>
            </View>
            <Text style={styles.pts}>{value(s)}</Text>
          </View>
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
      return;
    }
    applyTactics({ ...tactics, lineup: next.slice(0, 11) });
    setSelectedId(null);
  };

  const onTapMine = (id: string, inXi: boolean) => {
    if (!selectedId) {
      setSelectedId(id);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    const selInXi = myIds.includes(selectedId);
    if (selInXi !== inXi) {
      swapPlayers(selectedId, id);
    } else {
      setSelectedId(id);
    }
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
        <Text style={[styles.prePos, opts.compact && styles.prePosSm]}>
          {preferredRoleLabel(p)}
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
          onPress: () => onTapMine(id, true),
        });
      })}
      <Text style={[styles.preSub, { marginTop: 10 }]}>Запас</Text>
      {myBench.slice(0, 9).map((id) => {
        const p = save.players.find((x) => x.id === id);
        if (!p) return null;
        return renderPlayerRow(p, {
          jersey: userClub.colors[0],
          jerseySecondary: userClub.colors[1],
          compact: true,
          selected: selectedId === id,
          onPress: () => onTapMine(id, false),
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
}: {
  pack: WorldPack;
  save: CareerSave;
  home?: Club;
  away?: Club;
  homeName: string;
  awayName: string;
  summary: MatchSummary;
  onContinue: () => void;
}) {
  const reactions = summary.reactions ?? [];
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
          <View
            key={`${r.playerId}-${r.detail ?? ""}-${r.minutes?.join("-") ?? r.count}`}
            style={styles.summaryRow}
          >
            {club ? <ClubLogo club={club} size={18} /> : null}
            <Text style={styles.tableClub} numberOfLines={1}>
              {r.name}
              {r.count && r.count > 1 ? ` ×${r.count}` : ""}
            </Text>
            {mins ? <Text style={styles.summaryMinute}>{mins}</Text> : null}
            {r.rating != null ? <Text style={styles.pts}>{r.rating.toFixed(1)}</Text> : null}
          </View>
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
      <StatusBar style="light" />
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
              <View style={styles.summaryRow}>
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
                    <Text style={{ color: "#8FA396", fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {motmClub?.name ?? "Клуб не указан"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.pts}>{summary.motm.rating?.toFixed(1)}</Text>
              </View>
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
            return (
              <View
                key={`${r.role}-${r.clubId}-${r.playerId ?? r.name}-${idx}`}
                style={styles.reactionCard}
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
                      seed={`coach:${r.clubId}:${r.name}`}
                      size={36}
                      kind="coach"
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
              </View>
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
}: {
  pack: WorldPack;
  save: CareerSave;
  live: LiveMatchState;
  onLiveChange: (l: LiveMatchState) => void;
  onTacticsPersist: (t: TeamTactics) => void;
  onDone: (l: LiveMatchState) => void;
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
                    side === "neutral" && { textAlign: "center", color: "#8FA396" },
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
                <View key={id} style={styles.xiRow}>
                  <PersonPortrait seed={p.id} size={28} jersey={userIsHome ? home.colors[0] : away.colors[0]}
              jerseySecondary={userIsHome ? home.colors[1] : away.colors[1]} age={p.age} 
              portraitId={p.portraitId}
              nationalityId={p.nationalityId}
            />
                  <Text style={[styles.posBadge, { width: 40 }]}>{preferredRoleLabel(p)}</Text>
                  <Text style={styles.tableClub} numberOfLines={1}>
                    {playerDisplayName(p)}
                  </Text>
                  <Text
                    style={[
                      styles.pts,
                      { fontSize: 11, color: (live.stamina?.[id] ?? 100) < 40 ? "#E74C3C" : "#8FA396" },
                    ]}
                  >
                    {Math.round(live.stamina?.[id] ?? 100)}%
                  </Text>
                  <Text style={[styles.pts, r < 6 && { color: "#E74C3C" }, r >= 7.5 && { color: "#2ECC71" }]}>
                    {r.toFixed(1)}
                  </Text>
                </View>
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
  const roles = FORMATION_ROLES[formation];
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

  return (
    <View>
      <Text style={styles.section}>Схема · тап по игроку = убрать</Text>
      <View style={styles.subsPitch}>
        {onField.map((id, i) => {
          const p = byId.get(id);
          const c = coords[i] ?? { x: 50, y: 50 };
          const role = roles[i] ?? "CM";
          if (!p) return null;
          const selected = outId === id;
          const proposed = proposal?.outId === id;
          return (
            <Pressable
              key={`${id}-${i}`}
              onPress={() => {
                setProposal(null);
                setOutId(selected ? null : id);
              }}
              style={[
                styles.subsPitchPlayer,
                {
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                },
                selected && styles.subsPitchSelected,
                proposed && styles.subsPitchProposeOut,
              ]}
            >
              <View style={styles.pitchAvatarWrap}>
                <PersonPortrait
                  seed={p.id}
                  size={24}
                  jersey={jersey}
                  jerseySecondary={jerseySecondary}
                  age={p.age}
                  portraitId={p.portraitId}
                  nationalityId={p.nationalityId}
                />
                <View style={styles.pitchOvrBadge}>
                  <Text style={styles.pitchOvrBadgeText}>{effectiveOverall(p, role)}</Text>
                </View>
              </View>
              <Text style={styles.pitchCaption} numberOfLines={1}>
                <Text style={styles.pitchName}>{p.lastName}</Text>
                <Text style={styles.pitchPos}> · {ROLE_LABEL[role] ?? role}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

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
            <Text style={[styles.posBadge, { width: 40 }]}>{preferredRoleLabel(p)}</Text>
            <Text style={styles.tableClub} numberOfLines={1}>
              {playerDisplayName(p)}
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
  const squad = sortSquad(save.players.filter((p) => p.clubId === clubId));
  const [tab, setTab] = useState<"tactics" | "list" | "history">(
    isUserClub ? "tactics" : "list"
  );
  const history = useMemo(() => buildClubHistory(pack, clubId), [pack, clubId]);
  const living = useMemo(() => careerLegendsForClub(save, clubId), [save, clubId]);
  const played = useMemo(
    () => clubPlayedMatches(pack, save, clubId, 30),
    [pack, save, clubId]
  );
  const euroSoon = useMemo(
    () => upcomingClubEuroFixtures(pack, save, clubId),
    [pack, save, clubId]
  );
  const euroAccess = hasContinentalAccess(pack, club.federationId, save.season);

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← назад</Text>
      </Pressable>
      <View style={styles.titleRow}>
        <ClubLogo club={club} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandSmall}>{club.name}</Text>
          <Text style={styles.sub}>
            {club.city}
            {history ? ` · осн. ${history.founded}` : ""}
            {euroAccess ? " · еврокубки" : ""}
          </Text>
        </View>
      </View>

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

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {isUserClub && onTactics && tab === "tactics" ? (
          <TacticsPanel
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
        ) : null}

        {tab === "list"
          ? squad.map((p) => {
              const st = save.playerStats[p.id];
              return (
                <Pressable key={p.id} style={styles.playerRow} onPress={() => onPlayer(p.id)}>
                  <PersonPortrait
                    seed={p.id}
                    size={44}
                    jersey={club.colors[0]}
                    jerseySecondary={club.colors[1]}
                    age={p.age}
                    portraitId={p.portraitId}
                    nationalityId={p.nationalityId}
                  />
                  <Text style={[styles.posBadge, { width: 40 }]}>{preferredRoleLabel(p)}</Text>
                  <View style={styles.clubMeta}>
                    <Text style={styles.clubName}>
                      {playerDisplayName(p)}
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
            })
          : null}

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
            {living.length ? (
              <>
                <Text style={styles.section}>Звёзды эпохи</Text>
                {living.map((lg) => (
                  <View key={lg.id} style={styles.historyRow}>
                    <Text style={styles.clubName}>
                      {lg.firstName} {lg.lastName}
                    </Text>
                    <Text style={styles.clubCity}>
                      {lg.positionLabel} · {lg.years} · {lg.peakOverall}
                    </Text>
                    <Text style={styles.hint}>{lg.capsNote}</Text>
                  </View>
                ))}
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

            {euroSoon.length ? (
              <>
                <Text style={styles.section}>Еврокубки · календарь</Text>
                {euroSoon.map((f) => {
                  const home = pack.clubs.find((c) => c.id === f.homeClubId);
                  const away = pack.clubs.find((c) => c.id === f.awayClubId);
                  const cup = pack.tournaments.find((t) => t.id === f.tournamentId);
                  return (
                    <Text key={f.id} style={styles.sub}>
                      {f.date} · {cup?.name ?? "Евро"} · {home?.shortName} — {away?.shortName}
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
          </View>
        ) : null}
      </ScrollView>
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
  transferActions,
}: {
  player: Player;
  club?: Club;
  stats?: CareerSave["playerStats"][string];
  season?: string;
  seasonStartValue?: number;
  onBack: () => void;
  backLabel?: string;
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
}) {
  const keys = keyAttributes(player);
  const keySet = new Set(keys);
  const otherKeys = ALL_ATTR_KEYS.filter((k) => !keySet.has(k));
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

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{backLabel}</Text>
      </Pressable>
      <View style={styles.titleRow}>
        <PersonPortrait seed={player.id} size={72} jersey={club?.colors[0]}
              jerseySecondary={club?.colors[1]} age={player.age} 
          portraitId={player.portraitId}
          nationalityId={player.nationalityId}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandSmall}>{playerDisplayName(player)}</Text>
          <Text style={styles.sub}>
            {positionLabel(player)} · {player.overall} · пот. {player.potential} · {player.age} лет
          </Text>
          {isLastCareerSeason(player) ? (
            <Text style={styles.lastSeasonBanner}>
              Последний сезон в карьере. Даже при трансфере завершит карьеру по окончании чемпионата.
            </Text>
          ) : null}
          <Text style={styles.sub}>{nationalityShort(player.nationalityId)}</Text>
          <Text style={styles.sub}>
            Нога: {FOOT_LABEL[player.preferredFoot] ?? "Правая"} · {player.height} см ·{" "}
            {player.weight} кг · {formatMarketValue(player.marketValue)}
          </Text>
          {club ? (
            <Text style={styles.sub}>
              {club.name} · {club.city}
            </Text>
          ) : null}
          {stats ? (
            <Text style={styles.sub}>
              Сезон: {stats.appearances} игр, {stats.goals} г, {stats.assists} п, ср.{" "}
              {averageRating(stats).toFixed(1)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.traitRow}>
        {(player.traits ?? []).map((t) => (
          <Text key={t} style={styles.traitChip}>
            {TRAIT_LABEL[t] ?? t}
          </Text>
        ))}
      </View>
      <ScrollView>
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
        <Text style={styles.section}>Ключевые</Text>
        {keys.map((key) => (
          <View key={key} style={styles.attrRow}>
            <Text style={styles.attrLabel}>{ATTRIBUTE_LABEL[key]}</Text>
            <View style={styles.attrTrack}>
              <View
                style={[
                  styles.attrFill,
                  { width: `${player.attributes?.[key] ?? 0}%` as `${number}%` },
                ]}
              />
            </View>
            <Text style={styles.attrVal}>{player.attributes?.[key] ?? 0}</Text>
          </View>
        ))}
        <Text style={styles.section}>Все атрибуты</Text>
        {otherKeys.map((key) => (
          <View key={key} style={styles.attrRow}>
            <Text style={styles.attrLabel}>{ATTRIBUTE_LABEL[key]}</Text>
            <View style={styles.attrTrack}>
              <View
                style={[
                  styles.attrFill,
                  styles.attrFillMuted,
                  { width: `${player.attributes?.[key] ?? 0}%` as `${number}%` },
                ]}
              />
            </View>
            <Text style={styles.attrVal}>{player.attributes?.[key] ?? 0}</Text>
          </View>
        ))}
      </ScrollView>
      {player.loan ? (
        <Text style={styles.hint}>
          В аренде до {player.loan.until}. Игровая практика в аренде ускоряет рост рейтинга.
        </Text>
      ) : null}
      {(transferActions ?? []).map((transferAction, idx) => (
        <Pressable
          key={`${transferAction.label}-${idx}`}
          style={[styles.cta, transferAction.disabled && { opacity: 0.4 }, idx > 0 && { marginTop: 8 }]}
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

function NewsCard({ item, pack, save }: { item: NewsItem; pack: WorldPack; save: CareerSave }) {
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
  const speakerClub = item.speaker?.clubId
    ? pack.clubs.find((c) => c.id === item.speaker!.clubId)
    : clubs[0];
  return (
    <View style={styles.newsItem}>
      <View style={styles.newsTop}>
        {item.speaker ? (
          <PersonPortrait
            seed={item.speaker.name + (item.speaker.playerId ?? "")}
            size={40}
            kind={speakerKind(item.speaker.role)}
            jersey={speakerClub?.colors[0]}
              jerseySecondary={speakerClub?.colors[1]}
            portraitId={player?.portraitId}
            nationalityId={player?.nationalityId}
            age={player?.age}
          />
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
      {player ? <Text style={styles.speakerLine}>{playerDisplayName(player)}</Text> : null}
    </View>
  );
}


function BuyNegotiationModal({
  pack,
  save,
  playerId,
  offer,
  feedback,
  onChangeOffer,
  onClose,
  onBought,
}: {
  pack: WorldPack;
  save: CareerSave;
  playerId: string;
  offer: number;
  feedback?: string;
  onChangeOffer: (offer: number, feedback?: string) => void;
  onClose: () => void;
  onBought: (save: CareerSave) => void;
}) {
  const player = save.players.find((p) => p.id === playerId);
  const neg = getBuyNegotiation(pack, save, playerId);
  const budget = clubBudget(save, save.clubId);
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

  const submit = () => {
    if (!canAfford) {
      onChangeOffer(offer, `Недостаточно бюджета (есть ${formatMarketValue(budget)}).`);
      return;
    }
    const verdict = evaluateBuyOffer(neg, offer);
    if (verdict.status !== "accept") {
      onChangeOffer(offer, verdict.message);
      return;
    }
    const result = buyPlayer(pack, save, playerId, offer);
    if (!result.ok) {
      onChangeOffer(offer, result.error ?? "Сделка не состоялась.");
      return;
    }
    onBought(result.save);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Торг за игрока</Text>
          <Text style={styles.dialogBody}>
            {playerDisplayName(player)}
            {from ? ` («${from.name}»)` : ""}
            {"\n"}Рынок: {formatMarketValue(neg.marketValue)} · потолок торга ~{formatMarketValue(neg.hardCeil)}
            {"\n"}Ваше предложение: {formatMarketValue(offer)}
            {"\n"}Бюджет: {formatMarketValue(budget)}
          </Text>
          {feedback ? <Text style={styles.negoFeedback}>{feedback}</Text> : null}
          <View style={styles.negoRaiseRow}>
            <Pressable
              style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
              disabled={atCeil}
              onPress={() =>
                onChangeOffer(
                  raiseBuyOffer(offer, neg.marketValue, neg.hardCeil, "small"),
                  "Повысили предложение на ~5%."
                )
              }
            >
              <Text style={styles.negoRaiseText}>+5%</Text>
            </Pressable>
            <Pressable
              style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
              disabled={atCeil}
              onPress={() =>
                onChangeOffer(
                  raiseBuyOffer(offer, neg.marketValue, neg.hardCeil, "medium"),
                  "Повысили предложение на ~10%."
                )
              }
            >
              <Text style={styles.negoRaiseText}>+10%</Text>
            </Pressable>
            <Pressable
              style={[styles.negoRaiseBtn, atCeil && { opacity: 0.4 }]}
              disabled={atCeil}
              onPress={() =>
                onChangeOffer(
                  raiseBuyOffer(offer, neg.marketValue, neg.hardCeil, "large"),
                  "Крупная прибавка — ближе к потолку рынка."
                )
              }
            >
              <Text style={styles.negoRaiseText}>+20%</Text>
            </Pressable>
          </View>
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogBtnGhost} onPress={onClose}>
              <Text style={styles.dialogBtnGhostText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.dialogBtnMain, !canAfford && { opacity: 0.45 }]}
              onPress={submit}
            >
              <Text style={styles.dialogBtnMainText}>Предложить</Text>
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
}: {
  pack: WorldPack;
  save: CareerSave;
  onBack: () => void;
  onSave: (s: CareerSave) => void;
  onPlayer: (playerId: string, clubId: string) => void;
  onStartBuy: (playerId: string) => void;
}) {
  const [tab, setTab] = useState<"buy" | "loan" | "loanOut" | "sell">("buy");
  const [posFilter, setPosFilter] = useState<Position | "all">("all");
  const [sortBy, setSortBy] = useState<"rating" | "value">("value");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
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
  const open = isTransferWindowOpen(save);
  const active = getActiveTransferWindow(save);
  const next = getNextTransferWindow(save);
  const budget = clubBudget(save, save.clubId);
  const club = pack.clubs.find((c) => c.id === save.clubId)!;
  const targets = listTransferTargets(pack, save, { leagueOnly: false, limit: 400 });
  const loanTargets = useMemo(() => listLoanTargets(pack, save, { limit: 200 }), [pack, save]);
  const loanOutCandidates = useMemo(() => listLoanOutCandidates(pack, save), [pack, save]);
  const needs = useMemo(
    () => analyzeSquadNeeds(save.players, save.clubId, save.userTactics),
    [save.players, save.clubId, save.userTactics]
  );
  const needPositions = useMemo(() => new Set(needs.map((n) => n.position)), [needs]);

  const buyList = useMemo(() => {
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
  }, [targets, posFilter, sortBy, sortDir]);

  const sellList = useMemo(() => {
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
  }, [save.players, save.clubId, posFilter, sortBy, sortDir]);

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
    const verdict = evaluateLoanWillingness(pack, save, playerId);
    const from = p.clubId ? pack.clubs.find((c) => c.id === p.clubId) : undefined;
    if (!verdict.ok) {
      setDialog({ title: "Аренда", body: verdict.message });
      return;
    }
    setDialog({
      title: "Взять в аренду?",
      body: `${playerDisplayName(p)}${from ? ` («${from.shortName}»)` : ""}\nАренда до конца сезона\nСтоимость: ${formatMarketValue(verdict.fee)}\nБюджет после: ${formatMarketValue(budget - verdict.fee)}\n\n${verdict.message}`,
      confirmLabel: "Арендовать",
      onConfirm: () => {
        const result = loanPlayer(pack, save, playerId);
        setDialog(null);
        if (!result.ok) {
          setDialog({ title: "Аренда", body: result.error ?? "Не удалось оформить аренду" });
          return;
        }
        onSave(result.save);
      },
    });
  };

  const doLoanOut = (playerId: string) => {
    const p = save.players.find((x) => x.id === playerId);
    if (!p) return;
    const interest = evaluateLoanInterest(pack, save, playerId);
    if (!interest.ok) {
      setDialog({ title: "Аренда", body: interest.message });
      return;
    }
    setDialog({
      title: "Отдать в аренду?",
      body: `${playerDisplayName(p)}\n${interest.message}\nВы получите: ${formatMarketValue(interest.fee)}\nБюджет после: ${formatMarketValue(budget + interest.fee)}\n\nВ аренде игрок будет играть и может вырасти быстрее, чем на вашей лавке.`,
      confirmLabel: "Отдать",
      onConfirm: () => {
        const result = loanOutPlayer(pack, save, playerId);
        setDialog(null);
        if (!result.ok) {
          setDialog({ title: "Аренда", body: result.error ?? "Не удалось" });
          return;
        }
        onSave(result.save);
      },
    });
  };

  const doSell = (playerId: string) => {
    const p = save.players.find((x) => x.id === playerId);
    if (!p) return;
    const lastNote = isLastCareerSeason(p)
      ? "\n\nЭто последний сезон в его карьере: даже у нового клуба он завершит карьеру по итогам чемпионата."
      : "";
    setDialog({
      title: "Продать игрока?",
      body: `${playerDisplayName(p)}\nВы получите: ${formatMarketValue(p.marketValue)}\nИгрок уйдёт из клуба без возможности отмены.${lastNote}`,
      confirmLabel: "Продать",
      destructive: true,
      onConfirm: () => {
        const result = sellPlayer(pack, save, playerId);
        setDialog(null);
        if (!result.ok) {
          setDialog({
            title: "Трансфер",
            body: result.error ?? "Не удалось продать",
          });
          return;
        }
        onSave(result.save);
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

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
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
                {n.severity === "high" ? "Срочно · " : n.severity === "medium" ? "Желательно · " : "На заметку · "}
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
              {posChips.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setPosFilter(chip.id)}
                  style={[styles.posFilterChip, posFilter === chip.id && styles.filterChipOn]}
                >
                  <Text
                    style={[styles.filterChipText, posFilter === chip.id && styles.filterChipTextOn]}
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
                <Text style={[styles.filterChipText, sortBy === "rating" && styles.filterChipTextOn]}>
                  Рейтинг {sortBy === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleSort("value")}
                style={[styles.sortChip, sortBy === "value" && styles.filterChipOn]}
              >
                <Text style={[styles.filterChipText, sortBy === "value" && styles.filterChipTextOn]}>
                  Цена {sortBy === "value" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.hint}>
              Найдено: {list.length}
              {posFilter !== "all" ? ` · ${POSITION_LABEL[posFilter]}` : ""}
              {" · все чемпионаты"}
            </Text>

            {list.length === 0 ? (
              <Text style={styles.sub}>Нет игроков по выбранным фильтрам</Text>
            ) : null}
            {tab === "buy" &&
              list.map((p) => {
                const from = pack.clubs.find((c) => c.id === p.clubId);
                const fromLeague = from
                  ? pack.leagues.find((l) => l.clubIds.includes(from.id))
                  : undefined;
                const canAfford = budget >= (p.marketValue ?? 0);
                const matchesNeed = needPositions.has(primaryPosition(p));
                return (
                  <View key={p.id} style={styles.transferRow}>
                    <Pressable
                      style={styles.transferRowMain}
                      onPress={() => onPlayer(p.id, p.clubId ?? save.clubId)}
                    >
                      <PersonPortrait
                        seed={p.id}
                        size={40}
                        jersey={from?.colors[0]}
                        jerseySecondary={from?.colors[1]}
                        age={p.age}
                        portraitId={p.portraitId}
                        nationalityId={p.nationalityId}
                      />
                      {from ? <ClubLogo club={from} size={18} /> : null}
                      <View style={styles.clubMeta}>
                        <Text style={styles.clubName}>
                          {playerDisplayName(p)}
                          {matchesNeed ? " · нужно" : ""}
                        </Text>
                        <Text style={styles.clubCity}>
                          {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall} ·{" "}
                          {from?.name}
                          {fromLeague ? ` · ${fromLeague.name}` : ""}
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
              })}
            {tab === "loan" &&
              list.map((p) => {
                const from = pack.clubs.find((c) => c.id === p.clubId);
                const fee = loanFeeForPlayer(p);
                const canAfford = budget >= fee;
                return (
                  <View key={p.id} style={styles.transferRow}>
                    <Pressable
                      style={styles.transferRowMain}
                      onPress={() => onPlayer(p.id, p.clubId ?? save.clubId)}
                    >
                      <PersonPortrait
                        seed={p.id}
                        size={40}
                        jersey={from?.colors[0]}
                        jerseySecondary={from?.colors[1]}
                        age={p.age}
                        portraitId={p.portraitId}
                        nationalityId={p.nationalityId}
                      />
                      {from ? <ClubLogo club={from} size={18} /> : null}
                      <View style={styles.clubMeta}>
                        <Text style={styles.clubName}>{playerDisplayName(p)}</Text>
                        <Text style={styles.clubCity}>
                          {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall} ·{" "}
                          {from?.name} · скамейка/запас
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
              })}
            {tab === "loanOut" &&
              list.map((p) => {
                const interest = evaluateLoanInterest(pack, save, p.id);
                return (
                  <View key={p.id} style={styles.transferRow}>
                    <Pressable
                      style={styles.transferRowMain}
                      onPress={() => onPlayer(p.id, save.clubId)}
                    >
                      <PersonPortrait
                        seed={p.id}
                        size={40}
                        jersey={club.colors[0]}
                        jerseySecondary={club.colors[1]}
                        age={p.age}
                        portraitId={p.portraitId}
                        nationalityId={p.nationalityId}
                      />
                      <View style={styles.clubMeta}>
                        <Text style={styles.clubName}>{playerDisplayName(p)}</Text>
                        <Text style={styles.clubCity}>
                          {nationalityShort(p.nationalityId)} · {positionLabel(p)} · {p.overall}
                          {interest.wouldStart ? " · возьмут в основу" : " · ротация"}
                          {interest.hostName ? ` · ${interest.hostName}` : ""}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.transferBuyBtn}
                      onPress={() => doLoanOut(p.id)}
                    >
                      <Text style={styles.transferBuyBtnText} numberOfLines={2}>
                        Отдать {formatMarketValue(interest.fee)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            {tab === "sell" &&
              list.map((p) => {
                const onLoan = Boolean(p.loan);
                return (
                  <View key={p.id} style={styles.transferRow}>
                    <Pressable
                      style={styles.transferRowMain}
                      onPress={() => onPlayer(p.id, save.clubId)}
                    >
                      <PersonPortrait
                        seed={p.id}
                        size={40}
                        jersey={club.colors[0]}
                        jerseySecondary={club.colors[1]}
                        age={p.age}
                        portraitId={p.portraitId}
                        nationalityId={p.nationalityId}
                      />
                      <View style={styles.clubMeta}>
                        <Text style={styles.clubName}>
                          {playerDisplayName(p)}
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
                          : `${isLastCareerSeason(p) ? "Продать (посл. сезон)" : "Продать за"} ${formatMarketValue(p.marketValue)}`}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
          </>
        ) : null}
      </ScrollView>

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
  const [mineOnly, setMineOnly] = useState(false);

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

  const shortName = (id: string) => pack.clubs.find((c) => c.id === id)?.shortName ?? id;
  const leagueOf = (clubId: string) => {
    const c = pack.clubs.find((x) => x.id === clubId);
    if (!c) return null;
    const league = pack.leagues.find((l) => l.clubIds.includes(clubId));
    if (league) return leagueChipLabel(league);
    const fed = pack.federations.find((f) => f.id === c.federationId);
    return fed?.name ?? c.federationId;
  };
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
      ) : (
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
        {matchdays.length} туров · {fixtures.length} матчей
        {mineOnly ? " · ваш клуб" : ""}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {matchdays.length === 0 ? (
          <Text style={styles.sub}>
            {mode === "euro"
              ? "Еврокубковых матчей в календаре пока нет."
              : "Матчей не найдено."}
          </Text>
        ) : (
          matchdays.map((md) => {
            const past = md.date < save.currentDate;
            const today = md.date === save.currentDate;
            return (
              <View key={md.date} style={styles.calendarDay}>
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
                            {pack.tournaments.find((t) => t.id === f.tournamentId)?.name ??
                              f.tournamentId}
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
          })
        )}
      </ScrollView>
    </View>
  );
}

function WindowReportScreen({
  pack,
  report,
  onDone,
}: {
  pack: WorldPack;
  report: WindowTransferReport;
  onDone: () => void;
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
          report.deals.map((d) => (
            <View key={d.id} style={styles.historyRow}>
              <Text style={styles.clubName}>
                {d.playerName}
                {d.kind === "loan" ? " (аренда)" : ""}
              </Text>
              <Text style={styles.clubCity}>
                {nameOf(d.fromClubId)} → {nameOf(d.toClubId)} · {formatMarketValue(d.fee)} · {d.date}
              </Text>
            </View>
          ))
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
  onContinue,
}: {
  awards: SeasonAwards;
  onContinue: () => void;
}) {
  const placeLabel =
    awards.place === 1
      ? "Чемпион"
      : awards.place === 2
        ? "Серебро"
        : awards.place === 3
          ? "Бронза"
          : `${awards.place}-е место`;

  return (
    <View style={styles.root}>
      <Text style={styles.brandSmall}>Итоги сезона</Text>
      <Text style={styles.awardsLeague}>
        {awards.leagueName} · {awards.season}
      </Text>
      <View style={styles.awardsHero}>
        <Text style={styles.awardsPlace}>{placeLabel}</Text>
        <Text style={styles.awardsClub}>{awards.userClubName}</Text>
        <Text style={styles.sub}>
          {awards.points} очков · разница {awards.gd > 0 ? "+" : ""}
          {awards.gd} · {awards.played} матчей
        </Text>
      </View>
      <ScrollView>
        <Text style={styles.awardsBody}>{awards.body}</Text>
        {awards.place > 1 ? (
          <Text style={styles.sub}>Чемпион: {awards.championName}</Text>
        ) : null}
        {awards.topScorerName ? (
          <Text style={styles.sub}>
            Бомбардир: {awards.topScorerName} — {awards.topScorerGoals}
          </Text>
        ) : null}
        {awards.topAssistName ? (
          <Text style={styles.sub}>
            Ассистент: {awards.topAssistName} — {awards.topAssistCount}
          </Text>
        ) : null}
        {awards.topRatingName ? (
          <Text style={styles.sub}>
            Рейтинг: {awards.topRatingName} — {awards.topRatingValue?.toFixed(1)}
          </Text>
        ) : null}
        <Text style={[styles.hint, { marginTop: 16 }]}>
          Рейтинги обновлены, возрастные игроки подешевели; часть ветеранов завершила карьеру.
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
}: {
  pack: WorldPack;
  save: CareerSave;
  onAccept: (playerId: string) => void;
  onReject: (playerId: string) => void;
  onDone: () => void;
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
              <View style={styles.transferRowMain}>
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
                  <Text style={styles.clubName}>{playerDisplayName(p)}</Text>
                  <Text style={styles.clubCity}>
                    {positionLabel(p)} · {p.age} лет · OVR {p.overall} · пот. {p.potential}
                  </Text>
                  <Text style={styles.clubCity}>
                    {nationalityShort(p.nationalityId)} · {formatMarketValue(p.marketValue)}
                  </Text>
                </View>
              </View>
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

const styles = StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(6, 12, 10, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#121C18",
    borderWidth: 1,
    borderColor: "#C6A75E",
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 12,
  },
  dialogTitle: {
    color: "#E8F0EA",
    fontSize: 20,
    fontWeight: "700",
  },
  dialogBody: {
    color: "#8FA396",
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
    borderColor: "#24332C",
    paddingVertical: 12,
    alignItems: "center",
  },
  dialogBtnGhostText: { color: "#E8F0EA", fontWeight: "600" },
  dialogBtnMain: {
    flex: 1,
    backgroundColor: "#1F6F4A",
    paddingVertical: 12,
    alignItems: "center",
  },
  dialogBtnMainText: { color: "#E8F0EA", fontWeight: "700" },
  dialogBtnDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#C45B5B",
  },
  dialogBtnDangerText: { color: "#E8A0A0" },
  posFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    marginBottom: 2,
  },
  posFilterChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#24332C",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: "#24332C",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipOn: { borderColor: "#C6A75E", backgroundColor: "#1A2E26" },
  filterChipText: {
    color: "#8FA396",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  filterChipTextOn: { color: "#C6A75E" },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  sortLabel: { color: "#8FA396", fontSize: 12, marginRight: 4 },
  root: { flex: 1, backgroundColor: "#0E1512", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 20 },
  brand: { fontSize: 30, color: "#E8F0EA", fontWeight: "700", letterSpacing: 0.3 },
  brandSmall: { fontSize: 22, color: "#E8F0EA", fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  sub: { marginTop: 4, color: "#8FA396", fontSize: 13, lineHeight: 18 },
  back: { color: "#C6A75E", fontSize: 14 },
  leagueRow: { maxHeight: 56, marginTop: 12, marginBottom: 4, flexGrow: 0 },
  leagueRowContent: { alignItems: "center", paddingVertical: 4 },
  leagueChip: {
    borderWidth: 1,
    borderColor: "#24332C",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    marginRight: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  leagueChipActive: { borderColor: "#C6A75E", backgroundColor: "#16211C" },
  leagueChipText: { color: "#8FA396", fontSize: 12, lineHeight: 18, includeFontPadding: true },
  leagueChipTextActive: { color: "#E8F0EA" },
  list: { paddingVertical: 12, gap: 8 },
  endCareerBtn: {
    marginTop: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#5A3030",
    paddingVertical: 12,
    alignItems: "center",
  },
  endCareerText: { color: "#D08080", fontWeight: "600", fontSize: 13 },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
  },
  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
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
    backgroundColor: "#1F6F4A",
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  transferBuyBtnOff: {
    backgroundColor: "#1A2420",
    borderWidth: 1,
    borderColor: "#24332C",
  },
  transferBuyBtnText: {
    color: "#E8F0EA",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  transferBuyBtnTextOff: { color: "#5F7A6C", fontWeight: "600" },
  transferSellBtn: {
    maxWidth: 112,
    borderWidth: 1,
    borderColor: "#5A3030",
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  transferSellBtnText: {
    color: "#D08080",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  negoFeedback: {
    color: "#C6A75E",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  negoRaiseRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  negoRaiseBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#C6A75E",
    paddingVertical: 10,
    alignItems: "center",
  },
  negoRaiseText: { color: "#C6A75E", fontWeight: "700", fontSize: 13 },
  clubMeta: { flex: 1 },
  clubName: { color: "#E8F0EA", fontSize: 15, fontWeight: "600" },
  clubCity: { color: "#8FA396", fontSize: 12, marginTop: 2 },
  rep: { color: "#C6A75E", fontSize: 16, fontWeight: "700" },
  cta: { marginTop: 12, backgroundColor: "#1F6F4A", paddingVertical: 13, alignItems: "center" },
  ctaText: { color: "#E8F0EA", fontWeight: "700", fontSize: 15 },
  ctaSecondary: { marginTop: 10, borderWidth: 1, borderColor: "#24332C", paddingVertical: 12, alignItems: "center" },
  ctaSecondaryText: { color: "#E8F0EA", fontWeight: "600" },
  calendarDay: { marginBottom: 14 },
  calendarDayTitle: {
    color: "#C6A75E",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  calendarDayToday: { color: "#E8F0EA" },
  calendarDayPast: { color: "#6A7A70" },
  calendarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
  },
  calendarRowMine: { backgroundColor: "#16211C" },
  calendarClubs: { flex: 1, gap: 2 },
  calendarScore: {
    color: "#8FA396",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 28,
    textAlign: "right",
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, marginBottom: 8 },
  tab: { borderWidth: 1, borderColor: "#24332C", paddingHorizontal: 10, paddingVertical: 6 },
  tabOn: { borderColor: "#C6A75E", backgroundColor: "#16211C" },
  tabText: { color: "#8FA396", fontSize: 12 },
  tabTextOn: { color: "#E8F0EA" },
  section: { marginTop: 12, marginBottom: 6, color: "#C6A75E", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingVertical: 2,
  },
  th: { color: "#5F7A6C", fontSize: 10 },
  thRank: { width: 22, color: "#5F7A6C", fontSize: 10, textAlign: "center" },
  thLogoSpacer: { width: 18 },
  thClub: { flex: 1, color: "#5F7A6C", fontSize: 10, marginLeft: 4 },
  thNum: { width: 22, color: "#5F7A6C", fontSize: 10, textAlign: "center" },
  thGoals: { width: 44, color: "#5F7A6C", fontSize: 10, textAlign: "center" },
  thPts: { width: 24, color: "#5F7A6C", fontSize: 10, textAlign: "center" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5 },
  tableRowMine: { backgroundColor: "#16211C" },
  tableRowMineBorder: { borderWidth: 1, borderColor: "#C6A75E" },
  tableRowUcl: { backgroundColor: "rgba(46, 125, 80, 0.28)" },
  tableRowUel: { backgroundColor: "rgba(196, 120, 40, 0.28)" },
  tableRowUecl: { backgroundColor: "rgba(45, 100, 160, 0.28)" },
  euroLegend: { marginTop: 14, marginBottom: 8, gap: 6 },
  euroLegendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  euroLegendSwatch: { width: 18, height: 14, borderRadius: 2 },
  euroLegendText: { color: "#8FA396", fontSize: 12 },
  pos: { color: "#8FA396", fontSize: 12 },
  tdRank: {
    width: 22,
    color: "#8FA396",
    fontSize: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdLogo: { width: 18, alignItems: "center", justifyContent: "center" },
  tableClub: { flex: 1, color: "#E8F0EA", fontSize: 13, marginLeft: 4 },
  tdNum: {
    width: 22,
    color: "#8FA396",
    fontSize: 11,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdGoals: {
    width: 44,
    color: "#8FA396",
    fontSize: 11,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  tdPts: {
    width: 24,
    color: "#C6A75E",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  pts: { color: "#C6A75E", fontWeight: "700", fontSize: 12 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 },
  statRank: {
    width: 22,
    color: "#8FA396",
    fontSize: 12,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  statNat: { color: "#8FA396", fontSize: 11, marginTop: 1, fontWeight: "600", letterSpacing: 0.3 },
  news: { flex: 1 },
  newsItem: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#24332C" },
  newsTop: { flexDirection: "row", gap: 8 },
  newsCat: { color: "#5F7A6C", fontSize: 10, textTransform: "uppercase" },
  newsHead: { color: "#E8F0EA", fontWeight: "600", fontSize: 14 },
  newsBody: { color: "#8FA396", fontSize: 13, marginTop: 6, lineHeight: 18 },
  speakerLine: { color: "#C6A75E", fontSize: 11, marginTop: 4 },
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
  matchClub: { color: "#E8F0EA", fontSize: 12 },
  scoreBig: { fontSize: 24, color: "#E8F0EA", fontWeight: "700" },
  preRow: { flexDirection: "row", marginTop: 12, alignItems: "flex-start" },
  preCol: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  preDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "#24332C", alignSelf: "stretch", marginHorizontal: 6 },
  preColTitle: {
    color: "#C6A75E",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  preSub: {
    color: "#5F7A6C",
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
    width: 28,
    color: "#C6A75E",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  prePosSm: { width: 26, fontSize: 9 },
  preName: {
    flex: 1,
    minWidth: 0,
    color: "#E8F0EA",
    fontSize: 11,
  },
  preNameSm: { fontSize: 10, color: "#8FA396" },
  preOvr: {
    width: 22,
    color: "#C6A75E",
    fontWeight: "700",
    fontSize: 11,
    textAlign: "right",
  },
  preOvrSm: { fontSize: 10, width: 20 },
  speedRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  speedBtn: { borderWidth: 1, borderColor: "#24332C", paddingHorizontal: 10, paddingVertical: 6 },
  speedBtnActive: { borderColor: "#C6A75E", backgroundColor: "#16211C" },
  speedBtnText: { color: "#8FA396", fontSize: 12 },
  speedBtnTextActive: { color: "#E8F0EA" },
  feed: { flex: 1, marginTop: 8 },
  feedItem: { flexDirection: "row", marginBottom: 6, overflow: "hidden" },
  feedHome: { marginRight: 24, backgroundColor: "#121C18" },
  feedAway: { marginLeft: 24, backgroundColor: "#14181E", flexDirection: "row-reverse" },
  feedNeutral: { marginHorizontal: 12, backgroundColor: "#101612" },
  feedGoal: { borderWidth: 1, borderColor: "#C6A75E55" },
  feedYellow: { borderWidth: 1, borderColor: "#F1C40F66" },
  feedRed: { borderWidth: 1, borderColor: "#E74C3C66" },
  feedSetPiece: { borderWidth: 1, borderColor: "#3498DB55" },
  feedAccent: { width: 4 },
  feedCrest: { justifyContent: "center", paddingLeft: 6, paddingRight: 2 },
  feedText: { flex: 1, color: "#E8F0EA", fontSize: 13, lineHeight: 18, padding: 8 },
  xiRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  xiRowSelected: { backgroundColor: "#1A2E26", borderRadius: 4 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
  },
  summaryMinute: {
    color: "#C6A75E",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 36,
    textAlign: "right",
  },
  reactionCard: {
    backgroundColor: "#121C18",
    borderWidth: 1,
    borderColor: "#24332C",
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  reactionTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reactionMeta: { color: "#8FA396", fontSize: 11, marginTop: 2 },
  reactionQuote: { color: "#E8F0EA", fontSize: 13, lineHeight: 19, fontStyle: "italic" },
  slotRole: { width: 36, color: "#8FA396", fontSize: 10 },
  statsCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "#121A16",
    borderWidth: 1,
    borderColor: "#24332C",
  },
  statsCompactText: { flex: 1, color: "#8FA396", fontSize: 9 },
  statsCompactMid: {
    color: "#C6A75E",
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statsCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#24332C",
    backgroundColor: "#121A16",
    overflow: "hidden",
  },
  statsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0E1512",
  },
  statsSide: { width: "34%", gap: 4 },
  statsClub: { color: "#E8F0EA", fontSize: 12, fontWeight: "700" },
  statsScore: {
    color: "#E8F0EA",
    fontSize: 26,
    fontWeight: "700",
    minWidth: 64,
    textAlign: "center",
  },
  statsTitleBar: {
    backgroundColor: "#C6A75E",
    paddingVertical: 8,
    alignItems: "center",
  },
  statsTitle: {
    color: "#111",
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
    borderBottomColor: "#24332C",
  },
  statVal: { width: "22%", color: "#E8F0EA", fontSize: 14, fontWeight: "700", textAlign: "center" },
  statLabel: { flex: 1, color: "#8FA396", fontSize: 12, textAlign: "center" },
  subsPitch: {
    height: 320,
    backgroundColor: "#1A3D2E",
    borderWidth: 1,
    borderColor: "#2F5D45",
    marginVertical: 10,
    overflow: "hidden",
  },
  subsPitchPlayer: {
    position: "absolute",
    width: 60,
    marginLeft: -30,
    marginTop: -2,
    alignItems: "center",
  },
  subsPitchSelected: {
    backgroundColor: "rgba(198,167,94,0.25)",
    borderRadius: 6,
  },
  subsPitchProposeOut: {
    backgroundColor: "rgba(231,76,60,0.2)",
    borderRadius: 6,
  },
  pitchAvatarWrap: { position: "relative" },
  pitchOvrBadge: {
    position: "absolute",
    right: -6,
    bottom: -2,
    minWidth: 18,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#0E1512",
    borderWidth: 1,
    borderColor: "#C6A75E",
    alignItems: "center",
  },
  pitchOvrBadgeText: { color: "#E8F0EA", fontSize: 8, fontWeight: "800" },
  pitchCaption: {
    marginTop: 3,
    maxWidth: 58,
    textAlign: "center",
    lineHeight: 11,
  },
  pitchName: {
    color: "#E8F0EA",
    fontSize: 8,
  },
  pitchPos: { color: "#C6A75E", fontSize: 8 },
  pitchOvr: { color: "#E8F0EA", fontSize: 10, fontWeight: "700" },
  proposalBox: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#C6A75E",
    backgroundColor: "#16211C",
    gap: 8,
  },
  proposalTitle: { color: "#C6A75E", fontSize: 12, fontWeight: "700" },
  proposalActions: { gap: 6 },
  posBadge: { width: 36, color: "#C6A75E", fontSize: 11, fontWeight: "700" },
  traitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  traitChip: { borderWidth: 1, borderColor: "#C6A75E", color: "#C6A75E", padding: 6, alignSelf: "flex-start", fontSize: 12 },
  attrRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  attrLabel: { width: 90, color: "#8FA396", fontSize: 12 },
  attrTrack: { flex: 1, height: 6, backgroundColor: "#24332C" },
  attrFill: { height: 6, backgroundColor: "#1F6F4A" },
  attrFillMuted: { backgroundColor: "#3D5C4A" },
  attrVal: { width: 28, textAlign: "right", color: "#C6A75E", fontSize: 12 },
  hint: { color: "#5F7A6C", fontSize: 11, marginBottom: 8 },
  lockedBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#24332C",
    padding: 14,
    backgroundColor: "#121C18",
  },
  lockedTitle: { color: "#E8F0EA", fontWeight: "700", fontSize: 15, marginBottom: 4 },
  needsBox: {
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#C6A75E",
    backgroundColor: "#16211C",
    padding: 14,
    gap: 10,
  },
  needsTitle: { color: "#C6A75E", fontWeight: "700", fontSize: 15 },
  needsLead: { color: "#8FA396", fontSize: 12, lineHeight: 17, marginBottom: 2 },
  needsItem: {
    gap: 3,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A3F34",
  },
  needsSeverity: { color: "#8FA396", fontWeight: "700", fontSize: 13 },
  needsHigh: { color: "#E07A5F" },
  needsMed: { color: "#C6A75E" },
  needsTip: { color: "#E8F0EA", fontSize: 13, lineHeight: 18 },
  transferTipLine: {
    color: "#C6A75E",
    fontSize: 12,
    marginTop: 6,
    marginBottom: 2,
    lineHeight: 17,
  },
  historyMotto: {
    color: "#C6A75E",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  historyRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24332C",
    gap: 2,
  },
  lastSeasonBanner: {
    color: "#E07A5F",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  academyCard: {
    borderWidth: 1,
    borderColor: "#2A3F34",
    backgroundColor: "#121C18",
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
    borderColor: "#2A3F34",
    backgroundColor: "#101A16",
    padding: 12,
    gap: 8,
  },
  buzzTitle: { color: "#C6A75E", fontWeight: "700", fontSize: 13 },
  buzzItem: { gap: 2 },
  buzzHeadline: { color: "#E8F0EA", fontWeight: "600", fontSize: 12 },
  buzzBody: { color: "#8FA396", fontSize: 12, lineHeight: 17 },
  atmosphereBox: {
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#2A3F34",
    backgroundColor: "#101A16",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  atmosphereStadium: { color: "#E8F0EA", fontWeight: "700", fontSize: 14 },
  atmosphereLine: { color: "#A8BDB0", fontSize: 12, lineHeight: 17 },
  atmosphereWeather: { color: "#C6A75E", fontSize: 12, lineHeight: 17 },
  atmosphereLive: { color: "#8FA396", fontSize: 11, marginTop: 2, maxWidth: 140, textAlign: "center" },
  awardsLeague: { color: "#8FA396", fontSize: 13, marginBottom: 12 },
  awardsHero: {
    borderWidth: 1,
    borderColor: "#C6A75E",
    backgroundColor: "#121C18",
    padding: 18,
    marginBottom: 14,
    gap: 6,
  },
  awardsPlace: { color: "#C6A75E", fontSize: 28, fontWeight: "800" },
  awardsClub: { color: "#E8F0EA", fontSize: 18, fontWeight: "700" },
  awardsBody: { color: "#A8BDB0", fontSize: 14, lineHeight: 20, marginBottom: 12 },
});

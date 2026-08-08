import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  formatMarketValue,
  listLoanClubOffers,
  listSellClubOffers,
  playerNameWithAge,
  type CareerSave,
  type OutboundClubOffer,
  type Player,
  type WorldPack,
} from "@fm/engine";
import { ClubLogo } from "./ClubLogo";
import {broadcast, registerThemeRebuild} from "./broadcastTheme";

const LEAGUE_CHIP_LABEL: Record<string, string> = {
  rpl: "РПЛ",
  epl: "АПЛ",
  laliga: "Ла Лига",
  bundesliga: "Бундеслига",
  seriea: "Серия А",
  ligue1: "Лига 1",
};

function leagueLabel(league: { id: string; name: string }) {
  return LEAGUE_CHIP_LABEL[league.id] ?? league.name;
}

type Kind = "sell" | "loan";

type Props = {
  visible: boolean;
  kind: Kind;
  pack: WorldPack;
  save: CareerSave;
  player: Player;
  onClose: () => void;
  onConfirm: (clubId: string, fee: number) => void;
};

function statusTone(status: OutboundClubOffer["status"]) {
  if (status === "ready") return broadcast.accent;
  if (status === "player_refuse") return "#E8A0A0";
  return broadcast.mist;
}

export function OutboundClubPicker({
  visible,
  kind,
  pack,
  save,
  player,
  onClose,
  onConfirm,
}: Props) {
  const [leagueId, setLeagueId] = useState(
    () =>
      pack.leagues.find((l) => l.clubIds.includes(save.clubId))?.id ??
      pack.leagues[0]?.id ??
      "rpl"
  );
  const [pending, setPending] = useState<OutboundClubOffer | null>(null);

  const clubsById = useMemo(
    () => new Map(pack.clubs.map((c) => [c.id, c] as const)),
    [pack.clubs]
  );

  const offers = useMemo(() => {
    if (!visible) return [] as OutboundClubOffer[];
    return kind === "sell"
      ? listSellClubOffers(pack, save, player.id)
      : listLoanClubOffers(pack, save, player.id);
  }, [visible, kind, pack, save, player.id]);

  const byLeague = useMemo(() => {
    const m = new Map<string, OutboundClubOffer[]>();
    for (const o of offers) {
      const list = m.get(o.leagueId) ?? [];
      list.push(o);
      m.set(o.leagueId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        if (a.status === "ready" && b.status !== "ready") return -1;
        if (b.status === "ready" && a.status !== "ready") return 1;
        return b.fee - a.fee;
      });
    }
    return m;
  }, [offers]);

  const rows = byLeague.get(leagueId) ?? [];
  const readyCount = offers.filter((o) => o.status === "ready").length;

  const title =
    kind === "sell" ? "Куда продать" : "Куда отдать в аренду";
  const subtitle = `${playerNameWithAge(player)} · готовы: ${readyCount}`;

  const confirmPending = () => {
    if (!pending || pending.status !== "ready") return;
    const clubId = pending.clubId;
    const fee = pending.fee;
    setPending(null);
    onConfirm(clubId, fee);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.back}>← отмена</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.leagueRow}
          contentContainerStyle={styles.leagueRowContent}
          keyboardShouldPersistTaps="handled"
        >
          {pack.leagues.map((league) => {
            const active = league.id === leagueId;
            const n = (byLeague.get(league.id) ?? []).filter((o) => o.status === "ready").length;
            return (
              <Pressable
                key={league.id}
                onPress={() => setLeagueId(league.id)}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipText, active && styles.chipTextOn]}>
                  {leagueLabel(league)} · {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>В этой лиге нет клубов.</Text>
          ) : (
            rows.map((offer) => {
              const club = clubsById.get(offer.clubId);
              if (!club) return null;
              const ready = offer.status === "ready";
              return (
                <Pressable
                  key={offer.clubId}
                  disabled={!ready}
                  onPress={() => setPending(offer)}
                  style={[styles.row, !ready && styles.rowDim]}
                >
                  <ClubLogo club={club} size={36} />
                  <View style={styles.meta}>
                    <Text style={styles.clubName}>{club.name}</Text>
                    <Text style={styles.clubCity} numberOfLines={2}>
                      {ready
                        ? offer.reason ??
                          (kind === "loan"
                            ? offer.wouldStart
                              ? "Основа"
                              : "Ротация"
                            : "Готовы купить")
                        : offer.reason ?? "Недоступно"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.fee,
                      { color: statusTone(offer.status) },
                    ]}
                  >
                    {ready ? formatMarketValue(offer.fee) : "—"}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {pending ? (
          <View style={styles.confirmOverlay} pointerEvents="box-none">
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>
                {kind === "sell" ? "Продать?" : "Отдать в аренду?"}
              </Text>
              <Text style={styles.confirmBody}>
                {playerNameWithAge(player)}
                {"\n"}→ «{clubsById.get(pending.clubId)?.name ?? pending.clubId}»
                {"\n"}
                {kind === "sell" ? "Вы получите: " : "Плата за аренду: "}
                {formatMarketValue(pending.fee)}
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  style={styles.confirmCancel}
                  onPress={() => setPending(null)}
                >
                  <Text style={styles.confirmCancelText}>Назад</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmOk,
                    kind === "sell" && styles.confirmOkDanger,
                  ]}
                  onPress={confirmPending}
                >
                  <Text style={styles.confirmOkText}>
                    {kind === "sell" ? "Продать" : "Отдать"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function buildStyles() {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: broadcast.bgDeep,
    paddingTop: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  back: {
    color: broadcast.mist,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },
  title: {
    color: broadcast.white,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sub: {
    color: broadcast.mist,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
  },
  leagueRow: { maxHeight: 48, marginTop: 8 },
  leagueRowContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: broadcast.radiusPill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipOn: {
    borderColor: broadcast.accent,
    backgroundColor: "rgba(80, 200, 180, 0.16)",
  },
  chipText: { color: broadcast.mist, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: broadcast.white },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  empty: { color: broadcast.mist, marginTop: 24, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowDim: { opacity: 0.55 },
  meta: { flex: 1, minWidth: 0 },
  clubName: {
    color: broadcast.white,
    fontSize: 15,
    fontWeight: "700",
  },
  clubCity: {
    color: broadcast.mist,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  fee: {
    fontSize: 15,
    fontWeight: "800",
    minWidth: 64,
    textAlign: "right",
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  confirmCard: {
    backgroundColor: broadcast.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  confirmTitle: {
    color: broadcast.white,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  confirmBody: {
    color: broadcast.mist,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
  },
  confirmCancelText: { color: broadcast.mist, fontWeight: "700" },
  confirmOk: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: broadcast.accent,
    alignItems: "center",
  },
  confirmOkDanger: { backgroundColor: "#C45C5C" },
  confirmOkText: { color: "#0A1018", fontWeight: "800" },
});
}

let styles = buildStyles();
registerThemeRebuild(() => {
  styles = buildStyles();
});


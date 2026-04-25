import { useEffect, useMemo, useRef, useState } from "react";
import * as Sharing from "expo-sharing";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { captureRef } from "react-native-view-shot";
import {
  applyFeedFilters,
  buildConfessionShareText,
  type Confession,
  createDefaultFeedFilters,
  type FeedFilter,
  type FeedFilters,
  formatConfessionDate,
  getFeedFilterLabel,
  isPremiumFeedFilter,
  type Mood,
  MAX_CONFESSION_LENGTH,
  MOODS,
  validateConfession
} from "@noface/shared";
import {
  canDeleteMyConfessions,
  deleteMyConfession,
  isSupabaseConfigured,
  loadFeed,
  loadMyConfessions,
  publishConfession,
  resolveAnonymousUserId
} from "./src/confessions";

type ViewMode = "feed" | "write" | "mine";

const PAGE_SIZE = 8;
const FEED_FILTER_OPTIONS: FeedFilter[] = ["all", "mood", "short", "long"];

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [userId, setUserId] = useState("");
  const [feed, setFeed] = useState<Confession[]>([]);
  const [mine, setMine] = useState<Confession[]>([]);
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood | "">("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>(() => createDefaultFeedFilters());
  const [isPremiumPreviewEnabled, setIsPremiumPreviewEnabled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sharingConfession, setSharingConfession] = useState<Confession | null>(null);
  const shareCardRef = useRef<View>(null);

  const isDemoMode = useMemo(() => !isSupabaseConfigured(), []);
  const canDelete = useMemo(() => canDeleteMyConfessions(), []);
  const filteredFeed = useMemo(() => applyFeedFilters(feed, feedFilters), [feed, feedFilters]);

  useEffect(() => {
    let isActive = true;

    async function bootstrap() {
      const anonymousUserId = await resolveAnonymousUserId();
      const [nextFeed, nextMine] = await Promise.all([
        loadFeed(),
        loadMyConfessions(anonymousUserId)
      ]);

      if (!isActive) {
        return;
      }

      setUserId(anonymousUserId);
      setFeed(nextFeed);
      setMine(nextMine);
    }

    bootstrap().catch((error: unknown) => {
      console.error(error);
      if (isActive) {
        setErrorMessage("Unable to load confessions.");
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  async function handlePublish() {
    const validationError = validateConfession(text);

    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage(null);
      return;
    }

    if (!userId) {
      setErrorMessage("Anonymous user id is still loading.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const created = await publishConfession({
        userId,
        text,
        mood: selectedMood || null,
        isPrivate
      });

      setFeed((current) => (created.isPrivate ? current : [created, ...current]));
      setMine((current) => [created, ...current]);
      setVisibleCount((current) => Math.max(PAGE_SIZE, current));
      setText("");
      setSelectedMood("");
      setIsPrivate(false);
      setStatusMessage(created.isPrivate ? "Private confession saved." : "Confession posted.");
      setViewMode("feed");
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to post right now.");
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleShareConfession(confession: Confession) {
    const shareText = buildConfessionShareText(confession);

    try {
      setSharingConfession(confession);
      await waitForNextFrame();

      if (shareCardRef.current && Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shareCardRef, {
          format: "png",
          quality: 1,
          result: "tmpfile"
        });

        await Sharing.shareAsync(uri, {
          dialogTitle: "Share confession card",
          mimeType: "image/png"
        });
        setStatusMessage("Confession card shared.");
        return;
      }

      await Share.share({
        message: shareText,
        title: "Noface confession"
      });
      setStatusMessage("Confession shared.");
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to share right now.");
      setStatusMessage(null);
    }
  }

  function handleDeleteConfession(confession: Confession) {
    if (!canDelete) {
      setErrorMessage("Delete is only available in demo mode right now.");
      return;
    }

    Alert.alert("Delete confession", "Delete this confession from your device?", [
      {
        text: "Cancel",
        style: "cancel"
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void confirmDeleteConfession(confession);
        }
      }
    ]);
  }

  async function confirmDeleteConfession(confession: Confession) {
    try {
      await deleteMyConfession(confession.id, confession.userId);
      setMine((current) => current.filter((item) => item.id !== confession.id));
      setFeed((current) => current.filter((item) => item.id !== confession.id));
      setStatusMessage("Confession deleted.");
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to delete this confession right now.");
      setStatusMessage(null);
    }
  }

  function handleFeedFilterSelect(filter: FeedFilter) {
    if (isPremiumFeedFilter(filter) && !isPremiumPreviewEnabled) {
      return;
    }

    setFeedFilters((current) => ({
      ...current,
      filter
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function handleMoodFilterSelect(mood: Mood | "all") {
    setFeedFilters((current) => ({
      ...current,
      filter: "mood",
      mood
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function handlePremiumPreviewToggle() {
    setIsPremiumPreviewEnabled((current) => {
      const next = !current;

      if (!next) {
        setFeedFilters(createDefaultFeedFilters());
      }

      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function renderCard({ item }: { item: Confession }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{formatConfessionDate(item.createdAt)}</Text>
          <View style={styles.cardBadges}>
            {item.isPrivate ? <Text style={styles.privatePill}>private</Text> : null}
            {item.mood ? <Text style={styles.pill}>{item.mood}</Text> : null}
          </View>
        </View>
        <Text style={styles.cardText}>{item.text}</Text>
        <Pressable onPress={() => void handleShareConfession(item)} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>Share card</Text>
        </Pressable>
      </View>
    );
  }

  const visibleFeed = filteredFeed.slice(0, visibleCount);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>anonymous daily confession app</Text>
          <Text style={styles.title}>Noface</Text>
          <Text style={styles.subtitle}>
            A private release valve for short confessions, with no identity and no social graph.
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Mode</Text>
              <Text style={styles.metricValue}>{isDemoMode ? "Demo" : "Supabase"}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Feed</Text>
              <Text style={styles.metricValue}>{filteredFeed.length}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Mine</Text>
              <Text style={styles.metricValue}>{mine.length}</Text>
            </View>
          </View>
          <Text style={styles.modeBanner}>
            {isDemoMode
              ? "Demo mode is active until EXPO_PUBLIC_SUPABASE_* values are configured."
              : "Live mode is connected to Supabase."}
          </Text>
          <Text style={styles.userId}>Local id: {userId ? `${userId.slice(0, 8)}...` : "loading"}</Text>
        </View>

        <View style={styles.tabs}>
          {[
            { label: "Feed", value: "feed" },
            { label: "Write", value: "write" },
            { label: "Mine", value: "mine" }
          ].map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => setViewMode(tab.value as ViewMode)}
              style={[styles.tab, viewMode === tab.value ? styles.activeTab : null]}
            >
              <Text style={viewMode === tab.value ? styles.activeTabText : styles.tabText}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {viewMode === "feed" ? (
          <View style={styles.feedPane}>
            <View style={styles.feedHeader}>
              <View style={styles.feedHeaderCopy}>
                <Text style={styles.sectionTitle}>Today&apos;s confessions</Text>
                <Text style={styles.sectionSubtitle}>
                  Public feed only, with premium filters for mood and reading length.
                </Text>
              </View>
              <Pressable onPress={() => setViewMode("write")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Write now</Text>
              </Pressable>
            </View>

            <View style={styles.filterPanel}>
              <Text style={styles.filterEyebrow}>premium filters</Text>
              <Text style={styles.filterTitle}>Shape the public feed</Text>
              <Text style={styles.filterCopy}>
                Refine by mood or reading length. Private confessions remain excluded.
              </Text>
              <Pressable onPress={handlePremiumPreviewToggle} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>
                  {isPremiumPreviewEnabled ? "Lock preview" : "Unlock premium preview"}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroller}
            >
              {FEED_FILTER_OPTIONS.map((filter) => {
                const isDisabled = isPremiumFeedFilter(filter) && !isPremiumPreviewEnabled;

                return (
                  <Pressable
                    key={filter}
                    disabled={isDisabled}
                    onPress={() => handleFeedFilterSelect(filter)}
                    style={[
                      styles.filterChip,
                      feedFilters.filter === filter ? styles.activeFilterChip : null,
                      isDisabled ? styles.disabledFilterChip : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        feedFilters.filter === filter ? styles.activeFilterChipText : null
                      ]}
                    >
                      {getFeedFilterLabel(filter)}
                      {isPremiumFeedFilter(filter) ? " Premium" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {feedFilters.filter === "mood" && isPremiumPreviewEnabled ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroller}
              >
                <Pressable
                  onPress={() => handleMoodFilterSelect("all")}
                  style={[
                    styles.filterChip,
                    feedFilters.mood === "all" ? styles.activeFilterChip : null
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      feedFilters.mood === "all" ? styles.activeFilterChipText : null
                    ]}
                  >
                    All moods
                  </Text>
                </Pressable>
                {MOODS.map((mood) => (
                  <Pressable
                    key={mood}
                    onPress={() => handleMoodFilterSelect(mood)}
                    style={[
                      styles.filterChip,
                      feedFilters.mood === mood ? styles.activeFilterChip : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        feedFilters.mood === mood ? styles.activeFilterChipText : null
                      ]}
                    >
                      {mood}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.filterNote}>
              {isPremiumPreviewEnabled
                ? `Preview unlocked. Currently showing ${getFeedFilterLabel(feedFilters.filter).toLowerCase()}.`
                : "Premium filters stay locked until you unlock the local preview on this device."}
            </Text>

            <FlatList
              contentContainerStyle={styles.listContent}
              data={visibleFeed}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {filteredFeed.length === 0 && feed.length > 0
                      ? "No public confessions match this filter yet."
                      : "No confessions yet. Write the first one."}
                  </Text>
                </View>
              }
              onEndReached={() => {
                setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredFeed.length));
              }}
              onEndReachedThreshold={0.5}
              renderItem={renderCard}
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : null}

        {viewMode === "write" ? (
          <ScrollView contentContainerStyle={styles.composePane} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Write anonymously</Text>
            <Text style={styles.sectionSubtitle}>
              Up to {MAX_CONFESSION_LENGTH} characters with an optional mood tag.
            </Text>

            <TextInput
              maxLength={MAX_CONFESSION_LENGTH}
              multiline
              onChangeText={setText}
              placeholder="Say the thing you would never attach to your real name."
              placeholderTextColor="#8f8a82"
              style={styles.textArea}
              textAlignVertical="top"
              value={text}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moodScroller}>
              <Pressable
                onPress={() => setSelectedMood("")}
                style={[styles.moodChip, !selectedMood ? styles.selectedMoodChip : null]}
              >
                <Text style={!selectedMood ? styles.selectedMoodText : styles.moodChipText}>none</Text>
              </Pressable>
              {MOODS.map((mood) => (
                <Pressable
                  key={mood}
                  onPress={() => setSelectedMood(mood)}
                  style={[styles.moodChip, selectedMood === mood ? styles.selectedMoodChip : null]}
                >
                  <Text style={selectedMood === mood ? styles.selectedMoodText : styles.moodChipText}>
                    {mood}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.privateRow}>
              <View style={styles.privateCopy}>
                <Text style={styles.privateLabel}>Private confession</Text>
                <Text style={styles.privateHint}>
                  Keep this out of the public feed and store it only in My Confessions.
                </Text>
              </View>
              <Switch onValueChange={setIsPrivate} value={isPrivate} />
            </View>

            <Text style={styles.helperText}>{text.trim().length}/{MAX_CONFESSION_LENGTH} characters</Text>
            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable onPress={handlePublish} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{isSubmitting ? "Posting..." : "Post confession"}</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {viewMode === "mine" ? (
          <View style={styles.minePane}>
            {!canDelete ? (
              <Text style={styles.modeBanner}>
                Delete stays disabled in live mode until trusted identity exists.
              </Text>
            ) : null}
            <FlatList
              contentContainerStyle={styles.listContent}
              data={mine}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Nothing posted yet from this device.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardMeta}>
                    <Text style={styles.metaText}>{formatConfessionDate(item.createdAt)}</Text>
                    {item.mood ? <Text style={styles.pill}>{item.mood}</Text> : null}
                  </View>
                  <Text style={styles.cardText}>{item.text}</Text>
                  <View style={styles.cardActionRow}>
                    <Pressable onPress={() => void handleShareConfession(item)} style={styles.shareButton}>
                      <Text style={styles.shareButtonText}>Share card</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteConfession(item)} style={styles.deleteButton}>
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : null}

        <View pointerEvents="none" style={styles.hiddenShareCanvas}>
          <View collapsable={false} ref={shareCardRef} style={styles.shareCardCanvas}>
            <Text style={styles.shareCardEyebrow}>NOFACE</Text>
            <Text style={styles.shareCardTitle}>Anonymous confession</Text>
            <Text style={styles.shareCardDate}>
              {sharingConfession ? formatConfessionDate(sharingConfession.createdAt) : ""}
            </Text>
            <Text style={styles.shareCardBody}>{sharingConfession?.text ?? ""}</Text>
            {sharingConfession?.mood ? <Text style={styles.shareCardMood}>{sharingConfession.mood}</Text> : null}
            <Text style={styles.shareCardFooter}>Write freely. Leave no face behind.</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fcf6ea"
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#fcf6ea"
  },
  hero: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#fff7ed",
    marginTop: 8,
    shadowColor: "#17202a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2
  },
  eyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#6b6d76",
    marginBottom: 10
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    color: "#17202a"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 24,
    color: "#566573"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.8)"
  },
  metricLabel: {
    fontSize: 12,
    color: "#566573"
  },
  metricValue: {
    marginTop: 4,
    fontSize: 19,
    fontWeight: "600",
    color: "#17202a"
  },
  modeBanner: {
    marginTop: 16,
    color: "#566573",
    fontSize: 13
  },
  userId: {
    marginTop: 8,
    color: "#8f4b2d",
    fontSize: 13
  },
  tabs: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 16
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)"
  },
  activeTab: {
    backgroundColor: "#17202a"
  },
  tabText: {
    color: "#17202a",
    fontWeight: "600"
  },
  activeTabText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  listContent: {
    paddingBottom: 32,
    gap: 12
  },
  feedPane: {
    flex: 1
  },
  feedHeader: {
    marginBottom: 14,
    gap: 12
  },
  feedHeaderCopy: {
    gap: 8
  },
  minePane: {
    flex: 1
  },
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)"
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12
  },
  cardBadges: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  metaText: {
    color: "#6b6d76",
    fontSize: 12
  },
  pill: {
    color: "#8f4b2d",
    backgroundColor: "#f7d9c5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    textTransform: "capitalize"
  },
  privatePill: {
    color: "#17202a",
    backgroundColor: "rgba(23,32,42,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    textTransform: "lowercase"
  },
  cardText: {
    color: "#17202a",
    fontSize: 15,
    lineHeight: 24
  },
  emptyState: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(23,32,42,0.12)",
    borderStyle: "dashed"
  },
  emptyText: {
    color: "#566573",
    textAlign: "center"
  },
  composePane: {
    paddingBottom: 32
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#17202a"
  },
  sectionSubtitle: {
    marginTop: 8,
    marginBottom: 14,
    color: "#566573",
    lineHeight: 22
  },
  filterPanel: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.84)",
    gap: 8
  },
  filterEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#6b6d76"
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#17202a"
  },
  filterCopy: {
    color: "#566573",
    lineHeight: 22
  },
  filterScroller: {
    marginBottom: 10
  },
  filterChip: {
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  activeFilterChip: {
    backgroundColor: "#17202a"
  },
  disabledFilterChip: {
    opacity: 0.45
  },
  filterChipText: {
    color: "#17202a",
    fontWeight: "600"
  },
  activeFilterChipText: {
    color: "#ffffff"
  },
  filterNote: {
    marginBottom: 12,
    color: "#566573",
    fontSize: 13,
    lineHeight: 20
  },
  textArea: {
    minHeight: 180,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    color: "#17202a",
    fontSize: 16,
    lineHeight: 24
  },
  moodScroller: {
    marginTop: 14,
    marginBottom: 12
  },
  privateRow: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  privateCopy: {
    flex: 1
  },
  privateLabel: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "600"
  },
  privateHint: {
    marginTop: 4,
    color: "#566573",
    lineHeight: 20
  },
  moodChip: {
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  selectedMoodChip: {
    backgroundColor: "#17202a"
  },
  moodChipText: {
    color: "#17202a",
    textTransform: "capitalize"
  },
  selectedMoodText: {
    color: "#ffffff",
    textTransform: "capitalize"
  },
  helperText: {
    color: "#566573"
  },
  statusText: {
    marginTop: 8,
    color: "#566573"
  },
  errorText: {
    marginTop: 8,
    color: "#b03a2e"
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#17202a",
    alignItems: "center"
  },
  secondaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600"
  },
  secondaryButtonText: {
    color: "#17202a",
    fontWeight: "600"
  },
  shareButton: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#17202a"
  },
  shareButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  cardActionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14
  },
  deleteButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#9f3b2f"
  },
  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  hiddenShareCanvas: {
    position: "absolute",
    left: -9999,
    top: -9999,
    opacity: 0
  },
  shareCardCanvas: {
    width: 1080,
    minHeight: 1080,
    padding: 56,
    backgroundColor: "#fcf6ea",
    borderRadius: 64,
    justifyContent: "space-between"
  },
  shareCardEyebrow: {
    fontSize: 26,
    letterSpacing: 8,
    color: "#566573"
  },
  shareCardTitle: {
    marginTop: 26,
    fontSize: 68,
    fontWeight: "700",
    color: "#17202a"
  },
  shareCardDate: {
    marginTop: 18,
    fontSize: 24,
    color: "#566573"
  },
  shareCardBody: {
    marginTop: 84,
    fontSize: 44,
    lineHeight: 64,
    color: "#17202a"
  },
  shareCardMood: {
    marginTop: 36,
    fontSize: 30,
    color: "#8f4b2d",
    textTransform: "capitalize"
  },
  shareCardFooter: {
    marginTop: 120,
    fontSize: 24,
    color: "#566573"
  }
});
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sharing from "expo-sharing";
import { useFonts, SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
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
  FEED_PAGE_FETCH_SIZE,
  type FeedFilter,
  type FeedFilters,
  formatConfessionDate,
  getFeedFilterLabel,
  isPremiumFeedFilter,
  type Mood,
  MAX_CONFESSION_LENGTH,
  MOOD_EMOJI,
  MOODS,
  validateConfession
} from "@noface/shared";
import {
  canDeleteMyConfessions,
  deleteMyConfession,
  loadFeedPage,
  loadMyConfessions,
  publishConfession,
  resolveAnonymousUserId
} from "./src/confessions";

type ViewMode = "feed" | "write" | "mine";

const PAGE_SIZE = 8;
const FEED_FILTER_OPTIONS: FeedFilter[] = ["all", "mood", "short", "long"];

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return <AppContent />;
}

function AppContent() {
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
  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [isLoadingFeedPage, setIsLoadingFeedPage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sharingConfession, setSharingConfession] = useState<Confession | null>(null);
  const shareCardRef = useRef<View>(null);

  const canDelete = useMemo(() => canDeleteMyConfessions(), []);
  const filteredFeed = useMemo(() => applyFeedFilters(feed, feedFilters), [feed, feedFilters]);

  const loadNextFeedPage = useCallback(async () => {
    if (isLoadingFeedPage || !hasMoreFeed) {
      return;
    }

    try {
      setIsLoadingFeedPage(true);

      const nextPage = await loadFeedPage({ offset: feedOffset });

      setFeed((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const uniqueNextPage = nextPage.filter((item) => !existingIds.has(item.id));

        return [...current, ...uniqueNextPage];
      });
      setFeedOffset((current) => current + nextPage.length);
      setHasMoreFeed(nextPage.length === FEED_PAGE_FETCH_SIZE);
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to load more confessions.");
      setStatusMessage(null);
    } finally {
      setIsLoadingFeedPage(false);
    }
  }, [isLoadingFeedPage, hasMoreFeed, feedOffset]);

  useEffect(() => {
    let isActive = true;

    async function bootstrap() {
      const anonymousUserId = await resolveAnonymousUserId();
      const [nextFeed, nextMine] = await Promise.all([
        loadFeedPage(),
        loadMyConfessions(anonymousUserId)
      ]);

      if (!isActive) {
        return;
      }

      setUserId(anonymousUserId);
      setFeed(nextFeed);
      setFeedOffset(nextFeed.length);
      setHasMoreFeed(nextFeed.length === FEED_PAGE_FETCH_SIZE);
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

  useEffect(() => {
    if (viewMode !== "feed") {
      return;
    }

    if (!hasMoreFeed || isLoadingFeedPage) {
      return;
    }

    if (visibleCount < filteredFeed.length || filteredFeed.length >= PAGE_SIZE) {
      return;
    }

    void loadNextFeedPage();
  }, [filteredFeed.length, hasMoreFeed, isLoadingFeedPage, viewMode, visibleCount]);

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
      if (!created.isPrivate) {
        setFeedOffset((current) => current + 1);
      }
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
      await waitForShareCardRender();

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
    } finally {
      setSharingConfession(null);
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
            {item.isPrivate ? <Text style={styles.privatePill}>🔒 private</Text> : null}
            {item.mood ? <Text style={styles.pill}>{MOOD_EMOJI[item.mood]} {item.mood}</Text> : null}
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
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>// anonymous confession app</Text>
          <Text style={styles.title}>Noface</Text>
          <Text style={styles.subtitle}>
            // ghost id. write once. read what strangers carry. no profiles, no score.
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// confessions</Text>
              <Text style={styles.metricValue}>{hasMoreFeed ? `${filteredFeed.length}+` : filteredFeed.length}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// mine</Text>
              <Text style={styles.metricValue}>{mine.length}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// ghost id</Text>
              <Text style={styles.metricValue}>{userId ? userId.slice(0, 8) : "···"}</Text>
            </View>
          </View>
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
                <Text style={styles.sectionTitle}>// confessions</Text>
                <Text style={styles.sectionSubtitle}>
                  anonymous. infinite. text and mood only.
                </Text>
              </View>
              <Pressable onPress={() => setViewMode("write")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Write now</Text>
              </Pressable>
            </View>

            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

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
                      {MOOD_EMOJI[mood]} {mood}
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
              style={styles.flex1}
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
                if (visibleCount < filteredFeed.length) {
                  setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredFeed.length));
                  return;
                }

                void loadNextFeedPage();
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                isLoadingFeedPage ? <Text style={styles.filterNote}>// loading more...</Text> : null
              }
              renderItem={renderCard}
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : null}

        {viewMode === "write" ? (
          <ScrollView style={styles.flex1} contentContainerStyle={styles.composePane} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>// write</Text>
            <Text style={styles.sectionSubtitle}>
              up to {MAX_CONFESSION_LENGTH} chars. nothing but your ghost id.
            </Text>

            <TextInput
              maxLength={MAX_CONFESSION_LENGTH}
              multiline
              onChangeText={setText}
              placeholder="// say the thing you'd never post under your real name."
              placeholderTextColor="#4a4a6a"
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
                    {MOOD_EMOJI[mood]} {mood}
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
                // delete disabled in live mode until trusted identity exists.
              </Text>
            ) : null}
            <FlatList
              style={styles.flex1}
              contentContainerStyle={styles.listContent}
              data={mine}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>// nothing posted yet from this ghost id.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardMeta}>
                    <Text style={styles.metaText}>{formatConfessionDate(item.createdAt)}</Text>
                    <View style={styles.cardBadges}>
                      {item.isPrivate ? <Text style={styles.privatePill}>🔒 private</Text> : null}
                      {item.mood ? <Text style={styles.pill}>{MOOD_EMOJI[item.mood]} {item.mood}</Text> : null}
                    </View>
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

function waitForShareCardRender(): Promise<void> {
  return new Promise((resolve) => {
    // Two rAF calls: first fires before paint, second fires after first paint.
    // This ensures the share card has rendered with updated confession data.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#07070f"
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#07070f"
  },
  hero: {
    padding: 20,
    borderRadius: 6,
    backgroundColor: "#0d0d1a",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    borderLeftWidth: 2,
    borderLeftColor: "#9d4edd",
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#9d4edd",
    marginBottom: 10
  },
  title: {
    fontSize: 42,
    fontFamily: "SpaceMono_700Bold",
    color: "#e0e0f0",
    letterSpacing: -1
  },
  subtitle: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 20,
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16
  },
  metricCard: {
    flex: 1,
    padding: 10,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    borderLeftWidth: 2,
    borderLeftColor: "#9d4edd"
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: "SpaceMono_400Regular",
    color: "#4a4a6a",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  metricValue: {
    marginTop: 4,
    fontSize: 17,
    fontFamily: "SpaceMono_700Bold",
    color: "#e0e0f0"
  },
  modeBanner: {
    marginTop: 12,
    color: "#4a4a6a",
    fontSize: 11,
    fontFamily: "SpaceMono_400Regular"
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 14
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 3,
    backgroundColor: "#0d0d1a",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  activeTab: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd"
  },
  tabText: {
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  activeTabText: {
    color: "#ffffff",
    fontFamily: "SpaceMono_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  listContent: {
    paddingBottom: 32,
    gap: 8
  },
  feedPane: {
    flex: 1
  },
  feedHeader: {
    marginBottom: 12,
    gap: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  feedHeaderCopy: {
    flex: 1,
    gap: 4
  },
  minePane: {
    flex: 1
  },
  card: {
    padding: 14,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    borderLeftWidth: 3,
    borderLeftColor: "#4a4a6a"
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 8
  },
  cardBadges: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  metaText: {
    color: "#4a4a6a",
    fontSize: 10,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  pill: {
    color: "#9d4edd",
    backgroundColor: "rgba(157,78,221,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    overflow: "hidden",
    fontSize: 10,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase"
  },
  privatePill: {
    color: "#ff3366",
    backgroundColor: "rgba(255,51,102,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    overflow: "hidden",
    fontSize: 10,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "lowercase"
  },
  cardText: {
    color: "#e0e0f0",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 26
  },
  emptyState: {
    padding: 20,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    borderStyle: "dashed"
  },
  emptyText: {
    color: "#4a4a6a",
    textAlign: "center",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12
  },
  composePane: {
    paddingBottom: 32
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "SpaceMono_700Bold",
    color: "#9d4edd",
    textTransform: "uppercase",
    letterSpacing: 1.5
  },
  sectionSubtitle: {
    marginTop: 6,
    marginBottom: 12,
    color: "#4a4a6a",
    lineHeight: 20,
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12
  },
  filterPanel: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    gap: 6
  },
  filterEyebrow: {
    fontSize: 9,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#9d4edd"
  },
  filterTitle: {
    fontSize: 16,
    fontFamily: "SpaceMono_700Bold",
    color: "#e0e0f0"
  },
  filterCopy: {
    color: "#4a4a6a",
    lineHeight: 20,
    fontSize: 12
  },
  filterScroller: {
    marginBottom: 8
  },
  filterChip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  activeFilterChip: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd"
  },
  disabledFilterChip: {
    opacity: 0.28
  },
  filterChipText: {
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11,
    textTransform: "uppercase"
  },
  activeFilterChipText: {
    color: "#ffffff"
  },
  filterNote: {
    marginBottom: 10,
    color: "#4a4a6a",
    fontSize: 11,
    lineHeight: 18,
    fontFamily: "SpaceMono_400Regular"
  },
  textArea: {
    minHeight: 180,
    padding: 16,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    color: "#e0e0f0",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 24
  },
  moodScroller: {
    marginTop: 12,
    marginBottom: 10
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
    color: "#e0e0f0",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14
  },
  privateHint: {
    marginTop: 4,
    color: "#4a4a6a",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    fontSize: 12
  },
  moodChip: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  selectedMoodChip: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd"
  },
  moodChipText: {
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12,
    textTransform: "capitalize"
  },
  selectedMoodText: {
    color: "#ffffff",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12,
    textTransform: "capitalize"
  },
  helperText: {
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  statusText: {
    marginTop: 8,
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  errorText: {
    marginTop: 8,
    color: "#ff3366",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 3,
    backgroundColor: "#9d4edd",
    alignItems: "center"
  },
  secondaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "SpaceMono_700Bold"
  },
  secondaryButtonText: {
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  shareButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#111122",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  shareButtonText: {
    color: "#9d4edd",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  cardActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12
  },
  deleteButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "rgba(255,51,102,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,51,102,0.22)"
  },
  deleteButtonText: {
    color: "#ff3366",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
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
    backgroundColor: "#07070f",
    borderRadius: 0,
    justifyContent: "space-between"
  },
  shareCardEyebrow: {
    fontSize: 22,
    letterSpacing: 10,
    color: "#9d4edd",
    fontFamily: "SpaceMono_400Regular"
  },
  shareCardTitle: {
    marginTop: 26,
    fontSize: 60,
    fontFamily: "SpaceMono_700Bold",
    color: "#e0e0f0"
  },
  shareCardDate: {
    marginTop: 18,
    fontSize: 22,
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular"
  },
  shareCardBody: {
    marginTop: 84,
    fontSize: 42,
    lineHeight: 60,
    color: "#e0e0f0"
  },
  shareCardMood: {
    marginTop: 36,
    fontSize: 28,
    color: "#9d4edd",
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase"
  },
  shareCardFooter: {
    marginTop: 120,
    fontSize: 22,
    color: "#4a4a6a",
    fontFamily: "SpaceMono_400Regular"
  }
});
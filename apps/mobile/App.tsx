import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sharing from "expo-sharing";
import { useFonts, SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import {
  Alert,
  FlatList,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  type TextLayoutEventData,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import {
  applyFeedFilters,
  buildConfessionShareText,
  type Confession,
  createSecretIdentity,
  createDefaultFeedFilters,
  FEED_PAGE_FETCH_SIZE,
  type FeedFilter,
  type FeedFilters,
  formatSecretId,
  formatConfessionDate,
  getConfessionModerationMessage,
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
import {
  MOBILE_SCROLL_PROPS,
  MOBILE_TOUCH_TARGETS,
  MOBILE_WRITE_SCROLL_PROPS
} from "./src/ui-contract";

type ViewMode = "activity" | "feed" | "write" | "mine";

const PAGE_SIZE = 8;
const CONFESSION_PREVIEW_LINES = 5;
const FEED_FILTER_OPTIONS: FeedFilter[] = ["recommended", "all", "mood", "short", "long"];

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

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export function AppContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("activity");
  const [userId, setUserId] = useState("");
  const [feed, setFeed] = useState<Confession[]>([]);
  const [mine, setMine] = useState<Confession[]>([]);
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood | "">("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>(() => createDefaultFeedFilters());
  const [isPremiumPreviewEnabled, setIsPremiumPreviewEnabled] = useState(true);
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
  const filteredFeed = useMemo(() => {
    return applyFeedFilters(feed, feedFilters, {
      viewerUserId: userId,
      myConfessions: mine
    });
  }, [feed, feedFilters, mine, userId]);
  const identity = useMemo(() => {
    if (!userId) {
      return null;
    }

    return createSecretIdentity(userId);
  }, [userId]);
  const dominantMood = useMemo(() => {
    const moodCounts = new Map<Mood, number>();

    for (const confession of feed) {
      if (!confession.mood) {
        continue;
      }

      moodCounts.set(confession.mood, (moodCounts.get(confession.mood) ?? 0) + 1);
    }

    let currentMood: Mood | null = null;
    let currentCount = -1;

    for (const [mood, count] of moodCounts) {
      if (count > currentCount) {
        currentMood = mood;
        currentCount = count;
      }
    }

    return currentMood;
  }, [feed]);
  const composerModerationMessage = useMemo(() => getConfessionModerationMessage(text), [text]);

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
        setFeedFilters({ filter: "all", mood: "all" });
      }

      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function openRecommendedFeed() {
    setIsPremiumPreviewEnabled(true);
    setFeedFilters(createDefaultFeedFilters());
    setVisibleCount(PAGE_SIZE);
    setViewMode("feed");
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
        <ExpandableConfessionText text={item.text} />
        <Pressable onPress={() => void handleShareConfession(item)} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>Share card</Text>
        </Pressable>
      </View>
    );
  }

  const visibleFeed = filteredFeed.slice(0, visibleCount);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>// entry node</Text>
          <Text style={styles.title}>Noface</Text>
          <Text style={styles.subtitle}>
            // blackout feed. assigned alias. one secret id. real words left in the dark.
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// public signal</Text>
              <Text style={styles.metricValue}>{hasMoreFeed ? `${filteredFeed.length}+` : filteredFeed.length}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// assigned alias</Text>
              <Text style={styles.metricValue} numberOfLines={1}>{identity?.username ?? "···"}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>// secret id</Text>
              <Text style={styles.metricValue}>{userId ? userId.slice(0, 8) : "···"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          {[
            { label: "Activity", value: "activity" },
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

        {viewMode === "activity" ? (
          <ScrollView
            alwaysBounceVertical={MOBILE_WRITE_SCROLL_PROPS.alwaysBounceVertical}
            bounces={MOBILE_WRITE_SCROLL_PROPS.bounces}
            contentContainerStyle={styles.activityPane}
            keyboardShouldPersistTaps={MOBILE_WRITE_SCROLL_PROPS.keyboardShouldPersistTaps}
            showsVerticalScrollIndicator={MOBILE_WRITE_SCROLL_PROPS.showsVerticalScrollIndicator}
            style={styles.flex1}
          >
            <View style={styles.activityCard}>
              <Text style={styles.filterEyebrow}>assigned automatically</Text>
              <Text style={styles.activityTitle}>{identity?.username ?? "booting-alias"}</Text>
              <Text style={styles.activityCopy}>
                Your public alias is derived from the secret id below. Share the alias. Keep the full id private.
              </Text>
              <View style={styles.secretIdCard}>
                <Text style={styles.metricLabel}>// secret id</Text>
                <Text selectable style={styles.secretIdValue}>{identity ? formatSecretId(identity.secretId) : "···"}</Text>
              </View>
              <View style={styles.activityActionRow}>
                <Pressable
                  onPress={openRecommendedFeed}
                  style={[styles.primaryButton, styles.activityActionButton, styles.activityPrimaryButton]}
                >
                  <Text numberOfLines={1} style={[styles.primaryButtonText, styles.activityActionButtonText]}>
                    Enter feed
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode("write")}
                  style={[styles.secondaryButton, styles.activityActionButton, styles.activitySecondaryButton]}
                >
                  <Text numberOfLines={1} style={[styles.secondaryButtonText, styles.activityActionButtonText]}>
                    Write now
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.activityCard}>
              <Text style={styles.filterEyebrow}>network pulse</Text>
              <Text style={styles.activityTitle}>{dominantMood ? `${MOOD_EMOJI[dominantMood]} ${dominantMood}` : "No signal yet"}</Text>
              <Text style={styles.activityCopy}>
                The feed now prioritizes confessions that match your writing pattern, dominant mood, and the freshest public traffic.
              </Text>
              <View style={styles.activityStatsRow}>
                <View style={styles.activityStatCard}>
                  <Text style={styles.metricLabel}>// public feed</Text>
                  <Text style={styles.metricValue}>{filteredFeed.length}</Text>
                </View>
                <View style={styles.activityStatCard}>
                  <Text style={styles.metricLabel}>// private archive</Text>
                  <Text style={styles.metricValue}>{mine.filter((confession) => confession.isPrivate).length}</Text>
                </View>
              </View>
            </View>

            <View style={styles.activityCard}>
              <Text style={styles.filterEyebrow}>recent traffic</Text>
              <Text style={styles.activityTitle}>Latest from the dark</Text>
              {feed.slice(0, 3).map((confession) => (
                <View key={confession.id} style={styles.activityRow}>
                  <Text style={styles.metricLabel}>
                    {confession.mood ? `${MOOD_EMOJI[confession.mood]} ${confession.mood}` : "raw"}
                  </Text>
                  <Text style={styles.activityRowText}>{confession.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

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
                Start with the recommendation engine, then refine by mood or reading length. Private confessions remain excluded.
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
              alwaysBounceVertical={MOBILE_SCROLL_PROPS.alwaysBounceVertical}
              bounces={MOBILE_SCROLL_PROPS.bounces}
              contentInsetAdjustmentBehavior={MOBILE_SCROLL_PROPS.contentInsetAdjustmentBehavior}
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
              showsVerticalScrollIndicator={MOBILE_SCROLL_PROPS.showsVerticalScrollIndicator}
            />
          </View>
        ) : null}

        {viewMode === "write" ? (
          <ScrollView
            alwaysBounceVertical={MOBILE_WRITE_SCROLL_PROPS.alwaysBounceVertical}
            bounces={MOBILE_WRITE_SCROLL_PROPS.bounces}
            contentContainerStyle={styles.composePane}
            keyboardShouldPersistTaps={MOBILE_WRITE_SCROLL_PROPS.keyboardShouldPersistTaps}
            showsVerticalScrollIndicator={MOBILE_WRITE_SCROLL_PROPS.showsVerticalScrollIndicator}
            style={styles.flex1}
          >
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
            {composerModerationMessage ? (
              <Text style={styles.errorText}>{composerModerationMessage}</Text>
            ) : (
              <Text style={styles.helperText}>Links, handle drops, and promo phrases are filtered before publish.</Text>
            )}
            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            {errorMessage && errorMessage !== composerModerationMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            <Pressable
              disabled={isSubmitting || Boolean(composerModerationMessage)}
              onPress={handlePublish}
              style={[
                styles.primaryButton,
                isSubmitting || composerModerationMessage ? styles.primaryButtonDisabled : null
              ]}
            >
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
              alwaysBounceVertical={MOBILE_SCROLL_PROPS.alwaysBounceVertical}
              bounces={MOBILE_SCROLL_PROPS.bounces}
              contentInsetAdjustmentBehavior={MOBILE_SCROLL_PROPS.contentInsetAdjustmentBehavior}
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
                  <ExpandableConfessionText text={item.text} />
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
              showsVerticalScrollIndicator={MOBILE_SCROLL_PROPS.showsVerticalScrollIndicator}
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

function ExpandableConfessionText({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
    setCanExpand(false);
  }, [text]);

  const handleMeasureLayout = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const nextCanExpand = event.nativeEvent.lines.length > CONFESSION_PREVIEW_LINES;

    setCanExpand((current) => (current === nextCanExpand ? current : nextCanExpand));
  }, []);

  return (
    <View style={styles.expandableTextBlock}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={isExpanded ? undefined : CONFESSION_PREVIEW_LINES}
        style={styles.cardText}
      >
        {text}
      </Text>
      <Text
        accessible={false}
        onTextLayout={handleMeasureLayout}
        style={styles.cardTextMeasureProbe}
      >
        {text}
      </Text>
      {canExpand ? (
        <Pressable onPress={() => setIsExpanded((current) => !current)} style={styles.expandToggle}>
          <Text style={styles.expandToggleText}>{isExpanded ? "Show less" : "Show more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  flex1: {
    flex: 1
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#000000"
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#000000",
    minWidth: 0
  },
  hero: {
    padding: 20,
    borderRadius: 6,
    backgroundColor: "#050505",
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
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 140,
    padding: 10,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
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
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 14
  },
  tab: {
    flexGrow: 1,
    flexBasis: "48%",
    minWidth: 132,
    minHeight: MOBILE_TOUCH_TARGETS.tabMinHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 3,
    backgroundColor: "#0d0d1a",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  activeTab: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd",
    shadowColor: "#9d4edd",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  tabText: {
    color: MOBILE_TOUCH_TARGETS.inactiveTextColor,
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
    flexGrow: 1,
    paddingBottom: 32,
    gap: 8
  },
  feedPane: {
    flex: 1,
    minHeight: 0
  },
  feedHeader: {
    marginBottom: 12,
    gap: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  feedHeaderCopy: {
    flex: 1,
    gap: 4
  },
  minePane: {
    flex: 1,
    minHeight: 0
  },
  activityPane: {
    paddingBottom: 32,
    gap: 12
  },
  activityCard: {
    padding: 16,
    borderRadius: 4,
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    gap: 10
  },
  activityTitle: {
    color: "#e0e0f0",
    fontFamily: "SpaceMono_700Bold",
    fontSize: 20
  },
  activityCopy: {
    color: "#9797b4",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12,
    lineHeight: 20
  },
  secretIdCard: {
    padding: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    backgroundColor: "#000000",
    gap: 6
  },
  secretIdValue: {
    color: "#e0e0f0",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12,
    lineHeight: 21
  },
  activityActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
    alignItems: "stretch"
  },
  activityActionButton: {
    flexGrow: 1,
    flexBasis: "48%",
    minWidth: 0,
    minHeight: MOBILE_TOUCH_TARGETS.actionButtonMinHeight + 6,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "stretch"
  },
  activityActionButtonText: {
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  activityPrimaryButton: {
    shadowColor: "#9d4edd",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  activitySecondaryButton: {
    backgroundColor: "#090912",
    borderColor: "rgba(157,78,221,0.26)"
  },
  activityStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  activityStatCard: {
    flexGrow: 1,
    flexBasis: "48%",
    minWidth: 140,
    padding: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    backgroundColor: "rgba(255,255,255,0.01)"
  },
  activityRow: {
    padding: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    backgroundColor: "rgba(255,255,255,0.01)",
    gap: 6
  },
  activityRowText: {
    color: "#e0e0f0",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 22
  },
  card: {
    padding: 14,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    borderLeftWidth: 3,
    borderLeftColor: "#4a4a6a"
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8
  },
  cardBadges: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-start",
    maxWidth: "100%"
  },
  metaText: {
    color: "#4a4a6a",
    fontSize: 10,
    fontFamily: "SpaceMono_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 1
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
    textTransform: "uppercase",
    maxWidth: "100%"
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
    textTransform: "lowercase",
    maxWidth: "100%"
  },
  cardText: {
    color: "#e0e0f0",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 26
  },
  expandableTextBlock: {
    gap: 8,
    position: "relative"
  },
  cardTextMeasureProbe: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
    pointerEvents: "none"
  },
  expandToggle: {
    alignSelf: "flex-start"
  },
  expandToggleText: {
    color: "#9d4edd",
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11,
    textTransform: "uppercase"
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
    flexGrow: 1,
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
    backgroundColor: "#0b0b0b",
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
    minHeight: MOBILE_TOUCH_TARGETS.chipMinHeight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)",
    maxWidth: 220
  },
  activeFilterChip: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd"
  },
  disabledFilterChip: {
    opacity: 0.28
  },
  filterChipText: {
    color: MOBILE_TOUCH_TARGETS.inactiveTextColor,
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11,
    textTransform: "uppercase"
  },
  activeFilterChipText: {
    color: "#ffffff",
    fontFamily: "SpaceMono_700Bold"
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
    backgroundColor: "#0b0b0b",
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
    minHeight: MOBILE_TOUCH_TARGETS.chipMinHeight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  selectedMoodChip: {
    backgroundColor: "#9d4edd",
    borderColor: "#9d4edd"
  },
  moodChipText: {
    color: MOBILE_TOUCH_TARGETS.inactiveTextColor,
    fontFamily: "SpaceMono_400Regular",
    fontSize: 12,
    textTransform: "capitalize"
  },
  selectedMoodText: {
    color: "#ffffff",
    fontFamily: "SpaceMono_700Bold",
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
  primaryButtonDisabled: {
    opacity: 0.45
  },
  secondaryButton: {
    alignSelf: "flex-start",
    minHeight: MOBILE_TOUCH_TARGETS.actionButtonMinHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "rgba(157,78,221,0.18)"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "SpaceMono_700Bold"
  },
  secondaryButtonText: {
    color: MOBILE_TOUCH_TARGETS.inactiveTextColor,
    fontFamily: "SpaceMono_400Regular",
    fontSize: 11
  },
  shareButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    minHeight: MOBILE_TOUCH_TARGETS.actionButtonMinHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    backgroundColor: "#0b0b0b",
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
    minHeight: MOBILE_TOUCH_TARGETS.actionButtonMinHeight,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#000000",
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
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  type Confession,
  type Mood,
  MAX_CONFESSION_LENGTH,
  MOODS,
  validateConfession
} from "@noface/shared";
import {
  isSupabaseConfigured,
  loadFeed,
  loadMyConfessions,
  publishConfession,
  resolveAnonymousUserId
} from "./src/confessions";

type ViewMode = "feed" | "write" | "mine";

const PAGE_SIZE = 8;

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [userId, setUserId] = useState("");
  const [feed, setFeed] = useState<Confession[]>([]);
  const [mine, setMine] = useState<Confession[]>([]);
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState<Mood | "">("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDemoMode = useMemo(() => !isSupabaseConfigured(), []);

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
        mood: selectedMood || null
      });

      setFeed((current) => [created, ...current]);
      setMine((current) => [created, ...current]);
      setVisibleCount((current) => Math.max(PAGE_SIZE, current));
      setText("");
      setSelectedMood("");
      setStatusMessage("Confession posted.");
      setViewMode("feed");
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to post right now.");
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderCard({ item }: { item: Confession }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
          {item.mood ? <Text style={styles.pill}>{item.mood}</Text> : null}
        </View>
        <Text style={styles.cardText}>{item.text}</Text>
      </View>
    );
  }

  const visibleFeed = feed.slice(0, visibleCount);

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
              <Text style={styles.metricValue}>{feed.length}</Text>
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
          <FlatList
            contentContainerStyle={styles.listContent}
            data={visibleFeed}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No confessions yet. Write the first one.</Text>
              </View>
            }
            onEndReached={() => {
              setVisibleCount((current) => Math.min(current + PAGE_SIZE, feed.length));
            }}
            onEndReachedThreshold={0.5}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
          />
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

            <Text style={styles.helperText}>{text.trim().length}/{MAX_CONFESSION_LENGTH} characters</Text>
            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable onPress={handlePublish} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{isSubmitting ? "Posting..." : "Post confession"}</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {viewMode === "mine" ? (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={mine}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nothing posted yet from this device.</Text>
              </View>
            }
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
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
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600"
  }
});
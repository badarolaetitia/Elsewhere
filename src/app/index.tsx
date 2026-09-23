import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch() {
    const cleanedQuery = searchQuery.trim();

    if (!cleanedQuery) {
      return;
    }

    router.navigate({
      pathname: "/results",
      params: {
        place: cleanedQuery,
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.logo}>ELSEWHERE</Text>

          <Text style={styles.title}>
            Everyone&apos;s going there.
          </Text>

          <Text style={styles.subtitle}>
            Find somewhere better.
          </Text>

          <View style={styles.searchSection}>
            <Text style={styles.question}>
              Where are you thinking of going?
            </Text>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search any place..."
              placeholderTextColor="#8A8A8A"
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />

            <Pressable
              style={[
                styles.searchButton,
                !searchQuery.trim() &&
                  styles.searchButtonDisabled,
              ]}
              onPress={handleSearch}
              disabled={!searchQuery.trim()}
            >
              <Text style={styles.searchButtonText}>
                Find alternatives
              </Text>
            </Pressable>

            <Pressable style={styles.locationButton}>
              <Text style={styles.locationButtonText}>
                📍 Use my current location
              </Text>
            </Pressable>
          </View>

          <View style={styles.mapSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Explore nearby
              </Text>

              <Text style={styles.sectionLink}>
                Map coming soon
              </Text>
            </View>

            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapEmoji}>🗺️</Text>

              <Text style={styles.mapTitle}>
                Discover what&apos;s around you
              </Text>

              <Text style={styles.mapDescription}>
                Elsewhere will show popular places and nearby
                alternatives anywhere in the world.
              </Text>

              <View style={styles.fakeMapPins}>
                <View style={styles.pinGroup}>
                  <View style={styles.viralPin}>
                    <Text style={styles.viralPinText}>
                      🔥
                    </Text>
                  </View>

                  <Text style={styles.pinLabel}>
                    Popular
                  </Text>
                </View>

                <View style={styles.pinGroup}>
                  <View style={styles.matchPin}>
                    <Text style={styles.matchPinText}>
                      94%
                    </Text>
                  </View>

                  <Text style={styles.pinLabel}>
                    Alternative
                  </Text>
                </View>

                <View style={styles.pinGroup}>
                  <View style={styles.matchPin}>
                    <Text style={styles.matchPinText}>
                      89%
                    </Text>
                  </View>

                  <Text style={styles.pinLabel}>
                    Alternative
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.trendingSection}>
            <Text style={styles.sectionTitle}>
              Explore by category
            </Text>

            <Pressable
              style={styles.card}
              onPress={() => {
                setSearchQuery("Popular bakeries nearby");
              }}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardEmoji}>🥐</Text>

                <View>
                  <Text style={styles.cardTitle}>
                    Bakeries
                  </Text>

                  <Text style={styles.cardSubtitle}>
                    Find the ones worth the walk
                  </Text>
                </View>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>

            <Pressable
              style={styles.card}
              onPress={() => {
                setSearchQuery("Popular sandwich shops nearby");
              }}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardEmoji}>🥪</Text>

                <View>
                  <Text style={styles.cardTitle}>
                    Food
                  </Text>

                  <Text style={styles.cardSubtitle}>
                    Skip the viral queue
                  </Text>
                </View>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>

            <Pressable
              style={styles.card}
              onPress={() => {
                setSearchQuery("Popular cafés nearby");
              }}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardEmoji}>☕</Text>

                <View>
                  <Text style={styles.cardTitle}>
                    Cafés
                  </Text>

                  <Text style={styles.cardSubtitle}>
                    Same vibe, less hype
                  </Text>
                </View>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>

            <Pressable
              style={styles.card}
              onPress={() => {
                setSearchQuery("Popular shopping nearby");
              }}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardEmoji}>🛍️</Text>

                <View>
                  <Text style={styles.cardTitle}>
                    Shopping
                  </Text>

                  <Text style={styles.cardSubtitle}>
                    Find more local options
                  </Text>
                </View>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.bottomMessage}>
            <Text style={styles.bottomMessageTitle}>
              Popular doesn&apos;t always mean better.
            </Text>

            <Text style={styles.bottomMessageText}>
              Search any place you&apos;re considering.
              Elsewhere will help you compare it with nearby
              alternatives based on similarity, value,
              convenience and what matters most to you.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },

  scrollContent: {
    paddingBottom: 60,
  },

  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
  },

  logo: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 4,
    color: "#111111",
    marginBottom: 50,
  },

  title: {
    fontSize: 44,
    fontWeight: "700",
    lineHeight: 48,
    color: "#111111",
  },

  subtitle: {
    fontSize: 44,
    fontWeight: "300",
    lineHeight: 48,
    color: "#111111",
    marginBottom: 54,
  },

  searchSection: {
    gap: 14,
  },

  question: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 4,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E0DA",
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 17,
    color: "#111111",
  },

  searchButton: {
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: "center",
    backgroundColor: "#111111",
  },

  searchButtonDisabled: {
    opacity: 0.35,
  },

  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  locationButton: {
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D6D0C8",
    backgroundColor: "#EFEAE3",
  },

  locationButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
  },

  mapSection: {
    marginTop: 52,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111111",
  },

  sectionLink: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
  },

  mapPlaceholder: {
    minHeight: 280,
    borderRadius: 24,
    backgroundColor: "#E8E3DB",
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },

  mapEmoji: {
    fontSize: 38,
    marginBottom: 12,
  },

  mapTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 8,
  },

  mapDescription: {
    maxWidth: 360,
    textAlign: "center",
    color: "#666666",
    fontSize: 15,
    lineHeight: 22,
  },

  fakeMapPins: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 30,
  },

  pinGroup: {
    alignItems: "center",
    gap: 7,
  },

  viralPin: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },

  viralPinText: {
    fontSize: 22,
  },

  matchPin: {
    minWidth: 58,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  matchPinText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111111",
  },

  pinLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666666",
  },

  trendingSection: {
    marginTop: 52,
    gap: 12,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },

  cardEmoji: {
    fontSize: 27,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111111",
  },

  cardSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: "#777777",
  },

  arrow: {
    fontSize: 30,
    fontWeight: "300",
    color: "#999999",
  },

  bottomMessage: {
    marginTop: 55,
    backgroundColor: "#111111",
    borderRadius: 24,
    padding: 24,
  },

  bottomMessageTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 10,
  },

  bottomMessageText: {
    color: "#D3D3D3",
    fontSize: 15,
    lineHeight: 23,
  },
});
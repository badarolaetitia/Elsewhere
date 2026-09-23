import {
    router,
    useLocalSearchParams,
} from "expo-router";
import { normalizeKeywords, toggleKeyword as toggleSelection } from "../lib/places-ranking";

import {
    useEffect,
    useRef,
    useState,
} from "react";

import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type ElsewherePreference =
  | "local"
  | "hidden-gem"
  | "popular-worth-it"
  | "closest";

type DistanceOption =
  | "all"
  | 5
  | 2
  | 1;

type SearchFilters = {
  preference: ElsewherePreference;
  distance: DistanceOption;
  selectedKeywords: string[];
};

const DEFAULT_FILTERS: SearchFilters = {
  preference: "local",
  distance: "all",
  selectedKeywords: [],
};

// Keyword selection order does not change the meaning of a filter set.
function filterKey(filters: SearchFilters) {
  return JSON.stringify([filters.preference, filters.distance, [...filters.selectedKeywords].sort()]);
}

function filterSummary(filters: SearchFilters) {
  const preference = preferenceOptions.find(option => option.value === filters.preference)?.label ?? "Local";
  const distance = filters.distance === "all" ? "All city" : `within ${filters.distance} km`;
  return `Showing: ${preference} · ${distance}${filters.selectedKeywords.length ? ` · focused on ${filters.selectedKeywords.join(", ")}` : ""}`;
}

type PlaceClassification = {
  category: string;
  categoryFamily: string;
  experienceKeywords: string[];
};

type SearchedPlace = {
  name: string;
  formatted: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

type Recommendation = {
  name: string;
  address: string;
  categories: string[];
  distance: number | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;

  similarityScore: number;
  focusMatchScore: number;
  localScore: number;
  distinctivenessScore: number;
  chainLikelihood: number;
  popularityScore: number;

  elsewhereScore: number;

  whySimilar: string;
  whyTryInstead: string;
};

type PlacesResponse = {
  success: boolean;
  searchId?: string;

  searchedPlace?: SearchedPlace;

  classification?: PlaceClassification;

  candidateCount?: number;

  recommendations?: Recommendation[];

  preference?: ElsewherePreference;

  selectedKeywords?: string[];

  distanceKm?: number | null;

  error?: string;
};

const preferenceOptions: {
  value: ElsewherePreference;
  label: string;
  description: string;
}[] = [
  {
    value: "local",
    label: "Local",
    description:
      "Independent and neighborhood spots",
  },

  {
    value: "hidden-gem",
    label: "Hidden gem",
    description:
      "Distinctive and less obvious",
  },

  {
    value: "popular-worth-it",
    label: "Popular but worth it",
    description:
      "Known places that still fit",
  },

  {
    value: "closest",
    label: "Closest",
    description:
      "Similarity with convenience prioritized",
  },
];

const distanceOptions: {
  value: DistanceOption;
  label: string;
}[] = [
  {
    value: "all",
    label: "All city",
  },

  {
    value: 5,
    label: "5 km",
  },

  {
    value: 2,
    label: "2 km",
  },

  {
    value: 1,
    label: "1 km",
  },
];

export default function ResultsScreen() {
  const params =
    useLocalSearchParams();

  const rawPlace =
    params.place;

  const searchedQuery =
    typeof rawPlace === "string" &&
    rawPlace.trim().length > 0
      ? rawPlace
      : Array.isArray(rawPlace) &&
          typeof rawPlace[0] ===
            "string" &&
          rawPlace[0].trim()
            .length > 0
        ? rawPlace[0]
        : "Selected place";

  return <SearchResults key={searchedQuery} searchedQuery={searchedQuery} />;
}

function SearchResults({ searchedQuery }: { searchedQuery: string }) {
  const searchIdRef = useRef<string | undefined>(undefined);
  // Controls edit drafts; only an explicit submission updates appliedFilters.
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  // Commit the summary with its results, never ahead of an in-flight request.
  const [displayedFilters, setDisplayedFilters] = useState<SearchFilters | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const [
    searchedPlace,
    setSearchedPlace,
  ] =
    useState<SearchedPlace | null>(
      null
    );

  const [
    classification,
    setClassification,
  ] =
    useState<PlaceClassification | null>(
      null
    );

  const [
    recommendations,
    setRecommendations,
  ] =
    useState<Recommendation[]>(
      []
    );

  const [
    candidateCount,
    setCandidateCount,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const requestIdRef =
    useRef(0);

  const draftKey = filterKey(draftFilters);
  const appliedKey = filterKey(appliedFilters);
  const hasUnappliedChanges = draftKey !== appliedKey;
  const canUpdate = Boolean(classification) && (hasUnappliedChanges || Boolean(error)) &&
    !(loading && draftKey === appliedKey);

  function toggleKeyword(keyword: string) {
    setDraftFilters(current => ({...current, selectedKeywords: toggleSelection(current.selectedKeywords, keyword)}));
  }

  function updateResults() {
    if (!canUpdate) return;

    pendingKeyRef.current = draftKey;
    setAppliedFilters({
      ...draftFilters,
      selectedKeywords: [...draftFilters.selectedKeywords],
    });
  }

  useEffect(() => {
    const requestId =
      requestIdRef.current + 1;

    requestIdRef.current =
      requestId;

    const controller =
      new AbortController();

    controllerRef.current = controller;
    pendingKeyRef.current = filterKey(appliedFilters);

    async function loadRecommendations() {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            "/places",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              signal: controller.signal,

              body:
                JSON.stringify({
                  place:
                    searchedQuery,

                  searchId: searchIdRef.current,
                  preference: appliedFilters.preference,
                  selectedKeywords: appliedFilters.selectedKeywords,
                  distanceKm: appliedFilters.distance,
                }),
            }
          );

        const result:
          PlacesResponse =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              "Could not find alternatives."
          );
        }

        if (
          controller.signal.aborted ||
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        searchIdRef.current = result.searchId;

        setSearchedPlace(
          result.searchedPlace ??
            null
        );

        setClassification(
          (current) =>
            current ??
            (result.classification ? {...result.classification, experienceKeywords: normalizeKeywords(result.classification.experienceKeywords)} : null)
        );

        setCandidateCount(
          result.candidateCount ??
            0
        );

        setDisplayedFilters(appliedFilters);

        setRecommendations(
          result.recommendations ??
            []
        );
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        console.error(
          "Elsewhere results error:",
          error
        );

        setError(
          error instanceof Error ? error.message : "We couldn't find alternatives right now. Please try again."
        );
      } finally {
        if (
          !controller.signal.aborted &&
          requestId ===
          requestIdRef.current
        ) {
          pendingKeyRef.current = null;
          setLoading(false);
        }
      }
    }

    loadRecommendations();

    return () => {
      controller.abort();
    };
  }, [
    searchedQuery,
    appliedFilters,
  ]);

  const topAlternative =
    recommendations[0] ??
    null;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.content
      }
    >
      <Pressable
        onPress={() =>
          router.replace("/")
        }
      >
        <Text style={styles.back}>
          ← Back
        </Text>
      </Pressable>

      <Text style={styles.logo}>
        ELSEWHERE
      </Text>

      <Text style={styles.eyebrow}>
        YOU SEARCHED FOR
      </Text>

      <Text style={styles.title}>
        {searchedPlace?.name ??
          searchedQuery}
      </Text>

      {searchedPlace !== null && (
        <Text
          style={styles.location}
        >
          {[
            searchedPlace.city,
            searchedPlace.country,
          ]
            .filter(Boolean)
            .join(", ")}
        </Text>
      )}

      {searchedPlace !== null &&
        classification !== null && (
          <View
            style={styles.placeCard}
          >
            <Text
              style={
                styles.darkLabel
              }
            >
              SELECTED PLACE
            </Text>

            <Text
              style={
                styles.placeName
              }
            >
              {searchedPlace.name}
            </Text>

            <Text
              style={
                styles.placeAddress
              }
            >
              {
                searchedPlace.formatted
              }
            </Text>

            <View
              style={
                styles.categoryBadge
              }
            >
              <Text
                style={
                  styles.categoryBadgeText
                }
              >
                {
                  classification.category
                }
              </Text>
            </View>
          </View>
        )}

      <View testID="filter-controls">
      {classification !== null && (
        <View
          style={
            styles.analysisCard
          }
        >
          <Text
            style={
              styles.lightLabel
            }
          >
            WHAT DO YOU WANT TO KEEP?
          </Text>

          <Text
            style={
              styles.analysisTitle
            }
          >
            Tap what matters to you
          </Text>

          <Text
            style={
              styles.analysisText
            }
          >
            Elsewhere will give extra
            weight to the experiences
            you select.
          </Text>

          <View
            style={
              styles.keywordWrap
            }
          >
            {classification.experienceKeywords.map(
              (
                keyword,
                index
              ) => {
                const selected =
                  draftFilters.selectedKeywords.includes(
                    keyword
                  );

                return (
                  <Pressable
                    key={keyword}
                    accessibilityRole="checkbox"
                    aria-checked={selected}
                    accessibilityState={{checked: selected}}
                    onPress={() =>
                      toggleKeyword(
                        keyword
                      )
                    }
                    style={[
                      styles.keywordBadge,
                      selected &&
                        styles.keywordBadgeSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.keywordText,
                        selected &&
                          styles.keywordTextSelected,
                      ]}
                    >
                      {selected
                        ? "✓ "
                        : ""}
                      {keyword}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>

          {draftFilters.selectedKeywords.length ===
            0 && (
            <Text
              style={
                styles.selectionHint
              }
            >
              Nothing selected means
              Elsewhere considers the
              whole experience.
            </Text>
          )}
        </View>
      )}

      <Text
        style={styles.sectionTitle}
      >
        What kind of Elsewhere?
      </Text>

      <Text
        style={
          styles.preferenceIntro
        }
      >
        Local is the default, but you
        can change what “better”
        means for this search.
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel="Recommendation preference"
        style={
          styles.preferenceGrid
        }
      >
        {preferenceOptions.map(
          (option) => {
            const selected =
              draftFilters.preference ===
              option.value;

            return (
              <Pressable
                key={
                  option.value
                }
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                aria-checked={selected}
                accessibilityState={{checked: selected}}
                disabled={!classification}
                onPress={() => setDraftFilters(current => ({...current, preference: option.value}))}
                style={[
                  styles.preferenceCard,
                  selected &&
                    styles.preferenceCardSelected,
                ]}
              >
                <Text
                  style={[
                    styles.preferenceLabel,
                    selected &&
                      styles.preferenceLabelSelected,
                  ]}
                >
                  {selected
                    ? "✓ "
                    : ""}
                  {option.label}
                </Text>

                <Text
                  style={[
                    styles.preferenceDescription,
                    selected &&
                      styles.preferenceDescriptionSelected,
                  ]}
                >
                  {
                    option.description
                  }
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text
        style={styles.sectionTitle}
      >
        How far would you go?
      </Text>

      <Text
        style={
          styles.preferenceIntro
        }
      >
        All city keeps discovery wide.
        Distances are measured from the searched place.
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel="Distance from searched place"
        style={
          styles.distanceRow
        }
      >
        {distanceOptions.map(
          (option) => {
            const selected =
              draftFilters.distance ===
              option.value;

            return (
              <Pressable
                key={
                  String(
                    option.value
                  )
                }
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                aria-checked={selected}
                accessibilityState={{checked: selected}}
                disabled={!classification}
                onPress={() => setDraftFilters(current => ({...current, distance: option.value}))}
                style={[
                  styles.distanceButton,
                  selected &&
                    styles.distanceButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.distanceButtonText,
                    selected &&
                      styles.distanceButtonTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text style={styles.filterHint} testID="filter-status" accessibilityLiveRegion="polite">
        {hasUnappliedChanges
          ? "You have unapplied changes. Press Update results when you’re ready."
          : loading && displayedFilters !== null
            ? "Updating results… You can keep editing your filters."
            : "Choose your filters, then press Update results."}
      </Text>
      <Pressable
        testID="update-results"
        accessibilityRole="button"
        accessibilityLabel="Update results"
        accessibilityState={{disabled: !canUpdate}}
        disabled={!canUpdate}
        onPress={updateResults}
        style={[styles.updateButton, !canUpdate && styles.updateButtonDisabled]}
      >
        <Text style={styles.updateButtonText}>Update results</Text>
      </Pressable>
      </View>

      {displayedFilters !== null && (
        <Text testID="applied-filter-summary" style={styles.appliedSummary} accessibilityLiveRegion="polite">
          {filterSummary(displayedFilters)}
        </Text>
      )}
      {loading && displayedFilters !== null && (
        <View style={styles.updatingStatus} testID="updating-results">
          <ActivityIndicator />
          <Text style={styles.helperText}>Updating results…</Text>
        </View>
      )}
      {error.length > 0 && displayedFilters !== null && (
        <Text style={styles.errorText} accessibilityRole="alert">{error} Your previous results are still shown.</Text>
      )}

      <View
        style={
          styles.sectionHeader
        }
      >
        <View style={styles.flexOne}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            Better alternatives
          </Text>

          <Text
            style={
              styles.helperText
            }
          >
            Ranked by the experience
            you want, not simply by
            distance.
          </Text>
        </View>

        {candidateCount >
          0 && (
          <Text
            style={
              styles.candidateText
            }
          >
            {candidateCount} places considered
          </Text>
        )}
      </View>
      {loading && displayedFilters === null ? (
        <View
          style={styles.loadingCard}
        >
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Finding your Elsewhere...
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Comparing real places
            against your current
            preferences.
          </Text>
        </View>
      ) : error.length > 0 && displayedFilters === null ? (
        <View
          style={styles.errorCard}
        >
          <Text
            style={
              styles.errorTitle
            }
          >
            Something went wrong
          </Text>

          <Text
            style={
              styles.errorText
            }
          >
            {error}
          </Text>
        </View>
      ) : recommendations.length ===
        0 ? (
        <View
          style={styles.emptyCard}
        >
          <Text
            style={
              styles.emptyTitle
            }
          >
            No alternatives found in
            this search
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            Try widening the distance
            or removing one of your
            selected experience
            preferences.
          </Text>
        </View>
      ) : (
        recommendations.map(
          (
            recommendation,
            index
          ) => (
            <View
              testID="recommendation-card"
              key={
                recommendation.placeId ??
                `${recommendation.name}-${index}`
              }
              style={
                styles.alternativeCard
              }
            >
              <View
                style={
                  styles.alternativeHeader
                }
              >
                <View
                  style={
                    styles.alternativeTitleWrap
                  }
                >
                  {index ===
                    0 && (
                    <Text
                      style={
                        styles.topPick
                      }
                    >
                      TOP MATCH
                    </Text>
                  )}

                  <Text
                    style={
                      styles.alternativeName
                    }
                  >
                    {
                      recommendation.name
                    }
                  </Text>
                </View>

                <View
                  style={
                    styles.scoreBubble
                  }
                >
                  <Text
                    style={
                      styles.scoreText
                    }
                  >
                    {
                      recommendation.elsewhereScore
                    }
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.alternativeAddress
                }
              >
                {
                  recommendation.address
                }
              </Text>

              {recommendation.distance !==
                null && (
                <Text
                  style={
                    styles.distanceText
                  }
                >
                  {recommendation.distance <
                  1
                    ? `${Math.round(
                        recommendation.distance *
                          1000
                      )} m away`
                    : `${recommendation.distance.toFixed(
                        1
                      )} km away`}
                </Text>
              )}

              <View
                style={
                  styles.scoreRow
                }
              >
                <View
                  style={
                    styles.miniScore
                  }
                >
                  <Text
                    style={
                      styles.miniScoreValue
                    }
                  >
                    {
                      recommendation.similarityScore
                    }
                  </Text>

                  <Text
                    style={
                      styles.miniScoreLabel
                    }
                  >
                    Similar
                  </Text>
                </View>

                <View
                  style={
                    styles.miniScore
                  }
                >
                  <Text
                    style={
                      styles.miniScoreValue
                    }
                  >
                    {
                      recommendation.focusMatchScore
                    }
                  </Text>

                  <Text
                    style={
                      styles.miniScoreLabel
                    }
                  >
                    Your focus
                  </Text>
                </View>

                <View
                  style={
                    styles.miniScore
                  }
                >
                  <Text
                    style={
                      styles.miniScoreValue
                    }
                  >
                    {
                      recommendation.localScore
                    }
                  </Text>

                  <Text
                    style={
                      styles.miniScoreLabel
                    }
                  >
                    Local feel
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.divider
                }
              />

              <Text
                style={
                  styles.reasonLabel
                }
              >
                WHY IT MATCHES
              </Text>

              <Text
                style={
                  styles.reasonText
                }
              >
                {
                  recommendation.whySimilar
                }
              </Text>

              <Text
                style={[
                  styles.reasonLabel,
                  styles.secondReason,
                ]}
              >
                WHY TRY IT
              </Text>

              <Text
                style={
                  styles.reasonText
                }
              >
                {
                  recommendation.whyTryInstead
                }
              </Text>
            </View>
          )
        )
      )}

      {recommendations.length > 0 && (
        <Text style={styles.resultsCount}>
          Showing {recommendations.length} best matches
        </Text>
      )}

      {!loading &&
        topAlternative !== null && (
          <View
            style={styles.verdict}
          >
            <Text
              style={
                styles.verdictLabel
              }
            >
              ELSEWHERE PICK
            </Text>

            <Text
              style={
                styles.verdictTitle
              }
            >
              Try{" "}
              {
                topAlternative.name
              }
            </Text>

            <Text
              style={
                styles.verdictScore
              }
            >
              {
                topAlternative.elsewhereScore
              }
              /100 Elsewhere score
            </Text>

            <Text
              style={
                styles.verdictText
              }
            >
              {
                topAlternative.whyTryInstead
              }
            </Text>
          </View>
        )}

      {!loading && (
        <Text
          style={styles.disclaimer}
        >
          Place names and locations
          come from real place data.
          Similarity, local character,
          distinctiveness and
          popularity signals are AI
          estimates used for ranking,
          not verified ratings.
        </Text>
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    filterHint: {fontSize: 13, lineHeight: 19, color: "#666", marginTop: 16, marginBottom: 12},
    updateButton: {backgroundColor: "#111", borderRadius: 16, paddingVertical: 17, alignItems: "center", marginBottom: 24},
    updateButtonDisabled: {opacity: 0.4},
    updateButtonText: {color: "white", fontSize: 16, fontWeight: "700"},
    appliedSummary: {fontSize: 14, lineHeight: 21, color: "#444", marginBottom: 20},
    updatingStatus: {flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16},
    page: {
      flex: 1,
      backgroundColor:
        "#F7F4EF",
    },

    content: {
      width: "100%",
      maxWidth: 620,
      alignSelf: "center",
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 70,
    },

    flexOne: {
      flex: 1,
    },

    back: {
      fontSize: 16,
      marginBottom: 24,
      color: "#111",
    },

    logo: {
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 3,
      marginBottom: 42,
      color: "#111",
    },

    eyebrow: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.5,
      marginBottom: 8,
      color: "#111",
    },

    title: {
      fontSize: 36,
      fontWeight: "900",
      lineHeight: 40,
      color: "#111",
    },

    location: {
      marginTop: 8,
      fontSize: 15,
      color: "#666",
      marginBottom: 26,
    },

    placeCard: {
      backgroundColor: "#111",
      borderRadius: 22,
      padding: 22,
      marginBottom: 16,
    },

    darkLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      color: "#999",
      marginBottom: 8,
    },

    placeName: {
      color: "white",
      fontSize: 26,
      fontWeight: "900",
    },

    placeAddress: {
      color: "#BBB",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },

    categoryBadge: {
      alignSelf:
        "flex-start",
      borderWidth: 1,
      borderColor: "#555",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginTop: 18,
    },

    categoryBadgeText: {
      color: "white",
      fontWeight: "700",
      fontSize: 13,
    },

    analysisCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 22,
      padding: 22,
      marginBottom: 34,
      backgroundColor:
        "#FFFDF9",
    },

    lightLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      color: "#777",
    },

    analysisTitle: {
      fontSize: 22,
      fontWeight: "900",
      marginTop: 8,
      color: "#111",
    },

    analysisText: {
      marginTop: 7,
      fontSize: 14,
      lineHeight: 20,
      color: "#666",
    },

    keywordWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 18,
    },

    keywordBadge: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor:
        "#F7F4EF",
    },

    keywordBadgeSelected: {
      backgroundColor: "#111",
      borderColor: "#111",
    },

    keywordText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#333",
    },

    keywordTextSelected: {
      color: "white",
    },

    selectionHint: {
      color: "#777",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 14,
    },

    sectionTitle: {
      fontSize: 25,
      fontWeight: "900",
      color: "#111",
    },

    preferenceIntro: {
      marginTop: 6,
      marginBottom: 15,
      color: "#666",
      fontSize: 14,
      lineHeight: 20,
    },

    preferenceGrid: {
      gap: 9,
      marginBottom: 34,
    },

    preferenceCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      backgroundColor:
        "#FFFDF9",
      borderRadius: 16,
      padding: 15,
    },

    preferenceCardSelected: {
      backgroundColor: "#111",
      borderColor: "#111",
    },

    preferenceLabel: {
      fontSize: 16,
      fontWeight: "800",
      color: "#111",
    },

    preferenceLabelSelected: {
      color: "white",
    },

    preferenceDescription: {
      color: "#666",
      fontSize: 13,
      marginTop: 3,
    },

    preferenceDescriptionSelected: {
      color: "#BBB",
    },

    distanceRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 28,
    },

    distanceButton: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      backgroundColor:
        "#FFFDF9",
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },

    distanceButtonSelected: {
      backgroundColor: "#111",
      borderColor: "#111",
    },

    distanceButtonText: {
      fontSize: 13,
      fontWeight: "800",
      color: "#111",
    },

    distanceButtonTextSelected: {
      color: "white",
    },

    activeSearchCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 18,
      padding: 16,
      backgroundColor:
        "#FFFDF9",
      marginBottom: 34,
    },

    activeSearchLabel: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
      color: "#777",
    },

    activeSearchText: {
      fontSize: 16,
      fontWeight: "900",
      color: "#111",
      marginTop: 5,
    },

    activeSearchFocus: {
      fontSize: 13,
      lineHeight: 19,
      color: "#555",
      marginTop: 6,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 12,
      marginBottom: 16,
    },

    helperText: {
      color: "#666",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
    },

    candidateText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#777",
      marginTop: 7,
    },
    resultsCount: {
      fontSize: 13,
      color: "#777",
      marginTop: -8,
      marginBottom: 16,
    },

    loadingCard: {
      minHeight: 220,
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 20,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFDF9",
      padding: 28,
    },

    loadingTitle: {
      marginTop: 15,
      fontSize: 20,
      fontWeight: "900",
      color: "#111",
      textAlign: "center",
    },

    loadingText: {
      marginTop: 7,
      color: "#666",
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },

    alternativeCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 20,
      padding: 19,
      marginBottom: 13,
      backgroundColor:
        "#FFFDF9",
    },

    alternativeHeader: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      gap: 15,
    },

    alternativeTitleWrap: {
      flex: 1,
    },

    topPick: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
      color: "#777",
      marginBottom: 5,
    },

    alternativeName: {
      fontSize: 20,
      fontWeight: "900",
      color: "#111",
    },

    alternativeAddress: {
      color: "#666",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 9,
    },

    distanceText: {
      color: "#777",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 6,
    },

    scoreBubble: {
      minWidth: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "#111",
      alignItems: "center",
      justifyContent:
        "center",
    },

    scoreText: {
      color: "white",
      fontWeight: "900",
      fontSize: 16,
    },

    scoreRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 17,
    },

    miniScore: {
      flex: 1,
      backgroundColor:
        "#F2EEE8",
      borderRadius: 12,
      padding: 10,
    },

    miniScoreValue: {
      fontSize: 17,
      fontWeight: "900",
      color: "#111",
    },

    miniScoreLabel: {
      fontSize: 10,
      color: "#666",
      marginTop: 2,
    },

    divider: {
      height: 1,
      backgroundColor:
        "#E4DFD8",
      marginVertical: 17,
    },

    reasonLabel: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      color: "#777",
      marginBottom: 5,
    },

    secondReason: {
      marginTop: 16,
    },

    reasonText: {
      fontSize: 15,
      lineHeight: 22,
      color: "#333",
    },

    verdict: {
      backgroundColor: "#111",
      borderRadius: 22,
      padding: 22,
      marginTop: 22,
    },

    verdictLabel: {
      color: "#999",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
    },

    verdictTitle: {
      color: "white",
      fontSize: 27,
      fontWeight: "900",
      marginTop: 8,
    },

    verdictScore: {
      color: "white",
      fontSize: 15,
      fontWeight: "800",
      marginTop: 10,
    },

    verdictText: {
      color: "#CCC",
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
    },

    errorCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 20,
      padding: 22,
      backgroundColor:
        "#FFFDF9",
    },

    errorTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: "#111",
    },

    errorText: {
      color: "#666",
      marginTop: 8,
      lineHeight: 20,
    },

    emptyCard: {
      borderWidth: 1,
      borderColor: "#D8D3CB",
      borderRadius: 20,
      padding: 22,
      backgroundColor:
        "#FFFDF9",
    },

    emptyTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: "#111",
    },

    emptyText: {
      color: "#666",
      marginTop: 7,
      lineHeight: 20,
    },

    disclaimer: {
      fontSize: 12,
      lineHeight: 18,
      color: "#777",
      marginTop: 22,
      textAlign: "center",
      paddingHorizontal: 12,
    },
  });
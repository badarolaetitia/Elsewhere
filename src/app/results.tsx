import {searchAuthHeaders} from "../lib/search-auth";
import {useAccount} from '../components/account-provider';
import Brand from "../components/brand";
import BookingPanel from "../components/booking-panel";
import { normalizeSearchContext, type SearchContext } from "../lib/search-context";
import { readSavedPlaces, toggleSavedPlace } from "../lib/taste-profile";
import SearchSuggestions from "../components/search-suggestions";
import AreaHeatmap from '../components/area-heatmap';
import {coordinateArea} from '../lib/crowd-agent';
import {useAreaAgent} from '../lib/use-area-agent';
import {readDiscoveryProfile} from '../lib/discovery-profile';
import AgentActivity from '../components/agent-activity';
import {agentProgress} from '../lib/agent-progress';
import {unassessedMap} from '../lib/area-crowd-agent';
import {
    router,
    useLocalSearchParams,
    useFocusEffect,
} from "expo-router";
import { normalizeKeywords, toggleKeyword as toggleSelection } from "../lib/places-ranking";

import {
    useEffect,
    useCallback,
    useRef,
    useState,
} from "react";

import {
    ActivityIndicator,
    Pressable,
  Linking,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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
function filterKey(filters: SearchFilters) {
  return JSON.stringify([filters.preference, filters.distance, [...filters.selectedKeywords].sort()]);
}

function filterSummary(filters: SearchFilters, nearby = false) {
  const preference = preferenceOptions.find(option => option.value === filters.preference)?.label ?? "Local";
  const distance = filters.distance === "all" ? (nearby ? "Within 15 km" : "Citywide") : `within ${filters.distance} km`;
  return `${preference} · ${distance}${filters.selectedKeywords.length ? ` · ${filters.selectedKeywords.join(", ")}` : ""}`;
}

type PlaceClassification = {
  category: string;
  categoryFamily: string;
  intentSummary?: string;
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
  crowdPriorityKey?: string;
  metadata?: Record<string,string>;
  name: string;
  address: string;
  booking?: {status: string; label: string; url: string; date: string; time: string; partySize: number};
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

  experienceEvidence?: Record<string, {status: string; summary: string; sources: {title: string; url: string}[]}>;
  personalizationReason?: string;
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
  searchSuggestions?: string[];
  researchStatus?: "grounded" | "metadata-only";
  searchArea?: "city" | "nearby";

  preference?: ElsewherePreference;

  selectedKeywords?: string[];

  distanceKm?: number | null;

  discoveryPlan?: unknown;
  discovery?: {mode:string; summary:string};
  needsClarification?: boolean;
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
    label: "Hidden gems",
    description:
      "Distinctive and less obvious",
  },

  {
    value: "popular-worth-it",
    label: "Popular",
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
    label: "Citywide",
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

  let initialContext: SearchContext | undefined;
  try { if (typeof params.context === 'string') initialContext = normalizeSearchContext(JSON.parse(params.context)); } catch {  }
  return <SearchResults key={initialContext ? `${searchedQuery}:${JSON.stringify(initialContext)}` : searchedQuery} searchedQuery={searchedQuery} initialContext={initialContext} />;
}

function SearchResults({ searchedQuery, initialContext }: { searchedQuery: string; initialContext?: SearchContext }) {
  const [preferQuiet,setPreferQuiet]=useState(false);
  const [selectedMapId,setSelectedMapId]=useState<string|null>(null);
  const pageRef=useRef<ScrollView|null>(null);
  const contentRef=useRef<View|null>(null);
  const cardRefs=useRef<Record<string,View|null>>({});
  const mapRef=useRef<View|null>(null);
  function scrollToView(target:View|null){if(target&&contentRef.current)target.measureLayout(contentRef.current,(_x,y)=>pageRef.current?.scrollTo({y:Math.max(0,y-12),animated:true}),()=>{});}
  const {dataVersion}=useAccount();
  const tasteProfile=readDiscoveryProfile();
  const tasteKey=JSON.stringify(tasteProfile.signals);
  const [savedPlaces, setSavedPlaces] = useState(readSavedPlaces());
  useFocusEffect(useCallback(()=>{setSavedPlaces(readSavedPlaces());},[]));
  useEffect(()=>{setSavedPlaces(readSavedPlaces());},[dataVersion]);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [expandedCards, setExpandedCards] = useState<string[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const [refinement, setRefinement] = useState('');
  function refineSearch() {
    if (!refinement.trim()) return;
    const context = normalizeSearchContext({...initialContext, intent: [initialContext?.intent, refinement.trim()].filter(Boolean).join('; ')});
    router.replace({pathname:'/results',params:{place:searchedQuery,context:JSON.stringify(context)}});
  }
  const searchIdRef = useRef<string | undefined>(undefined);
  const discoveryPlanRef = useRef<unknown>(undefined);
  const [discoverySummary,setDiscoverySummary] = useState('');
  const [needsClarification,setNeedsClarification] = useState(false);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [searchArea, setSearchArea] = useState("city");
  const [researchStatus, setResearchStatus] = useState<string>("grounded");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
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
                ...await searchAuthHeaders(),
                "Content-Type":
                  "application/json",
              },

              signal: controller.signal,

              body:
                JSON.stringify({
                  place:
                    searchedQuery,

                  context:normalizeSearchContext({...initialContext,tasteProfile:tasteProfile.signals,taste:[],avoid:[]}),
                  searchId: searchIdRef.current,
                  discoveryPlan: discoveryPlanRef.current,
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
          setNeedsClarification(Boolean(result.needsClarification));
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

        const firstInterpretation=!searchIdRef.current && Boolean(result.discoveryPlan);
        searchIdRef.current = result.searchId;
        discoveryPlanRef.current = result.discoveryPlan;
        setNeedsClarification(false);
        setDiscoverySummary(result.discovery?.summary ?? '');
        const resolvedFilters=firstInterpretation ? {preference:result.preference ?? appliedFilters.preference,selectedKeywords:result.selectedKeywords ?? [],distance:([1,2,5].includes(result.distanceKm ?? 0)?result.distanceKm:'all') as DistanceOption} : appliedFilters;
        if(firstInterpretation){
          setDraftFilters(resolvedFilters);
          if(filterKey(resolvedFilters)!==filterKey(appliedFilters))setAppliedFilters(resolvedFilters);
        }

        setSearchedPlace(
          result.searchedPlace ??
            null
        );

        setClassification(
          (current) =>
            current ??
            (result.classification ? {...result.classification, experienceKeywords: [...new Set(result.classification.experienceKeywords)]} : null)
        );

        setCandidateCount(
          result.candidateCount ??
            0
        );

        setDisplayedFilters(resolvedFilters);
        setSearchSuggestions(result.searchSuggestions ?? []);
        setSearchArea(result.searchArea ?? "city");
        setResearchStatus(result.researchStatus ?? "grounded");

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

        console.warn(
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
    retryVersion,
    tasteKey,
  ]);

  const selectedKeywords = displayedFilters?.selectedKeywords ?? [];

  const activePreferenceOptions = researchStatus==='dataset'
    ? preferenceOptions.filter(option=>option.value==='local'||option.value==='closest').map(option=>option.value==='local'?{...option,label:'Best match',description:'Shared documented features'}:option)
    : preferenceOptions;
  const areaAgent=useAreaAgent(researchStatus==='dataset'?recommendations.flatMap(v=>v.placeId?[v.placeId]:[]):[],initialContext?.mode==='tonight'&&initialContext.date?`${initialContext.date}T${initialContext.time}:00`:undefined);
  const visibleRecommendations=coordinateArea(recommendations,areaAgent.result,{preferQuiet,closest:displayedFilters?.preference==='closest',now:areaAgent.now});
  const mapContext=areaAgent.result??unassessedMap(recommendations.flatMap(v=>v.placeId?[v.placeId]:[]),areaAgent.now);
  const areaById=new Map(mapContext.venues.map(v=>[v.id,v]));
  const mapInvestigation={...mapContext,venues:visibleRecommendations.flatMap(v=>{const area=areaById.get(v.placeId??'');return area?[area]:[];})};
  const progress=agentProgress({loading,error,needsClarification,resultCount:recommendations.length,discoverySummary,tasteSignals:tasteProfile.signals.length,areaLoading:areaAgent.loading,areaError:areaAgent.error,investigation:areaAgent.result,preferQuiet,closest:displayedFilters?.preference==='closest'});
  const topAlternative =
    visibleRecommendations[0] ??
    null;

  return (
    <ScrollView
      ref={pageRef}
      style={styles.page}
      contentContainerStyle={
        styles.content
      }
    >
      <View ref={contentRef} style={{width:'100%'}}>
      <Pressable
        onPress={() =>
          router.replace("/")
        }
      >
        <Text style={styles.back}>
          ← Back
        </Text>
      </Pressable>

      <Brand/>

      <Text style={styles.eyebrow}>
        YOU SEARCHED FOR
      </Text>

      <Text style={styles.title}>
        {searchedPlace?.name ??
          searchedQuery}
      </Text>

      {initialContext?.mode === 'tonight' && <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Dining preferences</Text>
        <Text style={styles.emptyText}>{initialContext.date} · {initialContext.time} · {initialContext.partySize} guests · {initialContext.city}</Text>
        <Text style={styles.emptyText}>Check availability on the booking site.</Text>
      </View>}
      {initialContext?.intent ? <Text style={styles.location}>{initialContext.intent.replace(/Priority \d+: /g,'').split('; ').join(' · ')}</Text> : null}
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

      <AgentActivity steps={progress}/>
      {researchStatus==='dataset'&&recommendations.length>0&&<Pressable accessibilityRole="button" onPress={()=>scrollToView(mapRef.current)} style={{alignSelf:'flex-start',paddingVertical:10,marginBottom:8}}><Text style={{color:'#174D43',fontWeight:'600'}}>View heatmap ↓</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityState={{expanded:showAdjustments}} onPress={()=>setShowAdjustments(!showAdjustments)} style={{paddingVertical:16,marginVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:'#D8D3CB'}}>
        <Text style={{fontSize:16,fontWeight:'600'}}>{showAdjustments?'Close filters':'Filters & preferences'}</Text>
      </Pressable>
      {showAdjustments && <View>
      <View style={{gap:10,marginVertical:18}}>
        <Text style={styles.emptyTitle}>Refine your search</Text>
        <TextInput accessibilityLabel="Refine your search" placeholder="Describe what you’d prefer…" value={refinement} onChangeText={setRefinement} maxLength={200} style={{borderWidth:1,borderColor:'#D8D3CB',borderRadius:14,padding:14,backgroundColor:'#FFFCF4'}} />
        <Pressable accessibilityRole="button" onPress={refineSearch} disabled={!refinement.trim() || loading}><Text style={styles.back}>Update search</Text></Pressable>
      </View>

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
            MATCH PREFERENCES
          </Text>

          <Text
            style={
              styles.analysisTitle
            }
          >
            Select the details that matter
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

        </View>
      )}

      <Text
        style={styles.sectionTitle}
      >
        Your preference
      </Text>



      <View accessibilityRole="radiogroup" accessibilityLabel="Recommendation preference"
        style={
          styles.preferenceGrid
        }
      >
        {activePreferenceOptions.map(
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
        Distance
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
                accessibilityLabel={option.value === "all" ? (searchArea === "pilot" ? "Pilot area" : searchArea === "nearby" ? "Within 15 km" : option.label) : option.label}
                aria-checked={selected}
                accessibilityState={{checked: selected}}
                disabled={!classification}
                onPress={() => {
                  if (draftFilters.distance === option.value && appliedFilters.distance === option.value) return;
                  const next = {...draftFilters, distance: option.value};
                  setDraftFilters(next);
                  setAppliedFilters(next);
                }}
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
                  {option.value === "all" ? (searchArea === "pilot" ? "Pilot area" : searchArea === "nearby" ? "Within 15 km" : option.label) : option.label}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text style={styles.filterHint} testID="filter-status" accessibilityLiveRegion="polite">
        {hasUnappliedChanges
          ? "Apply your changes to update the results."
          : loading && displayedFilters !== null
            ? "Updating results…"
            : ""}
      </Text>
      <Pressable
        testID="update-results"
        accessibilityRole="button"
        accessibilityLabel="Apply filters"
        accessibilityState={{disabled: !canUpdate}}
        disabled={!canUpdate}
        onPress={updateResults}
        style={[styles.updateButton, !canUpdate && styles.updateButtonDisabled]}
      >
        <Text style={styles.updateButtonText}>Apply filters</Text>
      </Pressable>
      </View>
      </View>}

      {displayedFilters !== null && (
        <Text testID="applied-filter-summary" style={styles.appliedSummary} accessibilityLiveRegion="polite">
          {researchStatus==='dataset'?filterSummary(displayedFilters,false).replace(/^Local/,'Best match').replace('Citywide','Pilot area'):filterSummary(displayedFilters, searchArea === "nearby")}
        </Text>
      )}
      {loading && displayedFilters !== null && (
        <View style={styles.updatingStatus} testID="updating-results">
          <ActivityIndicator />
          <Text style={styles.helperText}>Updating results…</Text>
        </View>
      )}
      {error.length > 0 && displayedFilters !== null && (
        <Text style={styles.errorText} accessibilityRole="alert">{error} Previous results are shown below.</Text>
      )}

      {discoverySummary.length>0 && <Text style={[styles.helperText,{marginBottom:12}]} accessibilityLiveRegion="polite">{discoverySummary}</Text>}
      {searchArea === "nearby" && <Text style={[styles.helperText,{marginBottom:18}]}>Showing alternatives within 15 km. Citywide search is temporarily unavailable.</Text>}
      {researchStatus==='dataset'&&<Text style={[styles.helperText,{marginBottom:18}]}>West Village · Published offerings and experiences checked November 7, 2026. Match scores compare documented details.</Text>}
      {researchStatus==='dataset'&&recommendations.length>0&&<View style={{gap:8,marginBottom:20}}>
        <Pressable accessibilityRole="switch" accessibilityLabel="Prefer less busy areas" aria-checked={preferQuiet} accessibilityState={{checked:preferQuiet}} onPress={()=>setPreferQuiet(value=>!value)} style={{alignSelf:'flex-start',padding:12,borderRadius:20,backgroundColor:preferQuiet?'#174D43':'#EEE9DF'}}><Text style={{color:preferQuiet?'white':'#174D43',fontWeight:'600'}}>{preferQuiet?'✓ Prefer less busy areas':'Prefer less busy areas'}</Text></Pressable>
        {preferQuiet&&<Text style={styles.helperText} accessibilityLiveRegion="polite">{displayedFilters?.preference==='closest'?'Closest first stays in distance order.':areaAgent.loading?'The Crowd Agent is researching area activity. Experience matches stay in their original order while it works.':!areaAgent.result?.venues.some(v=>v.reading.value!==null)?'Not enough area evidence to change the order.': 'The Coordinator favours lower estimated area activity only among similarly matched places with evidence.'}</Text>}
      </View>}
      {researchStatus==='dataset'&&recommendations.length>0&&<View ref={mapRef}>
        {!!areaAgent.error&&<View style={{gap:8,marginBottom:18}}><Text style={styles.helperText}>{areaAgent.error}</Text><Pressable accessibilityRole="button" onPress={areaAgent.retry}><Text style={{color:'#174D43'}}>Retry area research</Text></Pressable></View>}
        <AreaHeatmap investigation={mapInvestigation} researchState={areaAgent.loading||(!areaAgent.result&&!areaAgent.error)?'loading':areaAgent.error?'unavailable':'ready'} selectedId={selectedMapId} onSelect={setSelectedMapId} onViewPlace={id=>scrollToView(cardRefs.current[id])}/>
      </View>}
      {selectedKeywords.length===0&&researchStatus === "metadata-only" && <Text accessibilityRole="alert" style={[styles.helperText,{marginBottom:18}]}>Showing general alternatives. Product and atmosphere matches couldn’t be checked right now.</Text>}

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
            Recommended alternatives
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
            Finding alternatives…
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Searching for places that match your preferences.
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
            {needsClarification ? 'A little more detail' : 'Couldn’t finish this search'}
          </Text>

          <Text
            style={
              styles.errorText
            }
          >
            {error}
          </Text>
          {needsClarification && <View style={{gap:10}}>
            <TextInput accessibilityLabel="Clarify your search" value={refinement} onChangeText={setRefinement} placeholder="Like Via Carota, for pasta, within 1 km" style={{borderWidth:1,borderColor:'#D6CFC3',borderRadius:12,padding:14}} />
            <Pressable accessibilityRole="button" disabled={!refinement.trim()} onPress={()=>router.replace({pathname:'/results',params:{place:refinement.trim(),context:JSON.stringify(normalizeSearchContext({...initialContext,intent:''}))}})}><Text style={styles.back}>Search →</Text></Pressable>
          </View>}
          <Pressable accessibilityRole="button" onPress={() => setRetryVersion(value => value + 1)}><Text style={styles.back}>Try again →</Text></Pressable>
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
            {selectedKeywords.length ? "No verified matches yet" : "No matching places found"}
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            {selectedKeywords.length ? "We couldn’t confirm places that meet all your selected preferences. Try a wider distance or remove a preference." : "Try a wider distance or fewer filters."}
          </Text>
        </View>
      ) : (
        visibleRecommendations.map(
          (
            recommendation,
            index
          ) => (
            <View
              testID="recommendation-card"
              ref={node=>{if(recommendation.placeId)cardRefs.current[recommendation.placeId]=node;}}
              key={
                recommendation.placeId ??
                `${recommendation.name}-${index}`
              }
              style={
                [styles.alternativeCard,selectedMapId===recommendation.placeId?{borderColor:'#174D43',borderWidth:2}:null]
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
                    0 && researchStatus !== 'metadata-only' && (
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
                {researchStatus !== 'metadata-only' && <View accessibilityLabel={`Match score ${Math.round(recommendation.elsewhereScore)} out of 100`} style={styles.scoreBubble}><Text style={styles.scoreText}>{Math.round(recommendation.elsewhereScore)}</Text><Text style={{color:'white',fontSize:10}}>Match / 100</Text></View>}
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

              {researchStatus !== 'metadata-only' && <Text
                style={
                  styles.reasonLabel
                }
              >
                Match details
              </Text>}

              {researchStatus !== 'metadata-only' && <Text
                style={
                  styles.reasonText
                }
              >
                {
                  recommendation.whySimilar
                }
              </Text>}

              {recommendation.personalizationReason ? <Text style={[styles.reasonText,{color:"#174D43",marginTop:8}]}>{recommendation.personalizationReason}</Text> : null}
              {areaById.has(recommendation.placeId??'')&&<Pressable accessibilityRole="button" onPress={()=>{setSelectedMapId(recommendation.placeId);scrollToView(mapRef.current);}}><Text style={{color:'#58685C',fontSize:13,marginTop:8}}>{index+1} · Show on map{areaById.get(recommendation.placeId??'')?.reading.value!==null?` · ${areaById.get(recommendation.placeId??'')?.reading.label} estimated area activity`:''}</Text></Pressable>}
              <Pressable accessibilityRole="button" onPress={() => setSavedPlaces(toggleSavedPlace({id:recommendation.placeId ?? `${recommendation.name}:${recommendation.address}`,name:recommendation.name,address:recommendation.address,categoryFamily:classification?.categoryFamily,interests:Object.entries(recommendation.experienceEvidence ?? {}).filter(([,e])=>e.status==='SUPPORTED').map(([keyword])=>keyword)}))}>
                <Text style={[styles.reasonLabel,{marginTop:14}]}>{savedPlaces.some(item=>item.id===(recommendation.placeId ?? `${recommendation.name}:${recommendation.address}`))?'♥ Saved':'♡ Save'}</Text>
              </Pressable>
              {(classification?.categoryFamily==='restaurant' || recommendation.categories.some(category=>category.startsWith('catering.restaurant'))) && <BookingPanel id={recommendation.placeId ?? recommendation.name} name={recommendation.name} address={recommendation.address} website={recommendation.metadata?.website} reservationUrl={recommendation.metadata?.reservationUrl} initialContext={initialContext} />}
              <Pressable accessibilityRole="button" accessibilityState={{expanded:expandedCards.includes(recommendation.placeId ?? recommendation.name)}} onPress={()=>setExpandedCards(current=>current.includes(recommendation.placeId ?? recommendation.name)?current.filter(id=>id!==(recommendation.placeId ?? recommendation.name)):[...current,recommendation.placeId ?? recommendation.name])}><Text style={{color:'#625C53',paddingTop:16}}>{expandedCards.includes(recommendation.placeId ?? recommendation.name)?'Hide details':'View details'}</Text></Pressable>
              {expandedCards.includes(recommendation.placeId ?? recommendation.name) && <View>
              {Object.entries(recommendation.experienceEvidence ?? {}).filter(([keyword, evidence]) => evidence.status === "SUPPORTED" && evidence.sources.length > 0 && (selectedKeywords.length === 0 || selectedKeywords.includes(keyword))).map(([keyword, evidence]) => (
                <View key={keyword}>
                  <Text style={styles.reasonLabel}>{keyword} · {evidence.status === "SUPPORTED" ? "Source checked" : evidence.status === "NOT_SUPPORTED" ? "Does not match" : "Not verified"}</Text>
                  <Text style={styles.reasonText}>{evidence.summary}</Text>
                  {evidence.sources.map(source => (
                    <Pressable key={source.url} accessibilityRole="link" onPress={() => Linking.openURL(source.url)}>
                      <Text style={styles.reasonText}>Source: {source.title} ↗</Text>
                    </Pressable>
                  ))}
                </View>
              ))}

              <Text
                style={[
                  styles.reasonLabel,
                  styles.secondReason,
                ]}
              >
                About this recommendation
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
              </View>}
            </View>
          )
        )
      )}

      <SearchSuggestions widgets={searchSuggestions} />

      {recommendations.length > 0 && (
        <Text style={styles.resultsCount}>
          {recommendations.length} results
        </Text>
      )}
      </View>

    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    filterHint: {fontSize: 13, lineHeight: 19, color: "#666", marginTop: 16, marginBottom: 12},
    updateButton: {backgroundColor: "#174D43", borderRadius: 16, paddingVertical: 17, alignItems: "center", marginBottom: 24},
    updateButtonDisabled: {opacity: 0.4},
    updateButtonText: {color: "white", fontSize: 16, fontWeight: "700"},
    appliedSummary: {fontSize: 14, lineHeight: 21, color: "#444", marginBottom: 20},
    updatingStatus: {flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16},
    page: {
      flex: 1,
      backgroundColor:
        "#F8F5EB",
    },

    content: {
      width: "100%",
      maxWidth: 1120,
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
      color: "#174D43",
    },

    logo: {
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 3,
      marginBottom: 42,
      color: "#174D43",
    },

    eyebrow: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.5,
      marginBottom: 8,
      color: "#174D43",
    },

    title: {
      fontSize: 36,
      fontWeight: "900",
      lineHeight: 40,
      color: "#174D43",
    },

    location: {
      marginTop: 8,
      fontSize: 15,
      color: "#666",
      marginBottom: 26,
    },

    placeCard: {
      backgroundColor: "#174D43",
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
        "#FFFCF4",
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
      color: "#174D43",
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
        "#F8F5EB",
    },

    keywordBadgeSelected: {
      backgroundColor: "#174D43",
      borderColor: "#174D43",
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
      color: "#174D43",
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
        "#FFFCF4",
      borderRadius: 16,
      padding: 15,
    },

    preferenceCardSelected: {
      backgroundColor: "#174D43",
      borderColor: "#174D43",
    },

    preferenceLabel: {
      fontSize: 16,
      fontWeight: "800",
      color: "#174D43",
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
        "#FFFCF4",
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },

    distanceButtonSelected: {
      backgroundColor: "#174D43",
      borderColor: "#174D43",
    },

    distanceButtonText: {
      fontSize: 13,
      fontWeight: "800",
      color: "#174D43",
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
        "#FFFCF4",
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
      color: "#174D43",
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
        "#FFFCF4",
      padding: 28,
    },

    loadingTitle: {
      marginTop: 15,
      fontSize: 20,
      fontWeight: "900",
      color: "#174D43",
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
        "#FFFCF4",
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
      color: "#174D43",
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
      backgroundColor: "#174D43",
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
      color: "#174D43",
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
      backgroundColor: "#174D43",
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
        "#FFFCF4",
    },

    errorTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: "#174D43",
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
        "#FFFCF4",
    },

    emptyTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: "#174D43",
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

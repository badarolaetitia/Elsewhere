import pilotCatalog from '../data/nyc-pilot-venues.json';
import {DISCOVERY_CITY} from '../lib/discovery-scope';
import ScheduleInput from "../components/schedule-input";
import {useAccount} from '../components/account-provider';
import Brand from "../components/brand";
import { learnedTaste, learnedAvoids, readVisits } from "../lib/visit-feedback";
import { normalizeSearchContext } from "../lib/search-context";
import { readSavedPlaces } from "../lib/taste-profile";
import { router, useFocusEffect } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const {dataVersion}=useAccount();
  const desktop=useWindowDimensions().width>=1000;
  const [searchQuery, setSearchQuery] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [intent, setIntent] = useState("");
  const city = DISCOVERY_CITY;
  const [mode, setMode] = useState<'discover' | 'tonight'>("discover");
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState("2");
  const [useTaste, setUseTaste] = useState(true);
  const [formError, setFormError] = useState("");
  const [visits,setVisits] = useState(readVisits());
  const [saved,setSaved] = useState(readSavedPlaces());
  useEffect(()=>{setSaved(readSavedPlaces());setVisits(readVisits());},[dataVersion]);
  useFocusEffect(useCallback(()=>{setSaved(readSavedPlaces());setVisits(readVisits());},[]));

  function handleSearch() {
    const cleanedQuery = searchQuery.trim();

    if (!cleanedQuery) {
      return;
    }

    const context = normalizeSearchContext({intent: [...priorities.map((value,index)=>`Priority ${index+1}: ${value}`),intent].filter(Boolean).join("; "), city, mode, date, time, partySize, taste: useTaste ? learnedTaste(visits) : [], avoid: useTaste ? learnedAvoids(visits) : []});
    if (mode === 'tonight' && (!city.trim() || !context.date || context.time !== time || String(context.partySize) !== partySize)) {
      setFormError("Enter a valid date and time, and a party size between 1 and 12.");
      return;
    }
    setFormError("");
    router.navigate({
      pathname: "/results",
      params: {
        place: cleanedQuery,
        context: JSON.stringify(context),
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content,desktop&&styles.desktopContent]}>
          <View style={[styles.hero,desktop&&styles.desktopHero]}>
          <Brand/>

          <Text style={[styles.title,desktop&&styles.desktopTitle]}>
            Everyone&apos;s going there.
          </Text>

          <Text style={[styles.subtitle,desktop&&styles.desktopTitle]}>
            Find somewhere better.
          </Text>

          {desktop&&<Text style={styles.desktopDescription}>Discover food and drink across West Village.</Text>}
          </View>
          <View style={desktop?styles.desktopForm:undefined}>
          <View style={styles.searchSection}>
            <Text style={styles.question}>
              Search our West Village pilot
            </Text>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Place to find alternatives for"
              placeholder="e.g. Via Carota or Magnolia Bakery"
              placeholderTextColor="#8A8A8A"
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />

            <Text style={{color:'#686D60',fontSize:12}}>{pilotCatalog.venues.length} identity-matched places · West Village. Search by name or select a suggestion.</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{pilotCatalog.venues.filter(venue=>!searchQuery.trim() || [venue.name,...venue.aliases].some(name=>name.toLowerCase().includes(searchQuery.trim().toLowerCase()))).slice(0,8).map(venue=><Pressable accessibilityRole="button" key={venue.id} onPress={()=>setSearchQuery(venue.name)} style={{padding:8,borderRadius:16,borderWidth:1,borderColor:'#D6CFC3'}}><Text style={{color:'#174D43',fontSize:12}}>{venue.name}</Text></Pressable>)}</View>
            <Text style={{fontSize:15,fontWeight:'600',marginTop:8}}>Your priorities</Text>
            <Text style={{color:"#686D60",fontSize:12}}>Select your preferences in order of importance.</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {['Food & products','Atmosphere','Experience'].map(label=><Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked:priorities.includes(label)}} onPress={()=>setPriorities(current=>current.includes(label)?current.filter(item=>item!==label):[...current,label])} style={{paddingHorizontal:13,paddingVertical:10,borderRadius:22,borderWidth:1,borderColor:'#D6CFC3',backgroundColor:priorities.includes(label)?'#174D43':'#FFFCF4'}}><Text style={{color:priorities.includes(label)?'white':'#174D43',fontSize:13}}>{priorities.includes(label)?`${priorities.indexOf(label)+1}. `:''}{label}</Text></Pressable>)}
            </View>
            <View style={{flexDirection:'row',justifyContent:'space-between',gap:12}}>
              <Pressable accessibilityRole="button" accessibilityState={{expanded:showPreferences}} onPress={()=>setShowPreferences(!showPreferences)}><Text style={{color:'#625C53',paddingVertical:8}}>{showPreferences?'Hide details':'Add details'}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{expanded:mode==='tonight'}} onPress={()=>setMode(mode==='tonight'?'discover':'tonight')}><Text style={{color:'#625C53',paddingVertical:8}}>{mode==='tonight'?'Hide dinner details':'Dinner options'}</Text></Pressable>
            </View>
            {(showPreferences || priorities.length>0) && <View style={{gap:12,paddingVertical:10}}>
              <Text style={styles.question}>What are you looking for?</Text>
              <TextInput accessibilityLabel="Preferences" value={intent} onChangeText={setIntent} maxLength={240} placeholder="Choose a documented detail on the results page" style={styles.input} />

            </View>}
            {mode==='tonight' && <View style={{gap:10,padding:18,backgroundColor:'#E7EBD8',borderRadius:18}}>
              <Text style={styles.question}>Dinner plans</Text>
              <Text style={{color:'#174D43',fontWeight:'600'}}>New York City</Text>
              <Text>Date</Text>
              <ScheduleInput kind="date" label="Dinner date" value={date} onChange={setDate} />
              <View style={{flexDirection:'row',gap:12}}>
                <View style={{flex:1,gap:8}}><Text>Time</Text><ScheduleInput kind="time" label="Dinner time" value={time} onChange={setTime} /></View>
                <View style={{flex:1,gap:8}}><Text>Guests</Text><ScheduleInput kind="number" label="Party size" value={partySize} onChange={setPartySize} /></View>
              </View>
              <Text style={{color:'#625C53',fontSize:13}}>Reservations are completed on the booking site.</Text>
            </View>}
            {(learnedTaste(visits).length>0 || learnedAvoids(visits).length>0) && <Pressable accessibilityRole="checkbox" accessibilityState={{checked:useTaste}} onPress={()=>setUseTaste(!useTaste)}><Text style={{color:'#174D43'}}>{useTaste?'☑':'☐'} Personalize using my ratings</Text></Pressable>}
            {formError.length > 0 && <Text accessibilityRole="alert" style={{color:'#A42D24',marginTop:12}}>{formError}</Text>}

            <Pressable
              accessibilityRole="button"
              style={[
                styles.searchButton,
                !searchQuery.trim() &&
                  styles.searchButtonDisabled,
              ]}
              onPress={handleSearch}
              disabled={!searchQuery.trim()}
            >
              <Text style={styles.searchButtonText}>
                {mode === "tonight" ? "Find restaurants" : "Find alternatives"}
              </Text>
            </Pressable>

          </View>

          {saved.length > 0 && <View style={{marginTop:24,gap:10}}>
            <Text style={styles.sectionTitle}>Saved places</Text>
            {saved.slice(0,5).map(item=><Pressable key={item.id} onPress={()=>setSearchQuery(`${item.name}, ${item.address}`)} style={{padding:14,borderRadius:14,backgroundColor:'#E7EBD8'}}><Text>{item.name}</Text><Text style={{color:'#666',marginTop:4}}>{item.interests.join(' · ') || 'Saved for later'}</Text></Pressable>)}
          </View>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F5EB",
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

  desktopContent: {maxWidth:1320,paddingHorizontal:64,paddingTop:64,flexDirection:'row',gap:80,alignItems:'flex-start'},
  hero: {},
  desktopHero: {flex:1,paddingTop:34},
  desktopTitle: {fontSize:54,lineHeight:62},
  desktopDescription: {fontSize:19,lineHeight:30,color:'#736D62',maxWidth:410},
  desktopForm: {flex:1,backgroundColor:'#FFFCF4',borderRadius:28,borderWidth:1,borderColor:'#E0D9CE',padding:32},
  logo: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 4,
    color: "#174D43",
    marginBottom: 36,
  },

  title: {
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 40,
    color: "#174D43",
  },

  subtitle: {
    fontSize: 36,
    fontWeight: "300",
    lineHeight: 40,
    color: "#174D43",
    marginBottom: 34,
  },

  searchSection: {
    gap: 14,
  },

  question: {
    fontSize: 21,
    fontWeight: "700",
    color: "#174D43",
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
    color: "#174D43",
  },

  searchButton: {
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: "center",
    backgroundColor: "#174D43",
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
    color: "#174D43",
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
    color: "#174D43",
  },

  sectionLink: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
  },

  mapPlaceholder: {
    minHeight: 280,
    borderRadius: 24,
    backgroundColor: "#E7EBD8",
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
    color: "#174D43",
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
    backgroundColor: "#174D43",
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
    color: "#174D43",
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
    color: "#174D43",
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
    backgroundColor: "#174D43",
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
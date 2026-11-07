import {router} from 'expo-router';
import {useAccount} from '../components/account-provider';
import {useCallback,useState,useEffect} from 'react';
import {useFocusEffect} from 'expo-router';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {readVisits,removeVisit} from '../lib/visit-feedback';
import {readSavedPlaces,readTasteSettings,writeTasteSettings,type TasteChoice} from '../lib/taste-profile';
import {buildDiscoveryProfile} from '../lib/discovery-profile';
import {tasteFeatureLabels} from '../lib/discovery-taste';
import VisitFeedback from '../components/visit-feedback';
import Brand from '../components/brand';
import styles from '../components/collection-styles';
export default function TasteScreen(){
  const {user,status,dataVersion}=useAccount();
  const [visits,setVisits]=useState(readVisits());
  const [saved,setSaved]=useState(readSavedPlaces());
  const [settings,setSettings]=useState(readTasteSettings);
  const [editing,setEditing]=useState<string|null>(null);
  const [featureQuery,setFeatureQuery]=useState('');
  const [adding,setAdding]=useState(false);
  const refresh=useCallback(()=>{setVisits(readVisits());setSaved(readSavedPlaces());setSettings(readTasteSettings());},[]);
  useEffect(refresh,[dataVersion,refresh]);
  useFocusEffect(refresh);
  const profile=buildDiscoveryProfile(saved,visits,settings);
  function correct(feature:string,choice:TasteChoice|'auto'){
    const current=readTasteSettings(),choices={...current.choices};
    if(choice==='auto')delete choices[feature];else choices[feature]=choice;
    setSettings(writeTasteSettings({...current,choices}));setEditing(null);setAdding(false);setFeatureQuery('');
  }
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><Brand/><Pressable accessibilityRole="button" onPress={()=>router.navigate('/account')}><Text style={styles.action}>Account settings</Text></Pressable><Text style={styles.title}>Profile</Text><Text style={styles.muted}>Your preferences and visit history.</Text>
    {!user&&<View style={styles.card}><Text style={styles.name}>Keep your preferences</Text><Text style={styles.muted}>Sign in to sync your preferences and save private visit ratings.</Text><Pressable accessibilityRole="button" onPress={()=>router.navigate('/account')} style={styles.button}><Text style={styles.buttonText}>Sign in</Text></Pressable></View>}
    <View style={styles.card}>
      <Text style={styles.name}>Your taste</Text>
      <Text style={styles.muted}>Based on {profile.usedSaves} saved {profile.usedSaves===1?'place':'places'} and {profile.usedVisits} rated {profile.usedVisits===1?'visit':'visits'}. Saves suggest interest; explicit visit feedback carries more weight. Your current request comes first.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Personalize recommendations" aria-checked={settings.enabled} accessibilityState={{checked:settings.enabled}} onPress={()=>setSettings(writeTasteSettings({...readTasteSettings(),enabled:!settings.enabled}))}><Text style={styles.action}>{settings.enabled?'☑':'☐'} Personalize recommendations</Text></Pressable>
      {profile.traits.length===0&&<Text style={styles.muted}>Save a place, rate a visit, or add a preference to get started.</Text>}
      {profile.traits.map(trait=><View key={trait.feature} style={{gap:4,marginTop:12}}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${trait.feature} preference`} onPress={()=>{setEditing(editing===trait.feature?null:trait.feature);setAdding(false);}}><Text style={styles.action}>{trait.feature} · {trait.score>0?'Prefer':trait.score<0?'Prefer to avoid':'Not used'} · Edit</Text></Pressable>
        <Text style={styles.muted}>{trait.explanation}</Text>
      </View>)}
      <Pressable accessibilityRole="button" accessibilityState={{expanded:adding}} onPress={()=>{setAdding(!adding);setEditing(null);}}><Text style={styles.action}>{adding?'Cancel':'Add a preference'}</Text></Pressable>
      {adding&&<View style={{gap:8}}>
        <TextInput accessibilityLabel="Find a preference" placeholder="e.g. Pasta or courtyard dining" value={featureQuery} onChangeText={setFeatureQuery} style={{borderWidth:1,borderColor:'#D7D0C4',borderRadius:12,padding:12}}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{tasteFeatureLabels.filter(label=>label.toLowerCase().includes(featureQuery.toLowerCase())).slice(0,8).map(label=><Pressable key={label} accessibilityRole="button" onPress={()=>{setEditing(label);setAdding(false);}} style={{padding:10,borderRadius:18,backgroundColor:'#EEE9DF'}}><Text style={{color:'#174D43'}}>{label}</Text></Pressable>)}</View>
      </View>}
      {editing&&<View style={{gap:10,marginTop:12}}>
        <Text style={styles.name}>{editing}</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{([{value:'prefer',label:'Prefer'},{value:'avoid',label:'Prefer to avoid'},{value:'ignore',label:'Don’t use'},{value:'auto',label:'Use my activity'}] as const).map(option=><Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${option.label}: ${editing}`} onPress={()=>correct(editing,option.value)} style={{padding:12,borderRadius:18,backgroundColor:'#EEE9DF'}}><Text style={{color:'#174D43'}}>{option.label}</Text></Pressable>)}</View>
      </View>}
    </View>
    <Text style={styles.name}>Visit history · {visits.length}</Text>
    {visits.map(visit=><View key={visit.id} style={styles.card}><Text style={styles.name}>{visit.name}</Text><Text style={styles.muted}>{visit.address}</Text><Text style={{color:'#A84B30'}}>Your rating · {'★'.repeat(visit.rating)}{'☆'.repeat(5-visit.rating)}</Text><Text style={styles.muted}>{visit.liked.join(' · ')}</Text>{Boolean(visit.disliked?.length)&&<Text style={styles.muted}>Prefer to avoid: {visit.disliked?.join(' · ')}</Text>}{visit.note.length>0&&<Text>{visit.note}</Text>}<VisitFeedback {...visit} onSaved={()=>setVisits(readVisits())}/><Pressable accessibilityRole="button" onPress={()=>setVisits(removeVisit(visit.id))}><Text style={styles.action}>Delete rating</Text></Pressable></View>)}
    <Text style={styles.muted}>{user?'Your ratings are private.':'Sign in to save your visit history.'}</Text>
  </ScrollView>;
}

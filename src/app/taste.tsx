import {router} from 'expo-router';
import {useAccount} from '../components/account-provider';
import {useCallback,useState,useEffect} from 'react';
import {useFocusEffect} from 'expo-router';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {learnedTaste,learnedAvoids,readVisits,removeVisit} from '../lib/visit-feedback';
import VisitFeedback from '../components/visit-feedback';
import Brand from '../components/brand';
import styles from '../components/collection-styles';
export default function TasteScreen(){
  const {user,status,dataVersion}=useAccount();
  const [visits,setVisits]=useState(readVisits());
  useEffect(()=>{setVisits(readVisits());},[dataVersion]);
  useFocusEffect(useCallback(()=>{setVisits(readVisits());},[]));
  const taste=learnedTaste(visits);
  const avoid=learnedAvoids(visits);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><Brand/><Pressable accessibilityRole="button" onPress={()=>router.navigate('/account')}><Text style={styles.action}>Account settings</Text></Pressable><Text style={styles.title}>Profile</Text><Text style={styles.muted}>Your preferences and visit history.</Text>
    {!user&&<View style={styles.card}><Text style={styles.name}>Personalize your recommendations</Text><Text style={styles.muted}>Sign in to save private ratings and personalize your recommendations.</Text><Pressable accessibilityRole="button" onPress={()=>router.navigate('/account')} style={styles.button}><Text style={styles.buttonText}>Sign in</Text></Pressable></View>}
    <View style={styles.card}><Text style={styles.name}>Preferences</Text><Text style={styles.muted}>{taste.length?taste.join(' · '):'Your preferences will appear here after you rate a visit.'}</Text>{avoid.length>0&&<Text style={styles.muted}>Prefer to avoid: {avoid.join(' · ')}</Text>}</View>
    <Text style={styles.name}>Visit history · {visits.length}</Text>
    {visits.map(visit=><View key={visit.id} style={styles.card}><Text style={styles.name}>{visit.name}</Text><Text style={styles.muted}>{visit.address}</Text><Text style={{color:'#A84B30'}}>Your rating · {'★'.repeat(visit.rating)}{'☆'.repeat(5-visit.rating)}</Text><Text style={styles.muted}>{visit.liked.join(' · ')}</Text>{Boolean(visit.disliked?.length)&&<Text style={styles.muted}>Prefer to avoid: {visit.disliked?.join(' · ')}</Text>}{visit.note.length>0&&<Text>{visit.note}</Text>}<VisitFeedback {...visit} onSaved={()=>setVisits(readVisits())}/><Pressable accessibilityRole="button" onPress={()=>setVisits(removeVisit(visit.id))}><Text style={styles.action}>Delete rating</Text></Pressable></View>)}
    <Text style={styles.muted}>{user?'Your ratings are private.':'Sign in to save your visit history.'}</Text>
  </ScrollView>;
}

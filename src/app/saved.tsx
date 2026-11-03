import {useAccount} from '../components/account-provider';
import Brand from "../components/brand";
import VisitFeedback from "../components/visit-feedback";
import {useCallback,useState,useEffect} from 'react';
import {router,useFocusEffect} from 'expo-router';
import {Linking,Pressable,ScrollView,Text,View} from 'react-native';
import {readSavedPlaces,removeSavedPlace} from '../lib/taste-profile';
import BookingPanel from '../components/booking-panel';
import styles from '../components/collection-styles';

export default function SavedScreen() {
  const {user,status,dataVersion}=useAccount();
  const [places,setPlaces]=useState(readSavedPlaces());
  const [notice,setNotice]=useState('');
  useEffect(()=>{setPlaces(readSavedPlaces());},[dataVersion]);
  useFocusEffect(useCallback(()=>{setPlaces(readSavedPlaces());},[]));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Brand/><Text style={styles.title}>Saved places</Text>
    <Text style={styles.muted}>Places saved for later.</Text>
    {notice.length>0 && <Text accessibilityRole="alert" style={styles.muted}>{notice}</Text>}
    {places.length===0 && <View style={styles.card}><Text style={styles.name}>No saved places yet</Text><Text style={styles.muted}>Save places from your search results to find them here.</Text><Pressable accessibilityRole="button" onPress={()=>router.navigate('/')} style={styles.button}><Text style={styles.buttonText}>Explore places</Text></Pressable></View>}
    {places.map(place=><View key={place.id} style={styles.card}>
      <Text style={styles.name}>{place.name}</Text><Text style={styles.muted}>{place.address}</Text>
      {place.interests.length>0 && <Text style={styles.muted}>{place.interests.join(' · ')}</Text>}
      <Pressable accessibilityRole="link" onPress={async()=>{try{await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`);}catch{setNotice('Could not open maps. Please try again.');}}}><Text style={styles.action}>Directions ↗</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>router.navigate({pathname:'/results',params:{place:`${place.name}, ${place.address}`}})}><Text style={styles.action}>Find alternatives →</Text></Pressable>
      <VisitFeedback {...place}/>
      {place.categoryFamily==='restaurant' && <BookingPanel id={place.id} name={place.name} address={place.address}/>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name} from saved`} onPress={()=>{setPlaces(removeSavedPlace(place.id));setNotice(`${place.name} removed from Saved.`);}}><Text style={[styles.action,{color:'#8B4C3A'}]}>Remove</Text></Pressable>
    </View>)}
    <Text style={styles.muted}>{user?'':'Sign in to access your saved places on other devices.'}</Text>
  </ScrollView>;
}

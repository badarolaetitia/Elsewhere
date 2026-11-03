import {useAccount} from '../components/account-provider';
import Brand from "../components/brand";
import {useCallback,useState,useEffect} from 'react';
import {router,useFocusEffect} from 'expo-router';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {readDinnerPlans,removeDinnerPlan} from '../lib/dinner-plans';
import BookingPanel from '../components/booking-panel';
import styles from '../components/collection-styles';
export default function PlansScreen() {
  const {dataVersion}=useAccount();
  const [plans,setPlans]=useState(readDinnerPlans());
  useEffect(()=>{setPlans(readDinnerPlans());},[dataVersion]);
  useFocusEffect(useCallback(()=>{setPlans(readDinnerPlans());},[]));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Brand/><Text style={styles.title}>Plans</Text>
    <Text style={styles.muted}>Saved dining plans. Reservations must be confirmed separately.</Text>
    {plans.length===0 && <View style={styles.card}><Text style={styles.name}>No plans yet</Text><Text style={styles.muted}>Add a dining plan from a restaurant’s details.</Text><Pressable accessibilityRole="button" style={styles.button} onPress={()=>router.navigate('/')}><Text style={styles.buttonText}>Find a restaurant</Text></Pressable></View>}
    {plans.map(plan=><View key={plan.id} style={styles.card}>
      <Text style={styles.name}>{plan.name}</Text><Text style={styles.muted}>{plan.address}</Text>
      <Text>{plan.context.date} · {plan.context.time} · {plan.context.partySize} guests</Text>
      <Text style={{color:'#8B4C3A',fontWeight:'600'}}>Reservation not confirmed</Text>
      <BookingPanel key={`${plan.id}:${plan.context.date}:${plan.context.time}:${plan.context.partySize}`} id={plan.id} name={plan.name} address={plan.address} website={plan.website} reservationUrl={plan.reservationUrl} initialContext={plan.context} initiallyOpen onSaved={()=>setPlans(readDinnerPlans())}/>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${plan.name} from plans`} onPress={()=>setPlans(removeDinnerPlan(plan.id))}><Text style={[styles.action,{color:'#8B4C3A'}]}>Remove plan</Text></Pressable>
    </View>)}
  </ScrollView>;
}

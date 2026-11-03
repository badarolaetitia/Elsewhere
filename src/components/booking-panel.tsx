import {venueDestination} from '../lib/venue-links';
import ScheduleInput from './schedule-input';
import {useState} from 'react';
import {Linking,Pressable,Text,TextInput,View} from 'react-native';
import {normalizeSearchContext,type SearchContext} from '../lib/search-context';
import {saveDinnerPlan,readDinnerPlans} from '../lib/dinner-plans';

export default function BookingPanel({id,name,address,website,reservationUrl,initialContext,onSaved,initiallyOpen=false}:{id:string;name:string;address:string;website?:string;reservationUrl?:string;initialContext?:SearchContext;onSaved?:()=>void;initiallyOpen?:boolean}) {
  const destination=venueDestination(website,reservationUrl);
  const [open,setOpen]=useState(initiallyOpen);
  const [date,setDate]=useState(initialContext?.date || (()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})());
  const [time,setTime]=useState(initialContext?.time??'19:00');
  const [guests,setGuests]=useState(String(initialContext?.partySize??2));
  const [isPlanned,setIsPlanned]=useState(readDinnerPlans().some(plan=>plan.id===id));
  const [message,setMessage]=useState('');
  function details() {
    const context=normalizeSearchContext({mode:'tonight',city:initialContext?.city||address,date,time,partySize:guests});
    if(!context.date || context.time!==time || context.partySize!==Number(guests)) {setMessage('Enter a valid date, time and 1–12 guests.');return null;}
    setMessage('');return context;
  }
  return <View style={{marginTop:16,gap:10}}>
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)}><Text style={{fontWeight:'600',fontSize:15}}>{open?'Hide dining details':'Plan a visit'}</Text></Pressable>
    {open && <View style={{gap:10,padding:14,backgroundColor:'#E7EBD8',borderRadius:14}}>
      <Text>Date</Text><ScheduleInput kind="date" label={`Dinner date at ${name}`} value={date} onChange={setDate}/>
      <View style={{flexDirection:'row',gap:12}}>
        <View style={{flex:1,gap:6}}><Text>Time</Text><ScheduleInput kind="time" label={`Dinner time at ${name}`} value={time} onChange={setTime}/></View>
        <View style={{flex:1,gap:6}}><Text>Guests</Text><ScheduleInput kind="number" label={`Guests at ${name}`} value={guests} onChange={setGuests}/></View>
      </View>
      <Pressable accessibilityRole="link" accessibilityState={{disabled:!destination}} disabled={!destination} onPress={async()=>{if(destination)try{await Linking.openURL(destination.url);}catch{setMessage('Could not open booking options. Please try again.');}}} style={{backgroundColor:'#174D43',opacity:destination?1:0.4,padding:14,borderRadius:12}}><Text style={{color:'white',textAlign:'center',fontWeight:'600'}}>{destination?.label??'Booking link unavailable'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>{const context=details();if(context){saveDinnerPlan({id,name,address,context,...(destination?{website,reservationUrl}: {})});setIsPlanned(true);onSaved?.();setMessage('Plan saved. A reservation has not been made.');}}}><Text style={{textAlign:'center',padding:8}}>{isPlanned?'Update plan':'Save plan'}</Text></Pressable>
      <Text style={{fontSize:12,color:'#625C53',lineHeight:18}}>{destination ? 'Choose your date, time and guests on the restaurant’s website. Saving a plan here does not reserve a table.' : 'No restaurant website is listed for this place. You can still save a plan; a reservation has not been made.'}</Text>
      {message.length>0 && <Text accessibilityRole="alert">{message}</Text>}
    </View>}
  </View>;
}

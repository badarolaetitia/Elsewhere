import {useState} from 'react';
import {router} from 'expo-router';
import {Pressable,Text,TextInput,View} from 'react-native';
import {checkedVenues} from '../lib/pilot-catalog';
import {addCrowdReport,describeReading,type CrowdLevel} from '../lib/crowd-evidence';
import {crowdForVenue} from '../lib/crowd-agent';
import {useCrowdEvidence} from '../lib/use-crowd-evidence';
import {useAccount} from './account-provider';

export default function CrowdReportForm({venueId,name,showReading=true}:{venueId:string;name:string;showReading?:boolean}){
  const {user}=useAccount();
  const {reports,now}=useCrowdEvidence();
  const [open,setOpen]=useState(false);
  const [level,setLevel]=useState<CrowdLevel|null>(null);
  const [wait,setWait]=useState('');
  const [message,setMessage]=useState('');
  if(!checkedVenues.some(v=>v.id===venueId))return null;
  const reading=crowdForVenue(venueId,reports,now);
  function submit(){
    if(!user){router.navigate('/account');return;}
    if(!level)return;
    try{addCrowdReport({venueKey:venueId,level,...(wait.trim()?{waitMinutes:Number(wait)}:{})});setOpen(false);setLevel(null);setWait('');setMessage('Crowd report saved on this device.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not save your report.');}
  }
  return <View style={{gap:10,marginTop:12}}>
    {showReading&&reading.label!=='unknown'&&<Text style={{color:'#58685C',fontSize:13}}>{describeReading(reading)}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>{if(!user){router.navigate('/account');return;}setMessage('');setOpen(!open);}}><Text style={{color:'#174D43',fontWeight:'600'}}>{open?'Cancel crowd report':'Report current crowd'}</Text></Pressable>
    {open&&<View style={{gap:10}}>
      <Text>How busy is {name} right now?</Text>
      <View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['quiet','moderate','busy'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} at ${name}`} accessibilityState={{checked:level===value}} onPress={()=>setLevel(value)} style={{backgroundColor:level===value?'#174D43':'#EEE9DF',borderRadius:18,padding:12}}><Text style={{color:level===value?'white':'#343D36'}}>{value[0].toUpperCase()+value.slice(1)}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel={`Wait at ${name} in minutes`} placeholder="Wait in minutes (optional)" value={wait} onChangeText={text=>setWait(text.replace(/[^0-9]/g,'').slice(0,3))} keyboardType="number-pad" style={{borderWidth:1,borderColor:'#D7D0C4',borderRadius:12,padding:12}}/>
      <Text style={{fontSize:12,color:'#625C53'}}>Only report a place you are visiting now. Reports stay private on this device and expire after 2 hours.</Text>
      <Pressable accessibilityRole="button" disabled={!level} onPress={submit} style={{backgroundColor:'#174D43',borderRadius:12,padding:12,opacity:level?1:0.4}}><Text style={{color:'white',textAlign:'center'}}>Save crowd report</Text></Pressable>
    </View>}
    {!!message&&<Text accessibilityRole="alert" style={{fontSize:13,color:'#58685C'}}>{message}</Text>}
  </View>;
}

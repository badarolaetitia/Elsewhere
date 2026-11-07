import {router} from 'expo-router';
import {useAccount} from './account-provider';
import {useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {feedbackTags,readVisits,saveVisit} from '../lib/visit-feedback';
import {checkedVenues} from '../lib/pilot-catalog';
export default function VisitFeedback({id,name,address,categoryFamily,onSaved}:{id:string;name:string;address:string;categoryFamily?:string;onSaved?:()=>void}) {
  const {user}=useAccount();
  const existing=readVisits().find(v=>v.id===id);
  const [open,setOpen]=useState(false);
  const [rating,setRating]=useState(existing?.rating??0);
  const [liked,setLiked]=useState<string[]>(existing?.liked??[]);
  const [disliked,setDisliked]=useState<string[]>(existing?.disliked??[]);
  const [specific,setSpecific]=useState('');
  const [note,setNote]=useState(existing?.note??'');
  const [message,setMessage]=useState('');
  const tags=[...new Set([...(checkedVenues.find(v=>v.id===id)?.features??[]).map(f=>f.label),...feedbackTags])];
  return <View style={{gap:12,marginTop:12}}>
    <Pressable accessibilityRole="button" onPress={()=>{if(!user){router.navigate('/account');return;}setOpen(!open);}} accessibilityState={{expanded:open}}><Text style={{color:'#174D43',fontWeight:'600'}}>{existing?`Your rating: ${existing.rating}/5 · Edit`:'Rate your visit'}</Text></Pressable>
    {open&&<View style={{gap:12}}>
      <Text>Your rating</Text>
      <View style={{flexDirection:'row',gap:12}}>{[1,2,3,4,5].map(star=><Pressable key={star} accessibilityRole="radio" accessibilityLabel={`${star} ${star===1?'star':'stars'}`} accessibilityState={{checked:rating===star}} onPress={()=>setRating(star)}><Text style={{fontSize:30,color:star<=rating?'#A84B30':'#9B9589'}}>{star<=rating?'★':'☆'}</Text></Pressable>)}</View>
      <Text>What did you enjoy?</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[...new Set([...tags,...liked])].map(tag=><Pressable key={tag} accessibilityRole="checkbox" accessibilityState={{checked:liked.includes(tag)}} onPress={()=>{setLiked(current=>current.includes(tag)?current.filter(t=>t!==tag):[...current,tag]);setDisliked(current=>current.filter(t=>t!==tag));}} style={{borderRadius:18,padding:10,backgroundColor:liked.includes(tag)?'#174D43':'#EEE9DF'}}><Text style={{color:liked.includes(tag)?'white':'#343D36'}}>{tag}</Text></Pressable>)}</View>
      <Text>What would you prefer to avoid?</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[...new Set([...tags,...disliked])].map(tag=><Pressable key={tag} accessibilityRole="checkbox" accessibilityLabel={`Avoid ${tag}`} accessibilityState={{checked:disliked.includes(tag)}} onPress={()=>{setDisliked(current=>current.includes(tag)?current.filter(t=>t!==tag):[...current,tag]);setLiked(current=>current.filter(t=>t!==tag));}} style={{borderRadius:18,padding:10,backgroundColor:disliked.includes(tag)?'#A84B30':'#EEE9DF'}}><Text style={{color:disliked.includes(tag)?'white':'#343D36'}}>{tag}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel={`Specific favourite at ${name}`} placeholder="Add a specific dish or experience (optional)" value={specific} onChangeText={setSpecific} maxLength={60} style={{borderWidth:1,borderColor:'#D7D0C4',borderRadius:12,padding:12}}/>
      <TextInput accessibilityLabel={`Visit notes for ${name}`} placeholder="Add a note (optional)" value={note} onChangeText={setNote} maxLength={240} multiline style={{borderWidth:1,borderColor:'#D7D0C4',borderRadius:12,padding:12}}/>
      <Pressable accessibilityRole="button" disabled={!rating} onPress={()=>{if(!user){router.navigate('/account');return;}saveVisit({id,name,address,categoryFamily,rating,disliked,liked:[...liked,...(specific.trim()?[specific.trim()]:[])],note});setLiked(current=>[...new Set([...current,...(specific.trim()?[specific.trim()]:[])])]);setSpecific('');setMessage('Rating saved.');onSaved?.();setOpen(false);}} style={{backgroundColor:'#174D43',padding:14,borderRadius:12,opacity:rating?1:0.4}}><Text style={{color:'white',textAlign:'center'}}>Save rating</Text></Pressable>
    </View>}
    {message.length>0&&<Text accessibilityRole="alert" style={{color:'#58685C',fontSize:13}}>{message}</Text>}
  </View>;
}

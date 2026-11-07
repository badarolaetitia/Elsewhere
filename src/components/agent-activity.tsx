import {ActivityIndicator,Text,View} from 'react-native';
import type {AgentProgress} from '../lib/agent-progress';
export default function AgentActivity({steps}:{steps:AgentProgress[]}){
 return <View testID="agent-activity" style={{gap:12,marginTop:12,marginBottom:18,padding:16,borderRadius:16,backgroundColor:'#EEEFE5'}}>
  <Text style={{fontSize:18,fontWeight:'600',color:'#174D43'}}>Agent activity</Text>
  {steps.map(step=><View key={step.name} style={{gap:4}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
    {step.status==='Working'&&<ActivityIndicator size="small" color="#174D43"/>}
    <Text style={{fontWeight:'600',color:'#174D43'}}>{step.name}</Text>
    <Text style={{fontSize:12,color:step.status==='Unavailable'?'#8B4C3A':'#625C53'}}>{step.status==='Complete'?'✓ ':''}{step.status}</Text>
   </View>
   <Text style={{fontSize:13,lineHeight:19,color:'#625C53'}}>{step.detail}</Text>
  </View>)}
 </View>;
}

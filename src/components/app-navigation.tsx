import {router,usePathname} from 'expo-router';
import {Pressable,Text,View} from 'react-native';
export default function AppNavigation() {
  const path=usePathname();
  return <View style={{flexDirection:'row',backgroundColor:'#F8F5EB',borderTopWidth:1,borderColor:'#DDD7CE',paddingTop:12,paddingBottom:24}}>
    {([{path:'/',label:'Discover'},{path:'/saved',label:'Saved'},{path:'/plans',label:'Plans'},{path:'/taste',label:'Profile'}] as const).map(item=><Pressable key={item.path} accessibilityRole="tab" accessibilityState={{selected:item.path==='/'?path==='/'||path==='/results':path===item.path}} onPress={()=>router.navigate(item.path)} style={{flex:1,alignItems:'center',paddingVertical:10}}><Text style={{fontSize:15,fontWeight:path===item.path?'700':'400',color:'#174D43'}}>{item.label}</Text></Pressable>)}
  </View>;
}

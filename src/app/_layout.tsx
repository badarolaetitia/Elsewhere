import {View,Pressable,Text,Linking} from 'react-native';
import {Stack,router} from 'expo-router';
import AppNavigation from '../components/app-navigation';
import {AccountProvider,useAccount} from '../components/account-provider';
import '../global.css';
function AppShell(){
  const {user,status}=useAccount();
  return <View key={user?.id??'guest'} style={{flex:1,backgroundColor:'#F8F5EB'}}>
    <View style={{paddingHorizontal:24,paddingTop:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:12,color:'#626D61'}}>{user&&status!=='All changes saved'?status:''}</Text><Pressable accessibilityRole="button" onPress={()=>router.navigate('/account')} style={{paddingVertical:10,paddingHorizontal:20,borderRadius:24,backgroundColor:user?'transparent':'#174D43'}}><Text style={{fontSize:14,color:user?'#174D43':'#FFFDF6',fontWeight:'600'}}>{user?'Account':'Log in'}</Text></Pressable></View>
    <Stack screenOptions={{headerShown:false}}/><AppNavigation/>
    <View style={{flexDirection:'row',justifyContent:'center',flexWrap:'wrap',gap:4,paddingBottom:8,paddingHorizontal:16}}><Text style={{fontSize:10,color:'#6B7067'}}>Place data:</Text><Pressable accessibilityRole="link" onPress={()=>Linking.openURL('https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j')}><Text style={{fontSize:10,color:'#6B7067'}}>NYC Open Data</Text></Pressable><Text style={{fontSize:10,color:'#6B7067'}}>·</Text><Pressable accessibilityRole="link" onPress={()=>Linking.openURL('https://huggingface.co/datasets/MongoDB/whatscooking.restaurants')}><Text style={{fontSize:10,color:'#6B7067'}}>MongoDB dataset</Text></Pressable></View>
  </View>;
}
export default function RootLayout(){return <AccountProvider><AppShell/></AccountProvider>;}

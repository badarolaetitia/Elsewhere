import {useState} from 'react';
import {Image,Linking,Pressable,Text,View} from 'react-native';
import {mapViewport} from '../lib/map-projection';
import type {AreaInvestigation} from '../lib/area-crowd';

const colors={lower:'#38796A',typical:'#B28B34',higher:'#B05C44',insufficient:'#727A76'};
export default function AreaHeatmap({investigation,onSelect,onViewPlace,selectedId}:{investigation:AreaInvestigation;onSelect:(id:string)=>void;onViewPlace:(id:string)=>void;selectedId:string|null}){
  const [width,setWidth]=useState(360),[zoom,setZoom]=useState(15),[tilesFailed,setTilesFailed]=useState(false),[showLog,setShowLog]=useState(false);
  const [center,setCenter]=useState({lat:40.73475,lng:-74.00425});
  const height=420,view=mapViewport(width,height,zoom,center);
  const selected=investigation.venues.find(v=>v.id===selectedId);
  return <View style={{gap:12,marginBottom:24}}>
    <Text style={{fontSize:22,fontWeight:'700',color:'#174D43'}}>Around your alternatives</Text>
    <Text style={{color:'#625C53',lineHeight:20}}>Estimated area activity · {investigation.atLocal.slice(0,16).replace('T',' ')} New York time. Shading reflects historical station entries and located permitted events, not live restaurant crowds.</Text>
    <View onLayout={event=>setWidth(Math.max(240,event.nativeEvent.layout.width))} style={{height,borderRadius:20,overflow:'hidden',backgroundColor:'#E5E8DF',borderWidth:1,borderColor:'#D7D0C4'}}>
      {view.tiles.map(tile=><Image key={`${zoom}-${tile.x}-${tile.y}`} accessibilityIgnoresInvertColors accessible={false} onError={()=>setTilesFailed(true)} source={{uri:`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}} style={{position:'absolute',left:tile.left,top:tile.top,width:256,height:256}}/>)}
      {investigation.heat.map((cell,i)=>{const p=view.position(cell.lat,cell.lng);return <View pointerEvents="none" key={i} style={{position:'absolute',left:p.left-28,top:p.top-28,width:56,height:56,borderRadius:28,backgroundColor:colors[cell.reading.label],opacity:0.16}}/>;})}
      {investigation.venues.map((venue,i)=>{const p=view.position(venue.latitude,venue.longitude);return <Pressable key={venue.id} accessibilityRole="button" accessibilityLabel={`${venue.name}, ${venue.reading.label==='insufficient'?'no area estimate':`${venue.reading.label} estimated area activity`}`} accessibilityState={{selected:venue.id===selectedId}} onPress={()=>onSelect(venue.id)} style={{position:'absolute',left:p.left-15,top:p.top-15,width:30,height:30,borderRadius:15,backgroundColor:venue.id===selectedId?'#174D43':'#FFFDF6',borderWidth:2,borderColor:colors[venue.reading.label],alignItems:'center',justifyContent:'center',zIndex:venue.id===selectedId?3:1}}><Text style={{fontWeight:'700',fontSize:12,color:venue.id===selectedId?'white':'#174D43'}}>{i+1}</Text></Pressable>;})}
      <View style={{position:'absolute',top:12,right:12,gap:5,zIndex:4}}>{[{label:'Zoom in',text:'+',action:()=>setZoom(z=>Math.min(17,z+1))},{label:'Zoom out',text:'−',action:()=>setZoom(z=>Math.max(14,z-1))},{label:'Reset map',text:'↺',action:()=>{setZoom(15);setCenter({lat:40.73475,lng:-74.00425});}}].map(control=><Pressable key={control.label} accessibilityRole="button" accessibilityLabel={control.label} onPress={control.action} style={{backgroundColor:'#FFFDF6',borderRadius:8,padding:9,alignItems:'center'}}><Text style={{fontSize:20,color:'#174D43'}}>{control.text}</Text></Pressable>)}</View>
      <View style={{position:'absolute',bottom:26,right:12,flexDirection:'row',gap:4,zIndex:4}}>{[{text:'←',dx:-0.003,dy:0,label:'Pan west'},{text:'↑',dx:0,dy:0.003,label:'Pan north'},{text:'↓',dx:0,dy:-0.003,label:'Pan south'},{text:'→',dx:0.003,dy:0,label:'Pan east'}].map(p=><Pressable key={p.label} accessibilityRole="button" accessibilityLabel={p.label} onPress={()=>setCenter(c=>({lat:Math.max(40.725,Math.min(40.745,c.lat+p.dy)),lng:Math.max(-74.015,Math.min(-73.993,c.lng+p.dx))}))} style={{backgroundColor:'#FFFDF6',padding:8,borderRadius:6}}><Text>{p.text}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="link" accessibilityLabel="OpenStreetMap contributors copyright" onPress={()=>Linking.openURL('https://www.openstreetmap.org/copyright')} style={{position:'absolute',bottom:0,right:0,backgroundColor:'#FFFDF6',paddingHorizontal:6,paddingVertical:3,zIndex:4}}><Text style={{fontSize:10}}>© OpenStreetMap contributors</Text></Pressable>
    </View>
    {tilesFailed&&<Text style={{color:'#625C53'}}>Street tiles could not load. Venue positions and area evidence remain available.</Text>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{(['lower','typical','higher','insufficient'] as const).map(level=><Text key={level} style={{fontSize:12,color:colors[level]}}>● {level==='insufficient'?'No estimate':`${level[0].toUpperCase()+level.slice(1)} area activity`}</Text>)}</View>
    {selected&&<View accessibilityLiveRegion="polite" style={{padding:16,borderRadius:14,backgroundColor:'#EEE9DF',gap:8}}>
      <Text style={{color:'#174D43',fontWeight:'700'}}>{selected.name}</Text>
      <Text style={{color:'#625C53'}}>{selected.reading.value===null?'Not enough evidence to estimate this area.':`${selected.reading.label} estimated area activity · low confidence`}</Text>
      {selected.reading.because.map(reason=><Text key={reason} style={{color:'#625C53',lineHeight:19}}>{reason}</Text>)}
      {selected.reading.sources.map(url=><Pressable key={url} accessibilityRole="link" onPress={()=>Linking.openURL(url)}><Text style={{color:'#174D43'}}>View source ↗</Text></Pressable>)}
      <Pressable accessibilityRole="button" onPress={()=>onViewPlace(selected.id)}><Text style={{fontWeight:'600',color:'#174D43'}}>View recommendation ↓</Text></Pressable>
    </View>}
    <Pressable accessibilityRole="button" accessibilityState={{expanded:showLog}} onPress={()=>setShowLog(v=>!v)}><Text style={{fontWeight:'600',color:'#174D43'}}>{showLog?'Hide agent activity':'How the agents compared these places'}</Text></Pressable>
    {showLog&&<View style={{gap:8}}>{investigation.activity.map((step,i)=><Text key={i} style={{color:'#625C53',lineHeight:20}}>{step.agent}: {step.message}</Text>)}{investigation.sources.map(source=><Pressable key={source.kind} accessibilityRole="link" onPress={()=>Linking.openURL(source.url)}><Text style={{color:'#174D43',fontSize:12}}>{source.kind==='transit'?'MTA station history':'NYC permitted events'} · {source.status} · retrieved {source.fetchedAt.slice(0,16).replace('T',' ')} UTC ↗</Text></Pressable>)}</View>}
  </View>;
}

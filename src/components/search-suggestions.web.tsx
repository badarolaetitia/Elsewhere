import {createElement,useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';

function SuggestionWidget({html,index}:{html:string;index:number}){
  const frame=useRef<HTMLIFrameElement>(null);
  const observer=useRef<ResizeObserver|null>(null);
  const [height,setHeight]=useState(72);
  function measure(){
    const body=frame.current?.contentDocument?.body;
    if(!body)return;
    const style=window.getComputedStyle(body);
    const margins=(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
    const content=[...body.children].filter(element=>!['STYLE','SCRIPT','LINK'].includes(element.tagName));
    const bottom=content.length?Math.max(...content.map(element=>element.getBoundingClientRect().bottom))-body.getBoundingClientRect().top:body.getBoundingClientRect().height;
    const measured=Math.ceil(bottom+margins+(parseFloat(style.paddingBottom)||0));
    if(measured>0)setHeight(Math.max(48,measured));
  }
  useEffect(()=>()=>observer.current?.disconnect(),[]);
  function loaded(){
    observer.current?.disconnect();
    measure();
    const body=frame.current?.contentDocument?.body;
    if(body&&typeof ResizeObserver!=='undefined'){
      observer.current=new ResizeObserver(measure);
      observer.current.observe(body);
    }
    void frame.current?.contentDocument?.fonts?.ready.then(measure);
  }
  return createElement('iframe',{
    ref:frame,title:`Google related searches ${index+1}`,srcDoc:html,onLoad:loaded,
    sandbox:'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    style:{display:'block',width:'100%',height,border:0,background:'transparent'},
  });
}
export default function SearchSuggestions({widgets}:{widgets:string[]}){
  const unique=[...new Map(widgets.filter(html=>html.trim()).map(html=>[html.trim(),html])).values()];
  if(!unique.length)return null;
  return <View style={{gap:8,marginTop:24,paddingTop:16,borderTopWidth:1,borderColor:'#DDD7CE'}}>
    <Text style={{fontSize:12,color:'#736D62',marginBottom:2}}>Related searches from Google</Text>
    {unique.map((html,index)=><SuggestionWidget key={html} html={html} index={index}/>)}
  </View>;
}

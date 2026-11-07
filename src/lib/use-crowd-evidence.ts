import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState,Platform} from 'react-native';
import {allCrowdReports,REPORT_TTL_MINUTES} from './crowd-evidence';
import {crowdStorageKey,subscribeData} from './local-data';

export function useCrowdEvidence(){
  const [snapshot,setSnapshot]=useState(()=>({reports:allCrowdReports(),now:Date.now()}));
  const refresh=useCallback(()=>setSnapshot({reports:allCrowdReports(),now:Date.now()}),[]);
  useFocusEffect(useCallback(()=>{refresh();},[refresh]));
  useEffect(()=>subscribeData(refresh),[refresh]);
  useEffect(()=>{
    const nextExpiry=Math.min(...snapshot.reports.map(r=>r.at+REPORT_TTL_MINUTES*60_000).filter(at=>at>snapshot.now));
    const timer=setTimeout(refresh,Math.max(1,Math.min(60_000,nextExpiry-snapshot.now)));
    return()=>clearTimeout(timer);
  },[snapshot,refresh]);
  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===crowdStorageKey())refresh();};
    if(Platform.OS==='web')window.addEventListener('storage',changed);
    return()=>{sub.remove();if(Platform.OS==='web')window.removeEventListener('storage',changed);};
  },[refresh]);
  return snapshot;
}

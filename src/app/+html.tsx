import {ScrollViewStyleReset} from 'expo-router/html';
import type {PropsWithChildren} from 'react';
export default function Html({children}:PropsWithChildren){
  return <html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Elsewhere</title><meta name="description" content="Find alternatives to the places you love, guided by what matters to you."/><meta name="theme-color" content="#174D43"/>{process.env.EXPO_PUBLIC_INVITE_ONLY==='true'&&<meta name="robots" content="noindex, nofollow"/>}<ScrollViewStyleReset/></head><body>{children}</body></html>;
}

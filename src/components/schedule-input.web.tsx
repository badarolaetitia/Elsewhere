import {createElement,type ChangeEvent} from 'react';
import type {ScheduleInputProps} from './schedule-input';
export default function ScheduleInput({kind,label,value,onChange}:ScheduleInputProps){return createElement('input',{type:kind,'aria-label':label,value,onChange:(event:ChangeEvent<HTMLInputElement>)=>onChange(event.target.value),...(kind==='number'?{min:1,max:12,step:1}:{}),style:{width:'100%',minWidth:0,boxSizing:'border-box',backgroundColor:'#FFFCF4',border:'1px solid #D7D0C4',padding:14,borderRadius:12,fontSize:16,color:'#174D43',fontFamily:'inherit'}});}

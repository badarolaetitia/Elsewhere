import {TextInput} from 'react-native';
export type ScheduleInputProps={kind:'date'|'time'|'number';label:string;value:string;onChange:(value:string)=>void};
export default function ScheduleInput({kind,label,value,onChange}:ScheduleInputProps){return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={kind==='number'?'number-pad':'default'} placeholder={kind==='date'?'YYYY-MM-DD':kind==='time'?'HH:MM':'2'} style={{backgroundColor:'#FFFCF4',borderWidth:1,borderColor:'#D7D0C4',padding:14,borderRadius:12,fontSize:16,color:'#174D43'}}/>;}

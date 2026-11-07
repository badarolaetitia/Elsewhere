export function project(lat:number,lng:number,zoom:number){const n=2**zoom*256,r=lat*Math.PI/180;return {x:(lng+180)/360*n,y:(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n};}
export function mapViewport(width:number,height:number,zoom:number,center={lat:40.73475,lng:-74.00425}){
  const at=project(center.lat,center.lng,zoom),left=at.x-width/2,top=at.y-height/2;
  const tiles:{x:number;y:number;left:number;top:number}[]=[];
  for(let y=Math.floor(top/256);y<=Math.floor((top+height)/256);y++)for(let x=Math.floor(left/256);x<=Math.floor((left+width)/256);x++)tiles.push({x,y,left:x*256-left,top:y*256-top});
  return {tiles,position:(lat:number,lng:number)=>{const p=project(lat,lng,zoom);return {left:p.x-left,top:p.y-top};}};
}

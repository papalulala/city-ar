import * as THREE from 'three';

// Five pooled, opaque clouds: no particles, extra shadow passes or timers.
export function createWeather({scene,sun,sky,fill,onChange=()=>{}}){
 const group=new THREE.Group();group.name='城市天氣雲朵';scene.add(group);
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
 const geometry=new THREE.SphereGeometry(1,12,8);
 for(let i=0;i<5;i++){
  const cloud=new THREE.Group();cloud.name='飄雲 '+(i+1);
  [[0,0,0,1.3,.65,.75],[-1,.03,0,.85,.5,.6],[.85,.08,0,1,.55,.65],[0,.4,0,.8,.6,.65]].forEach(([x,y,z,a,b,c])=>{
   const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(a,b,c);cloud.add(mesh);
  });
  cloud.position.set(-16+i*7,9+(i%3)*.65,-5+(i%2)*7);group.add(cloud);
 }
 const presets={sunny:{count:3,bg:'#f0f2e9',sun:3.6,sky:.85,fill:.42,color:0xffffff},cloudy:{count:5,bg:'#e5eceb',sun:2.6,sky:1,fill:.5,color:0xf1f4f5},overcast:{count:5,bg:'#d9e0e3',sun:1.3,sky:1.15,fill:.6,color:0xd7dfe4}};
 const names={sunny:'晴天',cloudy:'多雲',overcast:'陰天'};
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let mode='sunny',current='sunny',elapsed=0,last=null;
 function choose(){const keys=Object.keys(presets).filter(k=>k!==current);return keys[Math.floor(Math.random()*keys.length)]}
 function apply(value){current=value;const p=presets[value];group.children.forEach((c,i)=>c.visible=i<p.count);material.color.setHex(p.color);scene.background.set(p.bg);sun.intensity=p.sun;sky.intensity=p.sky;fill.intensity=p.fill;onChange({mode,current,label:names[current]});}
 function setMode(value){if(!presets[value]&&value!=='random')return;mode=value;elapsed=0;apply(mode==='random'?choose():mode);}
 function update(now){const dt=last===null?0:Math.max(0,Math.min((now-last)/1000,.1));last=now;if(document.hidden)return;
  if(!reducedMotion.matches){group.children.forEach((cloud,i)=>{cloud.position.x+=dt*(.12+i*.015);if(cloud.position.x>20)cloud.position.x=-20;});}
  if(mode==='random'&&(elapsed+=dt)>=45){elapsed=0;apply(choose());}
 }
 function snapshot(){const clone=group.clone(true);clone.children.filter(c=>!c.visible).forEach(c=>clone.remove(c));clone.userData={weather:current,mode};return clone;}
 apply('sunny');return {setMode,update,snapshot,getState:()=>({mode,current,count:group.children.filter(c=>c.visible).length}),group};
}

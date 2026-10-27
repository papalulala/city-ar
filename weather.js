import * as THREE from 'three';

// Five opaque clouds and a fixed pool of 12 rain cards; no extra lights or shadow passes.
export function createWeather({scene,sun,sky,fill,camera,onChange=()=>{}}){
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
 const effects=new THREE.Group();effects.name='網頁限定雨與閃電';scene.add(effects);
 const textureLoader=new THREE.TextureLoader();
 const rainTexture=textureLoader.load('./assets/weather-rain.png');rainTexture.colorSpace=THREE.SRGBColorSpace;
 const boltTexture=textureLoader.load('./assets/weather-lightning.png');boltTexture.colorSpace=THREE.SRGBColorSpace;
 const rainMaterial=new THREE.MeshBasicMaterial({map:rainTexture,transparent:true,alphaTest:.05,depthWrite:false,side:THREE.DoubleSide,clippingPlanes:[new THREE.Plane(new THREE.Vector3(0,1,0),-.04)]});
 const rainGeometry=new THREE.PlaneGeometry(1,1);
 const rain=[];
 for(let i=0;i<12;i++){
  const mesh=new THREE.Mesh(rainGeometry,rainMaterial);mesh.name='雨滴圖片 '+(i+1);mesh.scale.set(.8,1.9,1);mesh.visible=false;effects.add(mesh);
  rain.push({mesh,speed:2.2+Math.random()*.8,wait:i*.16,cloud:i%5,offsetX:0,offsetZ:0});
 }
 const bolt=new THREE.Mesh(rainGeometry,new THREE.MeshBasicMaterial({map:boltTexture,transparent:true,alphaTest:.05,depthWrite:false,side:THREE.DoubleSide}));
 bolt.name='閃電圖片';bolt.scale.set(1.15,3,1);bolt.visible=false;effects.add(bolt);
 let boltWait=6+Math.random()*6,boltLife=0,boltCloud=null;
 const rainEnabled=()=>current==='overcast'&&!reducedMotion.matches;
 function faceCamera(mesh){if(camera)mesh.rotation.y=Math.atan2(camera.position.x-mesh.position.x,camera.position.z-mesh.position.z);}
 function updateEffects(dt){
  if(!rainEnabled()){rain.forEach(r=>{r.mesh.visible=false});bolt.visible=false;boltLife=0;return;}
  for(const r of rain){
   if(!r.mesh.visible){r.wait-=dt;if(r.wait>0)continue;const cloud=group.children[r.cloud];r.offsetX=(Math.random()-.5)*3;r.offsetZ=(Math.random()-.5)*1.8;r.mesh.position.set(cloud.position.x+r.offsetX,cloud.position.y-1.3,cloud.position.z+r.offsetZ);r.mesh.visible=true;}
   const cloud=group.children[r.cloud];r.mesh.position.x=cloud.position.x+r.offsetX;r.mesh.position.z=cloud.position.z+r.offsetZ;r.mesh.position.y-=r.speed*dt;faceCamera(r.mesh);
   // Clip the card at ground height so its upper drops do not disappear early.
   if(r.mesh.position.y+r.mesh.scale.y/2<=.04){r.mesh.visible=false;r.wait=.15+Math.random()*.65;}
  }
  if(bolt.visible){boltLife-=dt;if(boltLife<=0){bolt.visible=false;boltWait=9+Math.random()*9;}else{bolt.position.set(boltCloud.position.x,boltCloud.position.y-2.3,boltCloud.position.z);faceCamera(bolt);}}
  else if((boltWait-=dt)<=0){boltCloud=group.children[Math.floor(Math.random()*5)];bolt.position.set(boltCloud.position.x,boltCloud.position.y-2.3,boltCloud.position.z);faceCamera(bolt);boltLife=1.5+Math.random()*.5;bolt.visible=true;}
 }
 const presets={sunny:{count:3,bg:'#f0f2e9',sun:3.6,sky:.85,fill:.42,color:0xffffff},cloudy:{count:5,bg:'#e5eceb',sun:2.6,sky:1,fill:.5,color:0xf1f4f5},overcast:{count:5,bg:'#d9e0e3',sun:1.3,sky:1.15,fill:.6,color:0xd7dfe4}};
 const names={sunny:'晴天',cloudy:'多雲',overcast:'陰天'};
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 reducedMotion.addEventListener('change',()=>updateEffects(0));
 let mode='sunny',current='sunny',elapsed=0,last=null;
 function choose(){const keys=Object.keys(presets).filter(k=>k!==current);return keys[Math.floor(Math.random()*keys.length)]}
 function apply(value){rain.forEach(r=>{r.mesh.visible=false});bolt.visible=false;boltLife=0;boltWait=6+Math.random()*6;current=value;const p=presets[value];group.children.forEach((c,i)=>c.visible=i<p.count);material.color.setHex(p.color);scene.background.set(p.bg);sun.intensity=p.sun;sky.intensity=p.sky;fill.intensity=p.fill;onChange({mode,current,label:names[current]});}
 function setMode(value){if(!presets[value]&&value!=='random')return;mode=value;elapsed=0;apply(mode==='random'?choose():mode);}
 function update(now){const dt=last===null?0:Math.max(0,Math.min((now-last)/1000,.1));last=now;if(document.hidden)return;updateEffects(dt);
  if(!reducedMotion.matches){group.children.forEach((cloud,i)=>{cloud.position.x+=dt*(.12+i*.015);if(cloud.position.x>20)cloud.position.x=-20;});}
  if(mode==='random'&&(elapsed+=dt)>=(current==='overcast'?20:45)){elapsed=0;apply(choose());}
 }
 function snapshot(){const clone=group.clone(true);clone.children.filter(c=>!c.visible).forEach(c=>clone.remove(c));clone.userData={weather:current,mode};return clone;}
 mode='random';apply('overcast');return {setMode,update,snapshot,getState:()=>({mode,current,count:group.children.filter(c=>c.visible).length,rain:rain.filter(r=>r.mesh.visible).length,lightning:bolt.visible?1:0}),group};
}

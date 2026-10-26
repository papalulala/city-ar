import * as THREE from 'three';

/** Preserve the editor's directional definition and terrain shadows in portable AR files.
 * No presentation base is added: the texture is applied to existing terrain only.
 */
export function bakeCityLighting({city,scene,renderer,viewCamera,sun}){
 city.updateMatrixWorld(true);
 const meshes=[];city.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)});
 const ground=new Set(),bounds=new THREE.Box3();
 for(const o of meshes){const b=new THREE.Box3().setFromObject(o);if(b.max.y-b.min.y<.003){ground.add(o);bounds.union(b)}}
 if(!ground.size)throw Error('找不到城市地面，無法保留 AR 投影');
 bounds.min.x-=.05;bounds.max.x+=.05;bounds.min.z-=.05;bounds.max.z+=.05;
 const width=bounds.max.x-bounds.min.x,depth=bounds.max.z-bounds.min.z;
 const pixelWidth=Math.min(2048,renderer.capabilities.maxTextureSize),pixelHeight=Math.max(256,Math.round(pixelWidth*depth/width));
 const bakeCamera=new THREE.OrthographicCamera(-width/2,width/2,depth/2,-depth/2,.1,200);
 const center=bounds.getCenter(new THREE.Vector3());bakeCamera.position.set(center.x,60,center.z);bakeCamera.up.set(0,0,-1);bakeCamera.lookAt(center.x,0,center.z);bakeCamera.updateMatrixWorld(true);
 const old={size:renderer.getSize(new THREE.Vector2()),ratio:renderer.getPixelRatio(),target:renderer.getRenderTarget(),background:scene.background,clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha()};
 const savedMaterials=[],temporaryMaterials=[],savedVisibility=[];let texture;
 try{
  for(const child of scene.children)if(child!==city&&!child.isLight&&child!==sun.target){savedVisibility.push([child,child.visible]);child.visible=false}
  // Occluders still render into the sun's depth map, but cannot paint or cover the terrain bake.
  for(const o of meshes)if(!ground.has(o)){savedMaterials.push([o,o.material]);const list=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const c=m.clone();c.colorWrite=false;c.depthWrite=false;temporaryMaterials.push(c);return c});o.material=Array.isArray(o.material)?list:list[0]}
  renderer.setRenderTarget(null);renderer.setPixelRatio(1);renderer.setSize(pixelWidth,pixelHeight,false);renderer.setClearColor(0xffffff,0);scene.background=null;renderer.shadowMap.needsUpdate=true;renderer.render(scene,bakeCamera);
  const canvas=document.createElement('canvas');canvas.width=pixelWidth;canvas.height=pixelHeight;canvas.getContext('2d').drawImage(renderer.domElement,0,0);
  texture=new THREE.CanvasTexture(canvas);texture.name='城市地面_保留日光投影';texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 }finally{
  for(const [o,m]of savedMaterials)o.material=m;for(const m of temporaryMaterials)m.dispose();for(const [o,v]of savedVisibility)o.visible=v;
  scene.background=old.background;renderer.setClearColor(old.clear,old.alpha);renderer.setPixelRatio(old.ratio);renderer.setSize(old.size.x,old.size.y,false);renderer.setRenderTarget(old.target);renderer.shadowMap.needsUpdate=true;renderer.render(scene,viewCamera);
 }
 const output=city.clone(true);output.updateMatrixWorld(true);
 const clones=[];output.traverse(o=>{if(o.isMesh&&o.visible)clones.push(o)});
 if(clones.length!==meshes.length)throw Error('AR 模型結構不一致');
 const direction=sun.position.clone().sub(sun.target.position).normalize(),point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 for(let i=0;i<meshes.length;i++){
  const original=meshes[i],o=clones[i];o.geometry=original.geometry.clone();o.material=Array.isArray(original.material)?original.material.map(m=>m.clone()):original.material.clone();const materials=Array.isArray(o.material)?o.material:[o.material];
  if(ground.has(original)){
   const positions=o.geometry.attributes.position,uv=new Float32Array(positions.count*2);
   for(let n=0;n<positions.count;n++){point.fromBufferAttribute(positions,n).applyMatrix4(original.matrixWorld);uv[2*n]=(point.x-bounds.min.x)/width;uv[2*n+1]=(bounds.max.z-point.z)/depth}
   o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
   for(const m of materials){m.map=texture;m.color.setRGB(1,1,1);m.vertexColors=false;m.metalness=0;m.roughness=1;m.emissiveMap=texture;m.emissive.setRGB(.16,.16,.16);m.needsUpdate=true}
   o.userData.arBakedGround=true;
  }else{
   if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();const normals=o.geometry.attributes.normal,oldColor=o.geometry.attributes.color,colors=new Float32Array(normals.count*3);normalMatrix.getNormalMatrix(original.matrixWorld);
   // GLTF primitives use one material; retain the first material's base color in displayColor for USDZ too.
   const base=materials[0].color.clone(),useOld=materials[0].vertexColors&&oldColor;
   for(let n=0;n<normals.count;n++){
    normal.fromBufferAttribute(normals,n).applyMatrix3(normalMatrix).normalize();const strength=.62+.42*Math.max(0,normal.dot(direction));
    colors[3*n]=base.r*(useOld?oldColor.getX(n):1)*Math.min(1,strength*1.025);colors[3*n+1]=base.g*(useOld?oldColor.getY(n):1)*Math.min(1,strength*.985);colors[3*n+2]=base.b*(useOld?oldColor.getZ(n):1)*Math.min(1,strength*.91);
   }
   o.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));for(const m of materials){m.color.setRGB(1,1,1);m.vertexColors=true;m.needsUpdate=true}o.userData.arBakedSunlight=true;
  }
 }
 output.userData.arLighting={version:1,groundTexture:[pixelWidth,pixelHeight],groundMeshes:ground.size,litMeshes:meshes.length-ground.size};return output;
}

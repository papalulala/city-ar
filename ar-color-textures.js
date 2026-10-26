import * as THREE from 'three';

/** Encode portable vertex colors as ordinary embedded image textures.
 * Each triangle samples a small isolated color tile. No runtime primvar/vertex
 * color shader support is required in native AR viewers.
 */
export function encodeARColorTextures(root,maxTextureSize=2048){
 const meshes=[];let triangles=0;
 root.traverse(o=>{if(o.isMesh&&o.userData.arBakedSunlight&&o.geometry.attributes.color){meshes.push(o);triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3}});
 const tileSize=4,maxSize=Math.min(2048,maxTextureSize),maxTiles=Math.floor(maxSize/tileSize)**2;
 const atlases=[];let current=null,tileIndex=0,remaining=triangles;
 const linearToSRGB=new Uint8Array(4097);for(let i=0;i<=4096;i++){const c=i/4096;linearToSRGB[i]=Math.round((c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055)*255)}
 function allocate(){
  const count=Math.min(remaining,maxTiles),side=Math.min(maxSize,Math.max(8,THREE.MathUtils.ceilPowerOfTwo(Math.ceil(Math.sqrt(count))*tileSize))),canvas=document.createElement('canvas');canvas.width=canvas.height=side;
  const context=canvas.getContext('2d'),pixels=context.createImageData(side,side),texture=new THREE.CanvasTexture(canvas);texture.name='AR_原色與日光_'+atlases.length;texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  current={canvas,context,pixels,texture,side,capacity:(side/tileSize)**2};atlases.push(current);tileIndex=0;
 }
 function reserve(){if(!current||tileIndex>=current.capacity)allocate();const index=tileIndex++,col=index%(current.side/tileSize),row=Math.floor(index/(current.side/tileSize));remaining--;return{x:col*tileSize,y:row*tileSize,atlas:current}}
 function byte(value){return linearToSRGB[Math.max(0,Math.min(4096,Math.round(value*4096)))]}
 for(const o of meshes){
  const source=o.geometry,g=source.index?source.toNonIndexed():source,color=g.attributes.color,uv=new Float32Array(g.attributes.position.count*2);
  // Materials may cross atlas boundaries, so preserve them as explicit geometry groups.
  const originalMaterial=Array.isArray(o.material)?o.material[0]:o.material,materials=[],materialByTexture=new Map();let activeMaterial=-1,groupStart=0;
  g.clearGroups();
  for(let n=0;n<color.count;n+=3){
   const slot=reserve(),{x,y,atlas}=slot,A=[color.getX(n),color.getY(n),color.getZ(n)],B=[color.getX(n+1),color.getY(n+1),color.getZ(n+1)],C=[color.getX(n+2),color.getY(n+2),color.getZ(n+2)];
   for(let py=0;py<tileSize;py++)for(let px=0;px<tileSize;px++){
    const offset=((y+py)*atlas.side+x+px)*4,u=px-1,v=py-1;
    for(let c=0;c<3;c++)atlas.pixels.data[offset+c]=byte(A[c]+u*(B[c]-A[c])+v*(C[c]-A[c]));atlas.pixels.data[offset+3]=255;
   }
   for(const [vertex,dx,dy]of [[n,1.5,1.5],[n+1,2.5,1.5],[n+2,1.5,2.5]]){uv[2*vertex]=(x+dx)/atlas.side;uv[2*vertex+1]=1-(y+dy)/atlas.side}
   if(!materialByTexture.has(atlas.texture)){
    const m=originalMaterial.clone();m.name=(originalMaterial.name||o.name)+'_AR圖片材質';m.map=atlas.texture;m.color.setRGB(1,1,1);m.vertexColors=false;m.needsUpdate=true;materialByTexture.set(atlas.texture,materials.length);materials.push(m);
   }
   const materialIndex=materialByTexture.get(atlas.texture);
   if(activeMaterial!==materialIndex){if(activeMaterial!==-1)g.addGroup(groupStart,n-groupStart,activeMaterial);activeMaterial=materialIndex;groupStart=n}
  }
  if(activeMaterial!==-1)g.addGroup(groupStart,color.count-groupStart,activeMaterial);
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.deleteAttribute('color');
  if(materials.length===1){g.clearGroups();o.geometry=g;o.material=materials[0]}
  else{
   // USDZExporter accepts one material per mesh. Split only at atlas boundaries.
   const parent=o.parent,replacements=[];
   for(const group of g.groups){const part=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(g.attributes)){const values=attribute.array.slice(group.start*attribute.itemSize,(group.start+group.count)*attribute.itemSize);part.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized))}const replacement=o.clone(false);replacement.geometry=part;replacement.material=materials[group.materialIndex];replacement.name=o.name+'_texture_'+group.materialIndex;replacements.push(replacement)}
   parent.remove(o);for(const replacement of replacements)parent.add(replacement);
  }
  o.userData.arEmbeddedColorTexture=true;
 }
 for(const a of atlases){a.context.putImageData(a.pixels,0,0);a.texture.needsUpdate=true}
 root.userData.arTextureEncoding={version:1,atlases:atlases.length,triangles,vertexColorDependentMeshes:0};return root;
}

/* Font Builder: dependency-free TrueType encoding and raster-outline tracing.
 * The application never uploads user glyph artwork to a server.
 */
(function (root) {
  'use strict';
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  const u16 = v => [(v>>>8)&255,v&255];
  const i16 = v => u16((Math.round(v)+65536)&65535);
  const u32 = v => [(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
  const ascii = s => Array.from(s, c => c.charCodeAt(0));
  const pad4 = a => {while(a.length%4)a.push(0);return a;};
  const write16 = (a,i,v) => {a[i]=(v>>>8)&255;a[i+1]=v&255;};
  const write32 = (a,i,v) => {a[i]=(v>>>24)&255;a[i+1]=(v>>>16)&255;a[i+2]=(v>>>8)&255;a[i+3]=v&255;};
  const concat = (...v) => v.flat();
  const signedArea = (pts) => pts.reduce((acc,p,i)=>{const q=pts[(i+1)%pts.length];return acc+p.x*q.y-q.x*p.y},0)/2;
  const distSegmentSq = (p,a,b)=>{const dx=b.x-a.x, dy=b.y-a.y;const t=dx*dx+dy*dy?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1):0;return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;};
  function simplifyOpen(points,tolSq){
    if(points.length<3)return points.slice();
    const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
    const stack=[[0,points.length-1]];
    while(stack.length){const [a,b]=stack.pop();let max=-1,mid=-1;
      for(let i=a+1;i<b;i++){const d=distSegmentSq(points[i],points[a],points[b]);if(d>max){max=d;mid=i;}}
      if(max>tolSq&&mid!==-1){keep[mid]=1;stack.push([a,mid],[mid,b]);}
    }
    return points.filter((_,i)=>keep[i]);
  }
  function simplifyRing(points,tolerance){
    if(points.length<5)return points;
    let start=0;for(let i=1;i<points.length;i++)if(points[i].x<points[start].x)start=i;
    const rotated=points.slice(start).concat(points.slice(0,start));
    let far=1,max=-1;
    for(let i=1;i<rotated.length;i++){const d=(rotated[i].x-rotated[0].x)**2+(rotated[i].y-rotated[0].y)**2;if(d>max){far=i;max=d;}}
    const result=simplifyOpen(rotated.slice(0,far+1),tolerance*tolerance).concat(simplifyOpen(rotated.slice(far).concat([rotated[0]]),tolerance*tolerance).slice(1,-1));
    return result.length>=3 ? result:points;
  }
  /* Trace clockwise pixel edges; reverse-wound inner boundaries become counters. */
  function traceBitmap(imageData, advance=650, detail=2){
    const width=160,height=160,src=imageData.data,sw=imageData.width,sh=imageData.height;
    const mask=new Uint8Array(width*height);
    const factorX=sw/width,factorY=sh/height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let hits=0,total=0;
      for(let py=Math.floor(y*factorY);py<Math.ceil((y+1)*factorY);py++)for(let px=Math.floor(x*factorX);px<Math.ceil((x+1)*factorX);px++){
        if(px<sw&&py<sh){const idx=(py*sw+px)*4;hits+=src[idx+3]>70?1:0;total++;}
      }
      mask[y*width+x]=hits/Math.max(1,total)>=0.35?1:0;
    }
    const edges=[];const outgoing=new Map();
    const on=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&mask[y*width+x];
    const key=(x,y)=>y*16384+x;
    const add=(x1,y1,x2,y2,dir)=>{let edge={x1,y1,x2,y2,dir,used:false};const n=edges.push(edge)-1;const k=key(x1,y1);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(n);};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(on(x,y)){
      if(!on(x,y-1))add(x,y,x+1,y,0);
      if(!on(x+1,y))add(x+1,y,x+1,y+1,1);
      if(!on(x,y+1))add(x+1,y+1,x,y+1,2);
      if(!on(x-1,y))add(x,y+1,x,y,3);
    }
    if(edges.length>60000)throw Error('Artwork is too complex. Try a simpler graphic.');
    const contours=[];
    for(let start=0;start<edges.length;start++){
      if(edges[start].used)continue;
      let current=start,points=[],closed=false;
      for(let steps=0;steps<=edges.length;steps++){
        const e=edges[current];if(e.used)break;e.used=true;
        points.push({x:e.x1,y:e.y1});
        if(e.x2===edges[start].x1&&e.y2===edges[start].y1){closed=true;break;}
        const candidates=(outgoing.get(key(e.x2,e.y2))||[]).filter(idx=>!edges[idx].used);
        if(!candidates.length)break;
        const priorities=[(e.dir+1)%4,e.dir,(e.dir+3)%4,(e.dir+2)%4];
        candidates.sort((a,b)=>priorities.indexOf(edges[a].dir)-priorities.indexOf(edges[b].dir));
        current=candidates[0];
      }
      if(!closed||points.length<4)continue;
      const beforeArea=signedArea(points);const tidy=simplifyRing(points,clamp(detail,0,5)*0.23+0.35);
      if(tidy.length<3||Math.abs(signedArea(tidy))<1.2)continue;
      // Canvas y grows downward; font coordinates grow upward.
      const result=tidy.map(p=>({
        // Use one geometric scale for X and Y so imported art is not squeezed.
        // Advance width changes spacing, not the shape of the letter.
        x:Math.round(advance/2+(p.x*2-160)*3.55),
        y:Math.round((260-p.y*2)*3.55)
      }));
      if(Math.abs(signedArea(result))<10)continue;
      if(Math.sign(beforeArea)===Math.sign(signedArea(result)))result.reverse();
      contours.push(result);
    }
    return contours;
  }
  function makeGlyph(contours,advance){
    const all=contours.flat();const box=all.length?{
      xMin:Math.min(...all.map(p=>p.x)),yMin:Math.min(...all.map(p=>p.y)),xMax:Math.max(...all.map(p=>p.x)),yMax:Math.max(...all.map(p=>p.y))
    }:{xMin:0,yMin:0,xMax:0,yMax:0};
    if(all.length>60000)throw Error('Glyph has too many outline points. Simplify the artwork.');
    const out=concat(i16(contours.length),i16(box.xMin),i16(box.yMin),i16(box.xMax),i16(box.yMax));
    if(contours.length){let end=-1;for(const ring of contours){end+=ring.length;out.push(...u16(end));}
      out.push(0,0); // instruction length
      for(let i=0;i<all.length;i++)out.push(1); // on-curve, long coordinates
      let px=0,py=0;for(const p of all){out.push(...i16(p.x-px));px=p.x;}
      for(const p of all){out.push(...i16(p.y-py));py=p.y;}
    }
    return {data:out,box,advance:clamp(Math.round(advance),200,1600),points:all.length,contours:contours.length};
  }
  function makeCmap(glyphs){
    const mapping=glyphs.map((g,i)=>g.code==null?null:{code:g.code,index:i}).filter(Boolean).sort((a,b)=>a.code-b.code);
    const segments=mapping.concat([{code:65535,index:0}]);const n=segments.length;
    const format4=concat(u16(4),u16(16+8*n),u16(0),u16(n*2),u16(2**Math.floor(Math.log2(n))*2),u16(Math.floor(Math.log2(n))),u16(n*2-2**Math.floor(Math.log2(n))*2));
    for(const x of segments)format4.push(...u16(x.code));format4.push(0,0);
    for(const x of segments)format4.push(...u16(x.code));
    for(const x of segments)format4.push(...u16(x.code===65535?1:(x.index-x.code)&0xffff));
    for(const x of segments)format4.push(0,0);
    return concat(u16(0),u16(2),u16(0),u16(3),u32(20),u16(3),u16(1),u32(20),format4);
  }
  function makeNames(family){
    const safe=String(family||'My Font').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,60)||'My Font';
    const ps=safe.normalize('NFKD').replace(/[^a-zA-Z0-9]/g,'')||'MyFont';
    const labels=[[0,'Copyright (c) font author'],[1,safe],[2,'Regular'],[3,ps+'-Regular-1.0'],[4,safe+' Regular'],[5,'Version 1.000'],[6,ps+'-Regular']];
    const count=labels.length,header=concat(u16(0),u16(count),u16(6+count*12)),strings=[];
    for(const [id,str] of labels){const chars=[];for(let i=0;i<str.length;i++)chars.push(...u16(str.charCodeAt(i)));header.push(...u16(3),...u16(1),...u16(0x409),...u16(id),...u16(chars.length),...u16(strings.length));strings.push(...chars);}
    return header.concat(strings);
  }
  function makeOS2(first,last,advance,bounds){
    const arr=concat(u16(0),i16(advance),u16(400),u16(5),u16(0),i16(650),i16(600),i16(0),i16(75),i16(650),i16(600),i16(0),i16(350),i16(50),i16(280),i16(0));
    arr.push(...Array(10).fill(0), ...u32(1),...u32(0),...u32(0),...u32(0),...ascii('BFL '),...u16(0x40),...u16(first),...u16(last),...i16(800),...i16(-200),...i16(0),...u16(Math.max(800,bounds.yMax)),...u16(Math.max(240,-bounds.yMin)));
    if(arr.length!==78)throw Error('Invalid OS/2 table length '+arr.length);
    return arr;
  }
  function makeHead(bb){
    const macSeconds=Math.floor(Date.now()/1000)+2082844800;
    const timestamp=concat(u32(Math.floor(macSeconds/4294967296)),u32(macSeconds>>>0));
    const a=concat(u32(0x10000),u32(0x10000),u32(0),u32(0x5F0F3CF5),u16(3),u16(1000),timestamp,timestamp,i16(bb.xMin),i16(bb.yMin),i16(bb.xMax),i16(bb.yMax),u16(0),u16(8),i16(2),i16(1),i16(0));
    if(a.length!==54)throw Error('Invalid head length');return a;
  }
  function makeHhea(gs){
    const maxAdv=Math.max(...gs.map(g=>g.advance));
    const minLSB=Math.min(...gs.map(g=>g.box.xMin));
    const minRSB=Math.min(...gs.map(g=>g.advance-g.box.xMax));
    const xMaxExtent=Math.max(...gs.map(g=>g.box.xMax));
    const a=concat(u32(0x10000),i16(800),i16(-200),i16(0),u16(maxAdv),i16(minLSB),i16(minRSB),i16(xMaxExtent),i16(1),i16(0),i16(0),Array(8).fill(0),i16(0),u16(gs.length));
    if(a.length!==36)throw Error('Invalid hhea length '+a.length);return a;
  }
  function makeMaxp(gs){
    const a=concat(u32(0x10000),u16(gs.length),u16(Math.max(...gs.map(g=>g.points))),u16(Math.max(...gs.map(g=>g.contours))),u16(0),u16(0),u16(2),u16(0),u16(0),u16(0),u16(0),u16(0),u16(0),u16(0),u16(0));
    if(a.length!==32)throw Error('Invalid maxp length '+a.length);return a;
  }
  function checksum(a){const p=pad4(a.slice());let sum=0;for(let i=0;i<p.length;i+=4)sum=(sum+(((p[i]<<24)>>>0)+(p[i+1]<<16)+(p[i+2]<<8)+p[i+3]))>>>0;return sum;}
  function buildTTF(name, entries){
    // entries: [{char, imageData, advance, detail}]. Space is provided automatically.
    const undefinedOuter=[{x:45,y:-25},{x:45,y:720},{x:565,y:720},{x:565,y:-25}];
    const undefinedHole=[{x:125,y:75},{x:480,y:75},{x:480,y:620},{x:125,y:620}];
    const notdef=makeGlyph([undefinedOuter,undefinedHole],610);notdef.code=null;
    const space=makeGlyph([],320);space.code=32;
    const glyphs=[notdef,space];
    for(const entry of entries){if(!entry||!entry.char||entry.char===' ')continue;
      const code=entry.char.codePointAt(0);if(code<33||code>65534||code===65535)continue;
      const contours=entry.contours || (entry.imageData ? traceBitmap(entry.imageData,entry.advance,entry.detail):[]);
      if(!contours.length)continue;
      const g=makeGlyph(contours,entry.advance||650);g.code=code;glyphs.push(g);
    }
    if(glyphs.length<3)throw Error('Draw or upload at least one character before exporting.');
    if(glyphs.length>1024)throw Error('Too many characters.');
    const bounds={xMin:Math.min(...glyphs.map(g=>g.box.xMin)),yMin:Math.min(...glyphs.map(g=>g.box.yMin)),xMax:Math.max(...glyphs.map(g=>g.box.xMax)),yMax:Math.max(...glyphs.map(g=>g.box.yMax))};
    const loca=[0],glyf=[];for(const g of glyphs){glyf.push(...g.data);pad4(glyf);loca.push(glyf.length);}
    const n=glyphs.length;
    const first=Math.min(...glyphs.filter(g=>g.code!=null).map(g=>g.code));const last=Math.max(...glyphs.filter(g=>g.code!=null).map(g=>g.code));
    const tables={
      'OS/2':makeOS2(first,last,Math.round(glyphs.reduce((s,g)=>s+g.advance,0)/n),bounds),
      cmap:makeCmap(glyphs),glyf,head:makeHead(bounds),hhea:makeHhea(glyphs),hmtx:glyphs.flatMap(g=>concat(u16(g.advance),i16(g.box.xMin))),loca:loca.flatMap(u32),maxp:makeMaxp(glyphs),name:makeNames(name),post:concat(u32(0x30000),u32(0),i16(-100),i16(45),u32(0),Array(16).fill(0)),
    };
    const tags=Object.keys(tables).sort();const num=tabsafe(tags.length);const power=2**Math.floor(Math.log2(num));
    const out=concat(u32(0x10000),u16(num),u16(power*16),u16(Math.log2(power)),u16(num*16-power*16));
    let offset=12+16*num;const records=[];
    for(const tag of tags){const raw=tables[tag],length=raw.length;const bytes=pad4(raw.slice());records.push({tag,offset,length,bytes,check:checksum(raw)});offset+=bytes.length;}
    for(const r of records)out.push(...ascii(r.tag),...u32(r.check),...u32(r.offset),...u32(r.length));
    for(const r of records)out.push(...r.bytes);
    const head=records.find(r=>r.tag==='head');write32(out,head.offset+8,(0xB1B0AFBA-checksum(out))>>>0);
    return new Uint8Array(out);
  }
  function tabsafe(n){if(n<1||n>4095)throw Error('Too many font tables');return n;}
  const API={buildTTF,traceBitmap,simplifyRing};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  root.FontBuilderEngine=API;
})(typeof window!=='undefined'?window:globalThis);

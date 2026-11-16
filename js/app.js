/* Font Builder — local-first browser editor. No artwork or preview text is transmitted. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ALL=Array.from({length:94},(_,i)=>String.fromCharCode(i+33));
  const GROUPS=[['Uppercase','ABCDEFGHIJKLMNOPQRSTUVWXYZ'],['Lowercase','abcdefghijklmnopqrstuvwxyz'],['Numbers','0123456789'],['Punctuation & symbols',ALL.filter(c=>!/[a-zA-Z0-9]/.test(c)).join('')]];
  const DEFAULT_WIDTH = c => 'ilI!.,:;|\'`'.includes(c)?350:'mwMW@%'.includes(c)?850:'frt()[]{}?'.includes(c)?500:650;
  const glyphs=new Map(), histories=new Map(), imageDataCache=new Map();
  let current='A',tool='draw',brush=14,drawing=false,lastPoint=null,changed=false,toastTimer=null;
  let previewToken=0, previewFace=null, previewTimeout=null, autosaveTimeout=null, lastExportCount=0;
  const canvas=$('glyphCanvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const guide=$('guideCanvas'),gctx=guide.getContext('2d');
  const safeStorage={read(key){try{return localStorage.getItem(key)}catch{return null}},write(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}};
  const AUTOSAVE_KEY='buildiful.fontbuilder.project.v1';

  function showToast(message){const box=$('toast');box.textContent=message;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),3200)}
  function track(event,params={}){if(typeof window.buildifulAnalyticsEvent==='function')window.buildifulAnalyticsEvent(event,params)}
  function record(char){if(!glyphs.has(char))glyphs.set(char,{png:'',advance:DEFAULT_WIDTH(char),detail:2});return glyphs.get(char)}
  function history(char){if(!histories.has(char))histories.set(char,{undo:[],redo:[]});return histories.get(char)}
  const hasArtwork=char=>Boolean(glyphs.get(char)?.png);
  function drawGuides(){
    const c=gctx;c.clearRect(0,0,320,320);c.fillStyle='#fff';c.fillRect(0,0,320,320);
    c.strokeStyle='#ebeff6';c.lineWidth=1;c.setLineDash([4,5]);
    for(const x of [40,280]){c.beginPath();c.moveTo(x,0);c.lineTo(x,320);c.stroke()}
    c.beginPath();c.moveTo(0,55);c.lineTo(320,55);c.stroke();
    c.strokeStyle='#d0def3';c.setLineDash([5,4]);c.beginPath();c.moveTo(0,160);c.lineTo(320,160);c.stroke();
    c.strokeStyle='#e4a9a0';c.setLineDash([]);c.beginPath();c.moveTo(0,260.5);c.lineTo(320,260.5);c.stroke();
    c.strokeStyle='#e8ecf2';c.beginPath();c.moveTo(0,303);c.lineTo(320,303);c.stroke();
  }
  function renderCharacterGrid(){
    const container=$('glyphGroups');container.textContent='';
    for(const [name, chars] of GROUPS){const sec=document.createElement('section');sec.className='glyph-section';const heading=document.createElement('h3');heading.textContent=name;sec.append(heading);
      const grid=document.createElement('div');grid.className='glyph-grid';
      for(const ch of chars){const button=document.createElement('button');button.type='button';button.className='glyph-cell';button.dataset.char=ch;button.title='Edit '+describe(ch);button.setAttribute('aria-label','Edit '+describe(ch));button.addEventListener('click',()=>selectChar(ch));
        grid.append(button);
      }sec.append(grid);container.append(sec);
    }updateGrid();
  }
  function describe(c){if(/[A-Z]/.test(c))return 'Capital '+c;if(/[a-z]/.test(c))return 'Lowercase '+c;if(/[0-9]/.test(c))return 'Digit '+c;return 'Symbol '+c}
  function updateGrid(){
    for(const button of document.querySelectorAll('.glyph-cell')){
      const ch=button.dataset.char,done=hasArtwork(ch);
      button.classList.toggle('selected',ch===current);button.classList.toggle('done',done);button.setAttribute('aria-pressed',String(ch===current));
      if(done){let thumb=button.querySelector('img');if(!thumb){button.textContent='';thumb=document.createElement('img');thumb.alt='';thumb.style.cssText='position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain';button.append(thumb)}
        const url=glyphs.get(ch).png;if(thumb.src!==url)thumb.src=url;
      }else button.textContent=ch;
    }
    const completed=ALL.filter(hasArtwork).length;$('progressCount').textContent=`${completed} / ${ALL.length}`;$('progressFill').style.width=`${completed/ALL.length*100}%`;
    $('exportSummary').textContent=completed===0?'Create your first character to export.':`${completed} unique character${completed===1?'':'s'} ready to export`;
    lastExportCount=completed;
  }
  function updateCharUI(){
    const entry=record(current),done=hasArtwork(current);
    $('currentCharacter').textContent=current;$('characterHeading').textContent=describe(current);
    $('characterStatus').textContent=done?'Custom glyph saved · Ready to refine':'Blank character · Ready to draw';
    $('advanceWidth').value=entry.advance;$('advanceValue').textContent=entry.advance;
    $('smoothness').value=entry.detail;$('smoothnessValue').textContent=entry.detail;
    $('undoBtn').disabled=!history(current).undo.length;$('redoBtn').disabled=!history(current).redo.length;
    for(const btn of document.querySelectorAll('.glyph-cell'))btn.classList.toggle('selected',btn.dataset.char===current);
  }
  function selectChar(ch){if(!ALL.includes(ch))return;current=ch;ctx.clearRect(0,0,320,320);updateCharUI();const png=record(ch).png;
    if(png){const img=new Image();img.onload=()=>{if(current!==ch)return;ctx.clearRect(0,0,320,320);ctx.drawImage(img,0,0,320,320)};img.src=png;}
    updateGrid();
  }
  function pointFromEvent(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*320/r.height}}
  function beginStroke(e){if(e.button!==undefined && e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
    drawing=true;changed=false;lastPoint=pointFromEvent(e);saveUndo();stroke(lastPoint,lastPoint);
  }
  function saveUndo(){const h=history(current);const before=record(current).png||'';h.undo.push(before);if(h.undo.length>20)h.undo.shift();h.redo=[];}
  function stroke(a,b){ctx.save();ctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';ctx.strokeStyle='#111';ctx.fillStyle='#111';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=brush;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.arc(b.x,b.y,brush/2,0,Math.PI*2);ctx.fill();ctx.restore();changed=true;
  }
  function moveStroke(e){if(!drawing)return;e.preventDefault();const p=pointFromEvent(e);stroke(lastPoint,p);lastPoint=p}
  function endStroke(e){if(!drawing)return;if(e&&e.type==='pointerup')e.preventDefault();drawing=false;if(changed)capture();else history(current).undo.pop()}
  function imageHasInk(){const a=ctx.getImageData(0,0,320,320).data;for(let i=3;i<a.length;i+=4)if(a[i]>65)return true;return false}
  function capture(){const entry=record(current);entry.png=imageHasInk()?canvas.toDataURL('image/png'):'';
    if(entry.png)imageDataCache.set(current,ctx.getImageData(0,0,320,320));else imageDataCache.delete(current);
    updateCharUI();updateGrid();schedulePreview();scheduleAutosave();
  }
  function restorePng(png){const entry=record(current);entry.png=png;ctx.clearRect(0,0,320,320);
    if(!png){imageDataCache.delete(current);updateCharUI();updateGrid();schedulePreview();scheduleAutosave();return}
    const selected=current,img=new Image();img.onload=()=>{if(current===selected){ctx.clearRect(0,0,320,320);ctx.drawImage(img,0,0,320,320)}
      const off=document.createElement('canvas');off.width=320;off.height=320;const c=off.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,320,320);imageDataCache.set(selected,c.getImageData(0,0,320,320));schedulePreview();};img.src=png;
    updateCharUI();updateGrid();scheduleAutosave();
  }
  function undo(){const h=history(current);if(!h.undo.length)return;h.redo.push(record(current).png||'');restorePng(h.undo.pop())}
  function redo(){const h=history(current);if(!h.redo.length)return;h.undo.push(record(current).png||'');restorePng(h.redo.pop())}
  function clear(){if(!hasArtwork(current))return;if(!confirm(`Clear your artwork for ${describe(current)}? You can undo this.`))return;saveUndo();ctx.clearRect(0,0,320,320);capture()}
  function changeTool(next){tool=next;$('drawTool').classList.toggle('active',tool==='draw');$('eraseTool').classList.toggle('active',tool==='erase');$('drawTool').setAttribute('aria-pressed',tool==='draw');$('eraseTool').setAttribute('aria-pressed',tool==='erase')}

  async function importGraphic(file){
    if(!file)return;if(file.size>8*1024*1024){showToast('Please choose an image smaller than 8 MB.');return}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){showToast('Please choose a PNG, JPG, or WebP graphic.');return}
    try{
      const url=URL.createObjectURL(file);let img;
      try{img=new Image();img.decoding='async';img.src=url;await img.decode()}finally{URL.revokeObjectURL(url)}
      if(img.naturalWidth*img.naturalHeight>36_000_000)throw Error('Image dimensions are too large.');
      const probe=document.createElement('canvas');probe.width=64;probe.height=64;const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(img,0,0,64,64);const data=pc.getImageData(0,0,64,64).data;
      let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<248)transparent++;
      const hasTransparency=transparent>64;
      let borderLum=0,borderCount=0;
      for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x<4||y<4||x>=60||y>=60){let i=(y*64+x)*4;borderLum+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];borderCount++}
      const darkOnLight=borderLum/borderCount>=132;
      const scratch=document.createElement('canvas');scratch.width=320;scratch.height=320;const sc=scratch.getContext('2d',{willReadFrequently:true});
      const scale=Math.min(242/img.naturalWidth,218/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
      sc.drawImage(img,(320-w)/2,260-h,w,h);
      const pixels=sc.getImageData(0,0,320,320);
      for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data,alpha=d[i+3],lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
        const ink=hasTransparency?(alpha>85):(alpha>0&&(darkOnLight?lum<182:lum>110));
        d[i]=17;d[i+1]=17;d[i+2]=17;d[i+3]=ink?255:0;
      }
      if(!pixels.data.some((v,i)=>i%4===3&&v>0))throw Error('No visible shape found. Try a higher-contrast image.');
      saveUndo();ctx.clearRect(0,0,320,320);ctx.putImageData(pixels,0,0);capture();track('graphic_import',{file_type:file.type.split('/')[1]});showToast('Graphic imported. You can draw or erase to refine it.');
    }catch(err){showToast(err.message||'Could not open this image.')}finally{$('imageInput').value=''}
  }
  async function decodeGlyphData(ch){if(imageDataCache.has(ch))return imageDataCache.get(ch);const png=record(ch).png;if(!png)return null;
    const img=new Image();img.src=png;await img.decode();const off=document.createElement('canvas');off.width=320;off.height=320;const c=off.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,320,320);const d=c.getImageData(0,0,320,320);imageDataCache.set(ch,d);return d;
  }
  async function collectFont(){const selected=ALL.filter(hasArtwork);const entries=[];
    for(const ch of selected){const imageData=await decodeGlyphData(ch);const g=record(ch);entries.push({char:ch,advance:g.advance,detail:g.detail,imageData})}
    return window.FontBuilderEngine.buildTTF($('fontName').value||'My Font',entries)
  }
  function schedulePreview(){clearTimeout(previewTimeout);const token=++previewToken;previewTimeout=setTimeout(()=>updatePreviewFont(token),400)}
  async function updatePreviewFont(token){if(!lastExportCount){if(previewFace){document.fonts.delete(previewFace);previewFace=null}$('typePreview').style.fontFamily='Arial, sans-serif';return}
    try{const bytes=await collectFont();if(token!==previewToken)return;
      const face=new FontFace('BuildifulFontPreview',bytes.buffer,{style:'normal',weight:'400'});await face.load();if(token!==previewToken)return;
      if(previewFace)document.fonts.delete(previewFace);document.fonts.add(face);previewFace=face;$('typePreview').style.fontFamily='"BuildifulFontPreview", Arial, sans-serif';
    }catch(err){console.warn('Font preview unavailable:',err);}
  }
  function syncPreviewText(){$('typePreview').textContent=$('previewText').value||'Your custom typeface';}
  function fileDownload(bytes,filename,type){const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
  function safeFilename(s){return(s.trim()||'my-font').normalize('NFKD').replace(/[^\w\- ]/g,'').replace(/\s+/g,'-').slice(0,56)||'my-font'}
  async function exportFont(){if(!lastExportCount){showToast('Draw or upload at least one character first.');return}
    const buttons=[$('exportFont'),$('exportFontSide')];buttons.forEach(b=>b.disabled=true);
    try{const data=await collectFont();fileDownload(data,`${safeFilename($('fontName').value)}.ttf`,'font/ttf');track('font_export',{format:'ttf',glyph_count:lastExportCount});showToast(`Exported your font with ${lastExportCount} character${lastExportCount===1?'':'s'}.`)}
    catch(err){showToast('Export failed: '+(err.message||'unknown error'));console.error(err)}finally{buttons.forEach(b=>b.disabled=false)}
  }
  function projectObject(){return{format:'fontbuilder-project',version:1,fontName:$('fontName').value,glyphs:Object.fromEntries([...glyphs].map(([key,item])=>[key,{png:item.png,advance:item.advance,detail:item.detail}])),savedAt:new Date().toISOString()}}
  function scheduleAutosave(){clearTimeout(autosaveTimeout);autosaveTimeout=setTimeout(()=>safeStorage.write(AUTOSAVE_KEY,JSON.stringify(projectObject())),650)}
  function saveProject(){fileDownload(JSON.stringify(projectObject(),null,2),`${safeFilename($('fontName').value)}.fontbuilder.json`,'application/json');track('project_save',{glyph_count:lastExportCount});showToast('Editable project saved as JSON.');}
  async function openProject(file){if(!file)return;try{
      if(file.size>15*1024*1024)throw Error('Project file is too large.');
      const data=JSON.parse(await file.text());if(data.format!=='fontbuilder-project'||data.version!==1||typeof data.glyphs!=='object'||!data.glyphs)throw Error('Not a compatible Font Builder project.');
      if([...glyphs.values()].some(g=>g.png) && !confirm('Replace the current font project? Save it first if needed.'))return;
      glyphs.clear();histories.clear();imageDataCache.clear();for(const [key,value] of Object.entries(data.glyphs)){
        if(!ALL.includes(key)||!value||typeof value!=='object')continue;
        if(typeof value.png==='string'&&value.png.length<2_000_000&&(!value.png||/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.png))){glyphs.set(key,{png:value.png,advance:Math.max(220,Math.min(1100,Number(value.advance)||DEFAULT_WIDTH(key))),detail:Math.max(0,Math.min(5,Number(value.detail)||0))})}
      }
      $('fontName').value=String(data.fontName||'My Font').slice(0,60);selectChar('A');updateGrid();schedulePreview();scheduleAutosave();track('project_open',{glyph_count:lastExportCount});showToast('Project opened.');
    }catch(err){showToast(err.message||'Could not open the project.')}finally{$('projectInput').value=''}
  }
  function newProject(){if(lastExportCount&&!confirm('Start a new font? Save your current project first if you want to keep it.'))return;
    glyphs.clear();histories.clear();imageDataCache.clear();$('fontName').value='My First Font';selectChar('A');updateGrid();schedulePreview();scheduleAutosave();showToast('New font project ready.');
  }
  function applyEvents(){
    canvas.addEventListener('pointerdown',beginStroke);canvas.addEventListener('pointermove',moveStroke);canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);
    $('drawTool').addEventListener('click',()=>changeTool('draw'));$('eraseTool').addEventListener('click',()=>changeTool('erase'));
    $('brushSize').addEventListener('input',e=>{brush=Number(e.target.value);$('brushSizeOutput').textContent=brush});
    $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('clearBtn').addEventListener('click',clear);
    $('uploadGraphic').addEventListener('click',()=>$('imageInput').click());$('imageInput').addEventListener('change',e=>importGraphic(e.target.files[0]));
    $('advanceWidth').addEventListener('input',e=>{record(current).advance=Number(e.target.value);$('advanceValue').textContent=e.target.value;schedulePreview();scheduleAutosave()});
    $('smoothness').addEventListener('input',e=>{record(current).detail=Number(e.target.value);$('smoothnessValue').textContent=e.target.value;schedulePreview();scheduleAutosave()});
    $('previousChar').addEventListener('click',()=>selectChar(ALL[(ALL.indexOf(current)-1+ALL.length)%ALL.length]));
    $('nextChar').addEventListener('click',()=>selectChar(ALL[(ALL.indexOf(current)+1)%ALL.length]));
    $('fontName').addEventListener('input',()=>{schedulePreview();scheduleAutosave()});
    $('previewSize').addEventListener('change',e=>$('typePreview').style.fontSize=e.target.value+'px');
    $('previewText').addEventListener('input',syncPreviewText);
    $('exportFont').addEventListener('click',exportFont);$('exportFontSide').addEventListener('click',exportFont);
    $('saveProject').addEventListener('click',saveProject);$('openProject').addEventListener('click',()=>$('projectInput').click());$('projectInput').addEventListener('change',e=>openProject(e.target.files[0]));$('newProject').addEventListener('click',newProject);
    $('analyticsSettings').addEventListener('click',()=>window.openBuildifulAnalyticsSettings?.());
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!['TEXTAREA','INPUT'].includes(document.activeElement.tagName)){
      if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(e.key.toLowerCase()==='y'){e.preventDefault();redo()}
    }});
    const wrap=$('paperWrap');wrap.addEventListener('dragover',e=>{e.preventDefault();wrap.style.outline='2px dashed #5b83dc'});wrap.addEventListener('dragleave',()=>wrap.style.outline='');wrap.addEventListener('drop',e=>{e.preventDefault();wrap.style.outline='';importGraphic(e.dataTransfer.files[0])});
  }
  function init(){drawGuides();renderCharacterGrid();applyEvents();syncPreviewText();const saved=safeStorage.read(AUTOSAVE_KEY);
    if(saved){try{const d=JSON.parse(saved);if(d.format==='fontbuilder-project'&&d.version===1){$('fontName').value=String(d.fontName||'My First Font').slice(0,60);
      for(const [ch,val] of Object.entries(d.glyphs||{}))if(ALL.includes(ch)&&val&&typeof val.png==='string'&&val.png.length<2_000_000){glyphs.set(ch,{png:/^data:image\/png;base64,/.test(val.png)?val.png:'',advance:Number(val.advance)||DEFAULT_WIDTH(ch),detail:Number(val.detail)||2})}
      if(glyphs.size)showToast('Restored your last project from this browser.');
    }}catch{ /* Corrupt local backup: editor starts empty. */ }}
    selectChar('A');updateGrid();schedulePreview();
  }
  init();
})();

/* Optional GA4: never load a Google Analytics script before explicit consent.
 * Instrumentation sends only coarse tool actions, never artwork, typed text, or font names.
 */
(() => {
  'use strict';
  const script=document.currentScript;
  const measurement=script?.dataset.measurementId||'';
  const toolName=script?.dataset.toolName||document.title;
  const privacyURL=script?.dataset.privacyUrl||'privacy.html';
  const STORAGE_KEY='buildiful-analytics-choice-v1';
  let choice=null,gaLoaded=false,dialog=null;
  const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}};
  const write=(allowed)=>{choice={allowed,updatedAt:new Date().toISOString()};try{localStorage.setItem(STORAGE_KEY,JSON.stringify(choice))}catch{ /* Private mode: choice lasts for this page. */ }};
  function enable(){if(gaLoaded||!measurement||!/^G-[A-Z0-9]+$/.test(measurement))return;
    gaLoaded=true;window['ga-disable-'+measurement]=false;
    window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
    window.gtag('js',new Date());window.gtag('config',measurement,{
      send_page_view:true,page_location:location.origin+location.pathname,
      allow_google_signals:false,allow_ad_personalization_signals:false,anonymize_ip:true
    });
    const tag=document.createElement('script');tag.async=true;tag.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(measurement);document.head.append(tag);
  }
  window.buildifulAnalyticsEvent=(name,params={})=>{
    if(!choice?.allowed||!gaLoaded||typeof window.gtag!=='function')return;
    const allowed=['font_export','graphic_import','project_save','project_open'];
    if(!allowed.includes(name))return;
    const eventData={tool_name:toolName};
    if(Number.isFinite(params.glyph_count))eventData.glyph_count=Math.max(0,Math.min(1024,Math.round(params.glyph_count)));
    if(['png','jpeg','webp'].includes(params.file_type))eventData.file_type=params.file_type;
    if(params.format==='ttf')eventData.file_format='ttf';
    window.gtag('event',name,eventData);
  };
  function dismiss(){dialog?.remove();dialog=null;}
  function choose(allowed){write(allowed);dismiss();if(allowed)enable();else{
      // GA already loaded cannot be unsent; stop subsequent collection immediately.
      window['ga-disable-'+measurement]=true;
      if(typeof window.gtag==='function')window.gtag('consent','update',{analytics_storage:'denied'});
      if(gaLoaded)window.location.reload();
    }}
  function showSettings(){dismiss();const first=choice===null;
    dialog=document.createElement('div');dialog.id='buildiful-consent-dialog';
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');dialog.setAttribute('aria-label','Optional analytics settings');
    dialog.style.cssText='position:fixed;bottom:18px;right:18px;z-index:1000;max-width:min(380px,calc(100vw - 36px));background:#fff;color:#21364d;border:1px solid #d6dfeb;border-radius:14px;padding:19px 20px;box-shadow:0 15px 45px #11283c38;font:13px/1.55 system-ui,-apple-system,sans-serif';
    const title=document.createElement('strong');title.textContent='Optional analytics';title.style.cssText='display:block;margin-bottom:6px;font-size:15px';dialog.append(title);
    const p=document.createElement('p');p.textContent='May we use Google Analytics to understand visits and basic tool actions? Your drawings, font names, and preview text are never included in analytics events. The tool works the same if you decline.';p.style.cssText='margin:0 0 12px;color:#64758c';dialog.append(p);
    const links=document.createElement('div');links.style.cssText='margin-bottom:14px';
    const a=document.createElement('a');a.href=privacyURL;a.textContent='Privacy notice';a.style.cssText='color:#335fc3;text-decoration:underline';links.append(a);dialog.append(links);
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    const decline=document.createElement('button');decline.type='button';decline.textContent='No thanks';decline.style.cssText='background:#fff;border:1px solid #cdd7e5;color:#30435b;padding:9px 13px;border-radius:8px;cursor:pointer;font-weight:650';decline.onclick=()=>choose(false);
    const accept=document.createElement('button');accept.type='button';accept.textContent='Allow analytics';accept.style.cssText='background:#315ecb;border:1px solid #315ecb;color:#fff;padding:9px 13px;border-radius:8px;cursor:pointer;font-weight:650';accept.onclick=()=>choose(true);
    actions.append(decline,accept);
    if(!first){const close=document.createElement('button');close.textContent='Close';close.type='button';close.style.cssText='background:transparent;color:#69788b;border:0;padding:9px 2px;margin-left:auto;cursor:pointer';close.onclick=dismiss;actions.append(close)}
    dialog.append(actions);document.body.append(dialog);
  }
  window.openBuildifulAnalyticsSettings=showSettings;
  choice=read();
  if(choice?.allowed===true)enable();
  else if(choice?.allowed!==false){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showSettings,{once:true});else showSettings()}
})();

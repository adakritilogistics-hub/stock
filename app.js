var API_URL=CFG.api||"",SHEET_CSV_URL=CFG.csv||"",LOW_STOCK_AT=CFG.low||3,REFRESH_MIN=CFG.refresh||5,CFGIMG=CFG.img;
(function(){var l=document.createElement("link");l.rel="icon";l.href="PHI_LOGO.png";document.head.appendChild(l)})();
var disp=null;try{disp=JSON.parse(sessionStorage.getItem("disp")||"null")}catch(e){}
var sheets=[],si=0,idx=0,updated=null,serverImgs={},localImgs={},st=(sessionStorage.getItem("flow")==="update"&&disp)?"update":"check",sess=disp,typed={},notes={};
try{notes=JSON.parse(sessionStorage.getItem("notes_"+CFG.id)||"{}")}catch(e){}
function isAdmin(){var a=/admin/.test(location.hash+location.search);try{if(a)localStorage.setItem("matadmin","1");else a=localStorage.getItem("matadmin")==="1"}catch(e){}return a}
var admin=isAdmin();
window.addEventListener("hashchange",function(){admin=isAdmin();if(st==="check"||st==="update")render()});
try{localImgs=JSON.parse(localStorage.getItem("imgs_"+CFG.id)||"{}")}catch(e){}
var $=function(id){return document.getElementById(id)};
function D(){return sheets[si]?sheets[si].designs:[]}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function addItem(desc,cat,label,qty){
  var segs=desc?desc.split("\n"):[],found=false,pre=cat+" : ";
  for(var i=0;i<segs.length;i++){
    if(segs[i].indexOf(pre)===0){
      var items=segs[i].slice(pre.length).split(", "),hit=false;
      for(var j=0;j<items.length;j++){var m=items[j].match(/^(.*) x ([\d.]+)$/);
        if(m&&m[1]===label){items[j]=label+" x "+(Math.round((parseFloat(m[2])+qty)*1000)/1000);hit=true}}
      if(!hit)items.push(label+" x "+qty);
      segs[i]=pre+items.join(", ");found=true;break}}
  if(!found)segs.push(pre+label+" x "+qty);
  return segs.join("\n")}
function post(o){return fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(o)}).then(function(r){return r.json()})}

function parseCSV(t){var rows=[],r=[],c="",q=false;
  for(var i=0;i<t.length;i++){var ch=t[i];
    if(q){if(ch=='"'){if(t[i+1]=='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch=='"')q=true;else if(ch==','){r.push(c);c=""}
    else if(ch=='\n'||ch=='\r'){if(ch=='\r'&&t[i+1]=='\n')i++;r.push(c);rows.push(r);r=[];c=""}else c+=ch}
  if(c!==""||r.length){r.push(c);rows.push(r)}
  return rows.filter(function(x){return x.some(function(v){return v.trim()!==""})})}

function build(rows){
  var h=rows[0].map(function(x){return x.trim().toLowerCase()});
  function find(re,fb){for(var i=0;i<h.length;i++)if(re.test(h[i]))return i;return fb}
  var cD=find(/design|mat|name|model|product|item/,0),cS=find(/stock|qty|quantity|avail|balance|pcs|count/,2),
      cC=find(/colou?r|shade/,(1!==cD&&1!==cS)?1:-1),cI=find(/image|photo|picture|img|pic/,-1);
  var map={},order=[],imgs={},last="";
  rows.slice(1).forEach(function(r){
    var d=(r[cD]||"").trim()||last; if(!d)return; last=d;
    var c=cC>-1?(r[cC]||"").trim():"",raw=(r[cS]||"").replace(/[, ]/g,"");
    if(raw===""&&(cC<0||!c))return;
    var n=parseFloat(raw);if(isNaN(n))n=0;
    if(!map[d]){map[d]=[];order.push(d)}
    map[d].push({colour:c||"—",c:c,nc:cC<0,stock:n});
    if(cI>-1&&!imgs[d]){var u=(r[cI]||"").trim();if(u)imgs[d]=u}});
  return order.map(function(d){return {name:d,items:map[d],img:imgs[d]||""}})}

var METALS={gold:"#d4a82f",silver:"#b9bec4",copper:"#b8693d"};
function swatch(name){var m=METALS[name.trim().toLowerCase()];if(m)return m;
  var s=document.createElement("span").style;s.color=name.toLowerCase();if(s.color)return name.toLowerCase();
  s.color=name.toLowerCase().split(/[\s\/&-]+/)[0];return s.color?s.color:"#c9c5ba"}

function driveUrl(id){return "https://drive.google.com/thumbnail?id="+id+"&sz=w1000"}
function driveFix(u){var m=u.match(/drive\.google\.com\/file\/d\/([\w-]+)/)||u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/);return m?driveUrl(m[1]):u}
function keyOf(sn,d){return sn+"|"+d.name}
function tkey(sn,d,i){return sn+"|"+d.name+"|"+i}
function imgCandidates(sn,d){var k=keyOf(sn,d);
  if(serverImgs[k])return [driveUrl(serverImgs[k])];
  if(localImgs[k])return [localImgs[k]];
  if(d.img)return [driveFix(d.img)];
  var b=CFGIMG+"/"+encodeURIComponent(d.name);return [b+".jpg",b+".jpeg",b+".png",b+".webp"]}
function nextImg(el){var l=JSON.parse(el.getAttribute("data-c")),i=+el.getAttribute("data-i")+1;
  if(i<l.length){el.setAttribute("data-i",i);el.src=l[i]}else el.parentNode.style.display="none"}

function sheetHTML(d,sn,upd){
  var tot=d.items.reduce(function(a,b){return a+b.stock},0);
  var rows=d.items.map(function(it,i){
    var low=it.stock<=LOW_STOCK_AT,tk=tkey(sn,d,i);
    var th=it.nc?"":'<img class="th" alt="" loading="lazy" onerror="this.remove()" src="'+CFGIMG+'/'+encodeURIComponent(d.name)+'_'+esc(it.colour.toUpperCase().replace(/[^A-Z0-9]/g,''))+'.jpg">';
    var r='<div class="row'+(upd?' hu':'')+'"><span class="sw" style="'+(it.nc?'visibility:hidden':'background:'+esc(swatch(it.colour)))+'"></span><span class="cn">'+th+esc(it.nc?"Available":it.colour)+
      '</span><span class="qty '+(low?'low':'ok')+'">'+(+it.stock.toFixed(3)).toLocaleString()+(low?'<small class="l">'+(it.stock===0?'Out of stock':'Low')+'</small>':'')+'</span></div>';
    if(upd)r+='<div class="upd"><input class="uq" type="number" inputmode="decimal" min="0" step="any" placeholder="Qty sent" data-i="'+i+'" value="'+esc(typed[tk]||"")+'"><button class="usave" data-i="'+i+'">Save</button><span class="ust">'+esc(notes[tk]||"")+'</span></div>';
    return r}).join("");
  var c=imgCandidates(sn,d);
  var pic='<div class="pic"><img alt="Design '+esc(d.name)+'" data-i="0" data-c=\''+esc(JSON.stringify(c)).replace(/'/g,"&#39;")+'\' src="'+esc(c[0])+'" onerror="nextImg(this)"></div>';
  var adm=admin?'<div class="padm"><button onclick="addPhoto()">Add / change photo</button></div>':'';
  return '<section class="sheet"><h1>'+esc(d.name)+'</h1><p class="sub">'+(sheets.length>1?esc(sn)+' · ':'')+'Available stock'+(d.items[0]&&!d.items[0].nc?' by colour':'')+'</p>'+pic+adm+rows+
    '<div class="total"><span>Total available</span><b>'+(+tot.toFixed(3)).toLocaleString()+'</b></div></section>'}

/* ---------- screens ---------- */
function setHdr(){var h=$("hdr"),t=esc(CFG.title);
  if(st==="update"){h.innerHTML='<button class="savebtn" id="hs">Save Stock</button><span>'+esc(sess.customer)+' · '+t+'</span>';
    $("hs").onclick=function(){if(Object.keys(typed).some(function(k){return typed[k]!==""})&&!confirm("Some quantities are typed but not saved. Leave anyway?"))return;
      sessionStorage.setItem("menuok","1");location.href="index.html"}}
  else h.innerHTML='<a href="index.html" onclick="sessionStorage.setItem(\'menuok\',\'1\')">‹ Back</a><span>'+t+' · Check</span>'}

function render(){
  setHdr();var ds=D();
  if(!ds.length){$("view").innerHTML='<div class="msg">Loading…</div>';return}
  $("view").innerHTML=sheetHTML(ds[idx],sheets[si].name,st==="update");
  $("pick").value=idx;$("prev").disabled=idx===0;$("next").disabled=idx===ds.length-1;
  $("tabs").innerHTML=sheets.length>1?sheets.map(function(s,i){return '<button class="'+(i===si?'on':'')+'" onclick="goSheet('+i+')">'+esc(s.name)+'</button>'}).join(""):"";
  $("foot").textContent=(st==="update"?sess.customer+" · "+sess.date+" · "+sess.mode+" — ":"")+(idx+1)+" of "+ds.length+(updated&&st==="check"?" · Updated "+updated.toLocaleString([],{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"")}

function doSave(i,btn){
  var d=D()[idx],it=d.items[i],sn=sheets[si].name,tk=tkey(sn,d,i),inp=btn.parentNode.querySelector(".uq"),q=parseFloat(inp.value);
  if(!(q>0)){alert("Enter the quantity sent.");return}
  if(q>it.stock){alert("Only "+it.stock+" available.");return}
  var label=d.name+(d.items.length>1&&it.c?" "+it.c.replace(/\s+/g,""):"");
  if(!confirm("Reduce "+label+" by "+q+"?\nAvailable: "+it.stock+" → "+(+(it.stock-q).toFixed(3))))return;
  var pin=sessionStorage.getItem("pin")||prompt("Enter PIN");if(!pin)return;
  btn.disabled=true;btn.textContent="Saving…";
  post({action:"consume",pin:pin,sheet:sn,design:d.name,colour:it.c,qty:q,label:label,cat:CFG.title,date:sess.date,customer:sess.customer,mode:sess.mode,payment:sess.payment||"",marka:sess.marka||""})
  .then(function(j){
    if(j.error){if(/PIN/.test(j.error))sessionStorage.removeItem("pin");alert(j.error);if(typeof j.available==="number")it.stock=j.available;render();return}
    sessionStorage.setItem("pin",pin);it.stock=j.available;delete typed[tk];notes[tk]="✓ "+q+" saved";try{sessionStorage.setItem("notes_"+CFG.id,JSON.stringify(notes));sessionStorage.setItem("ddesc",addItem(sessionStorage.getItem("ddesc")||"",CFG.title,label,q))}catch(e){}render()})
  .catch(function(){alert("Could not save. Check your internet, then check the sheet before trying again.");btn.disabled=false;btn.textContent="Save"})}

function fillPicker(){$("pick").innerHTML=D().map(function(d,i){return '<option value="'+i+'">'+esc(d.name)+'</option>'}).join("")}
function goSheet(i){si=i;idx=0;fillPicker();render()}

function ingest(raw){
  var cs=sheets[si]&&sheets[si].name,cd=D()[idx]&&D()[idx].name;
  sheets=raw.sheets.map(function(s){return {name:s.name,designs:build(s.rows)}}).filter(function(s){return s.designs.length});
  serverImgs=raw.images||{};
  si=Math.max(0,sheets.map(function(s){return s.name}).indexOf(cs));
  var f=D().map(function(d){return d.name}).indexOf(cd);idx=f>=0?f:0;
  fillPicker();
  var a=document.activeElement;if(a&&a.classList&&a.classList.contains("uq"))return;   // don't disturb typing
  render()}

function load(){
  if(!API_URL&&!SHEET_CSV_URL){$("view").innerHTML='<div class="msg">Not connected yet. Add the sheet link to this page.</div>';return}
  var url=API_URL||SHEET_CSV_URL;url+=(url.indexOf("?")>-1?"&":"?")+"t="+Date.now();
  fetch(url).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){
    var raw=API_URL?JSON.parse(t):{sheets:[{name:"Stock",rows:parseCSV(t)}]};
    if(!raw.sheets.length)throw 0;
    updated=new Date();ingest(raw);
    try{localStorage.setItem("stock_"+CFG.id,JSON.stringify({raw:raw,at:updated.getTime()}))}catch(e){}
  }).catch(function(){
    try{var c=JSON.parse(localStorage.getItem("stock_"+CFG.id)||"null");
      if(c&&!sheets.length){updated=new Date(c.at);ingest(c.raw);return}}catch(e){}
    if(!sheets.length)$("view").innerHTML='<div class="msg err">Could not load stock. Check your internet and the setup links.</div>'})}

/* ---- add photo (admin only) ---- */
function addPhoto(){var inp=document.createElement("input");inp.type="file";inp.accept="image/*";
  inp.onchange=function(){var f=inp.files[0];if(!f)return;var img=new Image();
    img.onload=function(){var m=900,k=Math.min(1,m/Math.max(img.width,img.height)),cv=document.createElement("canvas");
      cv.width=img.width*k;cv.height=img.height*k;cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
      savePhoto(cv.toDataURL("image/jpeg",0.8))};img.src=URL.createObjectURL(f)};inp.click()}
function savePhoto(data){var key=keyOf(sheets[si].name,D()[idx]);
  if(!API_URL){localImgs[key]=data;try{localStorage.setItem("imgs_"+CFG.id,JSON.stringify(localImgs))}catch(e){alert("Photo too large to save on this device.")}render();
    alert("Saved on this device only. Set the Apps Script link to share photos with everyone.");return}
  var pin=sessionStorage.getItem("pin")||prompt("Admin PIN");if(!pin)return;
  post({pin:pin,key:key,data:data}).then(function(j){
    if(j.error){sessionStorage.removeItem("pin");alert(j.error);return}
    sessionStorage.setItem("pin",pin);serverImgs[key]=j.id;render()}).catch(function(){alert("Could not save photo. Check the Apps Script link.")})}

$("prev").onclick=function(){if(idx>0){idx--;render()}};
$("next").onclick=function(){if(idx<D().length-1){idx++;render()}};
$("pick").onchange=function(){idx=+this.value;render()};
$("view").addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".usave");if(b)doSave(+b.getAttribute("data-i"),b)});
$("view").addEventListener("input",function(e){var t=e.target;if(t.classList&&t.classList.contains("uq"))typed[tkey(sheets[si].name,D()[idx],+t.getAttribute("data-i"))]=t.value});
document.addEventListener("keydown",function(e){if(e.target.tagName==="SELECT"||e.target.tagName==="INPUT")return;
  if(st!=="check"&&st!=="update")return;if(e.key==="ArrowLeft")$("prev").click();if(e.key==="ArrowRight")$("next").click()});
render();load();setInterval(load,REFRESH_MIN*60000);

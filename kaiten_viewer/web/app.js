import './card-component.js';
import {escape as e} from './rich-text.js';

const $=selector=>document.querySelector(selector);
const snapshots=$('#snapshot'),search=$('#card-search'),list=$('#card-list'),main=$('#main-content');
let currentSnapshot='',currentId=null,offset=0,total=0,query='',request=0,listRequest=0;
const number=n=>new Intl.NumberFormat('ru-RU').format(n || 0);

async function json(url){const response=await fetch(url);const body=await response.json();if(!response.ok)throw new Error(body.error || 'Не удалось загрузить данные');return body;}
const apiQuery=extra=>new URLSearchParams({snapshot:currentSnapshot,...extra});
function selectCurrent(){list.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.id===String(currentId)));}
async function loadList(append=false){
  const ticket=++listRequest;
  try{
    const result=await json('/api/cards?'+apiQuery({q:query,offset:append?offset:0,limit:40}));
    if(ticket!==listRequest)return;
    if(!append){list.innerHTML='';offset=0;}
    total=result.total;offset+=result.items.length;
    $('#list-count').textContent=number(total);$('#list-label').textContent=query?'РЕЗУЛЬТАТЫ ПОИСКА':'КАРТОЧКИ · НОВЫЕ СНАЧАЛА';
    for(const c of result.items){
      const b=document.createElement('button');b.className='list-card';b.dataset.id=String(c.id);
      b.innerHTML=`<div><span>#${e(c.id)}</span><span class="list-status">${c.archived?'Архив':'На доске'}</span></div><strong>${e(c.title || 'Без названия')}</strong>`;
      b.addEventListener('click',()=>openCard(c.id));list.append(b);
    }
    if(!total)list.innerHTML='<p class="list-empty">Ничего не найдено. Проверьте номер или выберите другую копию.</p>';
    $('#more-cards').hidden=offset>=total;selectCurrent();
  }catch(error){if(ticket===listRequest)list.innerHTML=`<p class="list-empty">${e(error.message)}</p>`;}
}
async function openCard(id,updateURL=true){
  const ticket=++request;currentId=id;selectCurrent();
  main.innerHTML='<div class="loading-state"><span class="spinner"></span>Читаем карточку…</div>';
  try{
    const model=await json('/api/cards/'+encodeURIComponent(id)+'?'+apiQuery({}));
    if(ticket!==request)return;
    const component=document.createElement('kaiten-card');component.data=model;main.replaceChildren(component);
    document.title=`#${model.card.id} · ${model.card.title} · Архив`;
    if(updateURL)history.pushState({},'', '?'+new URLSearchParams({card:id,snapshot:currentSnapshot}));
    window.scrollTo({top:0});
  }catch(error){
    if(ticket!==request)return;
    main.innerHTML=`<div class="empty-state error-state"><div class="empty-icon">⌕</div><h1>Карточка #${e(id)} не открылась</h1><p>${e(error.message)}</p><small>Возможно, она находится в другой копии или не была выгружена.</small></div>`;
  }
}
function updateStats(data){$('#archive-stats').innerHTML=`<strong>${number(data.cards)}</strong> карточек<span>·</span><strong>${number(data.files)}</strong> файлов`;
  snapshots.title=data.id;
}
async function init(){
  try{
    const data=await json('/api/snapshots');
    if(!data.length)throw new Error('Нет резервных копий для просмотра');
    const params=new URLSearchParams(location.search);
    snapshots.innerHTML=data.map(s=>`<option value="${e(s.id)}">${e(s.id.slice(0,10))} · Доска ${e(s.boardId || '')}</option>`).join('');
    currentSnapshot=data.some(x=>x.id===params.get('snapshot'))?params.get('snapshot'):data[0].id;
    snapshots.value=currentSnapshot;updateStats(data.find(x=>x.id===currentSnapshot));
    snapshots.addEventListener('change',()=>{
      const previousId=currentId;
      currentSnapshot=snapshots.value;request++;currentId=null;query='';search.value='';
      updateStats(data.find(x=>x.id===currentSnapshot));loadList();
      if(previousId){search.value=String(previousId);openCard(previousId);}
      else{history.replaceState({},'','?'+apiQuery({}));main.innerHTML='<div class="empty-state"><h1>Выберите карточку</h1><p>Открыта другая резервная копия.</p></div>';}
    });
    loadList();
    if(/^\d+$/.test(params.get('card') || '')){search.value=params.get('card');openCard(params.get('card'),false);}
  }catch(error){main.innerHTML=`<div class="empty-state"><h1>Не удалось открыть архив</h1><p>${e(error.message)}</p></div>`;}
}
$('#search-form').addEventListener('submit',event=>{
  event.preventDefault();query=search.value.trim().replace(/^#/,'');loadList();
  if(/^\d+$/.test(query))openCard(query);
});
$('#more-cards').addEventListener('click',()=>loadList(true));
main.addEventListener('open-card',event=>{search.value=String(event.detail.id);openCard(event.detail.id);});
main.addEventListener('download-card',event=>{
  const blob=new Blob([JSON.stringify(event.detail.data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`card_${event.detail.data.card.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('popstate',()=>{
  const p=new URLSearchParams(location.search),snapshot=p.get('snapshot');
  if(snapshot && [...snapshots.options].some(x=>x.value===snapshot)){currentSnapshot=snapshot;snapshots.value=snapshot;loadList();}
  if(p.get('card'))openCard(p.get('card'),false);
});
init();

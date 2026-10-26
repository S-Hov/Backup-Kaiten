import {escape as e, richText, safeLink} from './rich-text.js';

export const formatDate = (value, time=true) => {
  if (!value) return 'Не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {day:'2-digit',month:'short',year:'numeric', ...(time ? {hour:'2-digit',minute:'2-digit'} : {}),timeZone:'Europe/Moscow'}).format(date);
};
const size = n => n == null ? '' : n < 1024 ? n + ' Б' : n < 1024**2 ? (n/1024).toFixed(1) + ' КБ' : (n/1024**2).toFixed(1) + ' МБ';
const fullname = user => user?.full_name || user?.name || user?.username || 'Неизвестный участник';
const initials = user => fullname(user).split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const avatar = user => `<span class="avatar" aria-hidden="true">${e(initials(user))}</span>`;
const empty = text => `<p class="section-empty">${e(text)}</p>`;
const valueHTML = value => {
  if (value == null || value === '') return '<span class="muted">Не указано</span>';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (Array.isArray(value)) return value.length ? value.map(valueHTML).join(', ') : '<span class="muted">Нет</span>';
  if (typeof value === 'object') return '<dl class="nested-values">' + Object.entries(value).map(([k,v])=>`<div><dt>${e(fieldNames[k] || k)}</dt><dd>${valueHTML(v)}</dd></div>`).join('') + '</dl>';
  return e(value);
};
const fieldNames = {created:'Создано',updated:'Обновлено',id:'ID',uid:'UID',title:'Название',name:'Название',text:'Текст',reason:'Причина',released:'Блокировка снята',released_by_id:'Кем снята',due_date:'Срок',user_id:'ID участника',author_id:'ID автора',card_id:'ID карточки',board_id:'ID доски',column_id:'ID колонки',lane_id:'ID дорожки',condition:'Состояние',size:'Размер',color:'Цвет',description:'Описание',value:'Значение',type:'Тип',comment:'Комментарий',for_date:'Дата',time_spent:'Затрачено, мин',planned_start:'Плановое начало',planned_end:'Плановое окончание',iteration_id:'ID итерации',removed_at:'Удалено из итерации',baseline_id:'ID базового плана',project_id:'ID проекта',added_by_uid:'Добавил',sort_order:'Порядок',state:'Статус',archived:'В архиве',version:'Версия',source:'Источник',external_id:'Внешний ID',blocked:'Заблокирована',asap:'Срочно',completed_at:'Завершено',completed_on_time:'Выполнено в срок',time_spent_sum:'Всего затрачено, мин',time_blocked_sum:'Время блокировки, мин',estimate_workload:'Оценка трудозатрат',first_moved_to_in_progress_at:'Впервые в работе',last_moved_to_done_at:'Последний переход в готово',column_changed_at:'Изменение колонки',lane_changed_at:'Изменение дорожки',children_count:'Дочерних карточек',children_done:'Выполнено дочерних',parents_count:'Родительских карточек',comments_total:'Всего комментариев',comment_last_added_at:'Последний комментарий',updater_id:'ID изменившего',owner_id:'ID создателя',type_id:'ID типа',email:'Почтовый адрес карточки',key:'Ключ',public:'Публичная карточка',description_filled:'Описание заполнено',goals_total:'Пунктов чек-листов',goals_done:'Выполнено пунктов',locked:'Блокировка изменений'};
const actionNames = {card_add:'Создал карточку',card_create:'Создал карточку',card_update:'Изменил карточку',card_move:'Переместил карточку',card_archive:'Отправил в архив',card_revive:'Вернул из архива',card_delete:'Удалил карточку',card_file_add:'Прикрепил файл',card_file_remove:'Удалил вложение',comment_add:'Добавил комментарий',comment_update:'Изменил комментарий',comment_delete:'Удалил комментарий',card_assign_member:'Добавил участника',card_unassign_member:'Убрал участника',card_assign_responsible:'Назначил ответственного',card_tag_add:'Добавил метку',card_tag_remove:'Убрал метку',card_block:'Заблокировал карточку',card_unblock:'Снял блокировку',card_checklist_add:'Добавил чек-лист',card_description_update:'Изменил описание',card_change_title:'Изменил название',card_change_due_date:'Изменил срок'};

/**
 * Reusable UI boundary. Set element.data = CardViewModel (schemaVersion: 1).
 * No fetch, folder access or Kaiten API inside the component.
 * Emits open-card {id} and download-card {data} events.
 */
export class KaitenCard extends HTMLElement {
  constructor() {
    super(); this.tab='comments'; this.limit=40;
    this.addEventListener('click', event => this.onClick(event));
    this.addEventListener('change', event => {
      if (event.target.matches('[data-raw-select]')) this.showRaw(event.target.value);
    });
  }
  set data(model) { this.model=model; this.tab='comments';this.limit=40;this.render(); }
  get data() { return this.model; }
  row(label, value, cls='') { return `<div class="field-row ${cls}"><dt>${e(label)}</dt><dd>${value}</dd></div>`; }
  related(id, title) { return `<button class="related-card" data-open-card="${e(id)}"><span>#${e(id)}</span>${e(title || 'Открыть карточку')}<b>↗</b></button>`; }
  render() {
    const m=this.model, c=m.card, s=m.sections;
    this.innerHTML=`
      <div class="detail-breadcrumb">${e(c.board)}<span>›</span>Карточка #${e(c.id)}<span class="copy-date">Снимок архива</span></div>
      <article class="card-shell">
        <header class="card-header">
          <div class="card-badges"><span class="card-id">#${e(c.id)}</span>${c.key?`<span class="badge">${e(c.key)}</span>`:''}${c.archived?'<span class="badge archive-badge">▣ В архиве</span>':'<span class="badge active-badge">На доске</span>'}${c.asap?'<span class="badge urgent">Срочно</span>':''}${c.blocked?'<span class="badge urgent">Заблокирована</span>':''}</div>
          <h1>${e(c.title || 'Без названия')}</h1>
          <div class="card-subtitle">Создал ${e(c.owner)}<span>·</span>${e(formatDate(c.created))}</div>
          <div class="card-toolbar"><span class="column-status"><i></i>${e(c.column)}</span><div class="toolbar-actions"><button class="icon-button" data-copy-link title="Скопировать ссылку" aria-label="Скопировать ссылку">↗</button><button class="text-button" data-export>↓ Скачать данные</button></div></div>
        </header>
        ${m.diagnostics.length?`<details class="diagnostic"><summary>⚠ В копии есть замечания · ${m.diagnostics.length}</summary><ul>${[...new Set(m.diagnostics)].map(x=>`<li>${e(x)}</li>`).join('')}</ul></details>`:''}
        <div class="card-columns">
          <div class="card-main">
            <dl class="card-fields">
              ${this.row('Расположение',`<span class="location-value">${e(c.board)} / ${e(c.column)}</span>${c.lane?`<small class="muted">${e(c.lane)}</small>`:''}`)}
              ${this.row('Тип',`<span class="type-chip"><b>${e(c.type.letter || c.type.name?.[0] || 'К')}</b>${e(c.type.name || 'Карточка')}</span>`)}
              ${this.row('Участники',s.members.length?`<div class="member-list">${s.members.map(u=>`<span class="member-chip" title="${e(u.email || '')}">${avatar(u)}${e(fullname(u))}${u.type===2?'<span class="responsible-mark" title="Ответственный">★</span>':''}</span>`).join('')}</div>`:'<span class="muted">Не назначены</span>')}
              ${this.row('Срок',c.dueDate?e(formatDate(c.dueDate)):'<span class="muted">Не указан</span>')}
              ${c.size!=null?this.row('Размер',valueHTML(c.size)):''}
              ${this.row('Метки',s.tags.length?s.tags.map(t=>`<span class="tag">${e(t.name)}</span>`).join(''):'<span class="muted">Нет меток</span>')}
              ${s.properties.map(p=>this.row(p.name,valueHTML(p.value))).join('')}
            </dl>
            <section class="content-section"><h2><span>≡</span>Описание</h2><div class="rich-text">${richText(c.description,m)}</div></section>
            ${this.checklists()}
            <section class="content-section"><h2><span>⌁</span>Файлы <small>${m.files.length}</small></h2>${this.fileGrid(m.files)}</section>
            ${s.links.length?`<section class="content-section"><h2><span>↗</span>Ссылки <small>${s.links.length}</small></h2>${s.links.map(x=>`<div class="external-link">↗ ${safeLink(x.url)?`<a href="${e(x.url)}" target="_blank" rel="noopener noreferrer">${e(x.description || x.url)}</a>`:e(x.description || x.url)}</div>`).join('')}</section>`:''}
            ${this.relations()}
            <details class="additional-section"><summary>Дополнительные сведения</summary><dl class="card-fields compact-fields">
              ${this.row('Обновлена',e(formatDate(c.updated)))}${this.row('Перемещена',e(formatDate(c.lastMoved)))}
              ${this.row('Завершена',e(formatDate(c.completedAt)))}${this.row('Плановое начало',e(formatDate(c.plannedStart)))}${this.row('Плановое окончание',e(formatDate(c.plannedEnd)))}
              ${this.row('Затрачено',e((c.timeSpent || 0) + ' мин'))}${this.row('Источник',e(c.source || 'Не указан'))}
              ${this.row('Почта карточки',e(c.email || 'Не указана'))}${this.row('UID',e(c.uid || 'Не указан'))}
            </dl>${this.genericSection('Блокировки',s.blockers)}${this.genericSection('Учёт времени',s.timeLogs)}${this.genericSection('Итерации',s.iterations)}${this.genericSection('Базовые планы',s.baselines)}${s.sla?this.genericSection('SLA',[s.sla]):''}</details>
            <details class="additional-section technical-section"><summary>Все поля карточки · ${Object.keys(m.raw['card.json']).length}</summary>${this.allFields()}</details>
          </div>
          <aside class="card-discussion"><nav class="discussion-tabs" aria-label="Разделы карточки"><button data-tab="comments" class="active">Комментарии <small>${s.comments.length}</small></button><button data-tab="history">История <small>${s.history.length}</small></button><button data-tab="activity">События <small>${s.activity.length}</small></button><button data-tab="raw">JSON</button></nav><div class="discussion-content"></div><div class="discussion-footer">Сохранённые данные · время МСК</div></aside>
        </div>
        <footer class="card-footer"><span>▣ ${m.source.jsonFiles} JSON-файлов прочитано</span><span>Карточка #${e(c.id)}</span></footer>
      </article>
      <dialog class="image-dialog"><div class="image-dialog-bar"><span data-image-name></span><button class="icon-button" data-close-image aria-label="Закрыть изображение">×</button></div><img alt="Просмотр вложения"><a class="text-button" data-image-download download>↓ Скачать оригинал</a></dialog>`;
    this.renderDiscussion();
  }
  checklists() {
    const checks=this.model.sections.checklists;
    return checks.map(check=>{
      const items=(check.items || []).filter(i=>!i.deleted), done=items.filter(i=>i.checked).length;
      return `<section class="content-section"><h2><span>☑</span>${e(check.name || 'Чек-лист')}<small>${done}/${items.length}</small></h2><progress max="${items.length || 1}" value="${done}"></progress><div class="check-items">${items.map(i=>`<div class="check-item ${i.checked?'checked':''}"><span class="check-box" aria-label="${i.checked?'Выполнено':'Не выполнено'}">${i.checked?'✓':''}</span><div>${richText(i.text,this.model)}${i.due_date?`<small class="muted">Срок: ${e(formatDate(i.due_date))}</small>`:''}</div></div>`).join('')}</div></section>`;
    }).join('');
  }
  fileGrid(files) {
    if (!files.length) return empty(this.model.sectionStatus?.files==='missing'?'Данные о вложениях не сохранены':'Вложений нет');
    return `<div class="file-grid">${files.map(f=>`<div class="file-card ${f.status!=='saved'?'file-unavailable':''}">
      ${f.image && f.url?`<button class="file-preview" data-preview="${e(f.url)}" aria-label="Открыть изображение ${e(f.name)}"><img src="${e(f.url)}" loading="lazy" alt="${e(f.name)}"></button>`:`<div class="file-placeholder">${f.video?'▷':f.audio?'♫':f.status==='saved'?'▤':'▧'}</div>`}
      <div class="file-caption"><strong title="${e(f.name)}">${e(f.name)}</strong><small>${f.status==='saved'?e(size(f.size)):f.status==='external_reference'?'Внешнее хранилище':f.status==='not_exported'?'Не выгружено':'Не скачано'}</small>
      ${f.url?`<a href="${e(f.downloadUrl)}" download aria-label="Скачать ${e(f.name)}">↓</a>`:''}</div>
      ${f.video && f.url?`<video controls preload="none" src="${e(f.url)}"></video>`:''}${f.audio && f.url?`<audio controls preload="none" src="${e(f.url)}"></audio>`:''}
    </div>`).join('')}</div>`;
  }
  relations() {
    const s=this.model.sections;
    const group=(label, cards, ids) => {
      const map=new Map(cards.map(c=>[c.id,c])); for(const id of ids)if(!map.has(id))map.set(id,{id});
      return map.size?`<section class="content-section"><h2><span>⊞</span>${label}<small>${map.size}</small></h2>${[...map.values()].map(c=>this.related(c.id,c.title)).join('')}</section>`:'';
    };
    return group('Родительские карточки',s.parents,s.parentIds)+group('Дочерние карточки',s.children,s.childIds);
  }
  genericSection(title, data) {
    return `<details class="nested-section"><summary>${e(title)} <small>${data.length}</small></summary>${data.length?data.map(x=>valueHTML(x)).join('<hr>'):empty('Записей нет')}</details>`;
  }
  allFields() {
    return `<dl class="all-fields">${Object.entries(this.model.raw['card.json']).map(([key,value])=>`<div><dt>${e(fieldNames[key] || key)}<small>${e(key)}</small></dt><dd>${valueHTML(value)}</dd></div>`).join('')}</dl>`;
  }
  renderDiscussion() {
    this.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===this.tab));
    const box=this.querySelector('.discussion-content'), m=this.model,s=m.sections;
    if(m.sectionStatus?.[this.tab]==='missing') {box.innerHTML=empty('Этот раздел не был сохранён в резервной копии');return;}
    if(this.tab==='raw') {
      box.innerHTML=`<label class="small-label" for="raw-files">Исходные данные</label><select data-raw-select id="raw-files">${Object.keys(m.raw).map(k=>`<option>${e(k)}</option>`).join('')}</select><pre class="raw-data"></pre>`;
      this.showRaw(Object.keys(m.raw)[0]);return;
    }
    let entries=s[this.tab] || [];
    entries=[...entries].sort((a,b)=>String(b.created || b.changed || '').localeCompare(String(a.created || a.changed || '')));
    if(!entries.length) {box.innerHTML=empty({comments:'В этой карточке нет комментариев',history:'История перемещений не сохранена',activity:'Событий нет'}[this.tab]);return;}
    box.innerHTML=entries.slice(0,this.limit).map(x=>{
      if(this.tab==='comments') {
        const attachments=m.files.filter(f=>f.commentId===x.id);
        return `<article class="comment"><div class="comment-heading">${avatar(x.author)}<div><b>${e(fullname(x.author))}</b><time>${e(formatDate(x.created))}${x.edited?' · изменён':''}${x.internal?' · внутренний':''}</time></div></div>${x.deleted?'<p class="muted">Комментарий удалён</p>':x.text?`<div class="rich-text comment-text">${richText(x.text,m,x.type)}</div>`:''}${attachments.length?this.fileGrid(attachments):''}</article>`;
      }
      if(this.tab==='history') return `<article class="timeline-item"><span class="timeline-dot"></span><time>${e(formatDate(x.changed))}</time><b>${e(x.columnName)}</b><p>${e(x.authorName)}</p><small>${e(x.boardName)}${x.condition===2?' · в архиве':''}</small></article>`;
      const dump=x.data?.dump || {}, current=dump.card || dump;
      const target=current.column?.title || x.column?.title;
      return `<article class="timeline-item"><span class="timeline-dot"></span><time>${e(formatDate(x.created))}</time><b>${e(actionNames[x.action] || 'Изменение карточки')}</b><p>${e(fullname(x.author))}${target && x.action==='card_move'?` → ${e(target)}`:''}</p><details class="event-details"><summary>Подробности</summary><small class="muted">${e(x.action)}</small>${valueHTML(x.data)}</details></article>`;
    }).join('') + (entries.length>this.limit?`<button class="load-more" data-more-events>Показать ещё ${Math.min(40,entries.length-this.limit)}</button>`:'');
  }
  showRaw(filename) {
    const box=this.querySelector('.raw-data');if(box)box.textContent=JSON.stringify(this.model.raw[filename],null,2);
  }
  async onClick(event) {
    const target=event.target.closest('button,a');
    const image=event.target.closest('[data-preview]');
    if(image) {
      const dialog=this.querySelector('dialog');const url=image.dataset.preview;
      dialog.querySelector('img').src=url;
      const file=this.model.files.find(f=>f.url===url);
      dialog.querySelector('[data-image-name]').textContent=file?.name || 'Изображение';
      dialog.querySelector('[data-image-download]').href=url+'?download=1';dialog.showModal();return;
    }
    if(!target)return;
    if(target.hasAttribute('data-close-image'))this.querySelector('dialog').close();
    if(target.dataset.tab){this.tab=target.dataset.tab;this.limit=40;this.renderDiscussion();}
    if(target.hasAttribute('data-more-events')){this.limit+=40;this.renderDiscussion();}
    if(target.dataset.openCard)this.dispatchEvent(new CustomEvent('open-card',{detail:{id:target.dataset.openCard},bubbles:true}));
    if(target.hasAttribute('data-export'))this.dispatchEvent(new CustomEvent('download-card',{detail:{data:this.model},bubbles:true}));
    if(target.hasAttribute('data-copy-link')) {
      try {await navigator.clipboard.writeText(location.href);target.textContent='✓';target.title='Ссылка скопирована';}
      catch {target.title='Скопируйте адрес из строки браузера';}
    }
  }
}
customElements.define('kaiten-card', KaitenCard);

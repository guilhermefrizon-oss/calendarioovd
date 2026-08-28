(function(){
  const ACTIVE_BRAND_KEY = 'portal_active_brand_v1';
  const THEME_KEY = 'calendar_theme_v1';
  const portal = window.PortalBrand || { activeId:'default', list:[] };
  let activeId = portal.activeId || 'default';
  const picker = document.getElementById('profilePicker');
  const menu = document.getElementById('profileMenu');

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char){ return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]; });
  }
  function colorForBrand(id){
    const colors = ['#F6BE00','#0ea5e9','#8b5cf6','#f97316','#10b981','#ec4899','#6366f1','#14b8a6'];
    let hash = 0;
    String(id).split('').forEach(function(char){ hash = (hash * 31 + char.charCodeAt(0)) >>> 0; });
    return colors[hash % colors.length];
  }
  function avatarHtml(brand){
    const initials = escapeHtml((brand.shortName || brand.name || '?').slice(0,3).toUpperCase());
    const content = brand.photo ? '<img src="' + escapeHtml(brand.photo) + '" alt="" />' : initials;
    return '<span class="home-profile-avatar" style="background:' + colorForBrand(brand.id || brand.name) + '">' + content + '</span>';
  }
  function activeBrand(){
    return portal.list.find(function(brand){ return brand.id === activeId; }) || portal.list[0] || { id:'default', name:'VONDER', shortName:'VD' };
  }
  function renderPicker(){
    const brand = activeBrand();
    document.getElementById('profilePickerAvatar').innerHTML = avatarHtml(brand);
    document.getElementById('profilePickerName').textContent = brand.name;
    menu.innerHTML = portal.list.map(function(item){
      return '<button type="button" class="profile-option' + (item.id === activeId ? ' is-active' : '') + '" role="option" aria-selected="' + (item.id === activeId) + '" data-brand-id="' + escapeHtml(item.id) + '">' + avatarHtml(item) + '<strong>' + escapeHtml(item.name) + '</strong>' + (item.id === activeId ? '<span class="profile-check">✓</span>' : '') + '</button>';
    }).join('');
  }
  function closeMenu(){ menu.hidden = true; picker.setAttribute('aria-expanded','false'); }
  function openMenu(){
    menu.hidden = false;
    picker.setAttribute('aria-expanded','true');
    const active = menu.querySelector('.is-active');
    if(active) active.focus();
  }
  picker.addEventListener('click',function(){ menu.hidden ? openMenu() : closeMenu(); });
  menu.addEventListener('click',function(event){
    const option = event.target.closest('[data-brand-id]');
    if(!option) return;
    activeId = option.dataset.brandId;
    localStorage.setItem(ACTIVE_BRAND_KEY, activeId);
    renderPicker();
    closeMenu();
    location.reload();
  });
  document.addEventListener('click',function(event){ if(!event.target.closest('.profile-picker-wrap')) closeMenu(); });
  document.addEventListener('keydown',function(event){ if(event.key === 'Escape') closeMenu(); });
  document.getElementById('homeThemeButton').addEventListener('click',function(){
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY,next);
    location.reload();
  });
  renderPicker();
})();

(function(){
  var btn = document.getElementById('btn-open-privacy');
  var modal = document.getElementById('privacy-modal');
  var closeBtn = document.getElementById('btn-close-privacy');
  if (!btn || !modal) return;
  btn.addEventListener('click', function(){ modal.classList.add('open'); });
  closeBtn.addEventListener('click', function(){ modal.classList.remove('open'); });
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.classList.remove('open'); });
})();
